"""
Route-table introspection that works across FastAPI versions.

Since FastAPI 0.137 (June 2026), `app.include_router()` no longer eagerly
flattens a child router's `APIRoute` objects into the parent's `.routes`
list. Instead it appends a lazy `_IncludedRouter` wrapper. The result:
`app.routes` is a tree, and the old pattern `[r.path for r in app.routes]`
silently returns an almost-empty list — every included route is hidden.

`fastapi.routing.iter_route_contexts()` (added in 0.137.2) is the public
API for enumerating effective routes across the whole tree, prefix-applied.
We use it when available and fall back to a recursive `_IncludedRouter`
walk on older versions.

`audit_routes(app)` is called from `main.lifespan` at startup. If no
`/api/*` routes are registered, it raises — the app should not start
silently serving nothing.
"""
from __future__ import annotations

from typing import Any

import structlog

log = structlog.get_logger()


def iter_effective_paths(app: Any) -> list[str]:
    """
    Return every full path the app will actually serve.

    Uses `iter_route_contexts()` on FastAPI >= 0.137.2; falls back to a
    recursive walk for older versions or if the import fails.
    """
    try:
        from fastapi.routing import iter_route_contexts
    except ImportError:
        return _fallback_paths(getattr(app, "routes", []))

    paths: list[str] = []
    for ctx in iter_route_contexts(getattr(app, "routes", [])):
        path = getattr(ctx, "path", None)
        methods = getattr(ctx, "methods", None)
        if path and methods:
            paths.append(path)
    return paths


def _fallback_paths(routes: list[Any]) -> list[str]:
    """Pre-0.137.2 fallback: recurse through `_IncludedRouter` wrappers."""
    try:
        from fastapi.routing import _IncludedRouter  # type: ignore[attr-defined]
    except ImportError:
        return [r.path for r in routes if hasattr(r, "path")]

    out: list[str] = []
    for r in routes:
        if isinstance(r, _IncludedRouter):
            out.extend(_fallback_paths(r.original_router.routes))
        elif hasattr(r, "path"):
            out.append(r.path)
    return out


def audit_routes(app: Any) -> None:
    """
    Log the effective route count at startup.

    Raises if no `/api/*` route is registered — catches the case where a
    router import silently failed and the app would otherwise boot and
    serve nothing.
    """
    paths = iter_effective_paths(app)
    api_paths = [p for p in paths if p.startswith("/api/")]

    log.info(
        "route_audit",
        total=len(paths),
        api=len(api_paths),
        sample=sorted(api_paths)[:5],
    )

    if not api_paths:
        raise RuntimeError(
            "Route audit failed: no /api/* routes registered. "
            "The app would start but serve no endpoints. Check that "
            "app/api/v1/router.py imports every sub-router successfully."
        )