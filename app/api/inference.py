"""Inference & GeoTIFF export endpoints (inference-export capability)."""

from __future__ import annotations

import uuid

import anyio
import numpy as np
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select

from ..models import Dataset, Export
from ..schemas import ExportOut, PredictRequest, PredictResponse, Region
from ..services.inference_service import (
    export_hard_geotiff,
    export_probability_geotiff,
    grid_transform,
    maps_from_probabilities,
)
from ..services.pipeline import checkpoint_or_409
from ..services.raster_service import RasterError, load_raster, make_grid, patch_features
from ..services.training_service import align_probabilities
from ..storage import project_dir
from .deps import (
    SessionDep,
    SettingsDep,
    get_project,
    latest_run,
    require_dataset,
)

router = APIRouter(prefix="/projects/{project_id}", tags=["inference"])

EXPORT_TYPES = {"hard": "hard", "probability": "probability", "prob": "probability"}


async def _run_inference(session, settings, project, dataset: Dataset, region: Region | None, iteration: int | None):
    run = await latest_run(session, project.id, iteration)
    if run is None:
        raise HTTPException(
            status_code=409,
            detail="No trained model found; submit labels and POST /train first",
        )
    checkpoint = checkpoint_or_409(run)
    if checkpoint["bands"] != dataset.bands:
        raise HTTPException(
            status_code=409,
            detail=f"Model expects {checkpoint['bands']} bands but dataset has {dataset.bands}",
        )

    if region is None:
        region = Region(x0=0, y0=0, x1=dataset.width, y1=dataset.height)
    if not (0 <= region.x0 < region.x1 <= dataset.width and 0 <= region.y0 < region.y1 <= dataset.height):
        raise HTTPException(
            status_code=422,
            detail=f"Region {region.model_dump()} outside dataset bounds {dataset.width}x{dataset.height}",
        )

    patch_size, stride = checkpoint["patch_size"], checkpoint["stride"]

    def _compute():
        arr = load_raster(dataset.path, dataset.nodata, settings.max_raster_elements)
        crop = arr[:, region.y0 : region.y1, region.x0 : region.x1]
        grid = make_grid(crop.shape[1], crop.shape[2], patch_size, stride)
        X = patch_features(crop, grid)
        model = checkpoint["model"]
        raw = np.asarray(model.predict_proba(X))
        model_classes = [run.classes[int(c)] for c in model.classes_]
        probs = align_probabilities(raw, model_classes, run.classes)
        hard, prob = maps_from_probabilities(probs, grid.shape)
        return grid, hard, prob

    try:
        grid, hard, prob = await anyio.to_thread.run_sync(_compute)
    except RasterError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    transform = grid_transform(dataset.transform, grid, region.x0, region.y0, stride)
    export_dir = project_dir(settings, "exports", project.id)
    tag = f"ds{dataset.id}_iter{run.iteration}_{uuid.uuid4().hex[:8]}"
    hard_path = export_dir / f"hard_{tag}.tif"
    prob_path = export_dir / f"probability_{tag}.tif"

    await anyio.to_thread.run_sync(
        lambda: export_hard_geotiff(hard_path, hard, run.classes, dataset.crs, transform)
    )
    await anyio.to_thread.run_sync(
        lambda: export_probability_geotiff(prob_path, prob, run.classes, dataset.crs, transform)
    )

    for etype, path in (("hard", hard_path), ("probability", prob_path)):
        session.add(
            Export(
                project_id=project.id,
                dataset_id=dataset.id,
                training_run_id=run.id,
                type=etype,
                path=str(path),
                region=region.model_dump(),
            )
        )
    await session.commit()
    return run, region, grid, hard, prob, patch_size, stride


@router.post("/predict", response_model=PredictResponse)
async def predict(
    project_id: int, payload: PredictRequest, session: SessionDep, settings: SettingsDep
):
    """Run inference on the whole image or a pixel region.

    Returns patch-grid probability and hard maps (also exported as GeoTIFF;
    see `exports` for download URLs).
    """
    project = await get_project(session, project_id)
    dataset = await require_dataset(session, project_id, payload.dataset_id)
    run, region, grid, hard, prob, patch_size, stride = await _run_inference(
        session, settings, project, dataset, payload.region, payload.iteration
    )
    return PredictResponse(
        project_id=project.id,
        dataset_id=dataset.id,
        model_iteration=run.iteration,
        classes=run.classes,
        region=region,
        grid_shape=list(grid.shape),
        patch_size=patch_size,
        stride=stride,
        hard_map=hard.tolist() if payload.include_maps else None,
        probability_map=np.round(prob, 6).tolist() if payload.include_maps else None,
        exports={
            "hard": f"/projects/{project.id}/download/hard",
            "probability": f"/projects/{project.id}/download/probability",
        },
    )


@router.get("/download/{export_type}")
async def download(
    project_id: int,
    export_type: str,
    session: SessionDep,
    settings: SettingsDep,
    dataset_id: int | None = Query(default=None),
):
    """Download the latest GeoTIFF export of the given type (hard|probability).

    If no export exists yet but a model is trained, runs full-image
    inference automatically and returns a fresh export.
    """
    project = await get_project(session, project_id)
    if export_type not in EXPORT_TYPES:
        raise HTTPException(status_code=404, detail=f"Unknown export type '{export_type}'; use hard or probability")
    etype = EXPORT_TYPES[export_type]

    stmt = (
        select(Export)
        .where(Export.project_id == project_id, Export.type == etype)
        .order_by(Export.id.desc())
        .limit(1)
    )
    if dataset_id is not None:
        stmt = stmt.where(Export.dataset_id == dataset_id)
    export = (await session.execute(stmt)).scalar_one_or_none()

    if export is None or not _exists(export.path):
        dataset = await require_dataset(session, project_id, dataset_id)
        run, region, grid, hard, prob, _, _ = await _run_inference(
            session, settings, project, dataset, None, None
        )
        stmt = (
            select(Export)
            .where(Export.project_id == project_id, Export.type == etype, Export.dataset_id == dataset.id)
            .order_by(Export.id.desc())
            .limit(1)
        )
        export = (await session.execute(stmt)).scalar_one_or_none()
        if export is None:
            raise HTTPException(status_code=500, detail="Export failed")

    return FileResponse(
        export.path,
        media_type="image/tiff",
        filename=f"project_{project_id}_{etype}_ds{export.dataset_id}.tif",
    )


def _exists(path: str) -> bool:
    from pathlib import Path

    return Path(path).exists()


@router.get("/exports", response_model=list[ExportOut])
async def list_exports(project_id: int, session: SessionDep):
    await get_project(session, project_id)
    result = await session.execute(
        select(Export).where(Export.project_id == project_id).order_by(Export.id)
    )
    return list(result.scalars())
