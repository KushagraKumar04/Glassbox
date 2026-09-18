"""
Structured JSON logging via structlog.
Timestamps use DISPLAY_TIMEZONE from .env (default Asia/Kolkata for IST).
Never logs API keys — filter on the way out.
"""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import structlog

from app.config import Settings

_REDACT_KEYS = {
    "api_key", "llm_api_key", "secret", "secret_key",
    "password", "authorization", "token", "access_token",
}


def _resolve_tz(name: str) -> timezone | ZoneInfo:
    """Resolve an IANA name; fall back to UTC on any error."""
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return timezone.utc


def _make_timestamp_processor(tz_name: str):
    """Returns a structlog processor that stamps events in the given tz."""
    tz = _resolve_tz(tz_name)

    def processor(_, __, event_dict):
        event_dict["timestamp"] = datetime.now(tz).isoformat()
        return event_dict

    return processor


def _redact_processor(_, __, event_dict):
    """Redact known sensitive keys before rendering."""
    for key in list(event_dict.keys()):
        if key.lower() in _REDACT_KEYS:
            event_dict[key] = "***REDACTED***"
    return event_dict


def configure_logging(settings: Settings) -> None:
    level = getattr(logging, settings.log_level.upper(), logging.INFO)

    logging.basicConfig(format="%(message)s", level=level)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            _make_timestamp_processor(settings.display_timezone),
            _redact_processor,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str | None = None):
    return structlog.get_logger(name) if name else structlog.get_logger()