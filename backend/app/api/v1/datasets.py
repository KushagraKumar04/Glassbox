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

import structlog
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.core.errors import sanitize_message
from app.core.file_signature import UploadSignatureError, verify_upload
from app.db.models import Dataset, User
from app.db.session import get_session
from app.dependencies.auth import get_current_user
from app.core.audit import audit
from app.services.profiling_service import (
    detect_type,
    profile_file,
    sanitize_table_name,
    supported_extensions,
)

router = APIRouter(prefix="/datasets", tags=["datasets"])
settings = get_settings()
log = structlog.get_logger()


def _validate_filename(name: str) -> str:
    suffix = Path(name).suffix.lower()
    if suffix not in supported_extensions():
        raise HTTPException(
            400,
            f"Unsupported file type '{suffix}'. "
            f"Allowed: {', '.join(supported_extensions())}",
        )
    return suffix


def _normalize_text_bytes(content: bytes) -> bytes:
    """
    Return `content` as clean UTF-8 with no BOM.

    Handles:
      - UTF-8 with BOM (EF BB BF)  → strip, decode as UTF-8
      - UTF-16 LE with BOM (FF FE) → strip, decode as UTF-16, re-encode
      - UTF-16 BE with BOM (FE FF) → strip, decode as UTF-16, re-encode
      - Plain UTF-8 (no BOM)       → return as-is

    On any decode error, returns the original bytes so DuckDB can
    surface its own error rather than us masking the real content.
    """
    if content.startswith(b"\xef\xbb\xbf"):
        # UTF-8 BOM — strip and return the rest untouched
        return content[3:]

    if content.startswith(b"\xff\xfe"):
        # UTF-16 LE with BOM
        try:
            return content[2:].decode("utf-16-le").encode("utf-8")
        except UnicodeDecodeError:
            return content

    if content.startswith(b"\xfe\xff"):
        # UTF-16 BE with BOM
        try:
            return content[2:].decode("utf-16-be").encode("utf-8")
        except UnicodeDecodeError:
            return content

    return content


def _cleanup_upload_group(upload_dir: Path, dataset_id: str) -> None:
    """
    Remove every file in `upload_dir` whose name starts with `dataset_id`.

    A single logical upload may be represented by more than one file
    (e.g. the original .xlsx plus the converted .csv). All of them share
    the dataset_id prefix because we name files `<dataset_id>_<original>`.
    """
    try:
        for f in upload_dir.glob(f"{dataset_id}_*"):
            if f.is_file():
                f.unlink(missing_ok=True)
    except Exception:
        # Cleanup is best-effort — never fail the request on it.
        pass


async def _read_capped(file: UploadFile, cap_bytes: int) -> bytes:
    """
    Read the whole UploadFile into memory but abort as soon as it
    exceeds `cap_bytes`. Prevents a crafted 500 MB upload from
    consuming RAM before the size check runs.

    Starlette spools UploadFile to a temp file past ~1 MB, so this
    only controls what we then load into memory — the network read is
    handled by the multipart parser.
    """
    chunk_size = settings.upload_stream_chunk_bytes
    chunks: list[bytes] = []
    total = 0

    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total += len(chunk)
        if total > cap_bytes:
            # Drain and reject — nothing left to do, the request is dead.
            raise HTTPException(
                413,
                f"File exceeds {cap_bytes // 1_048_576} MB.",
            )
        chunks.append(chunk)

    return b"".join(chunks)


