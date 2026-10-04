"""
Structured error classes, sanitizer, and FastAPI exception handlers.

Design goals:
  - Clients see stable, safe messages — never stack traces, file paths,
    SQL statements, or credential-looking strings.
  - Server logs see the full exception with a correlation ID so an
    operator can trace the exact request.
  - Dev mode (APP_DEBUG=true) appends the raw error under `debug` so
    the developer can see what broke without grepping logs.

Response shape (stable across all handlers):

    {
      "detail":     "<human message>",
      "code":       "<machine code>",
      "request_id": "<16-char id>",
      "debug":      {...}   # only when APP_DEBUG=true
    }

`detail` is always a string so the frontend's `parseError()` keeps
working without changes.
"""
from __future__ import annotations

import re
from typing import Any

import structlog
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import get_settings

log = structlog.get_logger()
settings = get_settings()


# ═══════════════════════════════════════════════════════════════════════════
#  Domain error classes
# ═══════════════════════════════════════════════════════════════════════════

class AppError(Exception):
    """Base for domain errors that map cleanly to HTTP responses."""
    code: str = "internal_error"
    status_code: int = 500

    def __init__(self, message: str, *, details: dict[str, Any] | None = None):
        super().__init__(message)
        self.message = message
        self.details = details or {}


class ValidationError(AppError):
    code = "validation_error"
    status_code = 422


class NotFoundError(AppError):
    code = "not_found"
    status_code = 404


class ForbiddenError(AppError):
    code = "forbidden"
    status_code = 403


class ConflictError(AppError):
    code = "conflict"
    status_code = 409


class UpstreamError(AppError):
    """Downstream dependency (DB, LLM, SMTP) failed."""
    code = "upstream_error"
    status_code = 502


# ═══════════════════════════════════════════════════════════════════════════
#  Sanitizer
# ═══════════════════════════════════════════════════════════════════════════

# Filesystem paths: matches /home/..., /Users/..., C:\..., /tmp/..., etc.
_PATH_RE = re.compile(
    r"(?i)(?:[a-z]:[\\/]|/(?:home|users|app|tmp|var|etc|opt|root)/)"
    r"[^\s'\"]+"
)

# Credential-looking key=value pairs
_CRED_RE = re.compile(
    r"(?i)\b(password|passwd|pwd|api[_-]?key|token|secret|authorization)\b"
    r"\s*[:=]\s*[^\s,;'\"]+"
)

# Postgres/libpq "connection string" fragments
_CONNSTR_RE = re.compile(
    r"(?i)(host=\S+\s+port=\S+\s+dbname=\S+\s+user=\S+)"
)


def sanitize_message(msg: str, *, max_len: int = 500) -> str:
    """
    Redact filesystem paths, connection strings, and credential-looking
    substrings from an error message before it reaches a client.

    Preserves the semantic content ('column not found') while hiding
    internals ('/home/ubuntu/app/data/sales.csv').
    """
    if not msg:
        return ""
    m = _CONNSTR_RE.sub("<connection>", msg)
    m = _PATH_RE.sub("<path>", m)
    m = _CRED_RE.sub(r"\1=<redacted>", m)
    return m[:max_len]


def classify_db_error(msg: str) -> str:
    """
    Turn a raw database error into a small, stable category the frontend
    can map to a friendly message.
    """
    low = (msg or "").lower()
    if any(k in low for k in (
        "password authentication failed",
        "access denied for user",
        "authentication failed",
        "invalid password",
    )):
        return "auth_failed"
    if any(k in low for k in (
        "could not connect",
        "connection refused",
        "no route to host",
        "name or service not known",
        "nodename nor servname",
        "host is down",
        "network is unreachable",
    )):
        return "host_unreachable"
    if "timeout" in low or "timed out" in low:
        return "timeout"
    if "ssl" in low or "tls" in low:
        return "ssl_error"
    if any(k in low for k in (
        "does not exist",
        "unknown database",
        "no such table",
    )):
        return "not_found"
    if "permission denied" in low or "access denied" in low:
        return "permission"
    if "parser error" in low or "syntax error" in low:
        return "syntax"
    return "unknown"


# ═══════════════════════════════════════════════════════════════════════════
#  Exception handlers
# ═══════════════════════════════════════════════════════════════════════════

def _rid(request: Request) -> str:
    return getattr(request.state, "correlation_id", "unknown")


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Handle our own AppError subclasses with a structured response."""
    rid = _rid(request)
    log.warning(
        "app_error",
        code=exc.code,
        status=exc.status_code,
        message=exc.message[:200],
        request_id=rid,
    )

    content: dict[str, Any] = {
        "detail": sanitize_message(exc.message),
        "code": exc.code,
        "request_id": rid,
    }
    if settings.app_debug and exc.details:
        content["debug"] = exc.details

    return JSONResponse(status_code=exc.status_code, content=content)


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    """
    Trim Pydantic's verbose error list down to field paths + messages.

    The default FastAPI response includes the raw `input` value and the
    internal `type`/`ctx` — which can echo back sensitive user input in
    logs and error messages. We keep only what the client needs to fix
    the request.
    """
    rid = _rid(request)

    errors: list[dict[str, str]] = []
    for e in exc.errors()[:10]:
        loc = ".".join(str(x) for x in e.get("loc", []))
        msg = str(e.get("msg", ""))[:200]
        errors.append({"field": loc or "(body)", "message": msg})

    log.info("validation_failed", request_id=rid, count=len(errors))

    content: dict[str, Any] = {
        "detail": "Validation failed.",
        "code": "validation_error",
        "request_id": rid,
        "errors": errors,
    }
    if settings.app_debug:
        content["debug"] = {"raw": exc.errors()[:10]}

    return JSONResponse(status_code=422, content=content)


async def unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    """
    Last-resort catch-all. Logs the full traceback server-side, returns
    a generic message to the client.
    """
    rid = _rid(request)
    log.exception(
        "unhandled_error",
        request_id=rid,
        path=str(request.url.path),
        method=request.method,
        exc_type=type(exc).__name__,
    )

    content: dict[str, Any] = {
        "detail": "Something went wrong on our side.",
        "code": "internal_error",
        "request_id": rid,
    }
    if settings.app_debug:
        content["debug"] = {
            "type": type(exc).__name__,
            "message": sanitize_message(str(exc))[:1000],
        }

    return JSONResponse(status_code=500, content=content)


__all__ = [
    "AppError",
    "ValidationError",
    "NotFoundError",
    "ForbiddenError",
    "ConflictError",
    "UpstreamError",
    "sanitize_message",
    "classify_db_error",
    "app_error_handler",
    "validation_exception_handler",
    "unhandled_exception_handler",
]