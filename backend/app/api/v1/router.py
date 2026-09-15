"""Aggregates all v1 routes under /api/v1."""
from fastapi import APIRouter

from app.api.v1 import (
    audit,
    auth,
    chat,
    columns,
    datasets,
    execute,
    explain,
    health,
    metrics,
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
api_router.include_router(datasets.router)
api_router.include_router(sources.router)
api_router.include_router(suggestions.router)
api_router.include_router(templates.router)
api_router.include_router(metrics.router)
api_router.include_router(runs.router)
api_router.include_router(execute.router)
api_router.include_router(explain.router)
api_router.include_router(system.router)
api_router.include_router(audit.router)