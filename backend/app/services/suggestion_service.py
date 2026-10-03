"""
Rule-based suggestion generator.

Reads a dataset profile (from `profiling_service.profile_file`) and produces
6 natural-language question suggestions tailored to that dataset's shape.

Zero LLM calls. Zero network. Deterministic.

Rules:
  - date col + numeric col            → "Show X over time"
  - categorical + numeric             → "Which <dim> has the highest <metric>?"
  - categorical + numeric (2nd)       → "Top 10 <dim> by <col>"
  - any numeric                       → "What is the total <metric>?"
  - date + categorical + numeric      → "Break down <metric> by <dim> over time"
  - always                            → "Summarize this dataset"
"""
from __future__ import annotations

from typing import Any


# ── Type predicates ───────────────────────────────────────

def _is_temporal(dtype: str) -> bool:
    t = dtype.upper()
    return "DATE" in t or "TIMESTAMP" in t or "TIME" in t


def _is_numeric(dtype: str) -> bool:
    t = dtype.upper()
    return any(
        k in t for k in ("INT", "DOUBLE", "FLOAT", "DECIMAL", "NUMERIC", "REAL")
    )


def _is_categorical(col: dict) -> bool:
    """Text column with low cardinality → treat as a dimension."""
    dtype = str(col.get("type", "")).upper()
    is_text = any(k in dtype for k in ("VARCHAR", "TEXT", "STRING", "CHAR"))
    card = col.get("cardinality")
    # If cardinality is unknown, be permissive but avoid obvious high-card cols
    if card is None:
        return is_text
    return is_text and card <= 100


# ── Semantic hints ────────────────────────────────────────

_METRIC_HINTS = (
    "revenue", "amount", "total", "price", "sales", "spend",
    "cost", "profit", "margin", "value", "quantity", "qty", "count",
)

_DIM_HINTS = (
    "region", "country", "category", "product", "segment",
    "channel", "customer", "type", "status", "department", "team",
)


def _pick_metric(numeric: list[dict]) -> dict:
    for c in numeric:
        name = c["name"].lower()
        if any(h in name for h in _METRIC_HINTS):
            return c
    return numeric[0]


def _pick_dimension(categorical: list[dict]) -> dict:
    for c in categorical:
        name = c["name"].lower()
        if any(h in name for h in _DIM_HINTS):
            return c
    return categorical[0]


# ── Service ───────────────────────────────────────────────

class SuggestionService:
    def __init__(self, profile: dict[str, Any]) -> None:
        self.profile = profile
        self.columns: list[dict] = profile.get("columns", []) or []

    def generate(self, limit: int = 6) -> list[dict[str, str]]:
        numeric = [c for c in self.columns if _is_numeric(str(c.get("type", "")))]
        temporal = [c for c in self.columns if _is_temporal(str(c.get("type", "")))]
        categorical = [c for c in self.columns if _is_categorical(c)]

        out: list[dict[str, str]] = []

        # 1. Time series
        if temporal and numeric:
            t = temporal[0]["name"]
            m = _pick_metric(numeric)["name"]
            out.append({
                "question": f"Show {m} over time",
                "reason": f"{t} + {m}",
            })

        # 2. Category comparison
        if categorical and numeric:
            d = _pick_dimension(categorical)["name"]
            m = _pick_metric(numeric)["name"]
            out.append({
                "question": f"Which {d} has the highest {m}?",
                "reason": f"{d} + {m}",
            })

        # 3. Top-N on the second numeric (if available)
        if categorical and len(numeric) >= 2:
            d = _pick_dimension(categorical)["name"]
            m = numeric[1]["name"]
            out.append({
                "question": f"Top 10 {d} by {m}",
                "reason": "ranking",
            })

        # 4. Aggregate
        if numeric:
            m = _pick_metric(numeric)["name"]
            out.append({
                "question": f"What is the total {m}?",
                "reason": "aggregation",
            })

        # 5. Time + dimension breakdown
        if temporal and categorical and numeric:
            d = _pick_dimension(categorical)["name"]
            m = _pick_metric(numeric)["name"]
            t = temporal[0]["name"]
            out.append({
                "question": f"Break down {m} by {d} over time",
                "reason": f"{t} × {d}",
            })

        # 6. Distribution / overview fallback
        if numeric:
            m = numeric[0]["name"]
            out.append({
                "question": f"Show the distribution of {m}",
                "reason": "distribution",
            })

        # Always end with a general overview
        out.append({
            "question": "Summarize this dataset",
            "reason": "overview",
        })

        # Dedupe + cap
        seen: set[str] = set()
        final: list[dict[str, str]] = []
        for s in out:
            q = s["question"]
            if q in seen:
                continue
            seen.add(q)
            final.append(s)
            if len(final) >= limit:
                break
        return final


def suggestions_for_profile(
    profile: dict[str, Any], limit: int = 6
) -> list[dict[str, str]]:
    """Convenience wrapper."""
    return SuggestionService(profile).generate(limit=limit)