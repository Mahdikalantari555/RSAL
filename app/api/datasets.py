"""Dataset ingestion endpoints (dataset-ingestion capability)."""

from __future__ import annotations

from pathlib import Path

import anyio
from fastapi import APIRouter, HTTPException, UploadFile
from sqlalchemy import select

from ..models import Dataset
from ..schemas import DatasetOut
from ..services.raster_service import RasterError, extract_metadata
from ..storage import project_dir, unique_name
from .deps import SessionDep, SettingsDep, get_dataset, get_project

router = APIRouter(prefix="/projects/{project_id}", tags=["datasets"])

ALLOWED_SUFFIXES = {".tif", ".tiff"}
CHUNK = 1024 * 1024


@router.post("/upload", response_model=DatasetOut, status_code=201)
async def upload_geotiff(
    project_id: int, file: UploadFile, session: SessionDep, settings: SettingsDep
) -> Dataset:
    await get_project(session, project_id)

    filename = file.filename or "upload.tif"
    if Path(filename).suffix.lower() not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=422, detail="Only GeoTIFF files (.tif/.tiff) are accepted")

    dest_dir = project_dir(settings, "uploads", project_id)
    dest = dest_dir / unique_name(filename)

    size = 0
    try:
        async with await anyio.open_file(dest, "wb") as out:
            while chunk := await file.read(CHUNK):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise HTTPException(status_code=413, detail="Upload exceeds size limit")
                await out.write(chunk)
    except HTTPException:
        dest.unlink(missing_ok=True)
        raise
    finally:
        await file.close()

    if size == 0:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail="Empty file")

    try:
        meta = await anyio.to_thread.run_sync(extract_metadata, dest)
    except RasterError as exc:
        dest.unlink(missing_ok=True)
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    dataset = Dataset(
        project_id=project_id,
        filename=filename,
        path=str(dest),
        **meta,
    )
    session.add(dataset)
    await session.commit()
    await session.refresh(dataset)
    return dataset


@router.get("/dataset", response_model=list[DatasetOut])
async def list_datasets(project_id: int, session: SessionDep) -> list[Dataset]:
    await get_project(session, project_id)
    result = await session.execute(
        select(Dataset).where(Dataset.project_id == project_id).order_by(Dataset.id)
    )
    return list(result.scalars())


@router.get("/dataset/{dataset_id}", response_model=DatasetOut)
async def read_dataset(project_id: int, dataset_id: int, session: SessionDep) -> Dataset:
    await get_project(session, project_id)
    return await get_dataset(session, project_id, dataset_id)
