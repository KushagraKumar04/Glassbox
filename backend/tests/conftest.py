"""Pytest fixtures + env setup for Glassbox backend.

Env vars are set BEFORE importing `app.*` so `app.config.settings`
picks up test-safe defaults. Uses a **file-backed** SQLite DB (not
`:memory:`) because `session.py` creates the engine at module import
with default pooling — `:memory:` gives every connection its own empty
DB and `init_db()` writes would vanish. A temp file mirrors production
and is torn down by pytest-tmp.

**Env isolation note:** Uses direct `os.environ[...] = value`, not
`os.environ.setdefault(...)`. `setdefault` is a no-op if the key is
already present in the process environment — which happens when the
developer's shell, CI, or a pre-loaded `.env` has real values. Direct
assignment makes the test env authoritative so tests are reproducible
regardless of the developer's local setup.
"""
import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="glassbox-pytest-"))

# ── Test environment (authoritative — overrides shell + .env) ──
_TEST_ENV = {
    # App
    "APP_ENV": "test",
    "APP_DEBUG": "false",
    "APP_NAME": "Glassbox-Test",
    # Auth
    "AUTH_ENABLED": "false",
    "GUEST_MODE": "false",
    # LLM (dummy values — never called in tests)
    "LLM_PROVIDER": "gemini",
    "LLM_API_KEY": "test-key-not-used",
    "LLM_MODEL": "gemini-2.5-flash",
    "LLM_BASE_URL": "",
    # Secrets (64 chars — passes validate_secrets min-len check)
    "SECRET_KEY": "t" * 64,
    "JWT_SECRET_KEY": "j" * 64,
    # Storage (temp file DB + temp dirs)
    "DATABASE_URL": f"sqlite+aiosqlite:///{_TMP}/test.db",
    "UPLOAD_DIR": str(_TMP / "uploads"),
    "ARTIFACT_DIR": str(_TMP / "artifacts"),
    "DUCKDB_TEMP_DIR": str(_TMP / "duckdb"),
    # Guardrails (off for speed)
    "RATE_LIMIT_ENABLED": "false",
    "SANDBOX_ENABLED": "false",
    # Integrations (off)
    "SMTP_ENABLED": "false",
    "NEWS_API_KEY": "",
    # SSRF guard — force defaults so tests exercise default policy
    "CONNECTOR_ALLOW_PRIVATE_HOSTS": "false",
    "CONNECTOR_ALLOWLIST": "",
}
for _key, _val in _TEST_ENV.items():
    os.environ[_key] = _val

# Clear the settings cache in case any pre-conftest import instantiated
# Settings. `get_settings` is @lru_cache'd — a stale cache would keep
# old env values alive across the whole session.
from app.config import get_settings  # noqa: E402
get_settings.cache_clear()

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def app_client():
    """Boot FastAPI with real lifespan (migrations, seeders, route audit).

    Route audit in lifespan will fail the fixture if any router is
    broken — exactly what we want from a smoke test.
    """
    from app.main import app

    with TestClient(app) as client:
        yield client