"""
OpenAI-compatible adapter.

Works with any provider that speaks the OpenAI Chat Completions protocol:

    OpenAI         https://api.openai.com/v1
    Ollama         http://localhost:11434/v1
    OpenRouter     https://openrouter.ai/api/v1
    Groq           https://api.groq.com/openai/v1
    vLLM           http://localhost:8000/v1
    LM Studio      http://localhost:8000/v1
    Together       https://api.together.xyz/v1
    Fireworks      https://api.fireworks.ai/inference/v1

Set LLM_BASE_URL in .env — everything else is standard.
"""
from __future__ import annotations

import asyncio
from typing import AsyncIterator

from openai import AsyncOpenAI

from app.config import get_settings
from app.services.llm.base import LLMError, LLMProvider

settings = get_settings()

_MAX_RETRIES = 3
_BACKOFF = 1.5

# Only OpenAI itself has a canonical default. Everything else MUST set LLM_BASE_URL.
_DEFAULT_BASES = {
    "openai": "https://api.openai.com/v1",
    "ollama": "http://localhost:11434/v1",
}


class OpenAICompatProvider(LLMProvider):
    def __init__(self, name: str = "openai") -> None:
        self.name = name
        base = settings.llm_base_url or _DEFAULT_BASES.get(name, "")
        if not base:
            raise LLMError(
                f"LLM_BASE_URL is required for provider '{name}'. "
                f"Examples: https://openrouter.ai/api/v1, http://localhost:11434/v1"
            )
        # Some local servers (Ollama, LM Studio) don't require a real key.
        self.client = AsyncOpenAI(
            api_key=settings.llm_api_key or "not-needed",
            base_url=base,
            timeout=settings.query_timeout_seconds,
        )
        self.model = settings.llm_model

    # ── Message builder ─────────────────────────────────────

    def _messages(self, prompt: str, system: str | None) -> list[dict]:
        msgs: list[dict] = []
        if system:
            msgs.append({"role": "system", "content": system})
        msgs.append({"role": "user", "content": prompt})
        return msgs

    # ── Generate ────────────────────────────────────────────

    async def generate(
        self,
        prompt: str,
        *,
        system: str | None = None,
        json_mode: bool = False,
    ) -> str:
        kwargs: dict = {
            "model": self.model,
            "messages": self._messages(prompt, system),
            "temperature": settings.llm_temperature,
            "max_tokens": settings.llm_max_tokens,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        last_err: Exception | None = None
        for attempt in range(_MAX_RETRIES):
            try:
                resp = await self.client.chat.completions.create(**kwargs)
                return resp.choices[0].message.content or ""
            except Exception as e:
                last_err = e
                if attempt < _MAX_RETRIES - 1:
                    await asyncio.sleep(_BACKOFF ** attempt)
        raise LLMError(f"{self.name} generate failed: {last_err}") from last_err

    # ── Stream ──────────────────────────────────────────────

    async def stream(
        self,
        prompt: str,
        *,
        system: str | None = None,
    ) -> AsyncIterator[str]:
        try:
            stream = await self.client.chat.completions.create(
                model=self.model,
                messages=self._messages(prompt, system),
                temperature=settings.llm_temperature,
                max_tokens=settings.llm_max_tokens,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta
        except Exception as e:
            raise LLMError(f"{self.name} stream failed: {e}") from e