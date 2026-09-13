"""Aggregates all v1 routes under /api/v1."""
from fastapi import APIRouter

from app.api.v1 import chat, datasets, health, runs, sources, suggestions

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(chat.router)
api_router.include_router(datasets.router)
api_router.include_router(sources.router)
api_router.include_router(suggestions.router)
api_router.include_router(runs.router)