"""Full auth flow tests — register → login → JWT → me → reset → new login.

The `auth_on` fixture enables auth per-test via monkeypatch. `app_client`
stays session-scoped and shares its booted FastAPI app + temp DB across
tests. Unique user data per test prevents cross-test collisions.
"""
from __future__ import annotations

import sqlite3
import uuid
from datetime import datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest


# ═══════════════════════════════════════════════════════════════════
#  Fixtures + helpers
# ═══════════════════════════════════════════════════════════════════

@pytest.fixture
def auth_on(monkeypatch):
    """Enable auth for one test, speed up bcrypt, expose reset link.

    - auth_enabled=True            — endpoints now require JWT
    - auth_backoff_enabled=False   — multiple wrong-password tests would
                                     otherwise throttle after 3 failures
    - auth_show_reset_link=True    — lets tests extract the raw reset token
                                     from ForgotPasswordResponse.reset_url
    - _BCRYPT_ROUNDS=4             — ~1ms per hash instead of ~100ms
                                     (bcrypt stores rounds in the hash, so
                                     verification works at default cost too)
    """
    from app.config import get_settings
    import app.core.security as sec

    s = get_settings()
    monkeypatch.setattr(s, "auth_enabled", True)
    monkeypatch.setattr(s, "auth_backoff_enabled", False)
    monkeypatch.setattr(s, "auth_show_reset_link", True)
    monkeypatch.setattr(sec, "_BCRYPT_ROUNDS", 4)


def _unique(prefix: str = "user") -> dict:
    token = uuid.uuid4().hex[:12]
    return {
        "email": f"{prefix}_{token}@test.local",
        "username": f"{prefix}_{token}",
        "password": "GoodPass123!",
    }


def _register(client, data: dict | None = None):
    data = data or _unique()
    return client.post("/api/v1/auth/register", json=data), data


def _login(client, ident: str, password: str):
    return client.post(
        "/api/v1/auth/login",
        json={"username": ident, "password": password},
    )


def _extract_reset_token(reset_url: str) -> str:
    parsed = urlparse(reset_url)
    return parse_qs(parsed.query)["token"][0]


def _get_db_path() -> str:
    """Return the filesystem path of the SQLite test DB."""
    from sqlalchemy.engine.url import make_url
    from app.config import get_settings

    return make_url(get_settings().database_url).database


# ═══════════════════════════════════════════════════════════════════
#  /auth/config
# ═══════════════════════════════════════════════════════════════════

class TestAuthConfig:
    def test_config_reflects_enabled(self, app_client, auth_on):
        r = app_client.get("/api/v1/auth/config")
        assert r.status_code == 200
        body = r.json()
        assert body["enabled"] is True
        assert body["guest_mode"] is False
        assert isinstance(body["min_password_length"], int)


# ═══════════════════════════════════════════════════════════════════
#  Register
# ═══════════════════════════════════════════════════════════════════

class TestRegister:
    def test_register_returns_token_and_user(self, app_client, auth_on):
        r, data = _register(app_client)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["token_type"] == "bearer"
        assert isinstance(body["access_token"], str) and body["access_token"]
        assert body["expires_in"] > 0
        user = body["user"]
        assert user["email"] == data["email"]
        assert user["username"] == data["username"]
        assert user["is_active"] is True
        assert user["is_superuser"] is False
        assert user["id"]

    def test_register_duplicate_email_rejected(self, app_client, auth_on):
        r, data = _register(app_client)
        assert r.status_code == 200, r.text
        dup = {**data, "username": data["username"] + "_v2"}
        r2 = app_client.post("/api/v1/auth/register", json=dup)
        assert r2.status_code == 409

    def test_register_duplicate_username_rejected(self, app_client, auth_on):
        r, data = _register(app_client)
        assert r.status_code == 200, r.text
        dup = {**data, "email": "diff_" + data["email"]}
        r2 = app_client.post("/api/v1/auth/register", json=dup)
        assert r2.status_code == 409

    def test_register_short_password_rejected(self, app_client, auth_on):
        data = _unique()
        data["password"] = "short"
        r = app_client.post("/api/v1/auth/register", json=data)
        assert r.status_code == 400
        assert "password" in r.text.lower()

    def test_register_when_auth_disabled_returns_400(self, app_client):
        """Uses default env — AUTH_ENABLED=false. No auth_on fixture."""
        data = _unique()
        r = app_client.post("/api/v1/auth/register", json=data)
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════
#  Login
# ═══════════════════════════════════════════════════════════════════

class TestLogin:
    def test_login_with_email(self, app_client, auth_on):
        _, data = _register(app_client)
        r = _login(app_client, data["email"], data["password"])
        assert r.status_code == 200, r.text
        assert r.json()["access_token"]

    def test_login_with_username(self, app_client, auth_on):
        _, data = _register(app_client)
        r = _login(app_client, data["username"], data["password"])
        assert r.status_code == 200, r.text

    def test_login_wrong_password_401(self, app_client, auth_on):
        _, data = _register(app_client)
        r = _login(app_client, data["username"], "WrongPass999!")
        assert r.status_code == 401

    def test_login_unknown_account_401(self, app_client, auth_on):
        r = _login(app_client, "nobody_xyz@nowhere.local", "WhateverPass1!")
        assert r.status_code == 401

    def test_login_when_auth_disabled_returns_400(self, app_client):
        r = _login(app_client, "anyone", "anything")
        assert r.status_code == 400


