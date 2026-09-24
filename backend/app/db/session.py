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


async def _seed_builtin_templates(session: AsyncSession) -> None:
    """
    Insert built-in templates on startup if they're missing.
    Idempotent — safe to run on every boot.

    Built-ins have user_id=None and is_builtin=True.
    They are refreshed (name/desc/question) if the definition changed,
    so improvements to the seed list propagate to existing installs.
    """
    existing_result = await session.execute(
        select(Template).where(Template.is_builtin.is_(True))
    )
    existing_by_name = {t.name: t for t in existing_result.scalars().all()}

    added = 0
    updated = 0

    for spec in _BUILTIN_TEMPLATES:
        existing = existing_by_name.get(spec["name"])
        if existing is None:
            session.add(Template(
                user_id=None,
                name=spec["name"],
                description=spec["description"],
                question=spec["question"],
                tags=spec["tags"],
                is_builtin=True,
            ))
            added += 1
        else:
            changed = (
                existing.description != spec["description"]
                or existing.question != spec["question"]
                or (existing.tags or []) != spec["tags"]
            )
            if changed:
                existing.description = spec["description"]
                existing.question = spec["question"]
                existing.tags = spec["tags"]
                updated += 1

    if added or updated:
        await session.commit()
        log.info(
            "builtin_templates_seeded",
            added=added,
            updated=updated,
            total=len(_BUILTIN_TEMPLATES),
        )


_BUILTIN_METRICS: list[dict] = [
    {
        "name": "Revenue",
        "description": "Total monetary value received from sales.",
        "sql_expression": "SUM(amount) — apply to the correct revenue/amount column",
        "synonyms": ["sales", "turnover", "top line", "total revenue"],
        "category": "Financial",
    },
    {
        "name": "Gross margin",
        "description": "Revenue minus cost of goods sold. Usually expressed as a percentage of revenue.",
        "sql_expression": "SUM(revenue - cost) or (SUM(revenue - cost) / SUM(revenue)) * 100",
        "synonyms": ["margin", "gross profit", "profit margin"],
        "category": "Financial",
    },
    {
        "name": "Order count",
        "description": "Number of orders placed in the period.",
        "sql_expression": "COUNT(*) or COUNT(DISTINCT order_id)",
        "synonyms": ["orders", "transactions", "number of orders"],
        "category": "Operations",
    },
    {
        "name": "Average order value",
        "description": "Revenue divided by order count.",
        "sql_expression": "SUM(revenue) / COUNT(DISTINCT order_id)",
        "synonyms": ["AOV", "avg order", "average order"],
        "category": "Financial",
    },
    {
        "name": "Customer count",
        "description": "Distinct count of customers who made a purchase or placed an order.",
        "sql_expression": "COUNT(DISTINCT customer_id)",
        "synonyms": ["customers", "number of customers", "unique customers"],
        "category": "Customer",
    },
    {
        "name": "Growth rate",
        "description": "Percentage change from a prior period (month-over-month or year-over-year).",
        "sql_expression": "((current - prior) / NULLIF(prior, 0)) * 100",
        "synonyms": ["growth", "MoM", "YoY", "change", "delta"],
        "category": "Financial",
    },
]


async def _seed_builtin_metrics(session: AsyncSession) -> None:
    """
    Insert built-in metrics on startup if they're missing.
    Idempotent — safe to run on every boot.
    """
    result = await session.execute(
        select(Metric).where(Metric.is_builtin.is_(True))
    )
    existing_by_name = {m.name: m for m in result.scalars().all()}

    added = 0
    updated = 0

    for spec in _BUILTIN_METRICS:
        existing = existing_by_name.get(spec["name"])
        if existing is None:
            session.add(Metric(
                user_id=None,
                name=spec["name"],
                description=spec["description"],
                sql_expression=spec["sql_expression"],
                synonyms=spec["synonyms"],
                category=spec["category"],
                is_builtin=True,
            ))
            added += 1
        else:
            changed = (
                existing.description != spec["description"]
                or existing.sql_expression != spec["sql_expression"]
                or (existing.synonyms or []) != spec["synonyms"]
                or existing.category != spec["category"]
            )
            if changed:
                existing.description = spec["description"]
                existing.sql_expression = spec["sql_expression"]
                existing.synonyms = spec["synonyms"]
                existing.category = spec["category"]
                updated += 1

    if added or updated:
        await session.commit()
        log.info(
            "builtin_metrics_seeded",
            added=added,
            updated=updated,
            total=len(_BUILTIN_METRICS),
        )


