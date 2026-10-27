"""Unit tests for the LLM fallback chain."""
import pytest
from typing import AsyncIterator

from app.services.llm.base import LLMProvider, LLMError
from app.services.llm.fallback import FallbackProvider


class FakeProvider(LLMProvider):
    def __init__(self, name: str, fail: bool = False):
        self.name = name
        self.model = "fake-model"
        self.fail = fail
        self.call_count = 0

    async def generate(self, prompt: str, *, system: str | None = None, json_mode: bool = False) -> str:
        self.call_count += 1
        if self.fail:
            raise LLMError(f"{self.name} failed")
        return f"response from {self.name}"

    async def stream(self, prompt: str, *, system: str | None = None) -> AsyncIterator[str]:
        self.call_count += 1
        if self.fail:
            raise LLMError(f"{self.name} failed")
        yield f"chunk1 from {self.name}"
        yield f"chunk2 from {self.name}"


@pytest.mark.asyncio
async def test_generate_fallback():
    primary = FakeProvider("primary", fail=True)
    fallback = FakeProvider("fallback", fail=False)
    wrapper = FallbackProvider(primary, fallback)

    res = await wrapper.generate("hello")
    assert res == "response from fallback"
    assert primary.call_count == 1
    assert fallback.call_count == 1


@pytest.mark.asyncio
async def test_stream_fallback_connection_error():
    primary = FakeProvider("primary", fail=True)
    fallback = FakeProvider("fallback", fail=False)
    wrapper = FallbackProvider(primary, fallback)

    chunks = []
    async for c in wrapper.stream("hello"):
        chunks.append(c)
    
    assert chunks == ["chunk1 from fallback", "chunk2 from fallback"]
    assert primary.call_count == 1
    assert fallback.call_count == 1


@pytest.mark.asyncio
async def test_stream_does_not_fallback_midway():
    """If the primary yields data then errors, we shouldn't duplicate output."""
    class MidwayFailProvider(FakeProvider):
        async def stream(self, prompt, *, system=None):
            self.call_count += 1
            yield "chunk1 from primary"
            raise LLMError("midway fail")

    primary = MidwayFailProvider("primary")
    fallback = FakeProvider("fallback")
    wrapper = FallbackProvider(primary, fallback)

    chunks = []
    with pytest.raises(LLMError, match="midway fail"):
        async for c in wrapper.stream("hello"):
            chunks.append(c)

    # Should have received the first chunk, but NOT triggered the fallback
    assert chunks == ["chunk1 from primary"]
    assert fallback.call_count == 0