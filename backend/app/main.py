"""
FastAPI entry point.

    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app import __version__
from app.api.v1.router import api_router
from app.config import get_settings
from app.core.errors import (
    AppError,
    app_error_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.core.logging import configure_logging
from app.core.middleware import CorrelationIdMiddleware
from app.core.rate_limit import limiter, rate_limit_handler
from app.core.route_audit import audit_routes
from app.db.session import dispose_db, init_db

settings = get_settings()
configure_logging(settings)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info(
        "startup",
        env=settings.app_env,
        provider=settings.llm_provider,
        model=settings.llm_model,
        rate_limit_enabled=settings.rate_limit_enabled,
        rate_limit_storage=settings.rate_limit_storage,
        auth_backoff_enabled=settings.auth_backoff_enabled,
        auth_backoff_threshold=settings.auth_backoff_threshold,
        auth_backoff_max_seconds=settings.auth_backoff_max_seconds,
        trusted_proxy_count=settings.trusted_proxy_count,
    )
    # Fail fast if any security-critical secret is missing or weak,
    # if any range/enum setting is invalid, or if the LLM provider
    # config is incomplete. Any raise aborts boot before traffic.
    settings.validate_secrets()
    settings.validate_ranges()
    settings.validate_llm()

    # Confirm every included router is actually reachable. On FastAPI
    # >= 0.137, `app.routes` is a lazy tree; a broken import in
    # `api/v1/router.py` would otherwise let the app boot silently
    # with no /api/* endpoints.
    audit_routes(app)

    await init_db()
    yield
    await dispose_db()
    log.info("shutdown")


app = FastAPI(
    title=settings.app_name,
    version=__version__,
    description="Ask your data. Get the answer. See the proof.",
    lifespan=lifespan,
    docs_url="/docs" if settings.app_debug else None,
    redoc_url=None,
)

# Rate limiting — must be set up BEFORE routers so decorators resolve
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

# Structured error handlers.
# Order of registration doesn't matter — Starlette dispatches by the
# most specific type match. HTTPException keeps its default handler.
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# Correlation ID must be INNER (added first) so the response header it
# sets is visible to the outer CORS middleware. Starlette applies
# middlewares in reverse-registration order: last added = outermost.
app.add_middleware(CorrelationIdMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=[
        "X-RateLimit-Limit",
        "X-RateLimit-Remaining",
        "Retry-After",
        "X-Request-ID",
    ],
)

app.include_router(api_router, prefix="/api/v1")


@app.get("/")
async def root() -> dict:
    return {
        "name": settings.app_name,
        "version": __version__,
        "docs": "/docs",
        "health": "/api/v1/health",
    }