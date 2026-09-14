"""
Narrative agent — turns rows into a human-readable, evidence-backed answer.

Two modes:
  - compose()         — one-shot JSON (used as a fallback)
  - compose_stream()  — token-by-token streaming in a strict text format

Both restrict the LLM to facts visible in the rows — no invention.
"""
from __future__ import annotations

import json
from typing import AsyncIterator

import structlog

from app.core.json_utils import extract_json, safe_list, safe_str
from app.prompts import (
    NARRATIVE_STREAM_SYSTEM,
    NARRATIVE_SYSTEM,
    build_narrative_prompt,
    build_narrative_stream_prompt,
)
from app.services.llm import LLMProvider

log = structlog.get_logger()

_MAX_ROWS_IN_PROMPT = 50


class NarrativeAgent:
    def __init__(self, llm: LLMProvider) -> None:
        self.llm = llm

    # ── Streaming ───────────────────────────────────────────

    async def compose_stream(
        self,
        question: str,
        sql: str,
        rows: list[dict],
    ) -> AsyncIterator[str]:
        """
        Yield text deltas as the LLM writes the narrative.

        The final full text can be parsed with `parse_streamed()`.
        """
        if not rows:
            yield (
                "The query ran successfully but returned no rows. "
                "The filters may be too narrow or the data may not "
                "contain what the question is asking for.\n\n"
                "FINDINGS:\n\n"
                "CAVEATS:\n- Empty result set.\n"
            )
            return

        sample = json.dumps(rows[:_MAX_ROWS_IN_PROMPT], default=str, indent=2)
        prompt = build_narrative_stream_prompt(
            question, sql, sample, len(rows)
        )

        try:
            async for chunk in self.llm.stream(
                prompt, system=NARRATIVE_STREAM_SYSTEM
            ):
                yield chunk
        except Exception as e:
            log.warning("narrative_stream_failed", error=str(e)[:160])
            # Fall back to a minimal message — the caller will decide
            # whether to try the JSON compose() method instead.
            yield ""

    # ── Parser for the streamed output ──────────────────────

    @staticmethod
    def parse_streamed(text: str) -> dict:
        """
        Parse the streamed narrative into the same dict shape as compose():
            {summary, findings: [], caveats: []}

        Tolerant of missing sections, extra whitespace, and partial text.
        """
        if not text or not text.strip():
            return {
                "summary": "Analysis complete.",
                "findings": [],
                "caveats": [],
            }

        # Split on the section headers
        import re

        findings_match = re.search(
            r"^\s*FINDINGS:\s*$", text, re.MULTILINE | re.IGNORECASE
        )
        caveats_match = re.search(
            r"^\s*CAVEATS:\s*$", text, re.MULTILINE | re.IGNORECASE
        )

        summary_end = (
            findings_match.start()
            if findings_match
            else (caveats_match.start() if caveats_match else len(text))
        )
        summary = text[:summary_end].strip()

        findings: list[str] = []
        caveats: list[str] = []

        if findings_match:
            findings_end = (
                caveats_match.start()
                if caveats_match and caveats_match.start() > findings_match.end()
                else len(text)
            )
            findings = _parse_bullets(
                text[findings_match.end():findings_end]
            )

        if caveats_match:
            caveats = _parse_bullets(text[caveats_match.end():])

        return {
            "summary": summary or "Analysis complete.",
            "findings": findings,
            "caveats": caveats,
        }

    # ── Fallback: one-shot JSON ─────────────────────────────

    async def compose(
        self,
        question: str,
        sql: str,
        rows: list[dict],
    ) -> dict:
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
                prompt, system=NARRATIVE_SYSTEM, json_mode=True
            )
        except Exception as e:
            log.warning("narrative_failed", error=str(e)[:160])
            return _fallback(rows)

        obj = extract_json(raw)
        summary = safe_str(obj, "summary", "").strip()
        if not summary:
            return _fallback(rows)

        return {
            "summary": summary,
            "findings": [str(f) for f in safe_list(obj, "findings") if f],
            "caveats": [str(c) for c in safe_list(obj, "caveats") if c],
        }


# ── Helpers ─────────────────────────────────────────────────

def _parse_bullets(block: str) -> list[str]:
    """Extract lines starting with '- ' as bullet items."""
    out: list[str] = []
    for line in block.splitlines():
        line = line.strip()
        if line.startswith("- "):
            item = line[2:].strip()
            if item:
                out.append(item)
        elif line.startswith("• "):
            item = line[2:].strip()
            if item:
                out.append(item)
    return out


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