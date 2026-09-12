"""
Narrative agent — turns rows into a human-readable, evidence-backed answer.

Never lets the LLM invent facts: the prompt hard-restricts it to what is
literally in the rows, and we always ship the row sample in the prompt so
it can't hallucinate.
"""
from __future__ import annotations

import json

import structlog

from app.core.json_utils import extract_json, safe_list, safe_str
from app.prompts import NARRATIVE_SYSTEM, build_narrative_prompt
from app.services.llm import LLMProvider

log = structlog.get_logger()

_MAX_ROWS_IN_PROMPT = 50


class NarrativeAgent:
    def __init__(self, llm: LLMProvider) -> None:
        self.llm = llm

    async def compose(
        self,
        question: str,
        sql: str,
        rows: list[dict],
    ) -> dict:
        """
        Returns:
            {summary: str, findings: list[str], caveats: list[str]}
        """
        if not rows:
            return {
                "summary": (
                    "The query ran successfully but returned no rows. "
                    "The filters may be too narrow or the data may not "
                    "contain what the question is asking for."
                ),
                "findings": [],
                "caveats": ["Empty result set."],
            }

        sample = json.dumps(rows[:_MAX_ROWS_IN_PROMPT], default=str, indent=2)
        prompt = build_narrative_prompt(question, sql, sample, len(rows))

        try:
            raw = await self.llm.generate(
                prompt, system=NARRATIVE_SYSTEM, json_mode=True,
            )
        except Exception as e:
            log.warning("narrative_failed", error=str(e)[:160])
            return self._fallback(rows)

        obj = extract_json(raw)
        summary = safe_str(obj, "summary", "").strip()
        if not summary:
            return self._fallback(rows)

        return {
            "summary": summary,
            "findings": [str(f) for f in safe_list(obj, "findings") if f],
            "caveats": [str(c) for c in safe_list(obj, "caveats") if c],
        }

    @staticmethod
    def _fallback(rows: list[dict]) -> dict:
        n = len(rows)
        return {
            "summary": (
                f"The query returned {n} row{'s' if n != 1 else ''}. "
                "See the result table below for details."
            ),
            "findings": [],
            "caveats": ["Narrative generation failed; showing raw result."],
        }