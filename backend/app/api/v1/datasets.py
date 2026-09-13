"""
Dataset endpoints:

    POST   /api/v1/datasets/upload    multipart file → profiled + registered
    GET    /api/v1/datasets           list all
    GET    /api/v1/datasets/{id}      fetch one with profile
    DELETE /api/v1/datasets/{id}      remove row + file
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import Dataset
from app.db.session import get_session
from app.services.profiling_service import (
    detect_type,
    profile_file,
    sanitize_table_name,
    supported_extensions,
)

router = APIRouter(prefix="/datasets", tags=["datasets"])
settings = get_settings()


def _validate_filename(name: str) -> str:
    suffix = Path(name).suffix.lower()
    if suffix not in supported_extensions():
        raise HTTPException(
            400,
            f"Unsupported file type '{suffix}'. "
            f"Allowed: {', '.join(supported_extensions())}",
        )
    return suffix


@router.post("/upload")
async def upload_dataset(
    file: UploadFile = File(...),
    session: AsyncSession = Depends(get_session),
):
    if not file.filename:
        raise HTTPException(400, "Missing filename")

    _validate_filename(file.filename)

    content = await file.read()
    size_mb = len(content) / 1_048_576
    if size_mb > settings.max_upload_size_mb:
        raise HTTPException(
            413,
            f"File exceeds {settings.max_upload_size_mb} MB "
            f"(got {size_mb:.1f} MB)",
        )

    # Unique id + derived SQL-safe table name
    dataset_id = uuid.uuid4().hex[:12]
    stem = Path(file.filename).stem
    table_name = f"{sanitize_table_name(stem)}_{dataset_id[:6]}"

    # Persist the raw file
    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / f"{dataset_id}_{file.filename}"
    dest.write_bytes(content)

    # Profile it
    try:
        profile = profile_file(dest, table_name=table_name)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, f"Profiling failed: {e}")

    # Persist metadata
    ds = Dataset(
        id=dataset_id,
        name=file.filename,
        table_name=table_name,
        file_path=str(dest),
        file_type=detect_type(dest),
        row_count=profile["row_count"],
        column_count=profile["column_count"],
        profile=profile,
    )
    session.add(ds)
    await session.commit()
    await session.refresh(ds)

    return ds.to_dict()


@router.get("")
async def list_datasets(session: AsyncSession = Depends(get_session)):
    result = await session.execute(
        select(Dataset).order_by(Dataset.created_at.desc())
    )
    return [ds.to_dict() for ds in result.scalars().all()]


@router.get("/{dataset_id}")
async def get_dataset(
    dataset_id: str,
    session: AsyncSession = Depends(get_session),
):
    ds = await session.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")
    return ds.to_dict()


@router.delete("/{dataset_id}")
async def delete_dataset(
    dataset_id: str,
    session: AsyncSession = Depends(get_session),
):
    ds = await session.get(Dataset, dataset_id)
    if not ds:
        raise HTTPException(404, "Dataset not found")

    # Remove file (best-effort)
    try:
        Path(ds.file_path).unlink(missing_ok=True)
    except Exception:
        pass

    await session.delete(ds)
    await session.commit()
    return {"deleted": dataset_id}