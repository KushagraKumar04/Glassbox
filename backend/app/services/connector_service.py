"""
Database connector service — wraps DuckDB's native ATTACH.

Supported kinds:
  - postgres   (via DuckDB's `postgres` extension)
  - mysql      (via DuckDB's `mysql` extension)
  - sqlite     (built into DuckDB, no extension needed)

Why DuckDB instead of native drivers?
  - One query engine for files AND databases
  - Cross-source JOINs work out of the box
  - Read-only enforced at ATTACH
  - Zero schema-mapping code — DuckDB handles it

Extension lifecycle:
  - On first use, `INSTALL <name>` downloads the extension from DuckDB's
    repo (cached in ~/.duckdb/extensions). Requires outbound HTTPS the
    first time. After that, offline-safe.
  - Air-gapped: bundle the extension file and use `LOAD '/path/to/ext'`.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import structlog

from app.core.errors import classify_db_error, sanitize_message
from app.core.ssrf_guard import SsrfError, assert_safe_host
from app.db.models import DataSource
from app.services.duckdb_service import DuckDBService

log = structlog.get_logger()

_DEFAULT_PORTS = {
    "postgres": 5432,
    "mysql": 3306,
}

# Schemas we don't want to expose to the LLM
_SYSTEM_SCHEMAS = {
    "information_schema",
    "pg_catalog",
    "pg_toast",
    "mysql",
    "performance_schema",
    "sys",
}


@dataclass
class AttachedSource:
    """Result of a successful ATTACH."""
    alias: str            # e.g. "src_1a2b3c4d"
    kind: str
    tables: list[dict]    # [{schema, name, qualified}]


class ConnectorService:
    def __init__(self, db: DuckDBService) -> None:
        self.db = db
        self._loaded_extensions: set[str] = set()

    # ── Public API ──────────────────────────────────────────

    def attach(
        self,
        source: DataSource,
        password: str,
        *,
        alias: str | None = None,
    ) -> AttachedSource:
        """
        ATTACH a DataSource to this DuckDB instance.

        Raises RuntimeError on failure — caller wraps in try/except.
        """
        alias = alias or self._safe_alias(source.id)
        kind = source.kind.lower().strip()

        if kind == "postgres":
            # SSRF guard: reject loopback/private/metadata hosts unless
            # the operator has explicitly allowed them via
            # CONNECTOR_ALLOW_PRIVATE_HOSTS or CONNECTOR_ALLOWLIST.
            try:
                assert_safe_host(
                    source.host,
                    source.port or _DEFAULT_PORTS["postgres"],
                )
            except SsrfError as e:
                # The guard's message is already user-safe and specific.
                raise RuntimeError(str(e)) from e

            conn = self._pg_conn(source, password)
            self._ensure_extension("postgres")
            sql = (
                f"ATTACH '{conn}' AS {alias} "
                f"(TYPE POSTGRES, READ_ONLY)"
            )
        elif kind == "mysql":
            try:
                assert_safe_host(
                    source.host,
                    source.port or _DEFAULT_PORTS["mysql"],
                )
            except SsrfError as e:
                raise RuntimeError(str(e)) from e

            conn = self._mysql_conn(source, password)
            self._ensure_extension("mysql")
            sql = (
                f"ATTACH '{conn}' AS {alias} "
                f"(TYPE MYSQL, READ_ONLY)"
            )
        elif kind == "sqlite":
            if not source.database:
                raise RuntimeError("SQLite source is missing a database file path.")

            # SQLite is local — no SSRF surface — but lock down the path:
            # must exist, be a regular file, and have a known extension.
            from pathlib import Path as _P
            p = _P(source.database).expanduser()
            if not p.exists():
                raise RuntimeError(f"SQLite file not found: {source.database}")
            if not p.is_file():
                raise RuntimeError(
                    f"SQLite path is not a regular file: {source.database}"
                )
            if p.suffix.lower() not in {".db", ".sqlite", ".sqlite3"}:
                raise RuntimeError(
                    "SQLite database must end with .db, .sqlite, or .sqlite3"
                )
            path = str(p).replace("'", "''")
            sql = f"ATTACH '{path}' AS {alias} (TYPE SQLITE, READ_ONLY)"
        else:
            raise RuntimeError(f"Unsupported source kind: {kind}")

        try:
            self.db.con.execute(sql)
        except Exception as e:
            # Scrub the connection string (contains the password), redact
            # filesystem paths, then classify.
            raw = str(e)
            if password:
                raw = raw.replace(password, "***")
            category = classify_db_error(raw)
            safe = sanitize_message(raw, max_len=500)
            log.info(
                "attach_failed",
                kind=kind,
                host=source.host,
                category=category,
            )
            raise RuntimeError(safe) from e

        tables = self._discover_tables(alias)
        return AttachedSource(alias=alias, kind=kind, tables=tables)

    def test_connection(
        self,
        source: DataSource,
        password: str,
    ) -> dict[str, Any]:
        """
        Attach, list tables, detach. Never raises.
        """
        alias: str | None = None
        try:
            attached = self.attach(source, password)
            alias = attached.alias
            return {
                "ok": True,
                "error": "",
                "tables": attached.tables,
                "table_count": len(attached.tables),
            }
        except Exception as e:
            return {
                "ok": False,
                "error": str(e)[:600],
                "tables": [],
                "table_count": 0,
            }
        finally:
            if alias:
                self._detach(alias)

    def detach(self, source_id: str) -> None:
        self._detach(self._safe_alias(source_id))

    def describe_table(
        self,
        source: DataSource,
        password: str,
        schema: str,
        table: str,
    ) -> list[dict]:
        """Return column metadata for one remote table."""
        alias = self._safe_alias(source.id)
        self.attach(source, password, alias=alias)
        try:
            safe_schema = schema.replace('"', '""')
            safe_table = table.replace('"', '""')
            rows = self.db.con.execute(
                f'DESCRIBE {alias}."{safe_schema}"."{safe_table}"'
            ).fetchall()
            return [
                {"name": r[0], "type": str(r[1]), "nullable": r[2] != "NO"}
                for r in rows
            ]
        finally:
            self._detach(alias)

    # ── Internals ───────────────────────────────────────────

    def _ensure_extension(self, name: str) -> None:
        if name in self._loaded_extensions:
            return
        try:
            self.db.con.execute(f"INSTALL {name}")
        except Exception as e:
            # `INSTALL` fails if it's already installed OR if there's no
            # network and it isn't cached. Try `LOAD` before giving up.
            log.debug("extension_install_skipped", name=name, error=str(e)[:120])
        self.db.con.execute(f"LOAD {name}")
        self._loaded_extensions.add(name)

    @staticmethod
    def _pg_conn(source: DataSource, password: str) -> str:
        from app.config import get_settings
        timeout = get_settings().connector_connect_timeout_seconds
        parts = [
            f"host={source.host}",
            f"port={source.port or _DEFAULT_PORTS['postgres']}",
            f"dbname={source.database}",
            f"user={source.username}",
            f"connect_timeout={timeout}",
        ]
        if password:
            parts.append(f"password={password}")
        if source.ssl_mode:
            parts.append(f"sslmode={source.ssl_mode}")
        # libpq style: escape single quotes inside the ATTACH string
        return " ".join(parts).replace("'", "\\'")

    @staticmethod
    def _mysql_conn(source: DataSource, password: str) -> str:
        from app.config import get_settings
        timeout = get_settings().connector_connect_timeout_seconds
        parts = [
            f"host={source.host}",
            f"port={source.port or _DEFAULT_PORTS['mysql']}",
            f"database={source.database}",
            f"user={source.username}",
            f"connect_timeout={timeout}",
        ]
        if password:
            parts.append(f"password={password}")
        return " ".join(parts).replace("'", "\\'")

    def _discover_tables(self, alias: str) -> list[dict]:
        """
        Return [{schema, name, qualified}] for user-visible tables.
        """
        try:
            rows = self.db.con.execute(f"""
                SELECT table_schema, table_name
                FROM information_schema.tables
                WHERE table_catalog = '{alias}'
                ORDER BY table_schema, table_name
            """).fetchall()
        except Exception as e:
            log.warning("table_discovery_failed", alias=alias, error=str(e)[:160])
            return []

        out: list[dict] = []
        for schema, table in rows:
            if schema in _SYSTEM_SCHEMAS:
                continue
            out.append({
                "schema": schema,
                "name": table,
                "qualified": f'{alias}."{schema}"."{table}"',
            })
        return out

    def _detach(self, alias: str) -> None:
        try:
            self.db.con.execute(f"DETACH {alias}")
        except Exception:
            pass

    @staticmethod
    def _safe_alias(source_id: str) -> str:
        return f"src_{source_id[:8]}"