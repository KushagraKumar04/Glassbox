"""
Anthropic Claude adapter.

Anthropic has no native JSON mode; when json_mode=True we append an
explicit instruction to the system prompt.
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator

from anthropic import AsyncAnthropic

from app.config import get_settings
from app.services.llm.base import LLMError, LLMProvider

settings = get_settings()

_MAX_RETRIES = 3
_BACKOFF = 1.5

_JSON_HINT = (
    "\n\nIMPORTANT: Respond with a single valid JSON object. "
    "No prose, no markdown fences, no trailing text."
)


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self) -> None:
        if not settings.llm_api_key:
            raise LLMError("LLM_API_KEY is required for provider 'anthropic'")
        self.client = AsyncAnthropic(
            api_key=settings.llm_api_key,
            timeout=settings.query_timeout_seconds,
        )
        self.model = settings.llm_model

    # ── Generate ────────────────────────────────────────────

    async def generate(
        self,
        prompt: str,
        *,
        system: str | None = None,
        json_mode: bool = False,
    ) -> str:
        sys_prompt = system or ""
        if json_mode:
            sys_prompt = (sys_prompt + _JSON_HINT).strip()

        kwargs: dict = {
            "model": self.model,
            "max_tokens": settings.llm_max_tokens,
            "temperature": settings.llm_temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if sys_prompt:
            kwargs["system"] = sys_prompt

        last_err: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                resp = await self.client.messages.create(**kwargs)
                parts = [
                    block.text
                    for block in resp.content
                    if getattr(block, "type", "") == "text"
                ]
                return "".join(parts)
            except Exception as e:
                last_err = e
                if attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(_BACKOFF ** attempt)
        raise LLMError(f"Anthropic generate failed: {last_err}") from last_err

    # ── Stream ──────────────────────────────────────────────

    async def stream(
        self,
        prompt: str,
        *,
        system: str | None = None,
    ) -> AsyncIterator[str]:
        kwargs: dict = {
            "model": self.model,
            "max_tokens": settings.llm_max_tokens,
            "temperature": settings.llm_temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        if system:
            kwargs["system"] = system

        try:
            async with self.client.messages.stream(**kwargs) as stream:
                async for text in stream.text_stream:
                    yield text
        except Exception as e:
            raise LLMError(f"Anthropic stream failed: {e}") from e