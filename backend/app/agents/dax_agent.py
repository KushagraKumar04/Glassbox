"""
DAX agent — generates the Power BI equivalent of the SQL query.

The agent does NOT execute anything. It reads the schema + the SQL that
was already produced and returns a measure or a calculated table.

Fails soft: on any error, returns an empty DAX string so the pipeline
continues.
"""
from __future__ import annotations

import structlog

from app.core.json_utils import extract_json, safe_str
from app.prompts import DAX_SYSTEM, build_dax_prompt
from app.services.llm import LLMProvider

log = structlog.get_logger()


class DaxAgent:
    def __init__(self, llm: LLMProvider) -> None:
        self.llm = llm

    async def generate(
        self,
        question: str,
        schema: str,
        sql: str,
        glossary: str = "",
    ) -> dict:
        """
        Returns:
            {
              dax: str,
              explanation: str,
              shape: "measure" | "table",
              ok: bool
            }
        """
        if not sql.strip():
            return {
                "dax": "",
                "explanation": "",
                "shape": "measure",
                "ok": False,
            }

        prompt = build_dax_prompt(question, schema, sql, glossary)

        try:
            raw = await self.llm.generate(
                prompt, system=DAX_SYSTEM, json_mode=True
            )
        except Exception as e:
            log.warning("dax_generation_failed", error=str(e)[:200])
            return {
                "dax": "",
                "explanation": "",
                "shape": "measure",
                "ok": False,
            }

        obj = extract_json(raw)
        dax = safe_str(obj, "dax", "").strip()
        explanation = safe_str(obj, "explanation", "").strip()
        shape = safe_str(obj, "shape", "measure").strip().lower()

        if shape not in {"measure", "table"}:
            shape = "measure"

        return {
            "dax": dax,
            "explanation": explanation,
            "shape": shape,
            "ok": bool(dax),
        }