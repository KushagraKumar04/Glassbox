"""
Visualization agent — chooses a chart type and encodes a spec.

The spec is a plain dict the frontend can render directly:
    {type, xKey, yKeys, title, unit, data, columns}

If the LLM fails or returns garbage, we fall back to column-type inference
so the user always sees *something* useful.
"""
from __future__ import annotations

import json
from datetime import date, datetime

import structlog

from app.core.json_utils import extract_json, safe_list, safe_str
from app.prompts import CHART_SYSTEM, build_chart_prompt
from app.services.llm import LLMProvider

log = structlog.get_logger()

_ALLOWED_TYPES = {"bar", "line", "area", "scatter", "table"}
_MAX_SAMPLE_ROWS = 20
_MAX_CHART_ROWS = 500


class VisualizationAgent:
    def __init__(self, llm: LLMProvider) -> None:
        self.llm = llm

    async def recommend(
        self,
        question: str,
        rows: list[dict],
    ) -> dict:
        if not rows:
            return {
                "type": "table",
                "xKey": "",
                "yKeys": [],
                "title": "No data returned",
                "unit": "",
                "data": [],
                "columns": [],
            }

        columns = list(rows[0].keys())
        numeric = _numeric_columns(rows)
        temporal = _temporal_columns(rows)

        sample = json.dumps(rows[:_MAX_SAMPLE_ROWS], default=str, indent=2)
        prompt = build_chart_prompt(question, columns, sample)

        spec = self._infer_spec(columns, numeric, temporal, rows)

        try:
            raw = await self.llm.generate(
                prompt, system=CHART_SYSTEM, json_mode=True,
            )
            obj = extract_json(raw)
            spec = self._merge_llm_spec(obj, columns, numeric, rows) or spec
        except Exception as e:
            log.warning("chart_generation_failed", error=str(e)[:160])

        # Always attach the data + columns for the frontend
        spec["data"] = _json_safe(rows[:_MAX_CHART_ROWS])
        spec["columns"] = columns
        return spec

    # ── LLM spec merging ────────────────────────────────────

    def _merge_llm_spec(
        self,
        obj: dict,
        columns: list[str],
        numeric: list[str],
        rows: list[dict],
    ) -> dict | None:
        if not obj:
            return None

        ctype = safe_str(obj, "type", "").lower().strip()
        if ctype not in _ALLOWED_TYPES:
            ctype = "bar"

        x_key = safe_str(obj, "xKey", "").strip()
        if x_key not in columns:
            x_key = columns[0] if columns else ""

        y_keys = [
            str(k) for k in safe_list(obj, "yKeys")
            if str(k) in columns and str(k) != x_key
        ]
        if not y_keys:
            numeric_others = [c for c in numeric if c != x_key]
            y_keys = numeric_others[:1] or [c for c in columns if c != x_key][:1]

        if ctype != "table" and (not x_key or not y_keys):
            ctype = "table"

        return {
            "type": ctype,
            "xKey": x_key,
            "yKeys": y_keys,
            "title": safe_str(obj, "title", "Result"),
            "unit": safe_str(obj, "unit", ""),
        }

    # ── Fallback inference ──────────────────────────────────

    def _infer_spec(
        self,
        columns: list[str],
        numeric: list[str],
        temporal: list[str],
        rows: list[dict],
    ) -> dict:
        if not columns:
            return {"type": "table", "xKey": "", "yKeys": [],
                    "title": "Result", "unit": ""}

        # Prefer a temporal x-axis if present, else first non-numeric column,
        # else first column
        if temporal:
            x_key = temporal[0]
            chart_type = "line"
        else:
            non_numeric = [c for c in columns if c not in numeric]
            x_key = non_numeric[0] if non_numeric else columns[0]
            chart_type = "bar"

        y_keys = [c for c in numeric if c != x_key][:3]

        if not y_keys:
            chart_type = "table"

        return {
            "type": chart_type,
            "xKey": x_key,
            "yKeys": y_keys,
            "title": "Result",
            "unit": "",
        }


# ═══════════════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _numeric_columns(rows: list[dict]) -> list[str]:
    if not rows:
        return []
    out: list[str] = []
    for k, v in rows[0].items():
        if isinstance(v, bool):
            continue
        if isinstance(v, (int, float)):
            out.append(k)
        elif isinstance(v, str):
            # try parsing a sample as float (catches numeric strings)
            try:
                float(v)
                out.append(k)
            except (TypeError, ValueError):
                pass
    return out


def _temporal_columns(rows: list[dict]) -> list[str]:
    if not rows:
        return []
    out: list[str] = []
    for k, v in rows[0].items():
        if isinstance(v, (datetime, date)):
            out.append(k)
        elif isinstance(v, str):
            # loose ISO check
            if len(v) >= 10 and v[4:5] == "-" and v[7:8] == "-":
                out.append(k)
    return out


def _json_safe(rows: list[dict]) -> list[dict]:
    """Convert NaN/NaT/datetime to JSON-friendly values."""
    safe: list[dict] = []
    for r in rows:
        clean: dict = {}
        for k, v in r.items():
            if v is None:
                clean[k] = None
            elif isinstance(v, (datetime, date)):
                clean[k] = v.isoformat()
            elif isinstance(v, float) and v != v:  # NaN
                clean[k] = None
            else:
                try:
                    json.dumps(v)
                    clean[k] = v
                except (TypeError, ValueError):
                    clean[k] = str(v)
        safe.append(clean)
    return safe