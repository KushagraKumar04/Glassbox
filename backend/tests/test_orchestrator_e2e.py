"""Batch 1.3 — Orchestrator E2E tests. All LLM calls mocked.

Covers:
- Full SSE stream structure (event order, artifacts, narrative)
- Run persistence (status, sql_text, elapsed_ms)
- Filter application at DuckDB-view level
- Conversation context
- Error paths (no datasets, invalid SQL, LLM failure)
"""
import json
import uuid

import pytest


# ═══════════════════════════════════════════════════════════════════
#  Fake LLM
# ═══════════════════════════════════════════════════════════════════

DEFAULT_RESPONSES = {
    # SQL agent reads: sql, explanation, assumptions
    "sql": "SELECT 1 AS x",
    "explanation": "mock",
    "assumptions": [],
    # Python agent reads: code
    "code": "print('hi')",
    # DAX agent reads: dax, shape
    "dax": 'EVALUATE ROW("x", 1)',
    "shape": "measure",
    # Viz agent reads: type, xKey, yKeys, title, unit, columns, data
    "type": "table",
    "xKey": "",
    "yKeys": [],
    "title": "Mock Chart",
    "unit": "",
    "columns": [],
    "data": [],
    # Quality agent reads: confidence, warnings, verdict
    "confidence": "high",
    "warnings": [],
    "verdict": "ok",
    # Next-questions service reads: questions
    "questions": [],
    # Narrative JSON fallback reads: summary, findings, caveats
    "summary": "Mock summary",
    "findings": [],
    "caveats": [],
    # Anomaly narrate reads: narrative
    "narrative": "Mock anomaly narrative",
}


class FakeLLM:
    """Mock LLM. Returns a 'kitchen sink' JSON with every key any
    agent might look for. Each agent picks its own slice via
    safe_str/safe_list, so system-prompt wording is irrelevant.

    `fail_calls = {N}` → raise on the Nth generate() call (1-indexed).
    `responses` → override per-test to change specific fields.
    `narrative_chunks` → text yielded from stream().
    """

    def __init__(self):
        self.responses = dict(DEFAULT_RESPONSES)
        self.narrative_chunks = [
            "Mock summary\n\n",
            "FINDINGS:\n- x\n\n",
            "CAVEATS:\n- none\n",
        ]
        self.fail_calls: set[int] = set()
        self._call_count = 0
        self._stream_count = 0

    async def generate(self, prompt, *, system=None, json_mode=False):
        self._call_count += 1
        if self._call_count in self.fail_calls:
            raise RuntimeError(
                f"simulated LLM failure on call {self._call_count}"
            )
        return json.dumps(self.responses)

    async def stream(self, prompt, *, system=None):
        self._stream_count += 1
        for chunk in self.narrative_chunks:
            yield chunk


@pytest.fixture
def mocked_llm(monkeypatch):
    """Patch get_llm everywhere the orchestrator or its services see it."""
    fake = FakeLLM()

    # Orchestrator imports get_llm directly at module top
    import app.services.orchestrator as orch_mod
    monkeypatch.setattr(orch_mod, "get_llm", lambda: fake)

    # Factory path — for any service that imports factory directly
    try:
        import app.services.llm.factory as factory_mod
        monkeypatch.setattr(factory_mod, "get_llm", lambda: fake)
    except ImportError:
        pass

    # Clear lru_caches on LLM-consuming service factories so they
    # pick up the fake when constructed fresh
    for modname in (
        "app.services.next_questions_service",
        "app.services.anomaly_service",
        "app.services.explain_service",
        "app.services.rationale_service",
    ):
        try:
            mod = __import__(modname, fromlist=["_"])
            for attr in dir(mod):
                fn = getattr(mod, attr, None)
                if callable(fn) and hasattr(fn, "cache_clear"):
                    fn.cache_clear()
        except Exception:
            pass

    return fake


# ═══════════════════════════════════════════════════════════════════
#  Dataset fixtures
# ═══════════════════════════════════════════════════════════════════

@pytest.fixture
def seed_dataset(app_client):
    """Upload a small 3-row CSV; yield its upload response dict."""
    csv = b"a,b,c\n1,10,100\n2,20,200\n3,30,300\n"
    r = app_client.post(
        "/api/v1/datasets/upload",
        files={"file": ("e2e_test.csv", csv, "text/csv")},
    )
    assert r.status_code == 200, r.text
    ds = r.json()
    yield ds
    try:
        app_client.delete(f"/api/v1/datasets/{ds['id']}")
    except Exception:
        pass


