"""
Provider factory — the only place that knows which adapters exist.

    from app.services.llm import get_llm
    llm = get_llm()
    text = await llm.generate("hello")

Swapping providers is a 4-line change in .env, nothing else.
The result is cached per-process so a single provider instance is reused.
"""
from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.services.llm.base import LLMError, LLMProvider

settings = get_settings()


@lru_cache(maxsize=1)
def get_llm() -> LLMProvider:
    """
    Return the configured provider.

    Valid LLM_PROVIDER values:
        gemini             → Google Gemini (native SDK)
        openai             → OpenAI (native protocol)
        anthropic          → Anthropic Claude
        ollama             → local Ollama (OpenAI-compatible)
        openai_compatible  → OpenRouter / Groq / vLLM / LM Studio / etc.
    """
    provider = settings.llm_provider.lower().strip()

    if provider == "gemini":
        from app.services.llm.gemini import GeminiProvider
        return GeminiProvider()

    if provider == "anthropic":
        from app.services.llm.anthropic import AnthropicProvider
        return AnthropicProvider()

    if provider in {"openai", "ollama", "openai_compatible"}:
        from app.services.llm.openai_compat import OpenAICompatProvider
        return OpenAICompatProvider(name=provider)

    raise LLMError(
        f"Unknown LLM_PROVIDER='{provider}'. "
        f"Use one of: gemini | openai | anthropic | ollama | openai_compatible"
    )


def reset_llm_cache() -> None:
    """Clear the cached provider. Useful for tests or after config changes."""
    get_llm.cache_clear()