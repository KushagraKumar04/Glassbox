"""
Orchestrator — coordinates all agents for one analysis run.

Emits a stream of events the API layer forwards as SSE:

    {"type": "agent_step",  "payload": {stage, status, detail}}
    {"type": "artifact",    "payload": {kind: sql|python|chart|answer|quality|trace, ...}}
    {"type": "run_complete","payload": {run_id, elapsed_ms}}

Also persists the run to SQLite on completion.
"""
from __future__ import annotations
from app.services.duckdb_service import DuckDBService, build_filter_where
import asyncio
import time
from datetime import datetime
from typing import AsyncIterator

import pandas as pd
import structlog
from sqlalchemy import select

from app.agents import (
    DaxAgent,
    KPIAgent,
    NarrativeAgent,
    PythonAgent,
    QualityAgent,
    SQLAgent,
    VisualizationAgent,
)
from app.db.models import AnalysisRun, Dataset, _utcnow
from app.db.session import SessionLocal
from app.services.duckdb_service import DuckDBService
from app.services.llm import get_llm
from app.services.context_service import (
    format_context,
    load_conversation_context,
)
from app.services.semantic_service import (
    format_glossary,
    load_relevant_metrics,
)
from app.services.anomaly_service import get_anomaly_service
from app.services.next_questions_service import (
    get_next_questions_service,
)

log = structlog.get_logger()

_MAX_ROWS_TO_FRONTEND = 500


# ═══════════════════════════════════════════════════════════════════════════
#  Dataset loader
# ═══════════════════════════════════════════════════════════════════════════

async def load_duckdb_for_datasets(
    dataset_ids: list[str],
    source_ids: list[str] | None = None,
    filters: list[dict] | None = None,
) -> tuple[DuckDBService, list[str], list[str], list[str]]:
    """
    Returns (db, table_names, selected_dataset_ids, selected_source_ids).
    The IDs are the actual UUIDs so we can persist truthful references.
    """
    """
    Build a fresh DuckDB with:

      - uploaded Datasets registered as views (via read_csv/read_parquet)
      - remote DataSources ATTACHed, with each of their tables exposed as a
        local view so the LLM sees a flat namespace

    Semantic (matches the frontend's picker):
      - dataset_ids == [] and source_ids == []  → ALL datasets and ALL sources
      - dataset_ids != [] or source_ids != []   → only the selected ones
    """
    from app.core.crypto import decrypt
    from app.db.models import DataSource
    from app.services.connector_service import ConnectorService
    from app.services.profiling_service import sanitize_table_name

    db = DuckDBService()
    tables: list[str] = []
    source_ids = source_ids or []

    # ── Datasets ────────────────────────────────────────
    async with SessionLocal() as session:
        if dataset_ids:
            ds_result = await session.execute(
                select(Dataset).where(Dataset.id.in_(dataset_ids))
            )
        else:
            ds_result = await session.execute(
                select(Dataset).order_by(Dataset.created_at.desc())
            )
        datasets = ds_result.scalars().all()

    for ds in datasets:
        try:
            db.register_file(
                ds.file_path,
                ds.table_name,
                ds.file_type,
                filters=filters or [],
            )
            tables.append(ds.table_name)
        except Exception as e:
            log.warning(
                "dataset_register_failed",
                dataset_id=ds.id,
                error=str(e)[:160],
            )

    # ── DataSources ─────────────────────────────────────
    async with SessionLocal() as session:
        if source_ids:
            src_result = await session.execute(
                select(DataSource).where(DataSource.id.in_(source_ids))
            )
        else:
            src_result = await session.execute(
                select(DataSource).order_by(DataSource.created_at.desc())
            )
        sources = src_result.scalars().all()

    conn = ConnectorService(db)
    for src in sources:
        try:
            password = decrypt(src.password_enc)
            attached = conn.attach(src, password)

            # Expose each remote table as a local view.
            # Table name pattern: <schema>_<table>_<src_short>
            for t in attached.tables:
                # Skip huge system-ish schemas the user shouldn't query
                local_name = sanitize_table_name(
                    f"{t['schema']}_{t['name']}_{src.id[:6]}"
                )
                try:
                    qualified = t["qualified"]
                    # Build a per-table filter WHERE clause using only the
                    # columns this remote table actually has
                    try:
                        cols_df = db.con.execute(
                            f"DESCRIBE {qualified}"
                        ).fetchdf()
                        available = set(cols_df["column_name"].tolist())
                    except Exception:
                        available = set()

                    where = build_filter_where(filters or [], available)

                    if where:
                        db.con.execute(
                            f'CREATE OR REPLACE VIEW "{local_name}" AS '
                            f"SELECT * FROM {qualified} WHERE {where}"
                        )
                    else:
                        db.con.execute(
                            f'CREATE OR REPLACE VIEW "{local_name}" AS '
                            f"SELECT * FROM {qualified}"
                        )
                    tables.append(local_name)
                except Exception as e:
                    log.warning(
                        "source_table_view_failed",
                        source_id=src.id,
                        table=t["name"],
                        error=str(e)[:160],
                    )
        except Exception as e:
            log.warning(
                "source_attach_failed",
                source_id=src.id,
                kind=src.kind,
                error=str(e)[:200],
            )

    # Capture the actual UUIDs we loaded (not table names) for persistence
    loaded_dataset_ids = [ds.id for ds in datasets]
    loaded_source_ids = [src.id for src in sources]

    return db, tables, loaded_dataset_ids, loaded_source_ids


