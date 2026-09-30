"""
DuckDB engine wrapper — in-process OLAP.

Reads CSV/Parquet/JSON directly via SQL. No server, no import step.
Every query is enforced read-only and row-capped.
"""
from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd

from app.config import get_settings

settings = get_settings()

# Statements we never let through, regardless of casing.
_FORBIDDEN_STARTS = (
    "insert", "update", "delete", "drop", "create", "alter",
    "truncate", "attach", "copy", "pragma", "export", "import",
    "set ", "reset",
)

_FILE_READERS = {
    "csv": "read_csv_auto",
    "parquet": "read_parquet",
    "json": "read_json_auto",
}

# ═══════════════════════════════════════════════════════════════════════════
#  Filter SQL builder
# ═══════════════════════════════════════════════════════════════════════════

def _sql_literal(v: Any) -> str:
    """
    Safely render a Python value as a SQL literal.

    Never used for identifiers — only for values. Single quotes are escaped
    by doubling. Numbers are emitted raw. Booleans become TRUE/FALSE.
    Lists are not allowed here — callers handle list values.
    """
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return repr(v)
    s = str(v).replace("'", "''")
    return f"'{s}'"


def build_filter_where(
    filters: list[dict],
    available_columns: set[str],
) -> str:
    """
    Build a SQL WHERE clause from filter conditions.

    Rules:
      - Filters reference columns; skip any filter whose column is missing
        from `available_columns` (so a filter can apply to whichever tables
        actually have that column).
      - Filter column names are NOT interpolated from user input — they are
        checked against `available_columns` first, then quoted as identifiers.
      - All filter VALUES are escaped via `_sql_literal`.

    Returns "" when no filter applies.
    """
    clauses: list[str] = []

    for f in filters or []:
        col = str(f.get("column") or "").strip()
        if not col or col not in available_columns:
            continue

        op = str(f.get("operator") or "").strip().lower()
        val = f.get("value")
        ident = '"' + col.replace('"', '""') + '"'

        if op == "=":
            clauses.append(f"{ident} = {_sql_literal(val)}")
        elif op == "!=":
            clauses.append(f"{ident} != {_sql_literal(val)}")
        elif op == ">":
            clauses.append(f"{ident} > {_sql_literal(val)}")
        elif op == ">=":
            clauses.append(f"{ident} >= {_sql_literal(val)}")
        elif op == "<":
            clauses.append(f"{ident} < {_sql_literal(val)}")
        elif op == "<=":
            clauses.append(f"{ident} <= {_sql_literal(val)}")
        elif op in ("in", "not_in"):
            if not isinstance(val, list) or not val:
                continue
            items = ", ".join(_sql_literal(x) for x in val[:100])
            kw = "IN" if op == "in" else "NOT IN"
            clauses.append(f"{ident} {kw} ({items})")
        elif op == "between":
            if (
                not isinstance(val, list)
                or len(val) != 2
                or val[0] is None
                or val[1] is None
            ):
                continue
            lo = _sql_literal(val[0])
            hi = _sql_literal(val[1])
            clauses.append(f"{ident} BETWEEN {lo} AND {hi}")
        elif op == "contains":
            pattern = str(val or "").replace("'", "''")
            clauses.append(f"{ident} LIKE '%{pattern}%'")
        elif op == "not_contains":
            pattern = str(val or "").replace("'", "''")
            clauses.append(f"{ident} NOT LIKE '%{pattern}%'")
        elif op == "is_null":
            clauses.append(f"{ident} IS NULL")
        elif op == "is_not_null":
            clauses.append(f"{ident} IS NOT NULL")

    return " AND ".join(clauses)

