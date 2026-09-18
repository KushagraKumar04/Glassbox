"""
Central settings. Reads from .env — one source of truth.
Swap LLM providers by changing LLM_PROVIDER / LLM_API_KEY / LLM_MODEL.
"""
from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── LLM ─────────────────────────────────────────────────
    llm_provider: str = "gemini"
    llm_api_key: str = ""
    llm_model: str = "gemini-2.5-flash"
    llm_base_url: str = ""
    llm_temperature: float = 0.0
    llm_max_tokens: int = 8192

    # ── App ─────────────────────────────────────────────────
    app_name: str = "AI Data Analyst"
    app_env: str = "development"
    app_debug: bool = True
    app_host: str = "0.0.0.0"
    app_port: int = 8000
    secret_key: str = "change-me"
    cors_origins: str = "http://localhost:5173"

    # ── Storage ─────────────────────────────────────────────
    database_url: str = "sqlite+aiosqlite:///./data/app.db"
    upload_dir: str = "./data/uploads"
    artifact_dir: str = "./data/artifacts"
    duckdb_temp_dir: str = "./data/duckdb_temp"
    max_upload_size_mb: int = 100

    # ── DuckDB ──────────────────────────────────────────────
    duckdb_memory_limit: str = "2GB"
    duckdb_threads: int = 4

    # ── Sandbox ─────────────────────────────────────────────
    sandbox_enabled: bool = False
    sandbox_image: str = "ai-data-analyst-sandbox:latest"
    sandbox_cpu_limit: float = 2.0
    sandbox_memory_limit_mb: int = 2048
    sandbox_timeout_seconds: int = 30
    sandbox_network_disabled: bool = True
    sandbox_max_output_bytes: int = 1_048_576

    # ── Guardrails ──────────────────────────────────────────
    max_query_rows: int = 100_000
    query_timeout_seconds: int = 60
    max_concurrent_runs: int = 5

    # ── Timezone ────────────────────────────────────────────
    # IANA tz name. Used to display timestamps in logs and API responses.
    # Storage always uses UTC; this only controls display.
    # Examples: Asia/Kolkata | UTC | America/New_York
    display_timezone: str = "Asia/Kolkata"

    # ── Auth ────────────────────────────────────────────────
    auth_enabled: bool = False
    jwt_secret_key: str = "change-me-to-a-long-random-string"
    jwt_algorithm: str = "HS256"
    jwt_access_token_minutes: int = 1440
    auth_min_password_length: int = 8

    # ── Password reset ──────────────────────────────────────
    auth_reset_token_minutes: int = 30
    # Dev-only: expose the reset link in the API response.
    # NEVER enable in production — it lets anyone reset any account.
    auth_show_reset_link: bool = False

    # ── Rate limiting ───────────────────────────────────────
    rate_limit_enabled: bool = True
    rate_limit_login: str = "10/minute"
    rate_limit_register: str = "5/hour"
    rate_limit_forgot: str = "5/hour"
    rate_limit_reset: str = "10/hour"
    rate_limit_chat: str = "30/minute"
    rate_limit_execute: str = "60/minute"
    rate_limit_storage: str = "memory://"

    # ── Audit ───────────────────────────────────────────────
    audit_retention_days: int = 90

    # ── SMTP (password-reset email) ─────────────────────────
    smtp_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "AI Data Analyst"
    smtp_use_tls: bool = True
    smtp_use_ssl: bool = False
    smtp_timeout_seconds: int = 15

    @property
    def email_delivery_active(self) -> bool:
        """True only when SMTP is fully configured."""
        return bool(
            self.smtp_enabled
            and self.smtp_host
            and self.smtp_from_email
        )
    # ── Logging ─────────────────────────────────────────────
    log_level: str = "INFO"

    # ── Derived ─────────────────────────────────────────────
    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def allowed_package_list(self) -> list[str]:
        return [
            "pandas", "numpy", "scipy", "duckdb",
            "pyarrow", "scikit-learn", "statsmodels", "matplotlib",
        ]

    def ensure_dirs(self) -> None:
        """Create runtime directories if they don't exist."""
        for d in (
            self.upload_dir,
            self.artifact_dir,
            self.duckdb_temp_dir,
            "./data",
        ):
            Path(d).mkdir(parents=True, exist_ok=True)

    def validate_llm(self) -> None:
        """Fail fast if the provider config is incomplete."""
        provider = self.llm_provider.lower().strip()
        if provider == "gemini" and not self.llm_api_key:
            raise ValueError("LLM_API_KEY is required for provider 'gemini'")
        if provider == "openai" and not self.llm_api_key:
            raise ValueError("LLM_API_KEY is required for provider 'openai'")
        if provider == "anthropic" and not self.llm_api_key:
            raise ValueError("LLM_API_KEY is required for provider 'anthropic'")
        if provider in {"openai_compatible", "ollama"} and not self.llm_base_url:
            raise ValueError(
                f"LLM_BASE_URL is required for provider '{provider}'. "
                f"Examples: https://openrouter.ai/api/v1, http://localhost:11434/v1"
            )
        if provider not in {"gemini", "openai", "anthropic", "ollama", "openai_compatible"}:
            raise ValueError(
                f"Unknown LLM_PROVIDER='{provider}'. "
                f"Use: gemini | openai | anthropic | ollama | openai_compatible"
            )


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    s.ensure_dirs()
    return s