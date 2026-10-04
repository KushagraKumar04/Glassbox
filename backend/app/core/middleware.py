"""
HTTP middleware.

CorrelationIdMiddleware:
  - Assigns every request a 16-char hex request ID
  - Accepts a client-supplied `X-Request-ID` if it's well-formed
    (16-64 chars, alphanumeric + dashes), for cross-service tracing
  - Binds the ID + method + path into structlog's contextvars so every
    log line emitted during the request includes them
  - Echoes the ID back in the `X-Request-ID` response header
"""
from __future__ import annotations

import re
import uuid

import structlog
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

log = structlog.get_logger()

# Accept up to 64 chars, alphanumeric + dashes. Anything else is
# regenerated to prevent header injection / log forging.
_INBOUND_ID_RE = re.compile(r"^[A-Za-z0-9-]{16,64}$")


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        inbound = request.headers.get("x-request-id", "")
        if inbound and _INBOUND_ID_RE.match(inbound):
            rid = inbound
        else:
            rid = uuid.uuid4().hex[:16]

        request.state.correlation_id = rid

        # Bind request-scoped context so every log line in this request
        # includes the ID automatically.
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(
            request_id=rid,
            method=request.method,
            path=request.url.path,
        )

        try:
            response = await call_next(request)
        finally:
            # Always clear so the next task doesn't inherit stale context.
            structlog.contextvars.clear_contextvars()

        response.headers["X-Request-ID"] = rid
        return response