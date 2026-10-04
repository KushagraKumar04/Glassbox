"""
The single interface every provider implements.

Two methods only:

    generate()  → await a full response string
    stream()    → async-iterate text deltas

Both accept an optional `system` prompt and a `json_mode` flag.
Providers that don't support native JSON mode fall back to a system hint.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import AsyncIterator


class LLMError(RuntimeError):
    """Raised when a provider call fails after retries."""
    pass


class LLMProvider(ABC):
    """Abstract base. Subclasses set `name` and `model` in __init__."""

    name: str = "base"
    model: str = ""

    # ── Required ────────────────────────────────────────────

    @abstractmethod
    async def generate(
        self,
        prompt: str,
        *,
        system: str | None = None,
        json_mode: bool = False,
    ) -> str:
        """
        Return a single full completion as text.

        Args:
            prompt:    user message
            system:    optional system instruction
            json_mode: request strict JSON output when supported
        """
        ...

    @abstractmethod
    async def stream(
        self,
        prompt: str,
        *,
        system: str | None = None,
    ) -> AsyncIterator[str]:
        """Yield text deltas as they arrive."""
        ...
        # makes the function an async generator even if a subclass forgets `yield`
        if False:  # pragma: no cover
            yield ""

    # ── Optional convenience ────────────────────────────────

    async def health(self) -> dict:
        """Cheap check — subclasses may override."""
        return {"provider": self.name, "model": self.model, "status": "ok"}

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__} provider={self.name} model={self.model}>"