async def _migrate_add_dax_text(conn) -> None:
    """Add `dax_text` to analysis_runs if missing."""
    try:
        result = await conn.execute(text("PRAGMA table_info(analysis_runs)"))
        existing = {row[1] for row in result.fetchall()}
    except Exception as e:
        log.warning("pragma_failed", table="analysis_runs", error=str(e)[:160])
        return

    if "dax_text" not in existing:
        try:
            await conn.execute(
                text(
                    "ALTER TABLE analysis_runs "
                    "ADD COLUMN dax_text TEXT DEFAULT ''"
                )
            )
            log.info("migration_added_dax_text")
        except Exception as e:
            log.warning("migration_dax_text_failed", error=str(e)[:160])
            


async def _migrate_add_conversation_id(conn) -> None:
    """Add `conversation_id` to analysis_runs if missing, then create its index."""
    try:
        result = await conn.execute(text("PRAGMA table_info(analysis_runs)"))
        existing = {row[1] for row in result.fetchall()}
    except Exception as e:
        log.warning("pragma_failed", table="analysis_runs", error=str(e)[:160])
        return

    if "conversation_id" not in existing:
        try:
            await conn.execute(
                text(
                    "ALTER TABLE analysis_runs "
                    "ADD COLUMN conversation_id VARCHAR(32)"
                )
            )
            log.info("migration_added_conversation_id")
        except Exception as e:
            log.warning(
                "migration_conversation_id_failed", error=str(e)[:160]
            )

    # Always ensure the index exists (idempotent)
    try:
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_analysis_runs_conversation_id "
                "ON analysis_runs (conversation_id)"
            )
        )
    except Exception as e:
        log.debug("conversation_index_skip", error=str(e)[:120])

async def _migrate_add_pinned(conn) -> None:
    """
    Add `pinned` and `pinned_at` columns to analysis_runs if missing.
    Both default to NULL/false, which is the correct initial state.
    """
    try:
        result = await conn.execute(text("PRAGMA table_info(analysis_runs)"))
        existing = {row[1] for row in result.fetchall()}
    except Exception as e:
        log.warning("pragma_failed", table="analysis_runs", error=str(e)[:160])
        return

    if "pinned" not in existing:
        try:
            await conn.execute(
                text(
                    "ALTER TABLE analysis_runs "
                    "ADD COLUMN pinned BOOLEAN DEFAULT 0"
                )
            )
            log.info("migration_added_pinned")
        except Exception as e:
            log.warning("migration_pinned_failed", error=str(e)[:160])

    if "pinned_at" not in existing:
        try:
            await conn.execute(
                text(
                    "ALTER TABLE analysis_runs "
                    "ADD COLUMN pinned_at DATETIME"
                )
            )
            log.info("migration_added_pinned_at")
        except Exception as e:
            log.warning("migration_pinned_at_failed", error=str(e)[:160])

    # Create index for the pinned list endpoint (idempotent)
    try:
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_analysis_runs_pinned "
                "ON analysis_runs (pinned)"
            )
        )
        await conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS ix_analysis_runs_pinned_at "
                "ON analysis_runs (pinned_at)"
            )
        )
    except Exception as e:
        log.debug("pinned_index_skip", error=str(e)[:120])


async def _prune_audit_events(session: AsyncSession) -> None:
    """
    Delete audit events older than AUDIT_RETENTION_DAYS on startup.
    Set AUDIT_RETENTION_DAYS=0 to disable pruning.
    """
    from datetime import datetime, timedelta

    from sqlalchemy import delete

    days = settings.audit_retention_days
    if days <= 0:
        return

    cutoff = datetime.utcnow() - timedelta(days=days)
    try:
        result = await session.execute(
            delete(AuditEvent).where(AuditEvent.created_at < cutoff)
        )
        await session.commit()
        deleted = result.rowcount or 0
        if deleted:
            log.info("audit_events_pruned", deleted=deleted, older_than_days=days)
    except Exception as e:
        await session.rollback()
        log.warning("audit_prune_failed", error=str(e)[:160])