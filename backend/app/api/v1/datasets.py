"""
Dataset endpoints (user-scoped).

    POST   /api/v1/datasets/upload    multipart file → profiled + registered
    GET    /api/v1/datasets           list current user's datasets
    GET    /api/v1/datasets/{id}      fetch one
    DELETE /api/v1/datasets/{id}      remove row + file
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.models import Dataset, User
from app.db.session import get_session
from app.core.audit import audit
from app.dependencies.auth import get_current_user
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
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
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
            f"File exceeds {settings.max_upload_size_mb} MB (got {size_mb:.1f} MB)",
        )

    dataset_id = uuid.uuid4().hex[:12]
    stem = Path(file.filename).stem
    table_name = f"{sanitize_table_name(stem)}_{dataset_id[:6]}"

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)
    dest = upload_dir / f"{dataset_id}_{file.filename}"
    dest.write_bytes(content)

    try:
        profile = profile_file(dest, table_name=table_name)
    except Exception as e:
        dest.unlink(missing_ok=True)
        raise HTTPException(400, f"Profiling failed: {e}")

    ds = Dataset(
        id=dataset_id,
        user_id=user.id,
        name=file.filename,
        table_name=table_name,
        file_path=str(dest),
        file_type=detect_type(dest),
        row_count=profile["row_count"],
        column_count=profile["column_count"],
        profile=profile,
    )
    session.add(ds)
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        dest.unlink(missing_ok=True)
        msg = str(e)
        if "UNIQUE" in msg.upper():
            raise HTTPException(
                409,
                f"You already have a dataset named '{file.filename}'. "
                f"Delete it first or rename the file.",
            )
        raise HTTPException(500, f"Failed to save dataset: {msg[:200]}")
    await session.refresh(ds)

    await audit(
        "dataset.upload",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="dataset",
        target_id=ds.id,
        details={
            "filename": file.filename,
            "file_type": ds.file_type,
            "rows": ds.row_count,
            "columns": ds.column_count,
            "size_mb": round(size_mb, 2),
        },
    )

    return ds.to_dict()


@router.get("")
async def list_datasets(
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    result = await session.execute(
        select(Dataset)
        .where(Dataset.user_id == user.id)
        .order_by(Dataset.created_at.desc())
    )
    return [ds.to_dict() for ds in result.scalars().all()]


@router.get("/{dataset_id}")
async def get_dataset(
    dataset_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    ds = await session.get(Dataset, dataset_id)
    if not ds or ds.user_id != user.id:
        raise HTTPException(404, "Dataset not found")
    return ds.to_dict()


@router.delete("/{dataset_id}")
async def delete_dataset(
    request: Request,
    dataset_id: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    ds = await session.get(Dataset, dataset_id)
    if not ds or ds.user_id != user.id:
        raise HTTPException(404, "Dataset not found")

    try:
        Path(ds.file_path).unlink(missing_ok=True)
    except Exception:
        pass

    await session.delete(ds)
    await session.commit()

    await audit(
        "dataset.delete",
        request=request,
        user_id=user.id,
        username=user.username,
        target_type="dataset",
        target_id=dataset_id,
        details={"name": ds.name, "table_name": ds.table_name},
    )

    return {"deleted": dataset_id}