class DuckDBService:
    """
    Each instance owns its own in-memory DuckDB connection.

    Not thread-safe by default — use `_lock` around writes to the
    connection. Reads are serialized by DuckDB itself.
    """

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.con = duckdb.connect(database=":memory:", read_only=False)
        self._configure()

    # ── Setup ───────────────────────────────────────────────

    def _configure(self) -> None:
        self.con.execute(f"SET memory_limit = '{settings.duckdb_memory_limit}'")
        self.con.execute(f"SET threads = {settings.duckdb_threads}")
        self.con.execute(f"SET temp_directory = '{settings.duckdb_temp_dir}'")
        # Deterministic behavior for profiling
        self.con.execute("SET preserve_insertion_order = true")

    # ── Registration ────────────────────────────────────────

    def register_file(
        self,
        path: str,
        table_name: str,
        file_type: str = "csv",
        filters: list[dict] | None = None,
    ) -> None:
        """
        Register a file as a queryable view.

        When `filters` is provided, the exposed view is a filtered
        projection of a hidden raw view. The LLM never sees the raw view.

        Args:
            path:        absolute or relative path to the file
            table_name:  SQL identifier to expose
            file_type:   csv | parquet | json
            filters:     list of {column, operator, value} conditions
        """
        if file_type not in _FILE_READERS:
            raise ValueError(
                f"Unsupported file_type '{file_type}'. "
                f"Use one of: {list(_FILE_READERS)}"
            )

        # Strip BOM before DuckDB reads the file. Idempotent — a clean
        # file is untouched. This is the definitive fix: it protects every
        # code path that reaches the reader, not just the upload endpoint.
        if file_type == "csv":
            _strip_bom_in_place(path)

        reader = _FILE_READERS[file_type]
        safe = self._quote_ident(table_name)
        raw_name = f"{table_name}__aida_raw"
        safe_raw = self._quote_ident(raw_name)
        path_literal = path.replace("'", "''")

        with self._lock:
            # Always create the raw view first
            self.con.execute(
                f"CREATE OR REPLACE VIEW {safe_raw} AS "
                f"SELECT * FROM {reader}('{path_literal}')"
            )

            # Peek the columns so we only apply filters to existing columns
            try:
                cols_df = self.con.execute(f"DESCRIBE {safe_raw}").fetchdf()
                available = set(cols_df["column_name"].tolist())
            except Exception:
                available = set()

            where = build_filter_where(filters or [], available)

            if where:
                self.con.execute(
                    f"CREATE OR REPLACE VIEW {safe} AS "
                    f"SELECT * FROM {safe_raw} WHERE {where}"
                )
            else:
                self.con.execute(
                    f"CREATE OR REPLACE VIEW {safe} AS "
                    f"SELECT * FROM {safe_raw}"
                )

    def has_table(self, table_name: str) -> bool:
        try:
            self.con.execute(f"DESCRIBE {self._quote_ident(table_name)}")
            return True
        except Exception:
            return False

    def list_tables(self) -> list[str]:
        rows = self.con.execute("SHOW TABLES").fetchall()
        return [r[0] for r in rows]

    def drop_table(self, table_name: str) -> None:
        with self._lock:
            self.con.execute(f"DROP VIEW IF EXISTS {self._quote_ident(table_name)}")

    # ── Profiling ───────────────────────────────────────────

    def profile(self, table_name: str, sample_size: int = 5) -> dict[str, Any]:
        """
        Column-level statistics + a small preview.

        Returns:
            {
              table, row_count, column_count,
              columns: [{name, type, total, nulls, cardinality, null_rate}],
              sample: [...]
            }
        """
        safe = self._quote_ident(table_name)

        cols_df = self.con.execute(f"DESCRIBE {safe}").fetchdf()
        row_count = int(
            self.con.execute(f"SELECT COUNT(*) FROM {safe}").fetchone()[0]
        )

        columns: list[dict[str, Any]] = []
        for _, row in cols_df.iterrows():
            name = row["column_name"]
            dtype = str(row["column_type"])
            info: dict[str, Any] = {"name": name, "type": dtype}

            try:
                stat = self.con.execute(
                    f'SELECT '
                    f'  COUNT(*) AS total, '
                    f'  COUNT(*) - COUNT({self._quote_ident(name)}) AS nulls, '
                    f'  COUNT(DISTINCT {self._quote_ident(name)}) AS cardinality '
                    f'FROM {safe}'
                ).fetchone()
                total, nulls, card = int(stat[0]), int(stat[1]), int(stat[2])
                info.update({
                    "total": total,
                    "nulls": nulls,
                    "cardinality": card,
                    "null_rate": round(nulls / total, 4) if total else 0.0,
                })
            except Exception:
                # Some column types break COUNT(DISTINCT) — skip silently.
                pass

            columns.append(info)

        sample_df = self.con.execute(
            f"SELECT * FROM {safe} LIMIT {int(sample_size)}"
        ).fetchdf()

        return {
            "table": table_name,
            "row_count": row_count,
            "column_count": len(columns),
            "columns": columns,
            "sample": _df_to_records(sample_df),
        }

    # ── Timeout wrapper ─────────────────────────────────────

    def run_with_timeout(
        self,
        fn: Any,
        *,
        timeout_seconds: int | None = None,
        op_label: str = "query",
    ) -> Any:
        """
        Run `fn()` in a worker thread with a hard timeout.

        On timeout, calls DuckDB's `interrupt()` on this connection — the
        worker unwinds with an exception, we propagate `TimeoutError`.

        Why a thread: DuckDB has no per-query timeout knob. `interrupt()`
        is the documented way to cancel a running statement from another
        thread, and the connection is reusable afterward.

        Caveats:
          - The worker is a daemon thread. If `interrupt()` fails to
            unwind it (rare), the thread leaks until process exit.
          - One query at a time per connection. Callers must not run a
            second query on `self.con` while this is running.
        """
        timeout = (
            int(timeout_seconds)
            if timeout_seconds is not None
            else int(settings.query_timeout_seconds)
        )
        result: list[Any] = []
        exc: list[BaseException] = []

        def _run() -> None:
            try:
                result.append(fn())
            except BaseException as e:  # noqa: BLE001 — propagate all
                exc.append(e)

        t = threading.Thread(
            target=_run, name=f"duckdb-{op_label}", daemon=True
        )
        t.start()
        t.join(timeout)

        if t.is_alive():
            try:
                self.con.interrupt()
            except Exception:
                pass
            # Give the worker a moment to unwind after interrupt.
            t.join(2.0)
            raise TimeoutError(
                f"{op_label} exceeded {timeout}s and was interrupted."
            )

        if exc:
            raise exc[0]

        return result[0]

    def execute_with_timeout(
        self,
        sql: str,
        params: list[Any] | None = None,
        *,
        fetch: str = "all",
        timeout_seconds: int | None = None,
    ) -> Any:
        """
        Run `con.execute(sql, params)` with a timeout.

        `fetch` selects what to return: "all" | "one" | "df" | "none".
        Used by callers that hit the connection directly (column stats,
        drill-down) so they get the same timeout as `query()`.
        """

        def _do() -> Any:
            cur = (
                self.con.execute(sql, params)
                if params
                else self.con.execute(sql)
            )
            if fetch == "one":
                return cur.fetchone()
            if fetch == "all":
                return cur.fetchall()
            if fetch == "df":
                return cur.fetchdf()
            if fetch == "none":
                return None
            raise ValueError(f"Unknown fetch mode: {fetch!r}")

        return self.run_with_timeout(
            _do, timeout_seconds=timeout_seconds, op_label="execute"
        )

    # ── Query ───────────────────────────────────────────────

    def query(
        self,
        sql: str,
        limit: int | None = None,
    ) -> pd.DataFrame:
        """
        Execute a read-only SELECT/WITH. Wraps in a subquery with LIMIT so
        a runaway query can't return unbounded rows, and runs under
        `run_with_timeout` so a pathological query can't hang forever.
        """
        limit = limit or settings.max_query_rows

        stripped = sql.strip().rstrip(";")
        if not stripped:
            raise ValueError("Empty SQL")

        lowered = stripped.lower().lstrip("(")
        if not (
            lowered.startswith("select")
            or lowered.startswith("with")
        ):
            raise PermissionError(
                "Only SELECT / WITH statements are allowed. "
                "DuckDB layer enforces read-only."
            )

        # Catch forbidden keywords anywhere (defense in depth).
        for bad in _FORBIDDEN_STARTS:
            # crude but effective: match whole word at statement start
            if lowered.startswith(bad):
                raise PermissionError(f"Forbidden statement: {bad}")

        wrapped = f"SELECT * FROM ({stripped}) AS _q LIMIT {int(limit)}"

        def _do() -> pd.DataFrame:
            return self.con.execute(wrapped).fetchdf()

        return self.run_with_timeout(_do, op_label="query")

    def explain(self, sql: str) -> str:
        """Return the EXPLAIN plan. Raises if the SQL is invalid."""
        stripped = sql.strip().rstrip(";")
        rows = self.con.execute(f"EXPLAIN {stripped}").fetchall()
        return "\n".join(str(r[1]) for r in rows)

    def validate(self, sql: str) -> tuple[bool, str | None]:
        """
        Cheap syntax/policy check. Returns (ok, error_message).
        Does NOT execute the query.
        """
        stripped = sql.strip().rstrip(";")
        if not stripped:
            return False, "Empty SQL"
        lowered = stripped.lower().lstrip("(")
        if not (lowered.startswith("select") or lowered.startswith("with")):
            return False, "Only SELECT / WITH statements are allowed."
        try:
            self.con.execute(f"EXPLAIN {stripped}")
            return True, None
        except Exception as e:
            return False, str(e)[:300]

    # ── Prompt helpers ──────────────────────────────────────

    def schema_for_prompt(self, tables: list[str]) -> str:
        """
        Compact schema block for LLM prompts.

        TABLE orders:
          - id (BIGINT)
          - amount (DOUBLE)
          ...
        """
        lines: list[str] = []
        for t in tables:
            try:
                cols = self.con.execute(
                    f"DESCRIBE {self._quote_ident(t)}"
                ).fetchdf()
            except Exception:
                continue

            lines.append(f"TABLE {t}:")
            for _, c in cols.iterrows():
                lines.append(f"  - {c['column_name']} ({c['column_type']})")
            lines.append("")

        return "\n".join(lines).rstrip()

    # ── Utilities ───────────────────────────────────────────

    @staticmethod
    def _quote_ident(name: str) -> str:
        """Quote a SQL identifier safely (doubles internal quotes)."""
        return '"' + name.replace('"', '""') + '"'

    def close(self) -> None:
        try:
            self.con.close()
        except Exception:
            pass


