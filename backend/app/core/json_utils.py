"""
Robust JSON extraction from LLM output.

Models sometimes wrap JSON in markdown fences, add a preamble, or leave
trailing text. This module handles all of it and never raises — worst case
it returns {} and the caller falls back to defaults.
"""
from __future__ import annotations

import json
import re
from typing import Any

_FENCE_RE = re.compile(
    r"```(?:json|JSON)?\s*\n?(.*?)```",
    re.DOTALL,
)


def extract_json(text: str) -> dict[str, Any]:
    """
    Pull the first JSON object out of `text`. Never raises.

    Handles:
        - ```json { ... } ```
        - "Here is the result: { ... }"
        - {"a": 1}\n\nLet me know if...
        - Plain {...}
    """
    if not text or not text.strip():
        return {}

    # 1. Try direct parse
    try:
        result = json.loads(text)
        return result if isinstance(result, dict) else {}
    except Exception:
        pass

    # 2. Strip code fences and retry
    for match in _FENCE_RE.finditer(text):
        inner = match.group(1).strip()
        try:
            result = json.loads(inner)
            if isinstance(result, dict):
                return result
        except Exception:
            continue

    # 3. Find first balanced { ... }
    brace_json = _find_first_object(text)
    if brace_json is not None:
        try:
            result = json.loads(brace_json)
            return result if isinstance(result, dict) else {}
        except Exception:
            pass

    return {}


def _find_first_object(text: str) -> str | None:
    """Return the substring from the first '{' to its matching '}'."""
    start = text.find("{")
    if start == -1:
        return None

    depth = 0
    in_string = False
    escape = False

    for i in range(start, len(text)):
        ch = text[i]

        if escape:
            escape = False
            continue

        if ch == "\\":
            escape = True
            continue

        if ch == '"':
            in_string = not in_string
            continue

        if in_string:
            continue

        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]

    return None


def safe_str(obj: dict, key: str, default: str = "") -> str:
    """Read a string key with a fallback."""
    v = obj.get(key)
    return v if isinstance(v, str) else default


def safe_list(obj: dict, key: str) -> list:
    """Read a list key; coerce single values into a list."""
    v = obj.get(key)
    if isinstance(v, list):
        return v
    if v is None:
        return []
    return [v]