"""LLM provider abstraction. Import `get_llm` — never a concrete class."""
from app.services.llm.base import LLMProvider, LLMError
from app.services.llm.factory import get_llm

__all__ = ["LLMProvider", "LLMError", "get_llm"]