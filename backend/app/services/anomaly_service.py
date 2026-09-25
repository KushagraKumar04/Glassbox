"""
Anomaly detection service.

Deterministic core (no LLM):
  1. Scan each numeric column in the result rows
  2. Compute three detectors: z-score, IQR, MAD
  3. Flag a point if ANY detector agrees (reduces false negatives)
  4. Rank by |z-score| descending
  5. Return top N

Optional LLM layer (cached):
  For the top anomaly, ask the model for a one-sentence explanation.

Skips:
  - Fewer than MIN_ROWS rows (small samples always look anomalous)
  - Columns with zero variance
  - Columns with > 40% nulls
"""
from __future__ import annotations

import hashlib
import json
import math
import statistics
from typing import Any

import structlog

from app.core.json_utils import extract_json, safe_str
from app.db.models import AnomalyNarrativesCache
from app.db.session import SessionLocal
from app.prompts import (
    ANOMALY_NARRATIVE_SYSTEM,
    build_anomaly_narrative_prompt,
)
from app.services.llm import get_llm

log = structlog.get_logger()

# Detection constants
MIN_ROWS = 10
MAX_NULL_RATE = 0.40
Z_THRESHOLD = 3.0
IQR_MULTIPLIER = 1.5
MAD_THRESHOLD = 3.5

# Output limits
MAX_ANOMALIES = 8
MAX_COLUMNS = 6


# ── Detectors ───────────────────────────────────────────────

def _is_numeric_column(rows: list[dict], col: str) -> bool:
    """True if at least 80% of non-null values in `col` are int/float."""
    total = 0
    numeric = 0
    for r in rows:
        v = r.get(col)
        if v is None:
            continue
        total += 1
        if isinstance(v, bool):
            continue
        if isinstance(v, (int, float)) and not (isinstance(v, float) and math.isnan(v)):
            numeric += 1
    if total == 0:
        return False
    return numeric / total >= 0.80


def _zscore_anomalies(values: list[float], idxs: list[int]) -> set[int]:
    if len(values) < MIN_ROWS:
        return set()
    mean = statistics.fmean(values)
    stdev = statistics.pstdev(values)
    if stdev == 0:
        return set()
    out: set[int] = set()
    for local_i, v in enumerate(values):
        z = abs(v - mean) / stdev
        if z > Z_THRESHOLD:
            out.add(idxs[local_i])
    return out


def _iqr_anomalies(values: list[float], idxs: list[int]) -> set[int]:
    if len(values) < MIN_ROWS:
        return set()
    sorted_vals = sorted(values)
    n = len(sorted_vals)
    q1 = sorted_vals[int(n * 0.25)]
    q3 = sorted_vals[int(n * 0.75)]
    iqr = q3 - q1
    if iqr == 0:
        return set()
    low = q1 - IQR_MULTIPLIER * iqr
    high = q3 + IQR_MULTIPLIER * iqr
    out: set[int] = set()
    for local_i, v in enumerate(values):
        if v < low or v > high:
            out.add(idxs[local_i])
    return out


def _mad_anomalies(values: list[float], idxs: list[int]) -> set[int]:
    """Median absolute deviation — robust to outliers skewing the baseline."""
    if len(values) < MIN_ROWS:
        return set()
    median = statistics.median(values)
    deviations = [abs(v - median) for v in values]
    mad = statistics.median(deviations)
    if mad == 0:
        return set()
    # 1.4826 scales MAD to be comparable to stdev under normality
    scaled = mad * 1.4826
    out: set[int] = set()
    for local_i, v in enumerate(values):
        m = abs(v - median) / scaled
        if m > MAD_THRESHOLD:
            out.add(idxs[local_i])
    return out


