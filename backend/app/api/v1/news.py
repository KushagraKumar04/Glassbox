"""
News proxy endpoint.

    GET /api/v1/news/tech?country=us&page_size=6

Proxies to Currents API, keeping the API key on the server.
Cached in-memory for 5 minutes to stay under the free-tier limit.
"""
from __future__ import annotations

import time
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, HTTPException, Query

from app.config import get_settings

router = APIRouter(prefix="/news", tags=["news"])
log = structlog.get_logger()
settings = get_settings()

# In-memory cache: {cache_key: (timestamp, data)}
_CACHE: dict[str, tuple[float, Any]] = {}
_CACHE_TTL = 300  # 5 minutes


@router.get("/tech")
async def tech_news(
    country: str = Query(default="us"),
    page_size: int = Query(default=6, ge=1, le=20),
):
    """
    Return the latest technology news headlines.

    Cached for 5 minutes. Returns an empty list when no key is configured.
    """
    if not settings.news_api_key:
        return {"articles": [], "reason": "no_api_key"}

    cache_key = f"tech:{country}:{page_size}"
    now = time.time()

    if cache_key in _CACHE:
        ts, data = _CACHE[cache_key]
        if now - ts < _CACHE_TTL:
            return data

    url = "https://api.currentsapi.services/v1/latest-news"
    params = {
        "category": "technology",
        "language": "en",
        "page_size": page_size,
        "apiKey": settings.news_api_key,
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(url, params=params)
            resp.raise_for_status()
            payload = resp.json()
    except Exception as e:
        log.warning("news_fetch_failed", error=str(e)[:200])
        if cache_key in _CACHE:
            return _CACHE[cache_key][1]
        raise HTTPException(502, f"News provider unavailable: {str(e)[:200]}")

    # Currents returns a body-level status field. A 200 HTTP response can
    # still carry a status error inside the JSON.
    body_status = str(payload.get("status") or "").lower()
    if body_status and body_status not in {"ok", "success"}:
        log.warning(
            "news_provider_error",
            status=body_status,
            message=str(payload.get("message") or "")[:200],
        )
        raise HTTPException(
            502,
            f"News provider error: {payload.get('message') or body_status}",
        )

    # Currents uses `news`; NewsAPI uses `articles`. Accept either so the
    # endpoint keeps working if the provider is ever swapped.
    items = payload.get("news") or payload.get("articles") or []

    articles: list[dict[str, Any]] = []
    for a in items:
        title = a.get("title") or ""
        link = a.get("url") or a.get("link") or ""
        if not title or not link:
            continue

        # Field names differ per provider — handle the common ones.
        source = (
            a.get("author")
            or (a.get("source") or {}).get("name")
            or "Currents"
        )

        articles.append({
            "title": title,
            "description": a.get("description") or a.get("summary") or "",
            "url": link,
            "source": source,
            "publishedAt": (
                a.get("published")
                or a.get("publishedAt")
                or a.get("published_at")
                or ""
            ),
            "image": a.get("image") or a.get("urlToImage") or "",
        })

    # Sort newest first (ISO 8601 strings sort lexicographically)
    articles.sort(key=lambda x: x["publishedAt"], reverse=True)

    result = {"articles": articles, "provider": "currents"}
    _CACHE[cache_key] = (now, result)

    log.info("news_fetched", count=len(articles))
    return result