# ═══════════════════════════════════════════════════════════════════════════
#  Orchestrator
# ═══════════════════════════════════════════════════════════════════════════

class Orchestrator:
    def __init__(self, db: DuckDBService) -> None:
        self.llm = get_llm()
        self.db = db
        self.sql = SQLAgent(self.llm, self.db)
        self.python = PythonAgent(self.llm)
        self.dax = DaxAgent(self.llm)
        self.viz = VisualizationAgent(self.llm)
        self.kpi = KPIAgent()
        self.narrative = NarrativeAgent(self.llm)
        self.quality = QualityAgent(self.llm)
        self.next_q = get_next_questions_service()
        self.anomalies = get_anomaly_service()

    # ── Public ──────────────────────────────────────────────

    async def run(
        self,
        *,
        question: str,
        tables: list[str],
        run_id: str,
        dataset_ids: list[str] | None = None,
        source_ids: list[str] | None = None,
        user_id: str | None = None,
        conversation_id: str | None = None,
        filters: list[dict] | None = None,
    ) -> AsyncIterator[dict]:
        t0 = time.time()
        trace: list[dict] = []

        # Accumulators for persistence
        sql_text = ""
        python_text = ""
        answer_summary = ""
        chart_spec: dict = {}
        error_text = ""

        def step(stage: str, status: str, detail: str = "") -> dict:
            entry = {
                "stage": stage,
                "status": status,
                "detail": detail,
                "ts": int((time.time() - t0) * 1000),
            }
            trace.append(entry)
            return {
                "type": "agent_step",
                "payload": {"stage": stage, "status": status, "detail": detail},
            }

        # ── 1. Planning ─────────────────────────────────────
        yield step(
            "planning", "running",
            f"{len(tables)} table(s): {', '.join(tables[:3])}"
            + ("…" if len(tables) > 3 else ""),
        )
        yield step("planning", "done", "plan ready")

        if not tables:
            error_text = "No datasets selected."
            yield {"type": "error", "payload": {"message": error_text}}
            yield {"type": "artifact",
                   "payload": {"kind": "trace", "events": trace}}
            yield {"type": "run_complete", "payload": {
                "run_id": run_id,
                "elapsed_ms": int((time.time() - t0) * 1000),
            }}
            return

        # ── 2. Schema inspection ────────────────────────────
        yield step("schema", "running")
        self.db.schema_for_prompt(tables)  # warm the cache
        yield step("schema", "done", f"{len(tables)} table(s)")

        # ── 3. SQL generation ───────────────────────────────
        yield step("query", "running", "generating SQL…")

        # Load prior turns in this conversation (if any) so follow-ups resolve
        context_block = ""
        try:
            prior = await load_conversation_context(
                conversation_id, user_id, exclude_run_id=run_id
            )
            context_block = format_context(prior)
            if prior:
                yield step(
                    "query", "running",
                    f"reusing {len(prior)} prior turn(s)",
                )
        except Exception as e:
            log.warning("context_load_failed", error=str(e)[:160])

        # Load relevant business-glossary metrics for this question
        glossary = ""
        try:
            metrics = await load_relevant_metrics(question, user_id)
            glossary = format_glossary(metrics)
            if metrics:
                yield step(
                    "query", "running",
                    f"using {len(metrics)} business term(s)",
                )
        except Exception as e:
            log.warning("semantic_load_failed", error=str(e)[:160])

        try:
            sql_result = await self.sql.generate(
                question, tables, glossary, context_block
            )
        except Exception as e:
            log.warning("sql_agent_failed", error=str(e)[:200])
            sql_result = {
                "sql": "",
                "valid": False,
                "validation_error": str(e)[:200],
                "explanation": "",
                "assumptions": [],
            }

        sql_text = sql_result.get("sql", "") or ""
        yield {"type": "artifact", "payload": {
            "kind": "sql",
            "content": sql_text,
            "valid": bool(sql_result.get("valid")),
            "explanation": sql_result.get("explanation", ""),
            "assumptions": sql_result.get("assumptions", []),
        }}

        # ── 4. Execute SQL ──────────────────────────────────
        rows: list[dict] = []
        if sql_result.get("valid"):
            try:
                df = self.db.query(sql_text)
                rows = _df_to_records(df)[:_MAX_ROWS_TO_FRONTEND]
                # (row-count reported from the full df)
                yield step("query", "done", f"{len(df)} row(s)")
            except Exception as e:
                error_text = str(e)[:200]
                yield step("query", "error", error_text[:160])
        else:
            err = sql_result.get("validation_error") or "invalid SQL"
            error_text = err
            yield step("query", "error", err[:160])

        # ── 5. Python generation ────────────────────────────
        yield step("compute", "running")
        try:
            py = await self.python.generate(question, rows)
        except Exception as e:
            log.warning("python_agent_failed", error=str(e)[:200])
            py = {"code": "", "explanation": ""}
        python_text = py.get("code", "") or ""
        yield {"type": "artifact", "payload": {
            "kind": "python",
            "content": python_text,
            "explanation": py.get("explanation", ""),
        }}
        yield step("compute", "done")

        # ── 5b. DAX equivalent (Power BI) ───────────────────
        yield step("translate", "running", "generating DAX…")
        dax_text = ""
        try:
            schema_for_dax = self.db.schema_for_prompt(tables)
            dax_result = await self.dax.generate(
                question=question,
                schema=schema_for_dax,
                sql=sql_text,
                glossary=glossary,
            )
            dax_text = dax_result.get("dax", "") or ""
            if dax_text:
                yield {"type": "artifact", "payload": {
                    "kind": "dax",
                    "content": dax_text,
                    "explanation": dax_result.get("explanation", ""),
                    "shape": dax_result.get("shape", "measure"),
                }}
                yield step("translate", "done", dax_result.get("shape", "measure"))
            else:
                yield step("translate", "done", "skipped")
        except Exception as e:
            log.warning("dax_agent_failed", error=str(e)[:200])
            yield step("translate", "done", "skipped")

        # ── 6. Chart recommendation ─────────────────────────
        yield step("visualizing", "running")

        try:
            chart_spec = await self.viz.recommend(question, rows)
        except Exception as e:
            log.warning("viz_agent_failed", error=str(e)[:200])
            chart_spec = {
                "type": "table",
                "xKey": "",
                "yKeys": [],
                "title": "Result",
                "unit": "",
                "data": rows,
                "columns": list(rows[0].keys()) if rows else [],
            }
        yield {"type": "artifact",
               "payload": {"kind": "chart", "spec": chart_spec}}

        # ── 6b. KPI cards (deterministic, no LLM) ───────────
        kpi_spec = self.kpi.detect(question, rows)
        if kpi_spec:
            yield {"type": "artifact",
                   "payload": {"kind": "kpi", **kpi_spec}}
        yield step("visualizing", "done")

        # ── 7. Narrative (streaming) ────────────────────────
        #
        # Stream the narrative token by token. Emit a `narrative_delta`
        # event per chunk so the frontend can show the answer as it types.
        # When the stream ends, parse the full text into the structured
        # answer shape and emit it as the `answer` artifact.
        #
        # Fail-safe: if streaming produces nothing useful, fall back to the
        # JSON-based compose() and continue.
        streamed_text = ""
        try:
            async for chunk in self.narrative.compose_stream(
                question, sql_text, rows
            ):
                if not chunk:
                    continue
                streamed_text += chunk
                yield {
                    "type": "narrative_delta",
                    "payload": {"delta": chunk},
                }
        except Exception as e:
            log.warning("narrative_stream_failed", error=str(e)[:200])

        answer: dict
        if streamed_text.strip():
            answer = self.narrative.parse_streamed(streamed_text)
        else:
            # Fallback to JSON mode
            try:
                answer = await self.narrative.compose(question, sql_text, rows)
            except Exception as e:
                log.warning("narrative_agent_failed", error=str(e)[:200])
                answer = {
                    "summary": "Analysis completed.",
                    "findings": [],
                    "caveats": [],
                }

        yield {"type": "artifact",
               "payload": {"kind": "answer", "content": answer}}

        # ── 8. Quality review ───────────────────────────────
        try:
            quality = await self.quality.check(
                rows, {**answer, "_question": question}
            )
        except Exception as e:
            log.warning("quality_agent_failed", error=str(e)[:200])
            quality = {"confidence": "medium", "warnings": [], "verdict": ""}
        await asyncio.sleep(0)
        yield {"type": "artifact",
               "payload": {"kind": "quality", "content": quality}}

        # ── 8b. Next-question suggestions ───────────────────
        #
        # Runs after the answer and artifacts so the user sees the result
        # immediately. Cached by (question + sql + columns) hash — the same
        # run re-opened never costs another LLM call.
        yield step("suggest", "running")
        try:
            result_columns = list(rows[0].keys()) if rows else []
            suggestions = await self.next_q.generate(
                question=question,
                sql=sql_text,
                columns=result_columns,
                row_count=len(rows),
                sample_rows=rows[:5],
                context=context_block,
            )
            if suggestions:
                yield {"type": "artifact", "payload": {
                    "kind": "next_questions",
                    "questions": suggestions,
                }}
                yield step(
                    "suggest", "done",
                    f"{len(suggestions)} suggestion(s)",
                )
            else:
                yield step("suggest", "done", "skipped")
        except Exception as e:
            log.warning("next_questions_failed", error=str(e)[:200])
            yield step("suggest", "done", "skipped")

        # ── 8c. Anomaly detection ───────────────────────────
        #
        # Deterministic scan for outliers in the result rows.
        # Narrated by the LLM only when an outlier exists — cached by
        # (sql + column + value).
        yield step("anomalies", "running")
        try:
            anomaly_list = self.anomalies.detect(rows)
            if anomaly_list:
                narrative = await self.anomalies.narrate(
                    anomaly_list, sql_text
                )
                yield {"type": "artifact", "payload": {
                    "kind": "anomalies",
                    "anomalies": anomaly_list,
                    "narrative": narrative,
                }}
                yield step(
                    "anomalies", "done",
                    f"{len(anomaly_list)} outlier(s)",
                )
            else:
                yield step("anomalies", "done", "none")
        except Exception as e:
            log.warning("anomaly_detection_failed", error=str(e)[:200])
            yield step("anomalies", "done", "skipped")

        # ── 9. Trace ────────────────────────────────────────
        yield {"type": "artifact",
               "payload": {"kind": "trace", "events": trace}}

        # ── Persist to SQLite ───────────────────────────────
        elapsed = int((time.time() - t0) * 1000)
        try:
            await self._persist(
                run_id=run_id,
                user_id=user_id,
                conversation_id=conversation_id,
                question=question,
                dataset_ids=dataset_ids or [],
                source_ids=source_ids or [],
                sql_text=sql_text,
                python_text=python_text,
                dax_text=dax_text,
                answer=answer,
                chart_spec=chart_spec,
                trace=trace,
                error=error_text,
                elapsed_ms=elapsed,
            )              
        except Exception as e:
            log.warning("run_persist_failed", error=str(e)[:200])

        yield {"type": "run_complete", "payload": {
            "run_id": run_id,
            "elapsed_ms": elapsed,
        }}

    # ── Persistence ─────────────────────────────────────────

    async def _persist(
        self,
        *,
        run_id: str,
        user_id: str | None,
        conversation_id: str | None,
        question: str,
        dataset_ids: list[str],
        source_ids: list[str],
        sql_text: str,
        python_text: str,
        dax_text: str,
        answer: dict,
        chart_spec: dict,
        trace: list[dict],
        error: str,
        elapsed_ms: int,
    ) -> None:
        import json as _json

        async with SessionLocal() as session:
            run = AnalysisRun(
                id=run_id,
                user_id=user_id,
                conversation_id=conversation_id,
                question=question,
                status="failed" if error else "completed",
                sql_text=sql_text,
                python_text=python_text,
                dax_text=dax_text,
                answer=_json.dumps(answer, default=str),
                chart_spec=chart_spec,
                trace=trace,
                dataset_ids=dataset_ids,
                source_ids=source_ids,
                error=error,
                elapsed_ms=elapsed_ms,
                completed_at=_utcnow(),
            )
            session.add(run)
            await session.commit()


# ═══════════════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════════════

def _df_to_records(df: pd.DataFrame) -> list[dict]:
    """DataFrame → JSON-safe dicts (NaN → None, datetimes → ISO strings)."""
    if df.empty:
        return []
    return df.astype(object).where(pd.notnull(df), None).to_dict(orient="records")