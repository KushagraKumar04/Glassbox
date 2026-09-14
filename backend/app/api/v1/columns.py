"""
Column metadata endpoint for the filter UI.

    GET /api/v1/columns                all columns across visible datasets
    GET /api/v1/columns?dataset_ids=a,b   columns from selected datasets
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Dataset, User
from app.db.session import get_session
from app.dependencies.auth import get_current_user
from app.schemas import ColumnInfo

router = APIRouter(prefix="/columns", tags=["columns"])


# ── Type classifier ─────────────────────────────────────────

def _classify(dtype: str) -> str:
    t = dtype.upper()
    if any(k in t for k in ("DATE", "TIMESTAMP", "TIME")):
        return "date"
    if any(k in t for k in ("BOOL",)):
        return "boolean"
    if any(
        k in t
        for k in ("INT", "DOUBLE", "FLOAT", "DECIMAL", "NUMERIC", "REAL", "BIGINT")
    ):
        return "numeric"
    return "text"


@router.get("", response_model=list[ColumnInfo])
async def list_columns(
    dataset_ids: str | None = Query(
        default=None,
        description="Comma-separated dataset IDs. Omit for 'all datasets'.",
    ),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Return columns the filter UI can build conditions on.

    Columns are merged across the selected datasets by name. Two datasets
    that both have `region` collapse to one entry.

    `distinct_preview` contains up to 10 sample values for enum-like columns
    (text with low cardinality) so the UI can show a picker.
    """
    ids = (
        [s.strip() for s in dataset_ids.split(",") if s.strip()]
        if dataset_ids
        else []
    )

    if ids:
        result = await session.execute(
            select(Dataset).where(Dataset.id.in_(ids))
        )
    else:
        result = await session.execute(
            select(Dataset).order_by(Dataset.created_at.desc())
        )
    datasets = result.scalars().all()

    # Merge columns by name
    merged: dict[str, dict[str, Any]] = {}

    for ds in datasets:
        profile = ds.profile or {}
        columns = profile.get("columns", []) or []
        sample_rows = profile.get("sample", []) or []

        for col in columns:
            name = str(col.get("name") or "").strip()
            if not name:
                continue
            dtype = str(col.get("type") or "")
            entry = merged.setdefault(name, {
                "name": name,
                "type": dtype,
                "kind": _classify(dtype),
                "from_datasets": [],
                "preview_values": [],
            })
            if ds.name not in entry["from_datasets"]:
                entry["from_datasets"].append(ds.name)

            # Collect distinct sample values (for text/boolean only)
            if entry["kind"] in ("text", "boolean"):
                for row in sample_rows:
                    if len(entry["preview_values"]) >= 10:
                        break
                    v = row.get(name)
                    if v is None:
                        continue
                    if v not in entry["preview_values"]:
                        entry["preview_values"].append(v)

    out = [
        ColumnInfo(
            name=e["name"],
            type=e["type"],
            kind=e["kind"],
            from_datasets=e["from_datasets"],
            distinct_preview=e["preview_values"][:10],
        )
        for e in merged.values()
    ]

    # Sort: alphabetical by name for predictable UI ordering
    out.sort(key=lambda c: c.name.lower())
    return out