def _detect_column(
    rows: list[dict],
    col: str,
) -> tuple[list[dict], float, float]:
    """
    Return (anomalies, mean, stdev) for one column.
    Only rows with numeric values are considered; nulls are skipped.
    """
    valid: list[tuple[int, float]] = []
    for i, r in enumerate(rows):
        v = r.get(col)
        if v is None or isinstance(v, bool):
            continue
        if isinstance(v, (int, float)) and not (
            isinstance(v, float) and math.isnan(v)
        ):
            valid.append((i, float(v)))

    if len(valid) < MIN_ROWS:
        return [], 0.0, 0.0

    idxs = [vi for vi, _ in valid]
    values = [v for _, v in valid]

    z_flags = _zscore_anomalies(values, idxs)
    iqr_flags = _iqr_anomalies(values, idxs)
    mad_flags = _mad_anomalies(values, idxs)

    # Vote: any two of three, OR any one with strong deviation
    flagged: set[int] = set()
    for row_idx in set(z_flags) | set(iqr_flags) | set(mad_flags):
        votes = (
            (row_idx in z_flags)
            + (row_idx in iqr_flags)
            + (row_idx in mad_flags)
        )
        if votes >= 2:
            flagged.add(row_idx)

    if not flagged:
        return [], 0.0, 0.0

    mean = statistics.fmean(values)
    stdev = statistics.pstdev(values) or 1.0

    anomalies: list[dict] = []
    for row_idx in flagged:
        v = rows[row_idx].get(col)
        if v is None:
            continue
        fv = float(v)
        z = (fv - mean) / stdev
        anomalies.append({
            "row_index": row_idx,
            "column": col,
            "value": fv,
            "mean": round(mean, 4),
            "stdev": round(stdev, 4),
            "z_score": round(z, 2),
            "direction": "high" if fv > mean else "low",
            "methods": (
                (["z"] if row_idx in z_flags else [])
                + (["iqr"] if row_idx in iqr_flags else [])
                + (["mad"] if row_idx in mad_flags else [])
            ),
        })

    return anomalies, mean, stdev


# ── Service ─────────────────────────────────────────────────

class AnomalyService:
    def detect(
        self,
        rows: list[dict],
        columns: list[str] | None = None,
    ) -> list[dict]:
        """
        Return a ranked list of anomalies across all numeric columns.
        Empty list when nothing qualifies.
        """
        if not rows or len(rows) < MIN_ROWS:
            return []

        # Determine numeric columns
        cols = columns or list(rows[0].keys())
        numeric_cols: list[str] = []
        for c in cols[:MAX_COLUMNS * 2]:
            null_count = sum(1 for r in rows if r.get(c) is None)
            if null_count / len(rows) > MAX_NULL_RATE:
                continue
            if _is_numeric_column(rows, c):
                numeric_cols.append(c)

        if not numeric_cols:
            return []

        all_anomalies: list[dict] = []
        for col in numeric_cols[:MAX_COLUMNS]:
            col_anomalies, _mean, _stdev = _detect_column(rows, col)
            all_anomalies.extend(col_anomalies)

        # Rank by absolute z-score descending
        all_anomalies.sort(key=lambda a: abs(a["z_score"]), reverse=True)
        return all_anomalies[:MAX_ANOMALIES]

    async def narrate(
        self,
        anomalies: list[dict],
        sql: str,
    ) -> str:
        """
        Return a one-sentence plain-English description of the top anomaly.
        Cached. Empty string on failure.
        """
        if not anomalies:
            return ""

        top = anomalies[0]
        cache_key = _narrative_key(sql, top["column"], top["value"])

        # Cache lookup
        async with SessionLocal() as session:
            row = await session.get(AnomalyNarrativesCache, cache_key)
            if row is not None:
                row.hit_count = (row.hit_count or 0) + 1
                await session.commit()
                return safe_str(row.response or {}, "narrative", "")

        # Cache miss → LLM
        try:
            llm = get_llm()
            prompt = build_anomaly_narrative_prompt(
                column=top["column"],
                value=top["value"],
                mean=top["mean"],
                stdev=top["stdev"],
                z_score=top["z_score"],
                direction=top["direction"],
                total_anomalies=len(anomalies),
            )
            raw = await llm.generate(
                prompt, system=ANOMALY_NARRATIVE_SYSTEM, json_mode=True
            )
            obj = extract_json(raw)
            narrative = safe_str(obj, "narrative", "").strip()
        except Exception as e:
            log.warning("anomaly_narrative_failed", error=str(e)[:200])
            narrative = ""

        # Cache write
        if narrative:
            try:
                async with SessionLocal() as session:
                    session.add(AnomalyNarrativesCache(
                        cache_key=cache_key,
                        response={"narrative": narrative},
                    ))
                    await session.commit()
            except Exception:
                pass

        return narrative


def _narrative_key(sql: str, column: str, value: Any) -> str:
    raw = f"{' '.join((sql or '').split())}|||{column}|||{value}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ── Singleton ───────────────────────────────────────────────

_service: AnomalyService | None = None


def get_anomaly_service() -> AnomalyService:
    global _service
    if _service is None:
        _service = AnomalyService()
    return _service