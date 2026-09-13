"""
SQL agent — natural language → validated DuckDB SQL.

Flow:
  1. Build schema + sample context
  2. Ask LLM for {sql, explanation, assumptions}
  3. Validate with EXPLAIN
  4. On failure, one repair round-trip with the error message
  5. Return the best effort with `valid` flag set
"""
from __future__ import annotations

import json

import structlog

from app.core.json_utils import extract_json, safe_list, safe_str
from app.prompts import SQL_SYSTEM, build_sql_prompt
from app.services.duckdb_service import DuckDBService
from app.services.llm import LLMProvider

log = structlog.get_logger()

_MAX_SAMPLE_ROWS = 3


class SQLAgent:
    def __init__(self, llm: LLMProvider, db: DuckDBService) -> None:
        self.llm = llm
        self.db = db

    async def generate(
        self,
        question: str,
        tables: list[str],
    ) -> dict:
        """
        Returns:
            {
              sql: str,
              explanation: str,
              assumptions: list[str],
              valid: bool,
              validation_error: str | None,
              repaired: bool (optional)
            }
        """
        if not tables:
            return {
                "sql": "",
                "explanation": "No tables were selected.",
                "assumptions": [],
                "valid": False,
                "validation_error": "no tables",
            }

        schema = self.db.schema_for_prompt(tables)
        samples = self._samples_for_prompt(tables)
        prompt = build_sql_prompt(question, schema, samples)

        raw = await self.llm.generate(prompt, system=SQL_SYSTEM, json_mode=True)
        parsed = self._parse(raw)

        sql = parsed["sql"].strip().rstrip(";")
        valid, err = self._validate(sql)

        result = {
            "sql": sql,
            "explanation": parsed["explanation"],
            "assumptions": parsed["assumptions"],
            "valid": valid,
            "validation_error": err,
        }

        # ── Repair once if invalid ─────────────────────────
        if sql and not valid:
            log.info("sql_repair_attempt", error=err[:120] if err else "")
            repaired = await self._repair(sql, err or "unknown error")
            if repaired:
                valid2, err2 = self._validate(repaired)
                if valid2:
                    result.update({
                        "sql": repaired,
                        "valid": True,
                        "validation_error": None,
                        "repaired": True,
                    })
                else:
                    result["validation_error"] = err2

        return result

    # ── Internals ───────────────────────────────────────────

    def _samples_for_prompt(self, tables: list[str]) -> str:
        """Small sample from each table so the LLM sees value formats."""
        blocks: list[str] = []
        for t in tables[:5]:
            try:
                df = self.db.query(
                    f'SELECT * FROM "{t}" LIMIT {_MAX_SAMPLE_ROWS}',
                    limit=_MAX_SAMPLE_ROWS,
                )
                if df.empty:
                    continue
                records = df.where(df.notnull(), None).to_dict(orient="records")
                blocks.append(f"-- {t}")
                blocks.append(json.dumps(records, default=str, indent=2))
                blocks.append("")
            except Exception as e:
                log.debug("sample_fetch_failed", table=t, error=str(e)[:120])
        return "\n".join(blocks).rstrip()

    @staticmethod
    def _parse(raw: str) -> dict:
        obj = extract_json(raw)
        return {
            "sql": safe_str(obj, "sql", ""),
            "explanation": safe_str(obj, "explanation", ""),
            "assumptions": [
                str(a) for a in safe_list(obj, "assumptions") if a
            ],
        }

    def _validate(self, sql: str) -> tuple[bool, str | None]:
        if not sql:
            return False, "no SQL produced"
        try:
            self.db.con.execute(f"EXPLAIN {sql}")
            return True, None
        except Exception as e:
            return False, str(e)[:300]

    async def _repair(self, bad_sql: str, error: str) -> str | None:
        prompt = (
            "The following SQL failed to validate against DuckDB:\n\n"
            f"{bad_sql}\n\n"
            f"Error: {error}\n\n"
            "Produce a corrected query. Return the same JSON shape "
            "(sql, explanation, assumptions)."
        )
        try:
            raw = await self.llm.generate(prompt, system=SQL_SYSTEM, json_mode=True)
            obj = extract_json(raw)
            return safe_str(obj, "sql", "").strip().rstrip(";") or None
        except Exception as e:
            log.warning("sql_repair_failed", error=str(e)[:160])
            return None