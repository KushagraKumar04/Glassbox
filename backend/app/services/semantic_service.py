"""
Semantic layer service.

Loads relevant business-glossary metrics for a question and formats them
as a compact block for the SQL agent's prompt.

Matching heuristic:
  - If the total number of metrics is small (<= 25), include all of them.
  - Otherwise, rank by keyword overlap with the question and take the top 25.
  - Always include metrics whose name or synonym literally appears.

Zero LLM calls — this is a pure deterministic filter.
"""
from __future__ import annotations

import structlog
from sqlalchemy import or_, select

from app.db.models import Metric
from app.db.session import SessionLocal

log = structlog.get_logger()

_MAX_METRICS_IN_PROMPT = 25


async def load_relevant_metrics(
    question: str,
    user_id: str | None,
) -> list[Metric]:
    """
    Return the metrics the SQL agent should know about.

    Empty question → all user-visible metrics (up to the cap).
    Non-empty question → ranked subset.
    """
    async with SessionLocal() as session:
        if user_id:
            q = select(Metric).where(
                or_(Metric.user_id.is_(None), Metric.user_id == user_id)
            )
        else:
            q = select(Metric).where(Metric.user_id.is_(None))
        result = await session.execute(q)
        metrics = list(result.scalars().all())

    if not metrics:
        return []

    if len(metrics) <= _MAX_METRICS_IN_PROMPT:
        return metrics

    return _rank(question, metrics)[:_MAX_METRICS_IN_PROMPT]


def _rank(question: str, metrics: list[Metric]) -> list[Metric]:
    q = (question or "").lower()
    scored: list[tuple[int, Metric]] = []

    for m in metrics:
        score = 0
        name_l = (m.name or "").lower()
        if name_l and name_l in q:
            score += 10
        for syn in (m.synonyms or []):
            s = (syn or "").lower()
            if s and s in q:
                score += 5
        if m.category and m.category.lower() in q:
            score += 1
        scored.append((score, m))

    scored.sort(key=lambda x: (-x[0], x[1].name.lower()))
    return [m for _, m in scored]


def format_glossary(metrics: list[Metric]) -> str:
    """
    Format a list of metrics as a compact block for the SQL prompt.

    Example output:
        BUSINESS GLOSSARY (use these definitions when the question matches):
        - "Revenue" (aka: sales, turnover, top line): Total monetary value...
          Suggested SQL: SUM(amount)
        - "Order count" (aka: orders, transactions): Number of orders...
          Suggested SQL: COUNT(*)
    """
    if not metrics:
        return ""

    lines = [
        "BUSINESS GLOSSARY (use these definitions when the question matches):"
    ]
    for m in metrics:
        aka = (
            f" (aka: {', '.join(m.synonyms)})"
            if m.synonyms
            else ""
        )
        head = f'- "{m.name}"{aka}: {m.description or "(no description)"}'
        lines.append(head)
        if m.sql_expression:
            lines.append(f"  Suggested SQL: {m.sql_expression}")
    return "\n".join(lines)