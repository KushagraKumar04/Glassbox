"""
Quality agent — reviews the drafted answer against the actual rows.

Runs cheap local checks first (row count, null-rate hints). If those pass,
asks the LLM for a semantic review. Returns:
    {confidence: high|medium|low, warnings: [...], verdict: str}
"""
from __future__ import annotations

import json

import structlog

from app.core.json_utils import extract_json, safe_list, safe_str
from app.prompts import QUALITY_SYSTEM, build_quality_prompt
from app.services.llm import LLMProvider

log = structlog.get_logger()

_MAX_ROWS_IN_PROMPT = 50
_SMALL_SAMPLE_THRESHOLD = 5


class QualityAgent:
    def __init__(self, llm: LLMProvider) -> None:
        self.llm = llm

    async def check(
        self,
        rows: list[dict],
        answer: dict,
    ) -> dict:
        local_warnings = self._local_checks(rows)

        summary = (answer or {}).get("summary", "")
        if not summary or not rows:
            return {
                "confidence": "low" if not rows else "medium",
                "warnings": local_warnings,
                "verdict": "Reviewed locally.",
            }

        sample = json.dumps(rows[:_MAX_ROWS_IN_PROMPT], default=str, indent=2)
        prompt = build_quality_prompt(answer.get("_question", ""), summary, sample, len(rows))

        try:
            raw = await self.llm.generate(
                prompt, system=QUALITY_SYSTEM, json_mode=True,
            )
            obj = extract_json(raw)
        except Exception as e:
            log.warning("quality_check_failed", error=str(e)[:160])
            return {
                "confidence": "medium",
                "warnings": local_warnings,
                "verdict": "LLM review unavailable; local checks only.",
            }

        confidence = safe_str(obj, "confidence", "medium").lower()
        if confidence not in {"high", "medium", "low"}:
            confidence = "medium"

        warnings = [
            str(w) for w in safe_list(obj, "warnings") if w
        ]
        # Merge local warnings
        for w in local_warnings:
            if w not in warnings:
                warnings.append(w)

        return {
            "confidence": confidence,
            "warnings": warnings,
            "verdict": safe_str(obj, "verdict", ""),
        }

    @staticmethod
    def _local_checks(rows: list[dict]) -> list[str]:
        warnings: list[str] = []
        n = len(rows)
        if n == 0:
            warnings.append("Result set is empty.")
        elif n < _SMALL_SAMPLE_THRESHOLD:
            warnings.append(
                f"Small sample: only {n} row{'s' if n != 1 else ''}."
            )

        if rows:
            # Check for columns that are entirely null in the sample
            total = len(rows)
            for col in rows[0].keys():
                nulls = sum(1 for r in rows if r.get(col) is None)
                if total and nulls == total:
                    warnings.append(f"Column '{col}' is entirely null in the sample.")
                elif total and nulls / total > 0.5:
                    pct = int(100 * nulls / total)
                    warnings.append(
                        f"Column '{col}' is {pct}% null in the sample."
                    )
        return warnings