@pytest.fixture
def seed_dataset_with_regions(app_client):
    """Upload a CSV with a `region` column for filter tests."""
    csv = b"id,region,value\n1,APAC,100\n2,APAC,200\n3,EMEA,300\n"
    r = app_client.post(
        "/api/v1/datasets/upload",
        files={"file": ("e2e_regions.csv", csv, "text/csv")},
    )
    assert r.status_code == 200, r.text
    ds = r.json()
    yield ds
    try:
        app_client.delete(f"/api/v1/datasets/{ds['id']}")
    except Exception:
        pass


# ═══════════════════════════════════════════════════════════════════
#  SSE helpers
# ═══════════════════════════════════════════════════════════════════

def _run_stream(app_client, payload, *, stop_on="done", max_events=300):
    """POST /chat/stream, collect SSE events until `stop_on`."""
    events: list[dict] = []
    with app_client.stream(
        "POST", "/api/v1/chat/stream", json=payload
    ) as response:
        assert response.status_code == 200, (
            f"chat stream failed: {response.status_code}"
        )
        ct = response.headers.get("content-type", "")
        assert "text/event-stream" in ct, f"unexpected content-type: {ct}"

        current: dict = {}
        for raw in response.iter_lines():
            line = (raw or "").rstrip("\r")
            if not line:
                if current:
                    events.append(current)
                    if current.get("event") == stop_on:
                        break
                    if len(events) >= max_events:
                        break
                    current = {}
                continue
            if line.startswith("event:"):
                current["event"] = line[len("event:"):].strip()
            elif line.startswith("data:"):
                body = line[len("data:"):].strip()
                try:
                    current["data"] = json.loads(body)
                except json.JSONDecodeError:
                    current["data"] = body

        if current and current.get("event") != stop_on:
            events.append(current)

    return events


def _find_artifact(events, kind):
    for e in events:
        if e.get("event") == "artifact" and e["data"].get("kind") == kind:
            return e
    return None


def _trace_steps(events):
    tr = _find_artifact(events, "trace")
    return tr["data"].get("events", []) if tr else []


# ═══════════════════════════════════════════════════════════════════
#  Happy path
# ═══════════════════════════════════════════════════════════════════

