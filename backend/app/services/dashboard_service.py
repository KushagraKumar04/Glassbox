"""
Auto-dashboard generator.

Deterministic — no LLM. Scans dataset profiles, proposes candidate panels,
scores them by relevance, executes each panel's SQL against DuckDB, and
returns the top N.

Panel kinds:
  kpi          — a single number (row count, sum, average)
  trend        — line chart of a metric over a date column
  comparison   — bar chart of a metric broken down by a category
  composition  — bar chart of category counts
  table        — the first 20 rows, formatted as a small grid

Skipped cleanly:
  - Datasets with 0 rows
  - Columns that are all null
  - Numeric columns with zero variance
"""
from __future__ import annotations

import re
import time
from typing import Any

import pandas as pd
import structlog

from app.services.duckdb_service import DuckDBService

log = structlog.get_logger()

MAX_VALUE_CHARS = 200  # cap any single cell for JSON

# Column name fragments that suggest an interesting metric
_METRIC_HINTS = (
    "revenue", "amount", "sales", "total", "price", "cost", "profit",
    "margin", "spend", "value", "gmv", "mrr", "arr",
)
_COUNT_HINTS = ("qty", "quantity", "count", "units", "num_")
_DATE_HINTS = ("date", "time", "created", "updated", "placed", "shipped")
_ID_HINTS = ("_id", "id_", "uuid", "guid", "key")


# ── Type classifiers ─────────────────────────────────────

def _kind(dtype: str) -> str:
    t = str(dtype).upper()
    if any(k in t for k in ("DATE", "TIMESTAMP", "TIME")):
        return "date"
    if "BOOL" in t:
        return "boolean"
    if any(k in t for k in ("INT", "DOUBLE", "FLOAT", "DECIMAL",
                            "NUMERIC", "REAL", "BIGINT")):
        return "numeric"
    return "text"


def _is_metric_name(name: str) -> float:
    low = name.lower()
    if any(h in low for h in _ID_HINTS):
        return -1.0
    if any(h in low for h in _METRIC_HINTS):
        return 2.0
    if any(h in low for h in _COUNT_HINTS):
        return 1.0
    if any(h in low for h in _DATE_HINTS):
        return -0.5
    return 0.0


def _aggregation_for_column(name: str) -> str:
    """Choose a meaningful aggregation for a numeric column."""
    low = name.lower()

    if (
        low.endswith(("_price", "_rate", "_pct", "_avg"))
        or "price" in low
        or "rate" in low
    ):
        return "AVG"

    return "SUM"


def _cardinality_score(card: int | None) -> float:
    if card is None:
        return 0.0
    if card <= 1:
        return -5.0
    if 3 <= card <= 20:
        return 3.0
    if 21 <= card <= 50:
        return 2.0
    if 51 <= card <= 200:
        return 0.0
    return -2.0


# ── SQL builders ─────────────────────────────────────────

