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
    app_name: str = "Glassbox"
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

    # When true, uploads are verified by content (magic bytes / text
    # heuristics) in addition to extension. Rejects files whose bytes
    # don't match their extension. Disable only for debugging.
    upload_signature_check_enabled: bool = True

    # Streaming read chunk size when enforcing MAX_UPLOAD_SIZE_MB.
    # Larger chunks are faster but buffer more per iteration.
    upload_stream_chunk_bytes: int = 1_048_576  # 1 MB

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

    # ── SSRF guard (database connectors) ────────────────────
    # When False, any connection whose host resolves to a private,
    # loopback, link-local, or cloud-metadata IP is rejected. Set to
    # True only in dev/test environments where you actually want to
    # connect to local Postgres/MySQL/SQLite.
    connector_allow_private_hosts: bool = False

    # Comma-separated hosts or CIDRs. When non-empty, ONLY these are
    # allowed — everything else is rejected. Takes precedence over
    # the private-hosts flag (an allowlisted host is always allowed).
    # Example: "db.internal.example.com,10.10.0.0/16"
    connector_allowlist: str = ""

    # Comma-separated hosts or CIDRs that are ALWAYS rejected, even if
    # they resolve to a public IP. Applied after the allowlist.
    # Sensible default blocks loopback and cloud metadata.
    connector_blocklist: str = (
        "localhost,"
        "127.0.0.0/8,"
        "::1,"
        "169.254.0.0/16,"
        "metadata.google.internal,"
        "metadata.azure.com"
    )

    # Seconds to wait for the initial TCP+handshake before giving up.
    connector_connect_timeout_seconds: int = 10

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
    # When auth is enabled AND guest mode is on, unauthenticated users can
    # READ (browse pages, list existing data) but not WRITE (upload, run,
    # connect, delete, pin). Every write returns 403 with a "sign in"
    # message the frontend turns into a modal.
    guest_mode: bool = False

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

    # ── Auth backoff (per-account, exponential) ─────────────
    # After N failures on the same account identifier (email/username),
    # requests for that identifier are delayed by an exponentially
    # growing amount. Never a permanent lockout — the counter resets
    # after AUTH_BACKOFF_RESET_MINUTES of inactivity.
    #
    # The delay is: min(base * multiplier^(failures - threshold), max)
    auth_backoff_enabled: bool = True
    auth_backoff_threshold: int = 3          # failures before any delay
    auth_backoff_base_seconds: float = 1.0   # first delay after threshold
    auth_backoff_multiplier: float = 2.0     # growth factor per extra failure
    auth_backoff_max_seconds: int = 300      # hard cap: 5 minutes
    auth_backoff_reset_minutes: int = 60     # idle window before counter reset

    # ── Trusted proxy ───────────────────────────────────────
    # Number of reverse proxies in front of the app. When > 0, the
    # client IP is taken from the Nth-from-right entry in X-Forwarded-For.
    # 0 → use request.client.host, ignore XFF entirely.
    trusted_proxy_count: int = 0

    # Optional IP/CIDR allowlist for the immediate peer. When non-empty,
    # XFF is only honored if the immediate peer's IP matches one of these.
    # Example: 10.0.0.0/8,172.16.0.0/12 for an internal load balancer.
    trusted_proxy_ips: str = ""

    # ── News (public landing page) ──────────────────────────
    news_api_key: str = ""
    # Optional — auto-detected from the key shape if unset
    # "currents" | "newsapi" | "guardian"
    news_provider: str = ""
    # Optional — override the provider URL
    news_provider_url: str = ""

    # ── Audit ───────────────────────────────────────────────
    audit_retention_days: int = 90

    # ── SMTP (password-reset email) ─────────────────────────
    smtp_enabled: bool = False
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""
    smtp_from_name: str = "Glassbox"
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

    @property
    def trusted_proxy_ip_list(self) -> list[str]:
        return [x.strip() for x in self.trusted_proxy_ips.split(",") if x.strip()]

    def ensure_dirs(self) -> None:
        """Create runtime directories if they don't exist."""
        for d in (
            self.upload_dir,
            self.artifact_dir,
            self.duckdb_temp_dir,
            "./data",
        ):
            Path(d).mkdir(parents=True, exist_ok=True)

    def validate_secrets(self) -> None:
        """
        Fail fast if any security-critical secret is missing, too weak,
        or still set to a known placeholder value.

        Called from `main.py` at startup. Any raise here aborts the boot
        before the app can accept traffic.
        """
        PLACEHOLDERS = {
            "",
            "change-me",
            "change-me-to-a-random-string",
            "change-me-to-a-long-random-string",
            "change-me-to-a-random-64-char-string",
            "your-key-here",
            "paste-your-api-key-here",
            "secret",
            "password",
        }
        MIN_SECRET_LEN = 32

        def _check(name: str, value: str, *, min_len: int = MIN_SECRET_LEN) -> None:
            v = (value or "").strip()
            if v.lower() in PLACEHOLDERS:
                raise ValueError(
                    f"{name} is unset or still set to a placeholder. "
                    f'Generate one with:  python -c "import secrets; '
                    f'print(secrets.token_urlsafe(48))"'
                )
            if len(v) < min_len:
                raise ValueError(
                    f"{name} is too short ({len(v)} chars). Minimum is "
                    f"{min_len}. Generate one with:  python -c "
                    f'"import secrets; print(secrets.token_urlsafe(48))"'
                )

        # Always required — encrypts stored source-database passwords
        _check("SECRET_KEY", self.secret_key)

        # Required only when auth is enabled
        if self.auth_enabled:
            _check("JWT_SECRET_KEY", self.jwt_secret_key)

        # LLM key must not be a placeholder (shape is validated separately)
        if self.llm_api_key.strip().lower() in PLACEHOLDERS:
            raise ValueError(
                "LLM_API_KEY is unset or still set to the placeholder value."
            )

        # SMTP password must not be a placeholder when SMTP is on
        if self.smtp_enabled and self.smtp_password.strip().lower() in PLACEHOLDERS:
            raise ValueError(
                "SMTP_PASSWORD is unset or still set to a placeholder "
                "value while SMTP_ENABLED=true."
            )

    def validate_ranges(self) -> None:
        """
        Range / format checks for security-relevant numeric and enum
        settings. Runs at startup alongside validate_secrets().

        Rationale: a bad value silently weakens a control (e.g.
        AUTH_BACKOFF_MULTIPLIER < 1 makes backoff shrink; a non-positive
        MAX_UPLOAD_SIZE_MB disables the streaming cap) or crashes at
        first use instead of at boot. Fail fast.
        """
        errors: list[str] = []

        def _need(name: str, value: object, cond: bool, hint: str) -> None:
            if not cond:
                errors.append(f"{name}={value!r} invalid — {hint}")

        # JWT
        _need("JWT_ALGORITHM", self.jwt_algorithm,
              self.jwt_algorithm == "HS256", 'only "HS256" is supported')
        _need("JWT_ACCESS_TOKEN_MINUTES", self.jwt_access_token_minutes,
              self.jwt_access_token_minutes > 0, "must be > 0")
        _need("AUTH_RESET_TOKEN_MINUTES", self.auth_reset_token_minutes,
              self.auth_reset_token_minutes > 0, "must be > 0")

        # Upload
        _need("MAX_UPLOAD_SIZE_MB", self.max_upload_size_mb,
              self.max_upload_size_mb > 0, "must be > 0")
        _need("UPLOAD_STREAM_CHUNK_BYTES", self.upload_stream_chunk_bytes,
              self.upload_stream_chunk_bytes > 0, "must be > 0")

        # Guardrails
        _need("MAX_QUERY_ROWS", self.max_query_rows,
              self.max_query_rows > 0, "must be > 0")
        _need("QUERY_TIMEOUT_SECONDS", self.query_timeout_seconds,
              self.query_timeout_seconds > 0, "must be > 0")
        _need("MAX_CONCURRENT_RUNS", self.max_concurrent_runs,
              self.max_concurrent_runs > 0, "must be > 0")

        # DuckDB
        _need("DUCKDB_THREADS", self.duckdb_threads,
              self.duckdb_threads >= 1, "must be >= 1")

        # SSRF guard
        _need("CONNECTOR_CONNECT_TIMEOUT_SECONDS",
              self.connector_connect_timeout_seconds,
              self.connector_connect_timeout_seconds > 0, "must be > 0")

        # Auth backoff
        _need("AUTH_BACKOFF_THRESHOLD", self.auth_backoff_threshold,
              self.auth_backoff_threshold >= 1, "must be >= 1")
        _need("AUTH_BACKOFF_BASE_SECONDS", self.auth_backoff_base_seconds,
              self.auth_backoff_base_seconds >= 0, "must be >= 0")
        _need("AUTH_BACKOFF_MULTIPLIER", self.auth_backoff_multiplier,
              self.auth_backoff_multiplier >= 1.0, "must be >= 1.0")
        _need("AUTH_BACKOFF_MAX_SECONDS", self.auth_backoff_max_seconds,
              self.auth_backoff_max_seconds > 0, "must be > 0")
        _need("AUTH_BACKOFF_RESET_MINUTES", self.auth_backoff_reset_minutes,
              self.auth_backoff_reset_minutes > 0, "must be > 0")

        # Trusted proxy
        _need("TRUSTED_PROXY_COUNT", self.trusted_proxy_count,
              self.trusted_proxy_count >= 0, "must be >= 0")

        # Audit
        _need("AUDIT_RETENTION_DAYS", self.audit_retention_days,
              self.audit_retention_days > 0, "must be > 0")

        # LLM sampling
        _need("LLM_MAX_TOKENS", self.llm_max_tokens,
              self.llm_max_tokens > 0, "must be > 0")
        _need("LLM_TEMPERATURE", self.llm_temperature,
              0.0 <= self.llm_temperature <= 2.0, "must be in [0.0, 2.0]")

        # Production safety net
        if self.app_env.lower().strip() == "production":
            _need("APP_DEBUG", self.app_debug,
                  self.app_debug is False,
                  "must be false when APP_ENV=production")
            _need("AUTH_SHOW_RESET_LINK", self.auth_show_reset_link,
                  self.auth_show_reset_link is False,
                  "must be false when APP_ENV=production")

        if errors:
            raise ValueError(
                "Invalid configuration:\n  - " + "\n  - ".join(errors)
            )

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