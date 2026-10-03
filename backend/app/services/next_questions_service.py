"""
Next-question suggestion service.

Deterministic cache keyed by SHA-256(question + sql + columns). Returns
0-3 suggestions. Fails soft — never raises into the orchestrator.
"""
from __future__ import annotations

import hashlib
import json

import structlog

from app.core.json_utils import extract_json, safe_list
from app.db.models import NextQuestionsCache
from app.db.session import SessionLocal
from app.prompts import NEXT_QUESTIONS_SYSTEM, build_next_questions_prompt
from app.services.llm import get_llm

log = structlog.get_logger()

_MAX_QUESTIONS = 3
_MAX_SAMPLE = 5


def _key(question: str, sql: str, columns: list[str]) -> str:
    norm_q = " ".join((question or "").split())
    norm_sql = " ".join((sql or "").split())
    norm_cols = ",".join(sorted(columns or []))
    raw = f"{norm_q}|||{norm_sql}|||{norm_cols}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class NextQuestionsService:
    async def generate(
        self,
        *,
        question: str,
        sql: str,
        columns: list[str],
        row_count: int,
        sample_rows: list[dict] | None = None,
        context: str = "",
    ) -> list[dict]:
        """
        Returns:
            [{"question": str, "reason": str}, ...]  (0 to 3 items)
        """
        if not sql or not sql.strip():
            return []

        cache_key = _key(question, sql, columns)

        # ── Cache lookup ────────────────────────────────────
        async with SessionLocal() as session:
            row = await session.get(NextQuestionsCache, cache_key)
            if row is not None:
                row.hit_count = (row.hit_count or 0) + 1
                await session.commit()
                return list(row.suggestions or [])

        # ── Cache miss → LLM ────────────────────────────────
        try:
            sample = ""
            if sample_rows:
                sample = json.dumps(
                    sample_rows[:_MAX_SAMPLE], default=str, indent=2
                )
            prompt = build_next_questions_prompt(
                question, sql, columns, row_count, sample, context
            )
            llm = get_llm()
            raw = await llm.generate(
                prompt, system=NEXT_QUESTIONS_SYSTEM, json_mode=True
            )
            suggestions = self._parse(raw)
        except Exception as e:
            log.warning("next_questions_llm_failed", error=str(e)[:200])
            suggestions = []

        # ── Cache write ─────────────────────────────────────
        if suggestions:
            try:
                async with SessionLocal() as session:
                    session.add(NextQuestionsCache(
                        cache_key=cache_key,
                        question=(question or "")[:2000],
                        suggestions=suggestions,
                        hit_count=0,
                    ))
                    await session.commit()
            except Exception as e:
                log.debug("next_questions_cache_write_skipped", error=str(e)[:120])

        return suggestions

    # ── Parsing ─────────────────────────────────────────────

    @staticmethod
    def _parse(raw: str) -> list[dict]:
        obj = extract_json(raw)
        if not obj:
            return []

        out: list[dict] = []
        seen: set[str] = set()

        for item in safe_list(obj, "questions")[:_MAX_QUESTIONS]:
            if isinstance(item, dict):
                q = str(item.get("question") or "").strip()
                r = str(item.get("reason") or "").strip()
            else:
                q = str(item or "").strip()
                r = ""

            if not q or len(q) < 5:
                continue
            # Case-insensitive dedupe
            k = q.lower()
            if k in seen:
                continue
            seen.add(k)
            out.append({"question": q, "reason": r})

        return out


# ── Singleton ───────────────────────────────────────────────

_service: NextQuestionsService | None = None


def get_next_questions_service() -> NextQuestionsService:
    global _service
    if _service is None:
        _service = NextQuestionsService()
    return _service