def _q(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _where(filters: list[dict], columns: set[str]) -> str:
    """Build a WHERE clause, honoring only filters that apply to this table."""
    from app.services.duckdb_service import build_filter_where
    return build_filter_where(filters or [], columns)


# ── Generator ────────────────────────────────────────────

class DashboardService:
    def __init__(self, db: DuckDBService) -> None:
        self.db = db

    def generate(
        self,
        *,
        tables: list[str],
        profiles: dict[str, dict],
        filters: list[dict] | None = None,
        max_panels: int = 8,
    ) -> list[dict]:
        """
        Return the top `max_panels` panels, ranked by score.
        Each panel dict matches DashboardPanel.
        """
        filters = filters or []
        candidates: list[dict] = []

        for table in tables:
            profile = profiles.get(table)
            if not profile:
                continue
            row_count = profile.get("row_count", 0)
            if not row_count:
                continue
            columns = profile.get("columns", []) or []

            # Column type buckets
            numeric: list[dict] = []
            dates: list[dict] = []
            cats: list[dict] = []

            for c in columns:
                name = str(c.get("name") or "")
                dtype = str(c.get("type") or "")
                card = c.get("cardinality")

                if not name:
                    continue
                # Skip anything >90% nulls
                null_rate = c.get("null_rate", 0) or 0
                if null_rate > 0.9:
                    continue

                k = _kind(dtype)
                if k == "numeric" and (c.get("cardinality") or 0) > 1:
                    numeric.append({"name": name, "type": dtype, **c})
                elif k == "date":
                    dates.append({"name": name, "type": dtype, **c})
                elif k == "text" and card and 2 <= card <= 200:
                    cats.append({"name": name, "type": dtype, **c})

            col_set = {c["name"] for c in columns}
            where = _where(filters, col_set)
            where_clause = f" WHERE {where}" if where else ""

            # ── 1. Row count KPI ────────────────────────────
            candidates.append(self._kpi(
                table=table,
                id_suffix="row_count",
                title="Total rows",
                subtitle=table,
                sql=f"SELECT COUNT(*) AS value FROM {_q(table)}{where_clause}",
                format="number",
                base_score=6.0,
            ))

            # ── 2. Numeric KPIs (top 2 by interest) ─────────
            numeric_ranked = sorted(
                numeric,
                key=lambda c: _is_metric_name(c["name"]),
                reverse=True,
            )
            for c in numeric_ranked[:2]:
                score = 7.0 + _is_metric_name(c["name"])
                unit, fmt = _unit_format(c["name"])
                agg = _aggregation_for_column(c["name"])
                agg_label = "Average" if agg == "AVG" else "Total"
                candidates.append(self._kpi(
                    table=table,
                    id_suffix=f"sum_{c['name']}",
                    title=f"{agg_label} {_pretty(c['name'])}",
                    subtitle=table,
                    sql=(
                        f"SELECT {agg}({_q(c['name'])}) AS value "
                        f"FROM {_q(table)}{where_clause}"
                    ),
                    unit=unit,
                    format=fmt,
                    base_score=score,
                ))

            # ── 3. Trend panels (date × top metric) ────────
            if dates and numeric:
                date_col = dates[0]["name"]
                for c in numeric_ranked[:1]:
                    score = 10.0 + _is_metric_name(c["name"])
                    agg = _aggregation_for_column(c["name"])
                    sql = (
                        f"SELECT date_trunc('month', {_q(date_col)}) AS period, "
                        f"{agg}({_q(c['name'])}) AS metric "
                        f"FROM {_q(table)}"
                    )
                    if where:
                        sql += f" WHERE {where} AND {_q(date_col)} IS NOT NULL"
                    else:
                        sql += f" WHERE {_q(date_col)} IS NOT NULL"
                    sql += " GROUP BY 1 ORDER BY 1 LIMIT 60"
                    candidates.append(self._chart(
                        table=table,
                        id_suffix=f"trend_{c['name']}",
                        kind="trend",
                        title=f"{_pretty(c['name'])} over time",
                        subtitle=f"monthly · {date_col}",
                        sql=sql,
                        x_key="period",
                        y_keys=["metric"],
                        score=score,
                    ))

            # ── 4. Comparison panels (category × metric) ───
            cat_ranked = sorted(
                cats,
                key=lambda c: _cardinality_score(c.get("cardinality")),
                reverse=True,
            )
            if cat_ranked and numeric:
                top_metric = numeric_ranked[0]["name"]
                for c in cat_ranked[:2]:
                    score = 8.0 + _cardinality_score(c.get("cardinality"))
                    agg = _aggregation_for_column(top_metric)
                    sql = (
                        f"SELECT {_q(c['name'])} AS category, "
                        f"{agg}({_q(top_metric)}) AS metric "
                        f"FROM {_q(table)}"
                    )
                    if where:
                        sql += f" WHERE {where} AND {_q(c['name'])} IS NOT NULL"
                    else:
                        sql += f" WHERE {_q(c['name'])} IS NOT NULL"
                    sql += " GROUP BY 1 ORDER BY metric DESC LIMIT 12"
                    candidates.append(self._chart(
                        table=table,
                        id_suffix=f"cmp_{c['name']}",
                        kind="comparison",
                        title=f"{_pretty(top_metric)} by {_pretty(c['name'])}",
                        subtitle=table,
                        sql=sql,
                        x_key="category",
                        y_keys=["metric"],
                        score=score,
                    ))

            # ── 5. Composition panels (category counts) ────
            if cat_ranked and not numeric:
                for c in cat_ranked[:1]:
                    score = 6.0 + _cardinality_score(c.get("cardinality"))
                    sql = (
                        f"SELECT {_q(c['name'])} AS category, "
                        f"COUNT(*) AS count "
                        f"FROM {_q(table)}"
                    )
                    if where:
                        sql += f" WHERE {where} AND {_q(c['name'])} IS NOT NULL"
                    else:
                        sql += f" WHERE {_q(c['name'])} IS NOT NULL"
                    sql += " GROUP BY 1 ORDER BY count DESC LIMIT 10"
                    candidates.append(self._chart(
                        table=table,
                        id_suffix=f"comp_{c['name']}",
                        kind="composition",
                        title=f"Rows by {_pretty(c['name'])}",
                        subtitle=table,
                        sql=sql,
                        x_key="category",
                        y_keys=["count"],
                        score=score,
                    ))

            # ── 6. Table panel (fallback, always) ──────────
            candidates.append(self._table(
                table=table,
                sql=f"SELECT * FROM {_q(table)}{where_clause} LIMIT 20",
                base_score=2.0,
            ))

        # Rank and cap
        candidates.sort(key=lambda p: p.get("score", 0), reverse=True)
        top = candidates[:max_panels]

        # Execute each panel's SQL, attach data
        for p in top:
            try:
                df = self.db.query(p["sql"], limit=1000)
                p["data"] = _df_records(df)
                if p["kind"] == "kpi" and len(df) > 0:
                    v = df.iloc[0].get("value")
                    p["value"] = float(v) if v is not None else None
            except Exception as e:
                log.warning(
                    "dashboard_panel_failed",
                    panel=p["id"],
                    error=str(e)[:160],
                )
                p["data"] = []
                if p["kind"] == "kpi":
                    p["value"] = None

        return top

    # ── Panel builders ──────────────────────────────────────

    def _kpi(
        self,
        *,
        table: str,
        id_suffix: str,
        title: str,
        subtitle: str,
        sql: str,
        unit: str = "",
        format: str = "number",
        base_score: float = 5.0,
    ) -> dict:
        return {
            "id": f"{table}__{id_suffix}",
            "kind": "kpi",
            "title": title,
            "subtitle": subtitle,
            "unit": unit,
            "format": format,
            "sql": sql,
            "spec": {},
            "data": [],
            "value": None,
            "score": base_score,
        }

    def _chart(
        self,
        *,
        table: str,
        id_suffix: str,
        kind: str,
        title: str,
        subtitle: str,
        sql: str,
        x_key: str,
        y_keys: list[str],
        score: float,
    ) -> dict:
        return {
            "id": f"{table}__{id_suffix}",
            "kind": kind,
            "title": title,
            "subtitle": subtitle,
            "unit": "",
            "format": "number",
            "sql": sql,
            "spec": {
                "type": "line" if kind == "trend" else "bar",
                "xKey": x_key,
                "yKeys": y_keys,
                "title": title,
            },
            "data": [],
            "value": None,
            "score": score,
        }

    def _table(
        self,
        *,
        table: str,
        sql: str,
        base_score: float = 2.0,
    ) -> dict:
        return {
            "id": f"{table}__table",
            "kind": "table",
            "title": "Sample rows",
            "subtitle": table,
            "unit": "",
            "format": "number",
            "sql": sql,
            "spec": {},
            "data": [],
            "value": None,
            "score": base_score,
        }


# ── Helpers ─────────────────────────────────────────────

def _pretty(name: str) -> str:
    s = re.sub(r"[_\-]+", " ", name).strip()
    return " ".join(w.capitalize() for w in s.split())


def _unit_format(col: str) -> tuple[str, str]:
    """Infer a display unit from the column name.

    Currency is inferred from explicit currency hints in the column name.
    If no currency is specified, fall back to USD for backwards compatibility
    with the existing dashboard behavior.
    """
    low = col.lower()

    if any(h in low for h in ("pct", "percent", "rate", "ratio")):
        return "%", "percent"

    # Explicit Indian Rupee / INR indicators.
    if any(h in low for h in (
        "inr", "₹", "rs", "rupee", "rupees", "indian_rupee",
        "indianrupee",
    )):
        return "₹", "currency"

    # Explicit US Dollar / USD indicators.
    if any(h in low for h in (
        "usd", "$", "dollar", "dollars", "us_dollar", "usdollar",
    )):
        return "$", "currency"

    # Explicit Euro / EUR indicators.
    if any(h in low for h in (
        "eur", "€", "euro", "euros",
    )):
        return "€", "currency"

    # Explicit British Pound / GBP indicators.
    if any(h in low for h in (
        "gbp", "£", "pound", "pounds", "british_pound",
    )):
        return "£", "currency"

    # Explicit Japanese Yen / JPY indicators.
    if any(h in low for h in (
        "jpy", "¥", "yen",
    )):
        return "¥", "currency"

    # Existing fallback for generic financial/metric columns.
    if any(h in low for h in _METRIC_HINTS):
        return "USD", "currency"

    return "", "number"


def _df_records(df: pd.DataFrame) -> list[dict]:
    """DataFrame → JSON-safe dicts (NaN/datetime-safe, cell-capped)."""
    if df.empty:
        return []
    out: list[dict] = []
    for r in df.astype(object).where(pd.notnull(df), None).to_dict(orient="records"):
        clean: dict = {}
        for k, v in r.items():
            if v is None:
                clean[k] = None
            elif hasattr(v, "isoformat"):
                clean[k] = v.isoformat()
            elif isinstance(v, str) and len(v) > MAX_VALUE_CHARS:
                clean[k] = v[:MAX_VALUE_CHARS] + "…"
            else:
                clean[k] = v
        out.append(clean)
    return out