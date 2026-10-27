"""Import + config smoke tests. Any failure here means the app cannot boot."""
import os

import pytest


def test_env_isolation():
    """Tests must run in an isolated env regardless of shell/.env values.

    Regression guard for a conftest bug where `os.environ.setdefault`
    silently deferred to pre-existing developer-env values. If this test
    ever fails, check `tests/conftest.py` hasn't switched back to
    `setdefault`.
    """
    # Env layer
    assert os.environ["APP_ENV"] == "test"
    assert os.environ["APP_DEBUG"] == "false"
    assert os.environ["LLM_PROVIDER"] == "gemini"
    assert os.environ["AUTH_ENABLED"] == "false"

    # Settings layer (end-to-end — proves the cache picked up the env)
    from app.config import get_settings
    s = get_settings()
    assert s.app_env == "test"
    assert s.app_debug is False
    assert s.llm_provider == "gemini"
    assert s.auth_enabled is False


def test_settings_load_and_validate():
    """Settings must load from conftest env and pass all three validators."""
    from app.config import get_settings

    s = get_settings()
    assert s.app_name
    assert s.llm_provider == "gemini"

    # These are called by main.lifespan at boot — if they raise, the app
    # would refuse to start. Verifying them explicitly isolates any future
    # env-default regression from the TestClient boot path.
    s.validate_secrets()
    s.validate_ranges()
    s.validate_llm()


def test_core_modules_import():
    import app.core.audit          # noqa: F401
    import app.core.crypto         # noqa: F401
    import app.core.email          # noqa: F401
    import app.core.errors         # noqa: F401
    import app.core.file_signature # noqa: F401
    import app.core.json_utils     # noqa: F401
    import app.core.logging        # noqa: F401
    import app.core.middleware     # noqa: F401
    import app.core.rate_limit     # noqa: F401
    import app.core.route_audit    # noqa: F401
    import app.core.security       # noqa: F401
    import app.core.ssrf_guard     # noqa: F401


def test_agents_import():
    import app.agents.sql_agent     # noqa: F401
    import app.agents.python_agent  # noqa: F401
    import app.agents.dax_agent     # noqa: F401
    import app.agents.visualization # noqa: F401
    import app.agents.narrative     # noqa: F401
    import app.agents.quality       # noqa: F401
    import app.agents.kpi           # noqa: F401


def test_services_import():
    import app.services.orchestrator           # noqa: F401
    import app.services.duckdb_service         # noqa: F401
    import app.services.sandbox_service        # noqa: F401
    import app.services.connector_service      # noqa: F401
    import app.services.semantic_service       # noqa: F401
    import app.services.context_service        # noqa: F401
    import app.services.suggestion_service     # noqa: F401
    import app.services.anomaly_service        # noqa: F401
    import app.services.dashboard_service      # noqa: F401
    import app.services.explain_service        # noqa: F401
    import app.services.rationale_service      # noqa: F401
    import app.services.next_questions_service # noqa: F401


def test_llm_providers_import():
    import app.services.llm.base          # noqa: F401
    import app.services.llm.factory       # noqa: F401
    import app.services.llm.gemini        # noqa: F401
    import app.services.llm.anthropic     # noqa: F401
    import app.services.llm.openai_compat # noqa: F401