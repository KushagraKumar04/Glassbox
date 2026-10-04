"""
File profiling — turns an uploaded file into a profiled DuckDB view.

Handles:
  .csv / .tsv       → read_csv_auto
  .xlsx / .xls      → convert to CSV, then read_csv_auto
  .parquet          → read_parquet
  .json             → read_json_auto
"""
from __future__ import annotations

import re
from pathlib import Path

import pandas as pd

from app.services.duckdb_service import DuckDBService

# Extension → DuckDB reader key
_SUPPORTED: dict[str, str] = {
    ".csv": "csv",
    ".tsv": "csv",
    ".txt": "csv",
    ".xlsx": "csv",   # converted to CSV first
    ".xls": "csv",
    ".parquet": "parquet",
    ".json": "json",
    ".jsonl": "json",
}

_MAX_XLSX_ROWS = 500_000  # guard against monster spreadsheets


def supported_extensions() -> list[str]:
    return sorted(_SUPPORTED.keys())


def detect_type(path: Path) -> str:
    """Return the DuckDB reader key for a file path."""
    ext = path.suffix.lower()
    if ext not in _SUPPORTED:
        raise ValueError(
            f"Unsupported file type '{ext}'. "
            f"Allowed: {', '.join(supported_extensions())}"
        )
    return _SUPPORTED[ext]


def sanitize_table_name(name: str) -> str:
    """
    Turn an arbitrary filename stem into a safe SQL identifier.

    'My Data 2025-01.csv' → 'my_data_2025_01'
    """
    name = name.lower().strip()
    name = re.sub(r"[^a-z0-9_]+", "_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    if not name:
        name = "dataset"
    if name[0].isdigit():
        name = f"d_{name}"
    return name[:60]


def _convert_excel_to_csv(path: Path) -> Path:
    """Convert .xlsx/.xls to a sibling .csv and return the new path."""
    df = pd.read_excel(path, nrows=_MAX_XLSX_ROWS)
    out = path.with_suffix(".csv")
    df.to_csv(out, index=False)
    return out


def profile_file(
    path: Path,
    table_name: str | None = None,
    sample_size: int = 5,
    original_name: str | None = None,
) -> dict:
    """
    Register the file with DuckDB, profile it, and return the profile dict.

    The returned dict is JSON-serializable and safe to persist in SQLite.

    Args:
        path:         the uploaded file
        table_name:   SQL identifier; derived from filename if omitted
        sample_size:  how many preview rows to include

    Returns:
        {
            table, row_count, column_count,
            columns: [...],
            sample: [...],
            source_path: str,
            file_type: str,
        }
    """
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    original_path = path
    file_type = detect_type(path)

    # Excel → CSV conversion
    if path.suffix.lower() in {".xlsx", ".xls"}:
        path = _convert_excel_to_csv(path)

    # Derive a table name if not provided
    if not table_name:
        table_name = sanitize_table_name(original_path.stem)

    db = DuckDBService()
    try:
        db.register_file(str(path), table_name, file_type)
        profile = db.profile(table_name, sample_size=sample_size)
    finally:
        db.close()

    profile["source_path"] = str(path)
    profile["file_type"] = file_type
    profile["original_filename"] = original_name or original_path.name
    return profile


def estimate_row_count(path: Path) -> int:
    """
    Cheap row-count estimate without full profiling.
    Useful for pre-upload validation.
    """
    if not path.exists():
        return 0
    try:
        file_type = detect_type(path)
        if path.suffix.lower() in {".xlsx", ".xls"}:
            return -1  # unknown until conversion
        db = DuckDBService()
        try:
            db.register_file(str(path), "_estimate", file_type)
            n = db.con.execute("SELECT COUNT(*) FROM _estimate").fetchone()[0]
            return int(n)
        finally:
            db.close()
    except Exception:
        return -1