"""
SQL explanation service.

Flow:
  1. Normalize the SQL → SHA-256 hash
  2. Look up the cache (SqlExplanation by sql_hash)
  3. On hit: bump hit_count, return cached response
  4. On miss: call the LLM, validate the shape, cache the response

The LLM call is one-shot JSON. Fails soft — returns a minimal fallback
response rather than raising into the request path.
"""
from __future__ import annotations

import hashlib

import structlog
from sqlalchemy import select

from app.core.json_utils import extract_json, safe_list, safe_str
from app.db.models import SqlExplanation
from app.db.session import SessionLocal
from app.prompts import SQL_EXPLAIN_SYSTEM, build_sql_explain_prompt
from app.services.llm import get_llm

log = structlog.get_logger()

_MAX_STEPS = 8
_MAX_ITEMS = 8


def _normalize(sql: str) -> str:
    """Strip trailing semicolons and collapse whitespace for stable hashing."""
    s = (sql or "").strip().rstrip(";")
    # Collapse runs of whitespace to single spaces — different formatting
    # of the same logical query should hit the same cache entry
    s = " ".join(s.split())
    return s


def _hash(sql: str) -> str:
    return hashlib.sha256(_normalize(sql).encode("utf-8")).hexdigest()


class ExplainService:
    async def explain_sql(
        self,
        sql: str,
        question: str = "",
    ) -> dict:
        """
        Return:
            {
              summary: str,
              steps: [{step, detail}, ...],
              tables: [str],
              columns: [str],
              assumptions: [str],
              warnings: [str],
              cached: bool,
            }
        """
        if not sql or not sql.strip():
            return self._empty_response()

        sql_hash = _hash(sql)

        # ── Cache lookup ────────────────────────────────────
        async with SessionLocal() as session:
            row = await session.get(SqlExplanation, sql_hash)
            if row is not None:
                row.hit_count = (row.hit_count or 0) + 1
                await session.commit()
                resp = dict(row.response or {})
                resp["cached"] = True
                return resp

        # ── Cache miss → ask the LLM ────────────────────────
        try:
            llm = get_llm()
            prompt = build_sql_explain_prompt(question, sql)
            raw = await llm.generate(
                prompt, system=SQL_EXPLAIN_SYSTEM, json_mode=True
            )
            parsed = self._parse(raw)
        except Exception as e:
            log.warning("sql_explain_llm_failed", error=str(e)[:200])
            parsed = self._fallback_response(sql)

        # ── Store in cache ──────────────────────────────────
        try:
            async with SessionLocal() as session:
                session.add(SqlExplanation(
                    sql_hash=sql_hash,
                    sql_text=sql[:20000],  # cap storage per row
                    response=parsed,
                    hit_count=0,
                ))
                await session.commit()
        except Exception as e:
            # IntegrityError is expected if two requests race; ignore
            log.debug("sql_explain_cache_write_skipped", error=str(e)[:120])

        parsed["cached"] = False
        return parsed

    # ── Parsing ─────────────────────────────────────────────

    @staticmethod
    def _parse(raw: str) -> dict:
        obj = extract_json(raw)
        if not obj:
            return ExplainService._fallback_response(raw)

        summary = safe_str(obj, "summary", "").strip()
        if not summary:
            return ExplainService._fallback_response(raw)

        steps_raw = safe_list(obj, "steps")
        steps: list[dict] = []
        for s in steps_raw[:_MAX_STEPS]:
            if not isinstance(s, dict):
                continue
            label = str(s.get("step") or "").strip()
            detail = str(s.get("detail") or "").strip()
            if label:
                steps.append({"step": label, "detail": detail})

        def _str_list(key: str) -> list[str]:
            return [
                str(x).strip()
                for x in safe_list(obj, key)
                if str(x).strip()
            ][:_MAX_ITEMS]

        return {
            "summary": summary,
            "steps": steps,
            "tables": _str_list("tables"),
            "columns": _str_list("columns"),
            "assumptions": _str_list("assumptions"),
            "warnings": _str_list("warnings"),
        }

    # ── Fallbacks ───────────────────────────────────────────

    @staticmethod
    def _empty_response() -> dict:
        return {
            "summary": "No SQL to explain.",
            "steps": [],
            "tables": [],
            "columns": [],
            "assumptions": [],
            "warnings": [],
            "cached": False,
        }

    @staticmethod
    def _fallback_response(sql: str) -> dict:
        return {
            "summary": "The query could not be explained automatically.",
            "steps": [],
            "tables": [],
            "columns": [],
            "assumptions": [],
            "warnings": ["LLM explanation unavailable. Try again later."],
            "cached": False,
        }


# ── Singleton ───────────────────────────────────────────────

_service: ExplainService | None = None


def get_explain_service() -> ExplainService:
    global _service
    if _service is None:
        _service = ExplainService()
    return _service