@router.post("/upload")
async def upload_dataset(
    request: Request,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    if not file.filename:
        raise HTTPException(400, "Missing filename")

    suffix = _validate_filename(file.filename)

    # ── Signature check on the first few KB ─────────────────
    if settings.upload_signature_check_enabled:
        try:
            head = await file.read(8192)
            await file.seek(0)
            verify_upload(head, suffix, filename=file.filename)
        except UploadSignatureError as e:
            raise HTTPException(400, str(e))

    # ── Streaming size cap ──────────────────────────────────
    cap_bytes = settings.max_upload_size_mb * 1_048_576
    content = await _read_capped(file, cap_bytes)

    if not content:
        raise HTTPException(400, "Uploaded file is empty.")

    # ── Normalize text encodings ────────────────────────────
    # PowerShell, Excel exports, and Notepad on Windows can write
    # UTF-8 (with BOM), UTF-16 LE, or UTF-16 BE. DuckDB's CSV
    # sniffer rejects any BOM and often fails entirely on UTF-16.
    # Normalize everything to clean UTF-8 before the file hits disk.
    if suffix in (".csv", ".tsv", ".json", ".jsonl", ".txt"):
        content = _normalize_text_bytes(content)

    import structlog as _slog
    _slog.get_logger().info(
        "upload_bytes",
        filename=file.filename,
        suffix=suffix,
        first_8=content[:8].hex() if content else "",
        size=len(content),
    )

    size_mb = len(content) / 1_048_576

    dataset_id = uuid.uuid4().hex[:12]
    stem = Path(file.filename).stem
    table_name = f"{sanitize_table_name(stem)}_{dataset_id[:6]}"

    upload_dir = Path(settings.upload_dir)
    upload_dir.mkdir(parents=True, exist_ok=True)

    # Filename is prefixed with the server-generated dataset_id — the
    # original name is kept for display only. Any path component in
    # `file.filename` is dropped by Path().name.
    safe_original = Path(file.filename).name
    dest = upload_dir / f"{dataset_id}_{safe_original}"
    dest.write_bytes(content)

    try:
        profile = profile_file(
            dest,
            table_name=table_name,
            original_name=file.filename,
        )
    except Exception as e:
        # Clean up any file that profiling may have created alongside `dest`.
        _cleanup_upload_group(upload_dir, dataset_id)
        safe = sanitize_message(str(e), max_len=300)
        raise HTTPException(400, f"Profiling failed: {safe}")

    # ── Effective file path ─────────────────────────────────
    # `profile["source_path"]` is what DuckDB actually reads — for .xlsx
    # this is the converted .csv, for everything else it's `dest`.
    # We store that path so future queries read the same file.
    effective_path = Path(profile.get("source_path") or dest)

    ds = Dataset(
        id=dataset_id,
        user_id=user.id,
        name=file.filename,
        table_name=table_name,
        file_path=str(effective_path),
        file_type=detect_type(effective_path),
        row_count=profile["row_count"],
        column_count=profile["column_count"],
        profile=profile,
    )
    session.add(ds)
    try:
        await session.commit()
    except Exception as e:
        await session.rollback()
        # A single upload can produce more than one file on disk
        # (e.g. .xlsx → .csv). Remove everything with this dataset's
        # prefix, matching the pattern used on profiling failure and
        # on delete.
        _cleanup_upload_group(upload_dir, dataset_id)
        msg = str(e)
        if "UNIQUE" in msg.upper():
            raise HTTPException(
                409,
                f"You already have a dataset named '{file.filename}'. "
                f"Delete it first or rename the file.",
            )
        safe = sanitize_message(str(e), max_len=200)
        raise HTTPException(500, f"Failed to save dataset: {safe}")
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

    # A single upload can produce more than one file on disk (e.g. .xlsx
    # → .csv conversion). Remove every file whose name starts with the
    # dataset_id prefix so nothing is orphaned.
    upload_dir = Path(settings.upload_dir)
    _cleanup_upload_group(upload_dir, ds.id)

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

# ═══════════════════════════════════════════════════════════════════════════
#  Column drill-down
# ═══════════════════════════════════════════════════════════════════════════

from typing import Any  # noqa: E402

from app.schemas import (  # noqa: E402
    ColumnStatsResponse,
    HistogramBucket,
    TopValue,
)
from app.services.duckdb_service import DuckDBService  # noqa: E402


def _classify(dtype: str) -> str:
    """Map a DuckDB type string to one of our four buckets."""
    t = dtype.upper()
    if any(k in t for k in ("DATE", "TIMESTAMP", "TIME")):
        return "date"
    if "BOOL" in t:
        return "boolean"
    if any(
        k in t
        for k in ("INT", "DOUBLE", "FLOAT", "DECIMAL", "NUMERIC", "REAL", "BIGINT")
    ):
        return "numeric"
    return "text"


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None
    try:
        f = float(v)
        if f != f:  # NaN
            return None
        return f
    except (TypeError, ValueError):
        return None


@router.get(
    "/{dataset_id}/columns/{column_name}",
    response_model=ColumnStatsResponse,
)
async def column_stats(
    dataset_id: str,
    column_name: str,
    user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """
    Return statistics, a histogram, and top values for one column.

    Runs a small set of aggregate queries against DuckDB. Scoped to the
    current user's dataset. Read-only.
    """
    import time

    t0 = time.time()

    ds = await session.get(Dataset, dataset_id)
    if not ds or ds.user_id != user.id:
        raise HTTPException(404, "Dataset not found")

    # Find the column in the profile (case-sensitive match)
    profile = ds.profile or {}
    columns = profile.get("columns", []) or []
    match = next(
        (c for c in columns if str(c.get("name")) == column_name),
        None,
    )
    if not match:
        raise HTTPException(404, f"Column '{column_name}' not found")

    dtype = str(match.get("type") or "")
    kind = _classify(dtype)
    table = ds.table_name
    col = '"' + column_name.replace('"', '""') + '"'
    tbl = '"' + table.replace('"', '""') + '"'

    db = DuckDBService()
    try:
        try:
            db.register_file(ds.file_path, table, ds.file_type)
        except Exception as e:
            raise HTTPException(
                400,
                f"Failed to load dataset: {sanitize_message(str(e), max_len=200)}",
            )

        # ── Always: totals ────────────────────────────────
        try:
            totals = db.execute_with_timeout(
                f"SELECT COUNT(*), COUNT({col}), COUNT(DISTINCT {col}) "
                f"FROM {tbl}",
                fetch="one",
            )
        except Exception as e:
            raise HTTPException(
                400,
                f"Query failed: {sanitize_message(str(e), max_len=200)}",
            )

        row_count = int(totals[0] or 0)
        non_null = int(totals[1] or 0)
        distinct = int(totals[2] or 0)
        null_count = row_count - non_null
        null_rate = round(null_count / row_count, 4) if row_count else 0.0

        resp = ColumnStatsResponse(
            dataset_id=dataset_id,
            table=table,
            column=column_name,
            kind=kind,  # type: ignore[arg-type]
            dtype=dtype,
            row_count=row_count,
            null_count=null_count,
            null_rate=null_rate,
            distinct_count=distinct,
        )

        # ── Sample values ─────────────────────────────────
        try:
            sample_rows = db.execute_with_timeout(
                f"SELECT DISTINCT {col} FROM {tbl} "
                f"WHERE {col} IS NOT NULL LIMIT 10",
                fetch="all",
            )
            resp.sample = [r[0] for r in sample_rows]
        except Exception as e:
            log.warning(
                "column_stats_sample_failed",
                dataset_id=dataset_id,
                column=column_name,
                error=str(e)[:160],
            )
            resp.sample = []

        # ── Kind-specific analysis ────────────────────────
        if kind == "numeric" and non_null > 0:
            try:
                stats = db.execute_with_timeout(
                    f"SELECT "
                    f"  MIN({col}), MAX({col}), AVG({col}), "
                    f"  MEDIAN({col}), "
                    f"  QUANTILE_CONT({col}, 0.25), "
                    f"  QUANTILE_CONT({col}, 0.75), "
                    f"  STDDEV_SAMP({col}) "
                    f"FROM {tbl}",
                    fetch="one",
                )
                resp.minimum = _safe_float(stats[0])
                resp.maximum = _safe_float(stats[1])
                resp.mean = _safe_float(stats[2])
                resp.median = _safe_float(stats[3])
                resp.p25 = _safe_float(stats[4])
                resp.p75 = _safe_float(stats[5])
                resp.std = _safe_float(stats[6])
            except Exception as e:
                log.warning(
                    "column_stats_numeric_failed",
                    dataset_id=dataset_id,
                    column=column_name,
                    error=str(e)[:160],
                )

            # Histogram — 20 buckets between min and max
            try:
                lo, hi = resp.minimum, resp.maximum
                if lo is not None and hi is not None and hi > lo:
                    buckets = 20
                    width = (hi - lo) / buckets
                    rows = db.execute_with_timeout(
                        f"SELECT "
                        f"  LEAST(FLOOR(({col} - ?) / ?), ?) AS bucket, "
                        f"  COUNT(*) AS n "
                        f"FROM {tbl} "
                        f"WHERE {col} IS NOT NULL "
                        f"GROUP BY 1 ORDER BY 1",
                        [lo, width, buckets - 1],
                        fetch="all",
                    )
                    by_bucket = {int(r[0]): int(r[1]) for r in rows}
                    for i in range(buckets):
                        b_lo = lo + width * i
                        b_hi = lo + width * (i + 1)
                        resp.histogram.append(
                            HistogramBucket(
                                label=f"{_fmt_num(b_lo)}–{_fmt_num(b_hi)}",
                                value=float(by_bucket.get(i, 0)),
                                lower=b_lo,
                                upper=b_hi,
                            )
                        )
                elif lo is not None and hi is not None and lo == hi:
                    resp.histogram.append(
                        HistogramBucket(
                            label=_fmt_num(lo),
                            value=float(non_null),
                            lower=lo,
                            upper=hi,
                        )
                    )
            except Exception as e:
                log.warning(
                    "column_stats_histogram_failed",
                    dataset_id=dataset_id,
                    column=column_name,
                    error=str(e)[:160],
                )

        elif kind == "date" and non_null > 0:
            try:
                date_range = db.execute_with_timeout(
                    f"SELECT MIN({col}), MAX({col}) FROM {tbl}",
                    fetch="one",
                )
                resp.date_min = str(date_range[0]) if date_range[0] else None
                resp.date_max = str(date_range[1]) if date_range[1] else None
            except Exception as e:
                log.warning(
                    "column_stats_date_range_failed",
                    dataset_id=dataset_id,
                    column=column_name,
                    error=str(e)[:160],
                )

            # Monthly distribution (bounded to avoid unbounded buckets)
            try:
                rows = db.execute_with_timeout(
                    f"SELECT "
                    f"  date_trunc('month', {col}) AS m, "
                    f"  COUNT(*) AS n "
                    f"FROM {tbl} "
                    f"WHERE {col} IS NOT NULL "
                    f"GROUP BY 1 ORDER BY 1 LIMIT 60",
                    fetch="all",
                )
                for m, n in rows:
                    label = str(m)[:7] if m else "—"
                    resp.histogram.append(
                        HistogramBucket(label=label, value=float(n))
                    )
            except Exception as e:
                log.warning(
                    "column_stats_monthly_failed",
                    dataset_id=dataset_id,
                    column=column_name,
                    error=str(e)[:160],
                )

        elif kind == "boolean":
            try:
                rows = db.execute_with_timeout(
                    f"SELECT {col}, COUNT(*) FROM {tbl} "
                    f"GROUP BY 1 ORDER BY 2 DESC",
                    fetch="all",
                )
                for v, n in rows:
                    resp.top_values.append(
                        TopValue(
                            value="null" if v is None else str(bool(v)).lower(),
                            count=int(n),
                            pct=round(int(n) / row_count * 100, 2) if row_count else 0,
                        )
                    )
            except Exception as e:
                log.warning(
                    "column_stats_boolean_failed",
                    dataset_id=dataset_id,
                    column=column_name,
                    error=str(e)[:160],
                )

        else:
            # Text — top 20 values by frequency
            try:
                rows = db.execute_with_timeout(
                    f"SELECT {col}, COUNT(*) AS n "
                    f"FROM {tbl} "
                    f"WHERE {col} IS NOT NULL "
                    f"GROUP BY 1 ORDER BY 2 DESC LIMIT 20",
                    fetch="all",
                )
                for v, n in rows:
                    resp.top_values.append(
                        TopValue(
                            value=str(v),
                            count=int(n),
                            pct=round(int(n) / row_count * 100, 2) if row_count else 0,
                        )
                    )
            except Exception as e:
                log.warning(
                    "column_stats_text_failed",
                    dataset_id=dataset_id,
                    column=column_name,
                    error=str(e)[:160],
                )

        resp.elapsed_ms = int((time.time() - t0) * 1000)
        return resp

    finally:
        try:
            db.close()
        except Exception:
            pass


def _fmt_num(v: float) -> str:
    """Compact number formatting for histogram bucket labels."""
    av = abs(v)
    if av >= 1_000_000:
        return f"{v/1_000_000:.1f}M"
    if av >= 1_000:
        return f"{v/1_000:.1f}k"
    if av >= 1:
        return f"{v:.0f}"
    return f"{v:.3g}"