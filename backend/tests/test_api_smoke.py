"""End-to-end HTTP smoke tests via TestClient."""


def test_health(app_client):
    r = app_client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert "version" in body
    assert "provider" in body
    assert "auth_backoff" in body


def test_auth_config_disabled(app_client):
    """conftest sets AUTH_ENABLED=false — config must reflect that."""
    r = app_client.get("/api/v1/auth/config")
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is False
    assert body["guest_mode"] is False
    assert isinstance(body["min_password_length"], int)
    assert isinstance(body["email_enabled"], bool)


def test_auth_me_returns_anonymous(app_client):
    """With AUTH_ENABLED=false, get_current_user yields the anonymous user.

    Proves: auth dependency + DB lookup + anon-user seeder all work end-to-end.
    """
    r = app_client.get("/api/v1/auth/me")
    assert r.status_code == 200
    body = r.json()
    assert body["username"] == "anonymous"


def test_root_endpoint(app_client):
    r = app_client.get("/")
    assert r.status_code == 200
    assert r.json()["health"] == "/api/v1/health"


def test_openapi_served(app_client):
    """/openapi.json is always mounted; only /docs respects APP_DEBUG."""
    r = app_client.get("/openapi.json")
    assert r.status_code == 200
    schema = r.json()
    assert schema["info"]["title"]  # app_name from settings


def test_docs_disabled_in_test(app_client):
    """APP_DEBUG=false → Swagger UI is off."""
    r = app_client.get("/docs")
    assert r.status_code == 404


def test_unknown_route_is_404(app_client):
    r = app_client.get("/api/v1/this-does-not-exist")
    assert r.status_code == 404