# ═══════════════════════════════════════════════════════════════════
#  /auth/me
# ═══════════════════════════════════════════════════════════════════

class TestMe:
    def test_me_with_valid_token(self, app_client, auth_on):
        r, data = _register(app_client)
        token = r.json()["access_token"]
        r2 = app_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r2.status_code == 200, r2.text
        assert r2.json()["email"] == data["email"]
        assert r2.json()["username"] == data["username"]

    def test_me_without_token_401(self, app_client, auth_on):
        r = app_client.get("/api/v1/auth/me")
        assert r.status_code == 401

    def test_me_with_invalid_token_401(self, app_client, auth_on):
        r = app_client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert r.status_code == 401


# ═══════════════════════════════════════════════════════════════════
#  Password reset
# ═══════════════════════════════════════════════════════════════════

class TestPasswordReset:
    def test_full_reset_cycle(self, app_client, auth_on):
        _, data = _register(app_client)
        old_pw = data["password"]
        new_pw = "NewGoodPass456!"

        # Request reset — reset_url is exposed because auth_show_reset_link=True
        r = app_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": data["email"]},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body.get("reset_url"), (
            "auth_show_reset_link=True must expose reset_url for existing user"
        )

        token = _extract_reset_token(body["reset_url"])

        # Consume token
        r = app_client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": new_pw},
        )
        assert r.status_code == 200, r.text

        # Old password now rejected
        assert _login(app_client, data["username"], old_pw).status_code == 401

        # New password works
        r = _login(app_client, data["username"], new_pw)
        assert r.status_code == 200, r.text

    def test_reset_token_single_use(self, app_client, auth_on):
        _, data = _register(app_client)
        r = app_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": data["email"]},
        )
        token = _extract_reset_token(r.json()["reset_url"])

        # First use succeeds
        r1 = app_client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "FirstPass1!"},
        )
        assert r1.status_code == 200, r1.text

        # Second use fails — token marked used_at
        r2 = app_client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "SecondPass2!"},
        )
        assert r2.status_code == 400
        assert "used" in r2.text.lower()

    def test_reset_weak_password_rejected(self, app_client, auth_on):
        _, data = _register(app_client)
        r = app_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": data["email"]},
        )
        token = _extract_reset_token(r.json()["reset_url"])
        r2 = app_client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "short"},
        )
        assert r2.status_code == 400
        assert "password" in r2.text.lower()

    def test_reset_invalid_token_400(self, app_client, auth_on):
        r = app_client.post(
            "/api/v1/auth/reset-password",
            json={"token": "a" * 43, "new_password": "GoodPass1!"},
        )
        assert r.status_code == 400
        assert "invalid" in r.text.lower() or "expired" in r.text.lower()

    def test_reset_expired_token_400(self, app_client, auth_on):
        """Directly manipulate the DB to force expires_at into the past.

        Uses raw sqlite3 instead of the async session — the async engine
        is bound to pytest-asyncio's event loop and would raise
        "attached to a different loop" if used from a sync test.
        """
        _, data = _register(app_client)
        r = app_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": data["email"]},
        )
        token = _extract_reset_token(r.json()["reset_url"])

        # Force expiry for any unused token
        past = (datetime.utcnow() - timedelta(minutes=5)).strftime(
            "%Y-%m-%d %H:%M:%S"
        )
        with sqlite3.connect(_get_db_path()) as conn:
            conn.execute(
                "UPDATE password_reset_tokens "
                "SET expires_at = ? WHERE used_at IS NULL",
                (past,),
            )
            conn.commit()

        r2 = app_client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "NewGoodPass!"},
        )
        assert r2.status_code == 400
        assert "expired" in r2.text.lower()


# ═══════════════════════════════════════════════════════════════════
#  Email enumeration
# ═══════════════════════════════════════════════════════════════════

class TestEmailEnumeration:
    def test_forgot_unknown_email_returns_200(self, app_client, auth_on):
        r = app_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nobody_xyz@nowhere.local"},
        )
        assert r.status_code == 200
        assert r.json()["ok"] is True

    def test_forgot_unknown_email_does_not_leak_reset_url(
        self, app_client, auth_on
    ):
        """Even with auth_show_reset_link=True, an unknown email must not
        produce a reset_url — the forgot_password handler early-returns
        before creating a token, so response.reset_url stays None.
        """
        r = app_client.post(
            "/api/v1/auth/forgot-password",
            json={"email": "nobody_xyz@nowhere.local"},
        )
        assert r.status_code == 200
        assert r.json().get("reset_url") is None