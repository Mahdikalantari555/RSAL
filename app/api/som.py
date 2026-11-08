"""Self-Organizing Map (SOM) exploration endpoints."""

from __future__ import annotations

from pathlib import Path

import anyio
import numpy as np
from fastapi import APIRouter, Body, HTTPException, Query

from ..schemas import SomCell, SomRequest, SomResponse
from ..services.al_service import uncertainty_scores
from ..services.label_service import build_training_targets
from ..services.raster_service import (
    RasterError,
    load_raster,
    make_grid,
    patch_features,
    sample_id,
)
from ..services.som_service import fit_som, normalized_band_profiles
from ..services.training_service import align_probabilities, load_checkpoint
from .deps import (
    SessionDep,
    SettingsDep,
    get_project,
    latest_run,
    project_labels,
    require_dataset,
)

router = APIRouter(prefix="/projects/{project_id}", tags=["self-organizing-map"])


async def _run_som(
    project_id: int,
    payload: SomRequest,
    session: SessionDep,
    settings: SettingsDep,
) -> SomResponse:
    project = await get_project(session, project_id)
    dataset = await require_dataset(session, project_id, payload.dataset_id)

    run = await latest_run(session, project_id)
    checkpoint = None
    model_iteration: int | None = None
    if run is not None and Path(run.checkpoint_path).exists():
        loaded = load_checkpoint(run.checkpoint_path)
        if loaded.get("bands") == dataset.bands:
            checkpoint = loaded
            model_iteration = run.iteration

    patch_size = payload.patch_size or (checkpoint["patch_size"] if checkpoint else settings.patch_size)
    stride = payload.stride or (checkpoint["stride"] if checkpoint else settings.resolved_stride())
    grid = make_grid(dataset.height, dataset.width, patch_size, stride)

    labels = await project_labels(session, project_id)
    labeled_sids, labeled_targets, _ = build_training_targets(
        labels, {dataset.id: dataset}, dataset, {dataset.id: grid}, project.classes
    )
    label_by_sid = {
        sid: project.classes[target]
        for sid, target in zip(labeled_sids, labeled_targets)
    }

    n_rows, n_cols = grid.shape
    all_sids = [sample_id(dataset.id, r, c) for r in range(n_rows) for c in range(n_cols)]

    def _compute() -> SomResponse:
        arr = load_raster(dataset.path, dataset.nodata, settings.max_raster_elements)
        X = patch_features(arr, grid)
        som = fit_som(
            X,
            rows=payload.rows,
            cols=payload.cols,
            epochs=payload.epochs,
            sigma=payload.sigma,
            learning_rate=payload.learning_rate,
            random_state=settings.random_state,
        )
        band_means, band_profiles = normalized_band_profiles(X, som.weights_denorm, dataset.bands)

        probs = None
        pred_idx = None
        confs = None
        uncs = None
        if checkpoint is not None:
            model = checkpoint["model"]
            raw = np.asarray(model.predict_proba(X))
            model_classes = [project.classes[int(c)] for c in model.classes_]
            probs = align_probabilities(raw, model_classes, project.classes)
            pred_idx = np.argmax(probs, axis=1)
            confs = probs.max(axis=1)
            uncs = uncertainty_scores(probs, "entropy")

        grouped: dict[int, list[int]] = {}
        for patch_i, bmu in enumerate(som.bmus.tolist()):
            grouped.setdefault(int(bmu), []).append(patch_i)

        class_rank = {c: idx for idx, c in enumerate(project.classes)}
        cells: list[SomCell] = []
        active_neurons = 0

        for r in range(som.rows):
            for c in range(som.cols):
                u = r * som.cols + c
                idxs = grouped.get(u, [])
                if idxs:
                    active_neurons += 1
                    idx_arr = np.asarray(idxs, dtype=np.int64)
                    order = np.argsort(som.bmu_dists[idx_arr], kind="stable")
                    ordered = [int(idx_arr[k]) for k in order]
                    sids = [all_sids[k] for k in ordered]
                    rep_sid = sids[0]
                    cell_qe = float(som.bmu_dists[idx_arr].mean())
                else:
                    ordered = []
                    sids = []
                    rep_sid = None
                    cell_qe = 0.0

                label_counts: dict[str, int] = {}
                for sid in sids:
                    cls = label_by_sid.get(sid)
                    if cls is not None:
                        label_counts[cls] = label_counts.get(cls, 0) + 1
                labeled_count = sum(label_counts.values())
                dominant_label = (
                    max(label_counts.keys(), key=lambda name: (label_counts[name], -class_rank.get(name, 999)))
                    if label_counts
                    else None
                )

                prediction_counts: dict[str, int] = {}
                predicted_class: str | None = None
                mean_conf: float | None = None
                mean_unc: float | None = None
                if probs is not None and ordered:
                    for k in ordered:
                        cname = project.classes[int(pred_idx[k])]
                        prediction_counts[cname] = prediction_counts.get(cname, 0) + 1
                    predicted_class = max(
                        prediction_counts.keys(),
                        key=lambda name: (prediction_counts[name], -class_rank.get(name, 999)),
                    )
                    idx_arr = np.asarray(ordered, dtype=np.int64)
                    mean_conf = float(confs[idx_arr].mean())
                    mean_unc = float(uncs[idx_arr].mean())

                cells.append(
                    SomCell(
                        row=r,
                        col=c,
                        hit_count=len(sids),
                        labeled_count=labeled_count,
                        unlabeled_count=len(sids) - labeled_count,
                        u_value=float(som.u_matrix[r, c]),
                        quantization_error=cell_qe,
                        dominant_label=dominant_label,
                        label_counts=label_counts,
                        predicted_class=predicted_class,
                        prediction_counts=prediction_counts,
                        mean_confidence=mean_conf,
                        mean_uncertainty=mean_unc,
                        band_means=[float(v) for v in band_means[u]],
                        band_profile=[float(v) for v in band_profiles[u]],
                        representative_sample_id=rep_sid,
                        sample_ids=sids,
                    )
                )

        return SomResponse(
            project_id=project.id,
            dataset_id=dataset.id,
            rows=som.rows,
            cols=som.cols,
            epochs=som.epochs,
            total_patches=len(all_sids),
            labeled_patches=len(label_by_sid),
            active_neurons=active_neurons,
            quantization_error=som.quantization_error,
            topographic_error=som.topographic_error,
            model_iteration=model_iteration,
            bands=dataset.bands,
            classes=project.classes,
            u_matrix=[[float(v) for v in row] for row in som.u_matrix.tolist()],
            hit_grid=[[int(v) for v in row] for row in som.hit_grid.tolist()],
            cells=cells,
        )

    try:
        return await anyio.to_thread.run_sync(_compute)
    except RasterError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/som", response_model=SomResponse)
async def get_som(
    project_id: int,
    session: SessionDep,
    settings: SettingsDep,
    dataset_id: int | None = Query(default=None),
    rows: int | None = Query(default=None, ge=2, le=32),
    cols: int | None = Query(default=None, ge=2, le=32),
    epochs: int = Query(default=50, ge=5, le=500),
    patch_size: int | None = Query(default=None, ge=2, le=512),
    stride: int | None = Query(default=None, ge=1, le=512),
) -> SomResponse:
    """Fit and summarize a 2D Self-Organizing Map over dataset patch embeddings."""
    payload = SomRequest(
        dataset_id=dataset_id,
        rows=rows,
        cols=cols,
        epochs=epochs,
        patch_size=patch_size,
        stride=stride,
    )
    return await _run_som(project_id, payload, session, settings)


@router.post("/som", response_model=SomResponse)
async def build_som(
    project_id: int,
    session: SessionDep,
    settings: SettingsDep,
    payload: SomRequest = Body(default_factory=SomRequest),
) -> SomResponse:
    """Fit a custom-configured Self-Organizing Map over dataset patch embeddings."""
    return await _run_som(project_id, payload, session, settings)
