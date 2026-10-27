# Glassbox — Project Handoff

## What it is

A local-first, provider-agnostic AI data analyst. Users upload files or connect
databases, ask questions in plain English, and get back SQL, Python, DAX,
charts, KPI cards, anomalies, and a full execution trace — never an opaque
answer.

Repo: github.com/<your-username>/Glassbox
Stack: FastAPI + DuckDB + SQLite + React 19 + Vite + Tailwind v4 + Monaco
Local runtime: Python 3.14 verified (min 3.11), Node 20+

## Deployment target

**Small trusted team.** Production must set:

- `AUTH_ENABLED=true`
- `GUEST_MODE=false`
- `RATE_LIMIT_STORAGE=redis://...` (not `memory://`)
- Strong `SECRET_KEY` and `JWT_SECRET_KEY` (≥32 chars, no placeholders)
- `CONNECTOR_ALLOW_PRIVATE_HOSTS=false`

R1 (login timing enumeration) is escalated from Low → **Medium** under this
target.

## Working conventions

- **Batches, not rewrites.** Each task is one batch: file list → full content
  for new files, find/replace for existing files → apply instructions → test.
- **New files delivered in full.** Existing files edited surgically.
- **Don't re-post existing code.** The user has the repo locally.
- **Short confirmations.** If a batch compiles and passes tests, one sentence
  is enough.
- **Ask before assuming.** If a batch could go two ways, ask one question.

## Tech conventions

- Backend: FastAPI, Pydantic v2, SQLAlchemy 2.0 async, SQLite, DuckDB
- LLM abstraction: `app/services/llm/` — swap providers via `.env` only
- Auth: JWT + bcrypt, opt-in via `AUTH_ENABLED`
- Migrations: idempotent helpers in `app/db/session.py` (no Alembic)
- Frontend: feature-sliced folders under `src/features/<name>/`
- State: zustand for cross-cutting state (inspector, thread, auth, theme)
- API: SSE for streaming, REST for everything else
- Styling: Tailwind v4, tokens in `index.css` `@theme`, no config file

## What's already built

**Core pipeline**
- 7 agents: SQL, Python, DAX, Visualization, Narrative, Quality, KPI
- Orchestrator with SSE streaming
- DuckDB engine — file upload + Postgres/MySQL/SQLite connectors
- Read-only SQL enforcement at the DuckDB layer
- Docker/local sandbox for Python

**Services (non-agent)**
- Anomaly detection, auto-dashboard, SQL explanation, SQL rationale,
  next-question suggestions, query-history autocomplete

**Data & semantics**
- File upload (CSV/TSV/XLSX/XLS/Parquet/JSON/JSONL) with magic-byte verification
- Database connectors via DuckDB `ATTACH` (SSRF-guarded)
- Filter bar — DuckDB-level view filtering, URL-persisted
- Multi-turn conversation context (last 3 turns)
- Business glossary (metrics) injected into prompts
- Column-level drill-down

**Auth & governance**
- JWT auth, password reset with SMTP email
- Per-account exponential auth backoff
- Rate limiting on auth + chat + execute
- Trusted-proxy IP derivation
- Audit log — every security-relevant action
- Per-user data scoping
- Guest mode (read-only browse, write-blocked)

**UX**
- 12 pages: Home, Sources, Workspace, History, RunDetail, Templates,
  Metrics, Audit, Settings, Dashboard, Login, ForgotReset
- Single + Thread workspace modes
- 5-tab inspector (SQL, Python, DAX, Trace, Assumptions)
- Monaco editors with edit-and-run, diff, ⌘↵
- Command palette (⌘K) with inline-ask
- Autocomplete from past questions
- Auto-suggest 3 follow-ups per run
- Streaming narrative with live typing
- Chart drill-down on click
- Anomaly detection card
- Pin / saved analyses
- Dark/light theme toggle
- SQL formatter
- Global keyboard shortcuts
- Onboarding tour
- Full export: CSV/JSON/PNG/.sql/.py/.dax
- Landing page with animated hero, news section

## Testing

```powershell
cd backend
.\scripts\test.ps1              # Windows
.\scripts\test.ps1 -Coverage    # With HTML report at htmlcov/index.html