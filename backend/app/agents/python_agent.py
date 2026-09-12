"""
Python agent — generates a compact pandas script for deeper analysis.

The script is NOT executed here. The orchestrator hands the code to
SandboxService separately so the agent stays pure.
"""
from __future__ import annotations

import json

import structlog

from app.core.json_utils import extract_json, safe_str
from app.prompts import PYTHON_SYSTEM, build_python_prompt
from app.services.llm import LLMProvider

log = structlog.get_logger()

_MAX_SAMPLE_ROWS = 20


class PythonAgent:
    def __init__(self, llm: LLMProvider) -> None:
        self.llm = llm

    async def generate(
        self,
        question: str,
        rows: list[dict],
    ) -> dict:
        """
        Returns:
            {code: str, explanation: str}
        """
        if not rows:
            return {
                "code": "# No rows to analyze.\nprint('No data')\n",
                "explanation": "No rows were returned by the query.",
            }

        sample = json.dumps(rows[:_MAX_SAMPLE_ROWS], default=str, indent=2)
        prompt = build_python_prompt(question, sample)

        try:
            raw = await self.llm.generate(
                prompt, system=PYTHON_SYSTEM, json_mode=True,
            )
        except Exception as e:
            log.warning("python_generation_failed", error=str(e)[:160])
            return self._fallback(question)

        obj = extract_json(raw)
        code = safe_str(obj, "code", "").strip()
        explanation = safe_str(obj, "explanation", "").strip()

        if not code:
            return self._fallback(question)

        return {"code": code, "explanation": explanation}

    @staticmethod
    def _fallback(question: str) -> dict:
        return {
            "code": (
                "import pandas as pd\n"
                "df = pd.DataFrame(rows)\n"
                "print(df.describe(include='all').to_string())\n"
            ),
            "explanation": (
                "Fallback: generated summary statistics because the model "
                "did not produce a valid script."
            ),
        }