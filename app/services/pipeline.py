"""End-to-end training pipeline shared by /train and label auto-training."""

from __future__ import annotations

import uuid
from pathlib import Path

import anyio
import numpy as np
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..config import Settings
from ..models import Dataset, Project, TrainingRun
from ..storage import project_dir
from .label_service import build_training_targets
from .raster_service import (
    RasterError,
    load_raster,
    make_grid,
    parse_sample_id,
    patch_features,
)
from .training_service import TrainingError, save_checkpoint, train_model


async def run_training(
    session: AsyncSession,
    settings: Settings,
    project: Project,
    *,
    model_type: str = "rf",
    iteration: int | None = None,
    test_size: float | None = None,
    params: dict | None = None,
) -> TrainingRun:
    """Train on the current labeled data and persist checkpoint + metrics."""
    from ..api.deps import project_labels

    labels = await project_labels(session, project.id)
    result = await session.execute(select(Dataset).where(Dataset.project_id == project.id))
    datasets = {d.id: d for d in result.scalars()}
    if not datasets:
        raise TrainingError("Project has no dataset; upload a GeoTIFF first")
    default_dataset = max(datasets.values(), key=lambda d: d.id)

    patch_size = settings.patch_size
    stride = settings.resolved_stride()
    grids = {
        ds_id: make_grid(ds.height, ds.width, patch_size, stride)
        for ds_id, ds in datasets.items()
    }

    sids, y, _ = build_training_targets(
        labels, datasets, default_dataset, grids, project.classes
    )
    if not sids:
        raise TrainingError(
            "No usable labeled patches. Submit labels whose geometry falls inside a dataset."
        )

    # Gather features per dataset (each raster is read once).
    by_dataset: dict[int, list[tuple[int, int, int]]] = {}
    for sid, target in zip(sids, y):
        parsed = parse_sample_id(sid)
        if parsed is None or parsed[0] not in datasets:
            continue
        by_dataset.setdefault(parsed[0], []).append((parsed[1], parsed[2], target))

    def _extract() -> tuple[np.ndarray, list[int], int]:
        X_parts: list[np.ndarray] = []
        y_out: list[int] = []
        bands = 0
        for ds_id, items in by_dataset.items():
            ds = datasets[ds_id]
            arr = load_raster(ds.path, ds.nodata, settings.max_raster_elements)
            bands = arr.shape[0]
            grid = grids[ds_id]
            feats = patch_features(arr, grid)
            n_cols = len(grid.xs)
            for row, col, target in items:
                if not (0 <= row < len(grid.ys) and 0 <= col < n_cols):
                    continue
                X_parts.append(feats[row * n_cols + col])
                y_out.append(target)
        if not X_parts:
            raise TrainingError("No labeled patch intersected the dataset grid")
        return np.vstack(X_parts), y_out, bands

    try:
        X, y_final, bands = await anyio.to_thread.run_sync(_extract)
    except RasterError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    if iteration is None:
        runs = await session.execute(
            select(TrainingRun.iteration)
            .where(TrainingRun.project_id == project.id)
            .order_by(TrainingRun.iteration.desc())
            .limit(1)
        )
        last = runs.scalar_one_or_none()
        if last is not None:
            iteration = last + 1
        else:
            iteration = max((l.iteration for l in labels), default=0)

    def _train():
        return train_model(
            X,
            y_final,
            project.classes,
            model_type,
            params or {},
            test_size if test_size is not None else settings.test_size,
            settings.random_state,
        )

    model, metrics, evaluation = await anyio.to_thread.run_sync(_train)
    metrics["evaluation"] = evaluation

    models_dir = project_dir(settings, "models", project.id)
    checkpoint = models_dir / f"model_iter_{iteration}_{model_type}_{uuid.uuid4().hex[:8]}.joblib"
    await anyio.to_thread.run_sync(
        lambda: save_checkpoint(
            checkpoint,
            model,
            model_type=model_type,
            classes=project.classes,
            iteration=iteration,
            patch_size=patch_size,
            stride=stride,
            bands=bands,
        )
    )

    run = TrainingRun(
        project_id=project.id,
        iteration=iteration,
        model_type=model_type,
        checkpoint_path=str(checkpoint),
        classes=project.classes,
        n_samples=len(y_final),
        metrics=metrics,
        params=params or {},
    )
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


def training_error_to_http(exc: TrainingError) -> HTTPException:
    return HTTPException(status_code=409, detail=str(exc))


def checkpoint_or_409(run: TrainingRun) -> dict:
    from .training_service import load_checkpoint

    path = Path(run.checkpoint_path)
    if not path.exists():
        raise HTTPException(status_code=409, detail=f"Checkpoint missing on disk: {path.name}")
    return load_checkpoint(path)
