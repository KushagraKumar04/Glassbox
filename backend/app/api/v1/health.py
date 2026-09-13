"""Health endpoint — also reports which LLM provider is active."""
from fastapi import APIRouter

from app import __version__
from app.config import get_settings

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict:
    s = get_settings()
    return {
        "status": "ok",
        "env": s.app_env,
        "provider": s.llm_provider,
        "model": s.llm_model,
        "version": __version__,
    }