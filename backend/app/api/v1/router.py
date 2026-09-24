"""Aggregates all v1 routes under /api/v1."""
from fastapi import APIRouter

from app.api.v1 import (
    audit,
    auth,
    chat,
    columns,
    conversations,
    dashboard,
    datasets,
    drilldown,
    execute,
    explain,
    health,
    metrics,
    news,
    runs,
    sources,
    suggestions,
    system,
    templates,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(chat.router)
api_router.include_router(columns.router)
api_router.include_router(conversations.router)
api_router.include_router(dashboard.router)
api_router.include_router(datasets.router)
api_router.include_router(drilldown.router)
api_router.include_router(sources.router)
api_router.include_router(suggestions.router)
api_router.include_router(templates.router)
api_router.include_router(metrics.router)
api_router.include_router(runs.router)
api_router.include_router(execute.router)
api_router.include_router(explain.router)
api_router.include_router(system.router)
api_router.include_router(audit.router)
api_router.include_router(news.router)