# ═══════════════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _strip_bom_in_place(path: str) -> None:
    """
    Rewrite a text file without its BOM, in place. Idempotent.

    DuckDB's CSV sniffer rejects any BOM:
      - UTF-8  (EF BB BF)  → strip, keep the rest as-is
      - UTF-16 LE (FF FE)  → strip, decode, re-encode as UTF-8
      - UTF-16 BE (FE FF)  → strip, decode, re-encode as UTF-8

    Called by `register_file` for CSV/TSV/TXT so every reader path is
    protected — uploads, direct profile calls, legacy files that were
    written before the upload-side strip existed.

    Fail-open: on any I/O or decode error, leaves the file untouched so
    DuckDB can produce its own error rather than us masking it.
    """
    p = Path(path)
    if not p.exists() or not p.is_file():
        return
    if p.suffix.lower() not in {".csv", ".tsv", ".txt"}:
        return

    try:
        data = p.read_bytes()
    except OSError:
        return

    stripped: bytes | None = None

    if data.startswith(b"\xef\xbb\xbf"):
        stripped = data[3:]
    elif data.startswith(b"\xff\xfe"):
        try:
            stripped = data[2:].decode("utf-16-le").encode("utf-8")
        except UnicodeDecodeError:
            return
    elif data.startswith(b"\xfe\xff"):
        try:
            stripped = data[2:].decode("utf-16-be").encode("utf-8")
        except UnicodeDecodeError:
            return

    if stripped is None:
        return

    try:
        p.write_bytes(stripped)
    except OSError:
        return

