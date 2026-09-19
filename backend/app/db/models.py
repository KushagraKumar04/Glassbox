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
