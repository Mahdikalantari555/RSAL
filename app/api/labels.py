"""Label management endpoints (label-management capability)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select

from ..models import Label
from ..schemas import LabelBatchCreate, LabelCreate, LabelOut
from ..services.label_service import derive_sample_id, latest_labels
from ..services.pipeline import run_training
from ..services.raster_service import make_grid
from ..services.training_service import TrainingError
from .deps import (
    SessionDep,
    SettingsDep,
    get_dataset,
    get_project,
    latest_dataset,
    project_labels,
)
from .training import run_to_metrics_out
from ..schemas import TrainResponse

router = APIRouter(prefix="/projects/{project_id}", tags=["labels"])


async def _store_label(session, settings, project, payload: LabelCreate) -> Label:
    if payload.class_name not in project.classes:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown class '{payload.class_name}'; project classes: {project.classes}",
        )

    if payload.dataset_id is not None:
        dataset = await get_dataset(session, project.id, payload.dataset_id)
    else:
        dataset = await latest_dataset(session, project.id)

    grid = (
        make_grid(dataset.height, dataset.width, settings.patch_size, settings.resolved_stride())
        if dataset is not None
        else None
    )
    sid, stype = derive_sample_id(payload, dataset, grid)

    result = await session.execute(
        select(func.max(Label.version)).where(
            Label.project_id == project.id, Label.sample_id == sid
        )
    )
    version = (result.scalar_one_or_none() or 0) + 1

    label = Label(
        project_id=project.id,
        dataset_id=dataset.id if dataset is not None else None,
        sample_id=sid,
        sample_type=stype,
        geometry=payload.geometry.model_dump(),
        coordinate_space=payload.coordinate_space,
        class_name=payload.class_name,
        iteration=payload.iteration,
        version=version,
    )
    session.add(label)
    return label


def _train_response(run) -> TrainResponse:
    return TrainResponse(
        id=run.id,
        project_id=run.project_id,
        iteration=run.iteration,
        model_type=run.model_type,
        checkpoint=run.checkpoint_path,
        n_samples=run.n_samples,
        metrics=run_to_metrics_out(run),
    )


@router.post("/labels", status_code=201)
async def submit_labels(
    project_id: int,
    payload: LabelCreate | LabelBatchCreate,
    session: SessionDep,
    settings: SettingsDep,
    auto_train: bool = Query(default=False, description="Train immediately after storing labels"),
    model_type: str = Query(default="rf", pattern="^(rf|lightgbm)$"),
):
    """Submit one label (object) or a batch ({"labels": [...]}).

    Re-submitting a label for an existing sample_id stores a corrected
    version; full history is preserved. Optionally triggers training on
    the current labeled data (auto_train).
    """
    project = await get_project(session, project_id)

    if isinstance(payload, LabelBatchCreate):
        items = payload.labels
        do_train = payload.auto_train or auto_train
        train_type = payload.model_type if payload.auto_train else model_type
    else:
        items = [payload]
        do_train = auto_train
        train_type = model_type

    stored = [await _store_label(session, settings, project, item) for item in items]
    await session.commit()
    for label in stored:
        await session.refresh(label)

    if isinstance(payload, LabelCreate) and not do_train:
        return LabelOut.model_validate(stored[0])

    result = {
        "labels": [LabelOut.model_validate(l) for l in stored],
        "training": None,
        "training_error": None,
    }
    if do_train:
        try:
            run = await run_training(session, settings, project, model_type=train_type)
            result["training"] = _train_response(run).model_dump()
        except TrainingError as exc:
            result["training_error"] = str(exc)
    return result


@router.get("/labels", response_model=list[LabelOut])
async def list_current_labels(
    project_id: int,
    session: SessionDep,
    all_versions: bool = Query(default=False),
) -> list[Label]:
    """Current (latest-version) labels; pass all_versions=true for full history."""
    await get_project(session, project_id)
    labels = await project_labels(session, project_id)
    return labels if all_versions else latest_labels(labels)


@router.get("/history", response_model=list[LabelOut])
async def label_history(project_id: int, session: SessionDep) -> list[Label]:
    """Full label history for the project (all samples, all versions)."""
    await get_project(session, project_id)
    return await project_labels(session, project_id)


@router.delete("/labels/{sample_id}", status_code=204)
async def delete_sample_labels(project_id: int, sample_id: str, session: SessionDep) -> None:
    """Delete every label version of a sample within the project."""
    await get_project(session, project_id)
    result = await session.execute(
        select(Label).where(Label.project_id == project_id, Label.sample_id == sample_id)
    )
    labels = result.scalars().all()
    if not labels:
        raise HTTPException(status_code=404, detail=f"No labels for sample '{sample_id}'")
    for label in labels:
        await session.delete(label)
    await session.commit()