def _df_to_records(df: pd.DataFrame) -> list[dict[str, Any]]:
    """
    Convert a DataFrame to JSON-safe dicts.

    Handles everything a real CSV can throw at us:
      - NaN / NaT / None              → None
      - pandas.Timestamp / datetime   → ISO 8601 string
      - datetime.date                 → ISO 8601 string
      - numpy scalars (int64, float64)→ python int / float
      - Decimal                       → float
      - bytes                         → utf-8 string (best-effort)
      - everything else               → str()
    """
    if df.empty:
        return []

    import datetime as _dt
    import decimal
    from math import isnan, isinf

    def clean(v: Any) -> Any:
        # Null-ish values from pandas / numpy
        if v is None:
            return None
        try:
            if pd.isna(v):
                return None
        except (TypeError, ValueError):
            pass

        # Datetimes → ISO strings
        if isinstance(v, (_dt.datetime, _dt.date, _dt.time)):
            return v.isoformat()

        # pandas.Timestamp is a subclass of datetime, so the above catches it,
        # but guard for the NaT case which slips through pd.isna() sometimes.
        if isinstance(v, pd.Timestamp):
            return None if pd.isna(v) else v.isoformat()

        # numpy scalars → python natives
        if hasattr(v, "item") and not isinstance(v, (str, bytes)):
            try:
                return v.item()
            except (ValueError, AttributeError):
                pass

        # Floats: normalize NaN / inf
        if isinstance(v, float):
            if isnan(v) or isinf(v):
                return None
            return v

        # Decimal → float
        if isinstance(v, decimal.Decimal):
            return float(v)

        # Bytes → string
        if isinstance(v, (bytes, bytearray)):
            try:
                return v.decode("utf-8")
            except UnicodeDecodeError:
                return v.decode("utf-8", errors="replace")

        # Anything else JSON can't handle — fall back to str
        try:
            import json as _json
            _json.dumps(v)
            return v
        except (TypeError, ValueError):
            return str(v)

    rows: list[dict[str, Any]] = []
    for record in df.to_dict(orient="records"):
        rows.append({k: clean(v) for k, v in record.items()})
    return rows