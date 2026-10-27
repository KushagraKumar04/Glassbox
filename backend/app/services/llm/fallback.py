"""
Fallback LLM provider wrapper.

Tries the primary provider first; if it fails (network error, rate limit,
invalid key), tries the fallback provider.
"""
from __future__ import annotations

from typing import AsyncIterator

import structlog

from app.services.llm.base import LLMProvider

log = structlog.get_logger()


class FallbackProvider(LLMProvider):
    def __init__(self, primary: LLMProvider, fallback: LLMProvider) -> None:
        self.primary = primary
        self.fallback = fallback
        self.name = f"{primary.name}->{fallback.name}"
        self.model = primary.model

    async def generate(
        self,
        prompt: str,
        *,
        system: str | None = None,
        json_mode: bool = False,
    ) -> str:
        try:
            return await self.primary.generate(
                prompt, system=system, json_mode=json_mode
            )
        except Exception as e:
            log.warning(
                "llm_fallback_generate",
                primary=self.primary.name,
                fallback=self.fallback.name,
                error=str(e)[:200],
            )
            return await self.fallback.generate(
                prompt, system=system, json_mode=json_mode
            )

    async def stream(
        self,
        prompt: str,
        *,
        system: str | None = None,
    ) -> AsyncIterator[str]:
        try:
            # We must fetch the first chunk inside the try block to catch
            # connection errors before we start yielding to the caller.
            gen = self.primary.stream(prompt, system=system)
            first_chunk = await gen.__anext__()
            yield first_chunk
        except StopAsyncIteration:
            return
        except Exception as e:
            log.warning(
                "llm_fallback_stream",
                primary=self.primary.name,
                fallback=self.fallback.name,
                error=str(e)[:200],
            )
            async for chunk in self.fallback.stream(prompt, system=system):
                yield chunk
            return

        # If we reach here, the primary yielded at least one chunk.
        # If it errors midway now, we can't un-yield tokens, so we let it raise.
        async for chunk in gen:
            yield chunk