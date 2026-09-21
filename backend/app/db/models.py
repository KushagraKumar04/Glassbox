from __future__ import annotations

import datetime as _dt
import decimal
import json as _json
import uuid
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import get_settings
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator


def _display_tz() -> timezone | ZoneInfo:
    """Resolve DISPLAY_TIMEZONE from .env; fall back to UTC on error."""
    try:
        return ZoneInfo(get_settings().display_timezone)
    except (ZoneInfoNotFoundError, ValueError, KeyError):
        return timezone.utc


def _utcnow() -> datetime:
    """
    Naive UTC datetime. Avoids the deprecated datetime.utcnow() in Python 3.12+.

    Storage is always UTC — display converts to DISPLAY_TIMEZONE at
    serialization time.
    """
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso_local(dt: datetime | None) -> str | None:
    """
    Serialize a stored (naive UTC) datetime as an ISO 8601 string tagged
    with the configured display timezone.

    Examples:
      Asia/Kolkata → '2026-09-12T20:45:41+05:30'
      UTC          → '2026-09-12T15:15:41+00:00'

    The offset suffix makes the string unambiguous — every client parses it
    correctly. Browsers then display it in the viewer's local time, which is
    IST for users in India.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(_display_tz()).isoformat()


# ═══════════════════════════════════════════════════════════════════════════
# Safe JSON serialization
# ═══════════════════════════════════════════════════════════════════════════

def _json_default(o: Any) -> Any:
    """Fallback for json.dumps — handles datetimes, Decimals, numpy, sets."""
    if isinstance(o, (_dt.datetime, _dt.date, _dt.time)):
        return o.isoformat()

    if isinstance(o, decimal.Decimal):
        return float(o)

    if isinstance(o, (set, frozenset)):
        return list(o)

    if hasattr(o, "item"):  # numpy scalars
        try:
            return o.item()
        except Exception:
            pass

    if isinstance(o, (bytes, bytearray)):
        try:
            return o.decode("utf-8")
        except Exception:
            return o.decode("utf-8", errors="replace")

    return str(o)


def _safe_dumps(obj: Any) -> str:
    return _json.dumps(obj, default=_json_default)


class _SafeJSON(TypeDecorator):
    """
    JSON column that never fails on Timestamp / Decimal / numpy scalars.
    Backed by the same storage as sqlalchemy.JSON.
    """

    impl = JSON
    cache_ok = True

    def process_bind_param(self, value, dialect):
        if value is None:
            return None

        # Serialize to string here so SQLAlchemy never sees the raw dict
        return _safe_dumps(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return None

        if isinstance(value, (dict, list)):
            return value

        try:
            return _json.loads(value)
        except Exception:
            return value


class Base(DeclarativeBase):
    """Declarative base for all models."""
    pass


def _uuid() -> str:
    return uuid.uuid4().hex


# ═══════════════════════════════════════════════════════════════════════════
#  User
# ═══════════════════════════════════════════════════════════════════════════

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, index=True
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "username": self.username,
            "is_active": self.is_active,
            "is_superuser": self.is_superuser,
            "created_at": _iso_local(self.created_at),
        }


class PasswordResetToken(Base):
    """
    One-time password reset token.

    The raw token is never stored — only its SHA-256 hash. If the DB
    leaks, the hashes are useless without brute-forcing 32 bytes of entropy.

    Single-use: `used_at` is set on success. Expires after
    AUTH_RESET_TOKEN_MINUTES.
    """
    __tablename__ = "password_reset_tokens"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        String(32),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, index=True
    )
    
# ═══════════════════════════════════════════════════════════════════════════
#  Template — a saved prompt / analysis playbook
# ═══════════════════════════════════════════════════════════════════════════

class Template(Base):
    __tablename__ = "templates"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    # NULL = built-in (visible to everyone); UUID = user-owned
    user_id: Mapped[str | None] = mapped_column(
        String(32), index=True, nullable=True
    )

    name: Mapped[str] = mapped_column(String(255), index=True)
    description: Mapped[str] = mapped_column(Text, default="")
    question: Mapped[str] = mapped_column(Text)

    # Freeform tags — JSON array of short strings
    tags: Mapped[list] = mapped_column(_SafeJSON, default=list)

    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    usage_count: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, index=True
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "description": self.description,
            "question": self.question,
            "tags": self.tags or [],
            "is_builtin": self.is_builtin,
            "usage_count": self.usage_count,
            "created_at": _iso_local(self.created_at),
        }

# ═══════════════════════════════════════════════════════════════════════════
#  Metric — a business glossary term
# ═══════════════════════════════════════════════════════════════════════════

class Metric(Base):
    """
    A named business metric. The SQL agent uses these definitions when
    generating queries, so "revenue" always means the same thing inside
    one workspace.

    Built-in metrics (user_id=None, is_builtin=True) are seeded on startup
    as ready-made examples. Users can edit / delete their own metrics and
    add new ones.
    """
    __tablename__ = "metrics"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str | None] = mapped_column(
        String(32), index=True, nullable=True
    )

    name: Mapped[str] = mapped_column(String(120), index=True)
    description: Mapped[str] = mapped_column(Text, default="")

    # Optional SQL fragment the LLM should prefer, e.g. "SUM(amount)"
    sql_expression: Mapped[str] = mapped_column(Text, default="")

    # Synonyms the user might type instead of `name`
    synonyms: Mapped[list] = mapped_column(_SafeJSON, default=list)

    category: Mapped[str] = mapped_column(String(64), default="", index=True)

    is_builtin: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, index=True
    )

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "user_id": self.user_id,
            "name": self.name,
            "description": self.description,
            "sql_expression": self.sql_expression,
            "synonyms": self.synonyms or [],
            "category": self.category,
            "is_builtin": self.is_builtin,
            "created_at": _iso_local(self.created_at),
        }
