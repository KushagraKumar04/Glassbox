"""
"Why this query" rationale service.

Cache key: SHA-256(question || sql). Same SQL for a different question gets
a different rationale.
"""
from __future__ import annotations

import hashlib

import structlog

from app.core.json_utils import extract_json, safe_list, safe_str
from app.db.models import SqlRationale
from app.db.session import SessionLocal
from app.prompts import SQL_WHY_SYSTEM, build_sql_why_prompt
from app.services.llm import get_llm

log = structlog.get_logger()

_MAX_CHOICES = 6
_MAX_LIST = 8
_CONFIDENCE_VALUES = {"high", "medium", "low"}


def _key(question: str, sql: str) -> str:
    normalized = " ".join((question or "").split()) + "|||" + " ".join((sql or "").split())
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


class RationaleService:
    async def explain_why(
        self,
        *,
        question: str,
        sql: str,
        schema: str = "",
        glossary: str = "",
    ) -> dict:
        if not sql or not sql.strip():
            return self._empty()

        cache_key = _key(question, sql)

        # ── Cache lookup ────────────────────────────────────
        async with SessionLocal() as session:
            row = await session.get(SqlRationale, cache_key)
            if row is not None:
                row.hit_count = (row.hit_count or 0) + 1
                await session.commit()
                resp = dict(row.response or {})
                resp["cached"] = True
                return resp

        # ── Cache miss → LLM ────────────────────────────────
        try:
            llm = get_llm()
            prompt = build_sql_why_prompt(question, sql, schema, glossary)
            raw = await llm.generate(
                prompt, system=SQL_WHY_SYSTEM, json_mode=True
            )
            parsed = self._parse(raw)
        except Exception as e:
            log.warning("sql_why_llm_failed", error=str(e)[:200])
            parsed = self._fallback()

        # ── Cache write ─────────────────────────────────────
        try:
            async with SessionLocal() as session:
                session.add(SqlRationale(
                    cache_key=cache_key,
                    question=(question or "")[:2000],
                    sql_text=(sql or "")[:20000],
                    response=parsed,
                    hit_count=0,
                ))
                await session.commit()
        except Exception as e:
            log.debug("sql_why_cache_write_skipped", error=str(e)[:120])

        parsed["cached"] = False
        return parsed

    # ── Parsing ─────────────────────────────────────────────

    @staticmethod
    def _parse(raw: str) -> dict:
        obj = extract_json(raw)
        if not obj:
            return RationaleService._fallback()

        rationale = safe_str(obj, "rationale", "").strip()
        if not rationale:
            return RationaleService._fallback()

        # Choices
        choices: list[dict] = []
        for c in safe_list(obj, "choices")[:_MAX_CHOICES]:
            if not isinstance(c, dict):
                continue
            aspect = str(c.get("aspect") or "").strip()
            chosen = str(c.get("chosen") or "").strip()
            reasoning = str(c.get("reasoning") or "").strip()
            if not aspect or not chosen:
                continue
            alts = [
                str(x).strip()
                for x in (c.get("alternatives") or [])
                if str(x).strip()
            ][:4]
            choices.append({
                "aspect": aspect,
                "chosen": chosen,
                "alternatives": alts,
                "reasoning": reasoning,
            })

        # Confidence
        conf = safe_str(obj, "confidence", "medium").strip().lower()
        if conf not in _CONFIDENCE_VALUES:
            conf = "medium"

        def _list(key: str) -> list[str]:
            return [
                str(x).strip()
                for x in safe_list(obj, key)
                if str(x).strip()
            ][:_MAX_LIST]

        return {
            "rationale": rationale,
            "choices": choices,
            "confidence": conf,
            "verify": _list("verify"),
            "data_caveats": _list("data_caveats"),
        }

    # ── Fallbacks ───────────────────────────────────────────

    @staticmethod
    def _empty() -> dict:
        return {
            "rationale": "No SQL to explain.",
            "choices": [],
            "confidence": "low",
            "verify": [],
            "data_caveats": [],
            "cached": False,
        }

    @staticmethod
    def _fallback() -> dict:
        return {
            "rationale": (
                "Rationale could not be generated automatically. "
                "Try again in a moment."
            ),
            "choices": [],
            "confidence": "low",
            "verify": [],
            "data_caveats": [],
            "cached": False,
        }


# ── Singleton ───────────────────────────────────────────────

_service: RationaleService | None = None


def get_rationale_service() -> RationaleService:
    global _service
    if _service is None:
        _service = RationaleService()
    return _service