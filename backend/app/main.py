"""
FastAPI entry point.

    uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi.errors import RateLimitExceeded

from app import __version__
from app.api.v1.router import api_router
from app.config import get_settings
from app.core.logging import configure_logging
from app.core.rate_limit import limiter, rate_limit_handler
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
    )
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-RateLimit-Limit", "X-RateLimit-Remaining", "Retry-After"],
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