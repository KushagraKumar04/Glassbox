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


