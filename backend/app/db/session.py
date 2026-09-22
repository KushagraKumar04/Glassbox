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


# ── Migration helpers ──────────────────────────────────────

async def _migrate_add_user_id(conn) -> None:
    """Add `user_id` columns to existing tables if missing."""
    for table in ("datasets", "data_sources", "analysis_runs"):
        try:
            result = await conn.execute(text(f"PRAGMA table_info({table})"))
            existing = {row[1] for row in result.fetchall()}
        except Exception as e:
            log.warning("pragma_failed", table=table, error=str(e)[:160])
            continue

        if "user_id" not in existing:
            try:
                await conn.execute(
                    text(f"ALTER TABLE {table} ADD COLUMN user_id VARCHAR(32)")
                )
                log.info("migration_added_user_id", table=table)
            except Exception as e:
                log.warning(
                    "migration_user_id_failed", table=table, error=str(e)[:160]
                )

async def _migrate_scoped_name_unique(conn) -> None:
    """
    Transition from global UNIQUE(name) to UNIQUE(user_id, name)
    on datasets and data_sources.

    SQLite can't ALTER a constraint, but it *can* DROP INDEX. The original
    `unique=True, index=True` on `name` created an index named `ix_<table>_name`.
    We drop it and create a composite unique index instead.
    """
    for table in ("datasets", "data_sources"):
        # Drop the old global unique index if it exists
        for old_idx in (f"ix_{table}_name", f"uq_{table}_name"):
            try:
                await conn.execute(text(f"DROP INDEX IF EXISTS {old_idx}"))
                log.info("migration_dropped_index", index=old_idx)
            except Exception as e:
                log.debug("drop_index_skipped", index=old_idx, error=str(e)[:80])

        # Create the composite unique index (idempotent)
        new_idx = f"uq_{table}_user_name"
        try:
            await conn.execute(
                text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {new_idx} "
                    f"ON {table} (user_id, name)"
                )
            )
            log.info("migration_created_composite_index", index=new_idx)
        except Exception as e:
            log.warning(
                "create_composite_index_failed",
                index=new_idx,
                error=str(e)[:160],
            )

async def _ensure_anonymous_user(session: AsyncSession) -> User:
    user = await session.get(User, ANONYMOUS_USER_ID)
    if user:
        return user

    user = User(
        id=ANONYMOUS_USER_ID,
        email=ANONYMOUS_USER_EMAIL,
        username=ANONYMOUS_USER_USERNAME,
        hashed_password="",  # cannot log in
        is_active=True,
        is_superuser=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    log.info("anonymous_user_created", user_id=ANONYMOUS_USER_ID)
    return user


async def _backfill_user_ids(session: AsyncSession) -> None:
    """Assign any NULL user_id rows to the anonymous user."""
    from app.db.models import AnalysisRun, DataSource, Dataset

    for model in (Dataset, DataSource, AnalysisRun):
        result = await session.execute(
            select(model).where(model.user_id.is_(None))
        )
        rows = result.scalars().all()
        if not rows:
            continue
        for row in rows:
            row.user_id = ANONYMOUS_USER_ID
        await session.commit()
        log.info("backfilled_user_id", table=model.__tablename__, count=len(rows))



_BUILTIN_TEMPLATES: list[dict] = [
    {
        "name": "Revenue diagnostics",
        "description": "Break down revenue by dimension to find what's driving change.",
        "question": "Break down total revenue by region and by month. Highlight which segments grew or declined the most.",
        "tags": ["revenue", "diagnostics", "time-series"],
    },
    {
        "name": "Top-N performers",
        "description": "Rank entities by a metric and show the top movers.",
        "question": "Show the top 10 by total revenue. Include the metric value and rank.",
        "tags": ["ranking", "top-n"],
    },
    {
        "name": "Time series trend",
        "description": "Show how a metric evolves over time with month-over-month change.",
        "question": "Show the monthly trend of total revenue. Include month-over-month percentage change.",
        "tags": ["time-series", "trend"],
    },
    {
        "name": "Distribution check",
        "description": "Understand the spread and shape of a numeric column.",
        "question": "Show the distribution of revenue. Include min, max, average, and percentiles.",
        "tags": ["statistics", "distribution"],
    },
    {
        "name": "Segment comparison",
        "description": "Compare a metric across two or more dimensions.",
        "question": "Compare average revenue by region and by channel. Which combinations perform best?",
        "tags": ["comparison", "segments"],
    },
    {
        "name": "Data quality scan",
        "description": "Find nulls, outliers, and anomalies in the data.",
        "question": "Show me any data quality issues: null rates per column, outliers in numeric columns, and duplicated rows.",
        "tags": ["quality", "audit"],
    },
    {
        "name": "Period-over-period change",
        "description": "Compare this period against the previous period.",
        "question": "Compare total revenue for the latest month against the previous month. Show the absolute and percentage change.",
        "tags": ["comparison", "time-series"],
    },
    {
        "name": "Correlation analysis",
        "description": "Test whether two numeric columns move together.",
        "question": "Analyze the correlation between revenue and margin. Is there a meaningful relationship?",
        "tags": ["statistics", "correlation"],
    },
    {
        "name": "Anomaly detection",
        "description": "Find unusual values or outliers in a numeric column.",
        "question": "Detect anomalies in the revenue column. Show the top 10 outliers and their distance from the mean.",
        "tags": ["anomaly", "statistics"],
    },
    {
        "name": "Customer segmentation",
        "description": "Group customers into meaningful cohorts.",
        "question": "Segment customers by their lifetime value. Show the count and average spend for each segment.",
        "tags": ["segments", "customers"],
    },
]

