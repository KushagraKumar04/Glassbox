"""
Conversation context service.

Loads the previous runs in a conversation so the SQL agent can resolve
follow-up references ("that", "this", "now break it down by region").

Zero LLM calls. Pure DB read + deterministic formatting.
"""
from __future__ import annotations

import structlog
from sqlalchemy import select

from app.db.models import AnalysisRun
from app.db.session import SessionLocal

log = structlog.get_logger()

_MAX_TURNS = 3          # how many prior runs to include in the prompt
_MAX_SQL_CHARS = 800    # truncate long SQL blocks


async def load_conversation_context(
    conversation_id: str | None,
    user_id: str | None,
    *,
    exclude_run_id: str | None = None,
    max_turns: int = _MAX_TURNS,
) -> list[dict]:
    """
    Return the last `max_turns` runs in a conversation, oldest-first.

    Each item: {"question": str, "sql": str, "row_count": int, "at": iso_str}

    Returns [] if conversation_id is None or has no prior runs.
    """
    if not conversation_id:
        return []

    async with SessionLocal() as session:
        q = (
            select(AnalysisRun)
            .where(AnalysisRun.conversation_id == conversation_id)
            .order_by(AnalysisRun.created_at.desc())
            .limit(max_turns + 1)  # +1 to allow excluding the current run
        )
        if user_id:
            q = q.where(AnalysisRun.user_id == user_id)

        result = await session.execute(q)
        runs = list(result.scalars().all())

    # Drop the run we're currently executing (if it was already persisted)
    if exclude_run_id:
        runs = [r for r in runs if r.id != exclude_run_id]

    # Oldest first for chronological presentation
    runs = list(reversed(runs[:max_turns]))

    out: list[dict] = []
    for r in runs:
        out.append({
            "question": (r.question or "").strip(),
            "sql": (r.sql_text or "").strip()[:_MAX_SQL_CHARS],
            "row_count": _extract_row_count(r.trace or []),
            "at": r.created_at.isoformat() if r.created_at else "",
        })
    return out


def _extract_row_count(trace: list) -> int:
    """Pull the row count from the query step of a stored trace."""
    for ev in trace or []:
        if isinstance(ev, dict) and ev.get("stage") == "query":
            detail = str(ev.get("detail", ""))
            # "412 row(s)" → 412
            for token in detail.split():
                if token.isdigit():
                    return int(token)
    return -1


def format_context(runs: list[dict]) -> str:
    """
    Format the prior turns as a compact block for the SQL prompt.
    """
    if not runs:
        return ""

    lines = [
        "PRIOR CONVERSATION (use to resolve follow-up references):"
    ]
    for i, r in enumerate(runs, start=1):
        lines.append(f"[Turn {i}] Q: {r['question']}")
        if r["sql"]:
            lines.append("SQL:")
            lines.append(r["sql"])
        if r["row_count"] >= 0:
            lines.append(f"(returned {r['row_count']} row(s))")
        lines.append("")

    lines.append(
        "If the current question references the prior context "
        "(\"that\", \"this\", \"those\", \"now break it down by...\"), "
        "produce a new query that extends the last turn."
    )
    return "\n".join(lines).rstrip()