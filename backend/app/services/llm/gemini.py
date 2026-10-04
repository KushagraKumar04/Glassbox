"""Google Gemini adapter via the official google-genai SDK."""
from __future__ import annotations

import asyncio
from typing import AsyncIterator

from google import genai
from google.genai import types

from app.config import get_settings
from app.services.llm.base import LLMError, LLMProvider

settings = get_settings()

_MAX_RETRIES = 3
_BACKOFF = 1.5


class GeminiProvider(LLMProvider):
    name = "gemini"

    def __init__(self) -> None:
        if not settings.llm_api_key:
            raise LLMError("LLM_API_KEY is required for provider 'gemini'")
        self.client = genai.Client(api_key=settings.llm_api_key)
        self.model = settings.llm_model

    # ── Config builder ──────────────────────────────────────

    def _config(
        self,
        system: str | None,
        json_mode: bool,
    ) -> types.GenerateContentConfig:
        kwargs: dict = {
            "temperature": settings.llm_temperature,
            "max_output_tokens": settings.llm_max_tokens,
        }
        if system:
            kwargs["system_instruction"] = system
        if json_mode:
            kwargs["response_mime_type"] = "application/json"
        return types.GenerateContentConfig(**kwargs)

    # ── Generate ────────────────────────────────────────────

    async def generate(
        self,
        prompt: str,
        *,
        system: str | None = None,
        json_mode: bool = False,
    ) -> str:
        last_err: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                resp = await self.client.aio.models.generate_content(
                    model=self.model,
                    contents=prompt,
                    config=self._config(system, json_mode),
                )
                return resp.text or ""
            except Exception as e:
                last_err = e
                if attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(_BACKOFF ** attempt)
        raise LLMError(f"Gemini generate failed: {last_err}") from last_err

    # ── Stream ──────────────────────────────────────────────

    async def stream(
        self,
        prompt: str,
        *,
        system: str | None = None,
    ) -> AsyncIterator[str]:
        try:
            stream = await self.client.aio.models.generate_content_stream(
                model=self.model,
                contents=prompt,
                config=self._config(system, json_mode=False),
            )
            async for chunk in stream:
                if chunk.text:
                    yield chunk.text
        except Exception as e:
            raise LLMError(f"Gemini stream failed: {e}") from e