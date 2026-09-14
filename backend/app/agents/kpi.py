"""
KPI agent — detects KPI-shaped results and builds metric cards.

Purely deterministic: no LLM call. Rules:

  1. Single row → one card per numeric column
  2. Time-series result + KPI-style question + 1 numeric column → one card
     with a sparkline showing the series
  3. Otherwise → None

A KPI-style question contains any of: total, how many, how much, count,
sum, average, mean, median, maximum, minimum, current, latest, overall.
"""
from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

_MAX_SPARKLINE_POINTS = 60

_KPI_WORDS = (
    "total", "how many", "how much", "count", "sum of",
    "average", "mean", "median",
    "maximum", "minimum", "max ", "min ",
    "current", "latest", "overall", "grand total",
)

_UNIT_HINTS: list[tuple[tuple[str, ...], str, str]] = [
    # (column-name fragments, unit, format)
    (("revenue", "amount", "price", "cost", "spend", "total"), "USD", "currency"),
    (("pct", "percent", "rate", "ratio"), "%", "percent"),
    (("count", "qty", "quantity", "num_", "n_", "_n"), "", "number"),
]


def _is_numeric(v: Any) -> bool:
    if isinstance(v, bool):
        return False
    return isinstance(v, (int, float))


def _is_temporal(v: Any) -> bool:
    if isinstance(v, (datetime, date)):
        return True
    if isinstance(v, str) and len(v) >= 10 and v[4:5] == "-" and v[7:8] == "-":
        return True
    return False


def _pretty_label(name: str) -> str:
    """'total_revenue_usd' → 'Total Revenue Usd'"""
    s = re.sub(r"[_\-]+", " ", name).strip()
    return " ".join(w.capitalize() if not w.isupper() else w for w in s.split())


def _guess_unit_format(col: str) -> tuple[str, str]:
    low = col.lower()
    for fragments, unit, fmt in _UNIT_HINTS:
        if any(f in low for f in fragments):
            return unit, fmt
    return "", "number"


def _numeric_columns(rows: list[dict]) -> list[str]:
    if not rows:
        return []
    return [k for k, v in rows[0].items() if _is_numeric(v)]


def _temporal_column(rows: list[dict]) -> str | None:
    if not rows:
        return None
    for k, v in rows[0].items():
        if _is_temporal(v):
            return k
    return None


def _is_kpi_question(question: str) -> bool:
    q = question.lower()
    return any(w in q for w in _KPI_WORDS)


class KPIAgent:
    def detect(
        self,
        question: str,
        rows: list[dict],
    ) -> dict | None:
        """
        Returns:
            {"cards": [{"label", "value", "unit", "format", "sparkline"?}]}
            or None if the result isn't KPI-shaped.
        """
        if not rows:
            return None

        numeric = _numeric_columns(rows)
        if not numeric:
            return None

        # ── Case 1: single row → one card per numeric column ──
        if len(rows) == 1:
            cards: list[dict] = []
            for col in numeric:
                unit, fmt = _guess_unit_format(col)
                cards.append({
                    "label": _pretty_label(col),
                    "value": float(rows[0][col]),
                    "unit": unit,
                    "format": fmt,
                })
            if cards:
                return {"cards": cards}
            return None

        # ── Case 2: time series + KPI question → card with sparkline ──
        temporal = _temporal_column(rows)
        if temporal and len(numeric) >= 1 and _is_kpi_question(question):
            # Use the first numeric column as the metric
            metric = numeric[0]
            series: list[float] = []
            for r in rows:
                v = r.get(metric)
                if _is_numeric(v):
                    series.append(float(v))
            if len(series) >= 5:
                # Keep the most recent N points
                trimmed = series[-_MAX_SPARKLINE_POINTS:]
                unit, fmt = _guess_unit_format(metric)
                return {
                    "cards": [{
                        "label": _pretty_label(metric),
                        "value": trimmed[-1],
                        "unit": unit,
                        "format": fmt,
                        "sparkline": trimmed,
                    }],
                    "note": f"Latest of {len(series)} points",
                }

        return None