class TestHappyPath:
    def test_stream_starts_with_run_started(
        self, app_client, mocked_llm, seed_dataset
    ):
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        assert events[0]["event"] == "run_started"
        assert events[0]["data"].get("run_id")

    def test_stream_ends_with_done(
        self, app_client, mocked_llm, seed_dataset
    ):
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        assert events[-1]["event"] == "done"

    def test_key_artifacts_present(
        self, app_client, mocked_llm, seed_dataset
    ):
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        for kind in ("sql", "chart", "answer", "trace"):
            assert _find_artifact(events, kind) is not None, (
                f"missing {kind} artifact"
            )

    def test_sql_artifact_valid(
        self, app_client, mocked_llm, seed_dataset
    ):
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        sql = _find_artifact(events, "sql")
        assert sql is not None
        assert sql["data"]["valid"] is True
        assert "SELECT" in sql["data"]["content"].upper()

    def test_agent_step_order(
        self, app_client, mocked_llm, seed_dataset
    ):
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        stages = [
            e["data"]["stage"] for e in events
            if e["event"] == "agent_step"
            and e["data"].get("status") == "running"
        ]
        expected = ["planning", "schema", "query", "compute", "translate"]
        indices = []
        for name in expected:
            idx = next((i for i, s in enumerate(stages) if s == name), None)
            assert idx is not None, f"stage {name} never ran"
            indices.append(idx)
        assert indices == sorted(indices), (
            f"stages out of order: {list(zip(expected, indices))}"
        )

    def test_narrative_streamed(
        self, app_client, mocked_llm, seed_dataset
    ):
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        deltas = [e for e in events if e["event"] == "narrative_delta"]
        assert len(deltas) >= 1
        text = "".join(e["data"]["delta"] for e in deltas)
        assert "Mock summary" in text
        assert "FINDINGS:" in text

    def test_answer_artifact_parsed(
        self, app_client, mocked_llm, seed_dataset
    ):
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        ans = _find_artifact(events, "answer")
        assert ans is not None
        content = ans["data"]["content"]
        assert content["summary"] == "Mock summary"
        assert content["findings"] == ["x"]
        assert content["caveats"] == ["none"]

    def test_run_persisted_completed(
        self, app_client, mocked_llm, seed_dataset
    ):
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        rc = next(e for e in events if e["event"] == "run_complete")
        r = app_client.get(f"/api/v1/runs/{rc['data']['run_id']}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "completed"
        assert body["sql_text"]
        assert body["elapsed_ms"] > 0
        assert body["question"] == "count rows"

    def test_query_step_row_count(
        self, app_client, mocked_llm, seed_dataset
    ):
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        steps = _trace_steps(events)
        query_done = [
            s for s in steps
            if s.get("stage") == "query" and s.get("status") == "done"
        ]
        assert query_done, "no query/done step in trace"
        # Mock SQL is "SELECT 1 AS x" → 1 row
        assert "1 row" in query_done[-1]["detail"]


# ═══════════════════════════════════════════════════════════════════
#  Filters
# ═══════════════════════════════════════════════════════════════════

class TestFilters:
    def test_filter_reduces_row_count(
        self, app_client, mocked_llm, seed_dataset_with_regions
    ):
        ds = seed_dataset_with_regions
        table = ds["table_name"]
        mocked_llm.responses = {
            **mocked_llm.responses,
            "sql": f'SELECT * FROM "{table}"',
        }
        payload = {
            "question": "show all rows",
            "dataset_ids": [ds["id"]],
            "filters": [
                {"column": "region", "operator": "=", "value": "APAC"},
            ],
        }
        events = _run_stream(app_client, payload)
        steps = _trace_steps(events)
        query_done = [
            s for s in steps
            if s.get("stage") == "query" and s.get("status") == "done"
        ]
        assert query_done, "no query/done step"
        detail = query_done[-1]["detail"]
        # 3 total rows, 2 in APAC → filter should show 2
        assert "2 row" in detail, (
            f"expected 2 rows after filter, got: {detail}"
        )


# ═══════════════════════════════════════════════════════════════════
#  Conversation context
# ═══════════════════════════════════════════════════════════════════

class TestConversationContext:
    def test_conversation_id_persisted(
        self, app_client, mocked_llm, seed_dataset
    ):
        conv_id = "test_conv_" + uuid.uuid4().hex[:8]
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
            "conversation_id": conv_id,
        }
        events = _run_stream(app_client, payload)
        rc = next(e for e in events if e["event"] == "run_complete")
        r = app_client.get(f"/api/v1/runs/{rc['data']['run_id']}")
        assert r.status_code == 200
        assert r.json()["conversation_id"] == conv_id

    def test_no_conversation_id_persisted_as_null(
        self, app_client, mocked_llm, seed_dataset
    ):
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        rc = next(e for e in events if e["event"] == "run_complete")
        r = app_client.get(f"/api/v1/runs/{rc['data']['run_id']}")
        assert r.json()["conversation_id"] is None


# ═══════════════════════════════════════════════════════════════════
#  Error paths
# ═══════════════════════════════════════════════════════════════════

class TestErrorPaths:
    def test_no_datasets_emits_error(self, app_client, mocked_llm):
        # Wipe any leftover datasets from prior tests
        existing = app_client.get("/api/v1/datasets").json()
        if isinstance(existing, dict):
            existing = (
                existing.get("items") or existing.get("datasets") or []
            )
        for ds in existing:
            app_client.delete(f"/api/v1/datasets/{ds['id']}")

        events = _run_stream(app_client, {"question": "anything"})
        err = next(
            (e for e in events if e["event"] == "error"), None
        )
        assert err is not None, "no error event emitted"
        msg = err["data"].get("message", "")
        assert "no dataset" in msg.lower()
        assert any(e["event"] == "run_complete" for e in events)

    def test_invalid_sql_persists_failed_status(
        self, app_client, mocked_llm, seed_dataset
    ):
        mocked_llm.responses = {
            **mocked_llm.responses,
            "sql": "SELECT * FROM definitely_nonexistent_table_xyz",
        }
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        rc = next(e for e in events if e["event"] == "run_complete")
        r = app_client.get(f"/api/v1/runs/{rc['data']['run_id']}")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "failed"
        assert body["error"]

    def test_sql_llm_failure_still_completes_stream(
        self, app_client, mocked_llm, seed_dataset
    ):
        mocked_llm.fail_calls = {1}  # fail first generate() = SQL
        payload = {
            "question": "count rows",
            "dataset_ids": [seed_dataset["id"]],
        }
        events = _run_stream(app_client, payload)
        assert any(e["event"] == "run_complete" for e in events)
        assert events[-1]["event"] == "done"
        rc = next(e for e in events if e["event"] == "run_complete")
        r = app_client.get(f"/api/v1/runs/{rc['data']['run_id']}")
        assert r.status_code == 200
        assert r.json()["status"] == "failed"