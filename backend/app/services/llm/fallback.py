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
