"""
Provider factory — the only place that knows which adapters exist.
"""
from __future__ import annotations

from functools import lru_cache

from app.config import get_settings
from app.services.llm.base import LLMError, LLMProvider
from app.services.llm.fallback import FallbackProvider

settings = get_settings()


def _build(
    provider: str,
    api_key: str,
    model: str,
    base_url: str,
) -> LLMProvider:
    provider = provider.lower().strip()

    if provider == "gemini":
        from app.services.llm.gemini import GeminiProvider
        return GeminiProvider(api_key=api_key, model=model)

    if provider == "anthropic":
        from app.services.llm.anthropic import AnthropicProvider
        return AnthropicProvider(api_key=api_key, model=model)

    if provider in {"openai", "ollama", "openai_compatible"}:
        from app.services.llm.openai_compat import OpenAICompatProvider
        return OpenAICompatProvider(
            name=provider,
            api_key=api_key,
            model=model,
            base_url=base_url,
        )

    raise LLMError(
        f"Unknown LLM_PROVIDER='{provider}'. "
        f"Use one of: gemini | openai | anthropic | ollama | openai_compatible"
    )


@lru_cache(maxsize=1)
def get_llm() -> LLMProvider:
    """
    Return the configured provider.
    If a fallback is configured, wraps both in a FallbackProvider.
    """
    primary = _build(
        settings.llm_provider,
        settings.llm_api_key,
        settings.llm_model,
        settings.llm_base_url,
    )

    fb_provider = settings.llm_fallback_provider.lower().strip()
    if fb_provider:
        fallback = _build(
            fb_provider,
            settings.llm_fallback_api_key,
            settings.llm_fallback_model,
            settings.llm_fallback_base_url,
        )
        return FallbackProvider(primary, fallback)

    return primary


def reset_llm_cache() -> None:
    """Clear the cached provider. Useful for tests or after config changes."""
    get_llm.cache_clear()