"""
Async SQLAlchemy engine + session factory + startup migrations.

Auth note:
  Every Dataset / DataSource / AnalysisRun has a nullable `user_id`.
  On first boot we create an anonymous user and backfill any existing
  rows to it. When AUTH_ENABLED=false, all endpoints resolve to this user.
"""
from __future__ import annotations

from pathlib import Path

import structlog
from sqlalchemy import select, text
from collections.abc import AsyncGenerator
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import get_settings
from app.db.models import AuditEvent, Base, Metric, Template, User

settings = get_settings()
log = structlog.get_logger()

Path("./data").mkdir(parents=True, exist_ok=True)

engine = create_async_engine(
    settings.database_url,
    echo=False,
    future=True,
    pool_pre_ping=True,
)

SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)

# Fixed ID so it's stable across restarts.
ANONYMOUS_USER_ID = "anon00000000"
ANONYMOUS_USER_EMAIL = "anonymous@local"
ANONYMOUS_USER_USERNAME = "anonymous"


# ── Startup ────────────────────────────────────────────────

async def init_db() -> None:
    """
    1. Create any missing tables (including `users`).
    2. Add missing `user_id` columns to existing tables.
    3. Replace global UNIQUE(datasets.name) with UNIQUE(user_id, name).
    4. Create the anonymous user.
    5. Backfill NULL `user_id` values to the anonymous user.
    """
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await _migrate_add_user_id(conn)
        await _migrate_add_conversation_id(conn)
        await _migrate_add_dax_text(conn)
        await _migrate_add_pinned(conn)
        await _migrate_scoped_name_unique(conn)

    async with SessionLocal() as session:
        await _ensure_anonymous_user(session)
        await _backfill_user_ids(session)
        await _seed_builtin_templates(session)
        await _seed_builtin_metrics(session)
        await _prune_audit_events(session)


async def dispose_db() -> None:
    await engine.dispose()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session


