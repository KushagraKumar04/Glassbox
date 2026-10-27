"""Route-table introspection — proves every router mounts under /api/v1."""
import pytest


EXPECTED_PREFIXES = (
    "/api/v1/health",
    "/api/v1/auth",
    "/api/v1/chat",
    "/api/v1/columns",
    "/api/v1/conversations",
    "/api/v1/dashboard",
    "/api/v1/datasets",
    "/api/v1/drilldown",
    "/api/v1/execute",
    "/api/v1/explain",
    "/api/v1/metrics",
    "/api/v1/news",
    "/api/v1/runs",
    "/api/v1/sources",
    "/api/v1/suggestions",
    "/api/v1/system",
    "/api/v1/templates",
    "/api/v1/audit",
)


def test_all_routers_mounted(app_client):
    """Booting via TestClient exercises lifespan's audit_routes().

    Here we assert each prefix is reachable — catches the case where a
    future edit drops a router from router.py (which would only fail at
    boot, not at import).
    """
    from app.core.route_audit import iter_effective_paths
    from app.main import app

    paths = iter_effective_paths(app)
    api_paths = [p for p in paths if p.startswith("/api/v1/")]

    assert len(api_paths) > 0, "no /api/v1/* routes registered"

    missing = [
        prefix for prefix in EXPECTED_PREFIXES
        if not any(p.startswith(prefix) for p in api_paths)
    ]
    assert not missing, f"missing routers: {missing}"


def test_root_endpoint(app_client):
    r = app_client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["health"] == "/api/v1/health"
    assert "version" in body