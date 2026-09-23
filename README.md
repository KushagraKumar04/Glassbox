<!-- # Glassbox

**Ask your data. Get the answer. See the proof.**

A local-first, provider-agnostic analytics workspace. Upload a file or connect a
database, ask a question in plain English, and get back SQL, Python, DAX,
interactive charts, and a transparent execution trace - never an opaque answer.

---

## Table of contents

1. [Highlights](#highlights)
2. [Architecture](#architecture)
3. [Tech stack](#tech-stack)
4. [Quick start](#quick-start)
5. [Environment variables](#environment-variables)
6. [Feature guide](#feature-guide)
   - [Data sources](#data-sources)
   - [Agent pipeline](#agent-pipeline)
   - [Inspector](#inspector)
   - [Charts and KPIs](#charts-and-kpis)
   - [Filters](#filters)
   - [Conversation context](#conversation-context)
   - [DAX generation](#dax-generation)
   - [Edit-and-run](#edit-and-run)
   - [Templates](#templates)
   - [Metrics (semantic layer)](#metrics-semantic-layer)
   - [History](#history)
   - [Audit log](#audit-log)
   - [Export](#export)
   - [Command palette](#command-palette)
   - [Settings](#settings)
   - [Auth and password reset](#auth-and-password-reset)
7. [Agent architecture](#agent-architecture)
8. [Security model](#security-model)
9. [API reference](#api-reference)
10. [Data model](#data-model)
11. [Deployment](#deployment)
12. [Roadmap](#roadmap)
13. [License](#license)

---

## Highlights

- **Multi-provider LLM** - Gemini, OpenAI, Anthropic, Ollama, OpenRouter, Groq,
  Cerebras, or any OpenAI-compatible endpoint. Swap with 4 lines in `.env`.
- **Read-only by construction** - the SQL layer rejects anything that isn't
  `SELECT` or `WITH`. Verified at the DuckDB level, not by prompt.
- **Transparent** - every run returns the SQL, Python, DAX, chart, assumptions,
  quality review, and a millisecond-timed execution trace.
- **In-process data engine** - DuckDB reads CSV, Parquet, JSON, and connects to
  Postgres / MySQL / SQLite. No server, no ETL.
- **Conversational** - follow-up questions reuse prior SQL and metrics.
- **Filter-bar scoping** - constrain datasets by column before the LLM even sees
  them. Impossible to escape.
- **Auditable** - every security-relevant action is logged.
- **Local-first** - SQLite for app metadata. Zero infra required.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (React)                     │
│  Vite · TypeScript · Tailwind v4 · Recharts · Monaco        │
└──────────────────────────┬──────────────────────────────────┘
                           │ SSE + REST
┌──────────────────────────▼──────────────────────────────────┐
│                       Backend (FastAPI)                     │
│                                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │   SQL    │  │  Python  │  │   DAX    │  │   Viz    │   │
│  │  Agent   │  │  Agent   │  │  Agent   │  │  Agent   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│       │             │             │             │         │
│       └─────────────┴──────┬──────┴─────────────┘         │
│                            │                               │
│              ┌─────────────▼─────────────┐                 │
│              │       Orchestrator        │                 │
│              │  (SSE streaming pipeline) │                 │
│              └─────────────┬─────────────┘                 │
│                            │                               │
│       ┌────────────────────┼────────────────────┐          │
│       │                    │                    │          │
│  ┌────▼─────┐        ┌─────▼────┐        ┌─────▼─────┐   │
│  │ LLM      │        │  DuckDB  │        │  Sandbox  │   │
│  │ Provider │        │  Engine  │        │ (Docker)  │   │
│  └──────────┘        └──────────┘        └───────────┘   │
│                                                             │
│  ┌────────────────────────────┐   ┌─────────────────────┐ │
│  │  SQLite (app metadata)     │   │  Local file storage │ │
│  │  users · datasets · runs   │   │  uploads · artifacts│ │
│  │  audit · sources · metrics │   │                     │ │
│  └────────────────────────────┘   └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech stack

| Layer | Technology |
|---|---|
| **Backend** | FastAPI + Python 3.11+ |
| **LLM** | Gemini / OpenAI / Anthropic / Ollama / OpenRouter / Groq / Cerebras / any OpenAI-compatible |
| **Data engine** | DuckDB (in-process OLAP) |
| **Execution** | Docker sandbox (optional) or local subprocess |
| **Database** | SQLite via SQLAlchemy 2.0 async |
| **Auth** | JWT (HS256) + bcrypt |
| **Email** | aiosmtplib (SMTP - Gmail / SendGrid / Mailgun / SES / etc.) |
| **Rate limiting** | slowapi (memory:// or Redis) |
| **Frontend** | React 19 + Vite 6 + TypeScript 5.7 |
| **Styling** | Tailwind CSS v4 |
| **Charts** | Recharts 2.15 |
| **Editor** | Monaco Editor (SQL, Python, DAX) |
| **Streaming** | Server-Sent Events (SSE) |

---

## Quick start

### Prerequisites

- Python 3.11+
- Node.js 18+
- (Optional) Docker for sandboxed Python execution

### 1. Clone and configure

```bash
git clone <your-repo> ai-data-analyst
cd ai-data-analyst
cp .env.example .env
```

Edit `.env` and set **at minimum**:

```bash
LLM_PROVIDER=gemini
LLM_API_KEY=your-key-here
LLM_MODEL=gemini-2.5-flash
SECRET_KEY=<random-64-char-string>
JWT_SECRET_KEY=<another-random-string>
```

### 2. Backend

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

The first boot will:
- Create SQLite tables
- Run migrations for existing installs
- Seed 10 built-in templates
- Seed 6 built-in business metrics
- Prune audit events older than 90 days
- Print a `startup` log line

Open http://localhost:8000/docs for the auto-generated API reference.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173.

### 4. Use it

1. **Data Sources** → upload a CSV (or connect a database)
2. **Home** → pick a suggested question
3. **Workspace** → watch the agent stream the answer
4. **Inspector** → inspect SQL, Python, DAX, trace, assumptions

---

## Environment variables

### LLM

| Variable | Default | Purpose |
|---|---|---|
| `LLM_PROVIDER` | `gemini` | `gemini` \| `openai` \| `anthropic` \| `ollama` \| `openai_compatible` |
| `LLM_API_KEY` | - | Provider API key |
| `LLM_MODEL` | `gemini-2.5-flash` | Model identifier |
| `LLM_BASE_URL` | - | Required for `openai_compatible` and `ollama` |
| `LLM_TEMPERATURE` | `0` | Sampling temperature |
| `LLM_MAX_TOKENS` | `8192` | Max output tokens |

### App

| Variable | Default | Purpose |
|---|---|---|
| `APP_NAME` | Glassbox | Display name |
| `APP_ENV` | `development` | Environment |
| `APP_DEBUG` | `true` | Enables `/docs` and verbose errors |
| `SECRET_KEY` | - | Derived for credential encryption |
| `CORS_ORIGINS` | `http://localhost:5173` | Comma-separated allowed origins |
| `DISPLAY_TIMEZONE` | `Asia/Kolkata` | ISO timezone for timestamps |
| `LOG_LEVEL` | `INFO` | Structured log level |

### Storage

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `sqlite+aiosqlite:///./data/app.db` | SQLAlchemy URL |
| `UPLOAD_DIR` | `./data/uploads` | Where uploaded files live |
| `ARTIFACT_DIR` | `./data/artifacts` | Sandbox scratch + outputs |
| `MAX_UPLOAD_SIZE_MB` | `100` | Upload size cap |

### DuckDB

| Variable | Default | Purpose |
|---|---|---|
| `DUCKDB_MEMORY_LIMIT` | `2GB` | DuckDB memory ceiling |
| `DUCKDB_THREADS` | `4` | Parallel worker count |

### Sandbox

| Variable | Default | Purpose |
|---|---|---|
| `SANDBOX_ENABLED` | `false` | `true` uses Docker; `false` uses local subprocess |
| `SANDBOX_TIMEOUT_SECONDS` | `30` | Wall time |
| `SANDBOX_MEMORY_LIMIT_MB` | `2048` | Memory cap in Docker mode |
| `SANDBOX_NETWORK_DISABLED` | `true` | Disable network in Docker mode |
| `SANDBOX_MAX_OUTPUT_BYTES` | `1048576` | Truncate stdout at 1 MB |

### Guardrails

| Variable | Default | Purpose |
|---|---|---|
| `MAX_QUERY_ROWS` | `100000` | Row cap per DuckDB query |
| `QUERY_TIMEOUT_SECONDS` | `60` | Query timeout |
| `MAX_CONCURRENT_RUNS` | `5` | Concurrent orchestrator runs |

### Auth

| Variable | Default | Purpose |
|---|---|---|
| `AUTH_ENABLED` | `false` | `false` = single-user anonymous mode |
| `JWT_SECRET_KEY` | - | JWT signing key (rotate in production) |
| `JWT_ALGORITHM` | `HS256` | JWT algorithm |
| `JWT_ACCESS_TOKEN_MINUTES` | `1440` | Token lifetime (24h) |
| `AUTH_MIN_PASSWORD_LENGTH` | `8` | Min password length |
| `AUTH_RESET_TOKEN_MINUTES` | `30` | Password reset link validity |
| `AUTH_SHOW_RESET_LINK` | `false` | Dev-only: expose reset URL in API response |

### SMTP (password reset email)

| Variable | Default | Purpose |
|---|---|---|
| `SMTP_ENABLED` | `false` | `true` emails reset links; `false` logs them |
| `SMTP_HOST` | - | e.g. `smtp.gmail.com` |
| `SMTP_PORT` | `587` | 587 (STARTTLS), 465 (SSL), 25 (plain) |
| `SMTP_USERNAME` | - | SMTP user |
| `SMTP_PASSWORD` | - | SMTP password or app password |
| `SMTP_FROM_EMAIL` | - | From address |
| `SMTP_FROM_NAME` | Glassbox | From display name |
| `SMTP_USE_TLS` | `true` | STARTTLS |
| `SMTP_USE_SSL` | `false` | Implicit TLS |
| `SMTP_TIMEOUT_SECONDS` | `15` | Send timeout |

### Rate limiting

| Variable | Default | Purpose |
|---|---|---|
| `RATE_LIMIT_ENABLED` | `true` | Kill switch |
| `RATE_LIMIT_LOGIN` | `10/minute` | Login attempts |
| `RATE_LIMIT_REGISTER` | `5/hour` | Registrations |
| `RATE_LIMIT_FORGOT` | `5/hour` | Password reset requests |
| `RATE_LIMIT_RESET` | `10/hour` | Password reset submissions |
| `RATE_LIMIT_CHAT` | `30/minute` | Analysis runs |
| `RATE_LIMIT_EXECUTE` | `60/minute` | Edit-and-run executions |
| `RATE_LIMIT_STORAGE` | `memory://` | `memory://` or `redis://...` |

### Audit

| Variable | Default | Purpose |
|---|---|---|
| `AUDIT_RETENTION_DAYS` | `90` | Prune events older than this. `0` = keep forever |

---

## Feature guide

### Data sources

**Location:** `/sources`

Two ways to bring data in:

#### File upload

Drag-and-drop or click to upload:

- CSV / TSV
- XLSX / XLS (converted to CSV server-side, BOM-stripped)
- Parquet
- JSON / JSONL

On upload, the backend:
1. Saves the file to `UPLOAD_DIR`
2. Profiles it with DuckDB (`read_csv_auto` / `read_parquet` / `read_json_auto`)
3. Detects the delimiter, types, encoding, and BOM
4. Computes per-column stats: null rate, cardinality, sample rows
5. Registers a view named `<sanitized_stem>_<uuid6>`
6. Persists a `Dataset` row in SQLite

The dataset card shows: name, table name, row count, column count, type, and
column chips.

#### Database connections

Click **Connect source** to open the connection wizard:

- **PostgreSQL** - also works for Aurora PG, Azure Database for PostgreSQL
- **MySQL / MariaDB** - also works for Aurora MySQL
- **SQLite** - point at a `.db` file

Credentials are encrypted at rest with a Fernet key derived from `SECRET_KEY`.
Never stored in plaintext.

On save, the connector:
1. Attaches the source to DuckDB via native `ATTACH` (`postgres`, `mysql`, or
   `sqlite` extension)
2. Discovers visible schemas and tables
3. Caches the schema so the UI can render it without reconnecting
4. Records connection health (`healthy` / `error`)

At query time, each remote table is exposed as a local view with a sanitized
name like `public_orders_1a2b3c`. This means **cross-source joins work out of the
box** - the LLM sees a flat namespace.

---

### Agent pipeline

**Location:** `/workspace`

When you ask a question, the orchestrator runs a sequence of agents. Each step
emits a Server-Sent Event that the frontend renders live.

| Step | Agent | What it does |
|---|---|---|
| 1. Planning | Orchestrator | Classifies intent, assembles scope |
| 2. Schema | DuckDB | Introspects tables + samples rows for the LLM prompt |
| 3. Query | SQL Agent | Generates read-only SQL, validates via `EXPLAIN`, repairs on error |
| 4. Execute | DuckDB | Runs the query with a row cap |
| 5. Compute | Python Agent | Writes a pandas script for deeper analysis |
| 6. Translate | DAX Agent | Produces the Power BI equivalent (measure or calculated table) |
| 7. Visualize | Viz Agent + KPI Agent | Chooses chart type; detects KPI-shaped answers |
| 8. Narrative | Narrative Agent | Streams the human-readable answer token by token |
| 9. Quality | Quality Agent | Reviews the answer against the rows; flags issues |
| 10. Trace | Orchestrator | Emits the full execution timeline |
| - | Persist | Writes everything to `analysis_runs` |

The workspace shows:

- **Agent rail** - each step with spinner → checkmark, elapsed time
- **Answer card** - summary, findings, caveats, confidence badge
- **KPI cards** - when the answer is a scalar or has a trend
- **Chart** - with a data-table toggle
- **SQL card** - the generated query with a `validated` chip
- **Python card** - the generated pandas script
- **DAX card** - the Power BI equivalent

**Streaming:** The narrative is streamed token by token. A live "writing…" card
appears with a blinking cyan caret. When the structured answer lands, it
replaces the live card.

---

### Inspector

**Location:** right-hand panel in the workspace

Five tabs, each rendered with Monaco:

| Tab | Content |
|---|---|
| **SQL** | Generated query, syntax-highlighted, editable, ⌘↵ to run |
| **Python** | Generated pandas script, editable, ⌘↵ to run |
| **DAX** | Power BI measure or calculated table, custom DAX syntax |
| **Trace** | Every orchestrator step with millisecond timestamps |
| **Assumptions** | Business-glossary terms used + quality review |

**Edit-and-run:** every panel has a **Run** button (or ⌘↵ inside Monaco). This
re-executes the edited code against the same datasets and sources the original
run used. Results render inline. A yellow `edited` chip appears when the code
differs from the generated version.

**Diff view:** click **diff** on an edited SQL or Python panel to see a
side-by-side comparison. Removed lines are red, added lines are green.

**Save to history:** after a successful edit-and-run, click **Save to history**
to persist it as a new `AnalysisRun`. It shows up in History with an `[edited]`
prefix.

The inspector auto-opens on the first run of the session and respects your
manual close afterwards.

---

### Charts and KPIs

**Chart types:** bar, line, area, scatter, table.

The Visualization Agent picks one based on the question and the shape of the
result:

| Question | Chart |
|---|---|
| "Show revenue by region" | Bar |
| "Show monthly trend" | Line or area |
| "Scatter revenue vs margin" | Scatter |
| "What is the total?" | Table (single row) |

Every chart has:
- A **data table** toggle - shows the exact rows behind the chart
- **CSV** export - downloads the underlying data
- **PNG** export - renders the SVG to a 2× PNG on a navy background

**KPI cards:** when the result is a single row (all numerics become cards) or a
time series with a KPI-style question (single card with a sparkline), KPI cards
appear above the chart. No LLM call - pure Python detection.

---

### Filters

**Location:** thin bar between the workspace canvas and the composer

Add filters like:
- `region in APAC, EMEA`
- `order_date between 2025-01-01 and 2025-12-31`
- `revenue > 10000`
- `customer_email contains @gmail.com`

**How it works:** filters are applied at the **DuckDB view level**, not by
prompt. Each table is registered as a hidden `__raw` view plus a filtered view
that the agent sees. The LLM literally cannot escape the filter - the raw data
is not addressable.

**Persistence:** filters live in the URL as base64 JSON (`?f=...`). Refresh,
bookmark, and share all preserve them. Filters also persist across follow-up
questions in the same conversation.

**Cross-table:** filters apply to every table that has the matching column. If
you filter `region = APAC` and both `sales` and `customers` have `region`,
both are filtered.

---

### Conversation context

**Location:** implicit in the workspace

Every question gets a `conversation_id` (stored in the URL as `?c=...`).
Follow-up questions in the same conversation see the **last 3 turns** -
question + SQL + row count - injected as a compact block into the SQL agent's
prompt.

Example:

```
Turn 1: "Show total revenue by region"
   → SELECT region, SUM(revenue) FROM sales GROUP BY region

Turn 2: "Now break that down by channel"
   → SELECT region, channel, SUM(revenue) FROM sales
     GROUP BY region, channel
```

The agent carries forward the metric and the prior dimension, adding the new
one. It never just repeats the previous query.

Click **new conversation** to reset. The chip in the header shows the current
conversation ID.

---

### DAX generation

Every run generates the Power BI DAX equivalent of the SQL - either a
**measure** (scalar question) or a **calculated table** (grouped question).

Example for "Show total revenue by region":

```dax
// Revenue by Region
SUMMARIZECOLUMNS(
    Sales[region],
    "Total Revenue", SUM(Sales[revenue])
)
```

The DAX card and inspector tab include:
- Custom DAX syntax highlighting (keywords, functions, columns)
- **Copy** button
- **`.dax`** download
- A **"How to use in Power BI"** hint with paste instructions

DAX is **not executed** - it's a starting point for a Power BI model. Table and
column names come from the DuckDB schema; you may need to rename them in your
Power BI model.

---

### Edit-and-run

**Location:** inspector SQL and Python tabs

Every generated artifact is editable in Monaco. Click **Run** (or press ⌘↵
inside the editor) to re-execute it against the same data scope.

**What happens:**
1. Frontend sends `POST /execute/sql` or `/execute/python` with the edited code
   and the dataset/source IDs
2. Backend loads a fresh DuckDB with those sources
3. Enforces read-only (SQL) or sandbox limits (Python)
4. Returns structured results

**SQL results:** a live result table appears below the editor with row count,
elapsed time, and a truncation chip if the result was capped at 1,000 rows.

**Python results:** stdout is captured, with exit code and elapsed time.

**Diff mode:** toggle **diff** to see original vs. edited side-by-side.
Removed lines are red, added lines are green.

**Save to history:** after a successful run, click **Save to history** to
persist it as a new `AnalysisRun`. It appears in History with an `[edited]`
prefix.

---

### Templates

**Location:** `/templates`

Reusable analysis playbooks. Two kinds:

- **Built-in** - 10 seeded templates (revenue diagnostics, top-N performers,
  time series trend, distribution check, segment comparison, data quality scan,
  period-over-period, correlation analysis, anomaly detection, customer
  segmentation). Read-only.
- **Custom** - your own, fully editable, private to your account.

Each template has: name, description, question, tags.

Click **Use** to run the template in the workspace. The usage counter
increments.

**On Home:** the top 3 most-used templates appear below the profile-derived
suggestions - only if you've used at least one template.

---

### Metrics (semantic layer)

**Location:** `/metrics`

The business glossary. Define what "Revenue", "Gross margin", "Active customer"
mean in your organization. Every subsequent question uses these definitions.

Each metric has:
- **Name** - canonical term (e.g. "Revenue")
- **Category** - grouping (e.g. "Financial")
- **Synonyms** - alternate ways users might phrase it ("sales", "turnover")
- **Description** - what it means
- **SQL expression** - suggested structure for the LLM

**6 built-in metrics** are seeded on startup:

| Metric | Category |
|---|---|
| Revenue | Financial |
| Gross margin | Financial |
| Order count | Operations |
| Average order value | Financial |
| Customer count | Customer |
| Growth rate | Financial |

**How it affects the agent:** before each SQL call, the relevant metrics are
loaded (matched against the question text) and injected into the prompt as a
`BUSINESS GLOSSARY` block. The SQL agent is instructed to use these definitions
authoritatively.

**Editing:** built-ins are read-only. Duplicate as a custom metric to modify.

---

### History

**Location:** `/history`

Every run persists to SQLite with:
- Question, status, elapsed time
- SQL, Python, DAX text
- Full answer payload (summary, findings, caveats)
- Chart spec, trace, dataset/source IDs
- Conversation ID
- Error message (if any)

**List view:** color-coded status, relative timestamp, elapsed time, dataset
count. Filter by conversation, click to open detail.

**Detail view:** the same inspector experience as the workspace - SQL, Python,
DAX, Trace, Assumptions tabs. Plus:
- **Re-run** button - opens the workspace with the same question
- **Full CSV** - re-runs the SQL and downloads all rows (not capped at 500)
- **JSON** - downloads the entire run as formatted JSON
- **Delete** - with confirmation

---

### Audit log

**Location:** `/audit`

Every security-relevant action is logged:

| Category | Actions |
|---|---|
| Auth | register, login, login_failed, password_reset_requested, password_reset_completed |
| Datasets | upload, delete |
| Sources | create, refresh, delete |
| Runs | delete |
| Templates | create, update, delete |
| Metrics | create, update, delete |
| System | clear_runs, clear_datasets |
| Rate limiting | hit |

Each event captures: actor (user ID + denormalized username), action, target
(type + ID), details (JSON), IP, user agent, and timestamp.

**Retention:** events older than `AUDIT_RETENTION_DAYS` (default 90) are pruned
on startup. Set to `0` to keep forever.

**Never logged:** passwords, tokens, secrets, API keys, email bodies. The
`audit()` helper defensively redacts keys containing `password`, `token`,
`secret`, or `api_key`.

**UI:** filter by action, date range, or free-text search. Color-coded by
category (cyan = auth, violet = datasets, green = sources, etc.). Expand any row
to see the full details JSON.

---

### Export

Every generated artifact is exportable:

| Artifact | Format | Where |
|---|---|---|
| Chart data | CSV | Chart card |
| Chart image | PNG (2× scale) | Chart card |
| SQL query | `.sql` | Inspector SQL tab |
| Python script | `.py` | Inspector Python tab |
| DAX expression | `.dax` | Inspector DAX tab |
| Full run | JSON | History detail |
| All rows | CSV | History detail (**Full CSV** - re-runs SQL) |

Filenames are timestamped and sanitized for cross-platform safety.

---

### Command palette

**Trigger:** ⌘K (macOS) / Ctrl+K (Windows)

The palette searches and navigates:

- **Navigation** - Home, Sources, Workspace, History, Templates, Metrics,
  Audit, Settings
- **Recent runs** - click any past question to open its detail view
- **Templates** - click to run in the workspace
- **Actions** - Toggle inspector, new analysis

**Keyboard:**
- `↑` / `↓` - navigate (auto-scrolls to keep the active row visible)
- `↵` - execute
- `ESC` - close

---

### Settings

**Location:** `/settings`

Six sections:

**Account** - username, email, active status, join date, sign-out (when auth
is enabled). Shows a single-user mode message when auth is off.

**LLM Provider** - provider name, model, temperature, max tokens. No API key
exposure. Note explains how to swap providers via `.env`.

**Execution limits** - max upload size, max rows per query, query timeout,
sandbox mode (Docker vs local subprocess), max concurrent runs.

**Storage & activity** - four stat cards (datasets, sources, runs,
conversations) plus total bytes on disk for uploads and artifacts.

**System** - app version, environment, display timezone.

**Danger zone** - two destructive actions, both with confirmation:
- **Clear run history** - deletes all `AnalysisRun` rows
- **Delete all datasets** - deletes all `Dataset` rows and their files

---

### Auth and password reset

**Toggle:** `AUTH_ENABLED=true` in `.env`

When enabled:
- **Register** - email, username, password (min length from config)
- **Login** - accepts username OR email
- **JWT** - stored in localStorage, sent as `Authorization: Bearer <token>`
- **Per-user scoping** - every dataset, source, run, template, metric belongs
  to one user

**Rate limiting:**
- Login: 10/minute
- Register: 5/hour
- Forgot: 5/hour
- Reset: 10/hour

**Password reset flow:**

1. `/forgot-password` - enter email
2. Backend generates a 32-byte URL-safe token, stores only its SHA-256 hash
3. If SMTP is configured, emails the reset link
4. If SMTP is off, logs the link to the server console
5. Link goes to `/reset-password?token=...`
6. Token is single-use, expires in 30 minutes

**Email enumeration is impossible** - the forgot endpoint always returns 200
regardless of whether the email exists.

**Email delivery (SMTP):**

Works with any SMTP provider: Gmail, Outlook, SendGrid, Mailgun, AWS SES,
Postmark, Mailtrap. Configure via `.env`. When `SMTP_ENABLED=false`, emails are
skipped and links are only logged.

**Fail-soft:** if SMTP is down, the endpoint still returns 200 and logs a
warning. Users see the generic success message.

---

## Agent architecture

The orchestrator coordinates six specialized agents. Each one is a thin wrapper
around one LLM concern.

### SQL Agent

**File:** `backend/app/agents/sql_agent.py`

Generates DuckDB SQL from natural language + schema + business glossary +
prior conversation context.

- Uses JSON-mode LLM output
- Validates with `EXPLAIN` before executing
- On error, re-prompts once with the parser error message
- Never emits writes - the DuckDB layer rejects them independently

### Python Agent

**File:** `backend/app/agents/python_agent.py`

Writes a compact pandas script for deeper analysis. The script is **not
executed here** - the orchestrator hands it to the sandbox separately so the
agent stays pure.

### DAX Agent

**File:** `backend/app/agents/dax_agent.py`

Reads the schema and the SQL that was already generated, produces the Power BI
equivalent. Chooses between a **measure** (scalar) or **calculated table**
(grouped) based on the question shape.

### Visualization Agent

**File:** `backend/app/agents/visualization.py`

Chooses a chart type and encodes a spec. Falls back to column-type inference if
the LLM returns garbage, so a chart always renders.

### Narrative Agent

**File:** `backend/app/agents/narrative.py`

Turns rows into a human-readable answer. Two modes:
- **Streaming** - token-by-token, in a strict text format
  (summary + `FINDINGS:` + `CAVEATS:`)
- **Fallback** - one-shot JSON if streaming fails

The prompt hard-restricts the model to facts visible in the rows.

### Quality Agent

**File:** `backend/app/agents/quality.py`

Reviews the answer against the rows:
- Local checks: small sample warning, entirely-null columns, high null rate
- LLM review: confidence (high / medium / low), warnings, verdict

### KPI Agent

**File:** `backend/app/agents/kpi.py`

Deterministic detection - no LLM call. Rules:
1. Single row → one card per numeric column
2. Time series + KPI-style question + one numeric column → one card with a
   sparkline
3. Otherwise → no cards

---

## Security model

### SQL

- Only `SELECT` / `WITH` statements are allowed
- Every query wrapped in `SELECT * FROM (user_query) LIMIT max_rows`
- Forbidden keyword scan (INSERT, UPDATE, DELETE, DROP, CREATE, ALTER,
  TRUNCATE, ATTACH, COPY, PRAGMA)
- `EXPLAIN` runs before execution

### Python

- Runs in an isolated subprocess (`-I` mode) or Docker container
- CPU, memory, wall-time, filesystem, and network caps
- `PYTHON*` environment variables stripped from the child process
- Output truncated at `SANDBOX_MAX_OUTPUT_BYTES`

### Credentials

- Encryption: Fernet symmetric, key derived from `SECRET_KEY` via SHA-256
- Never logged
- Not returned in any API response
- `audit()` helper redacts `password` / `token` / `secret` / `api_key` keys

### Auth

- Passwords: bcrypt, cost 12
- JWT: HS256, issuer claim enforced
- Token verified on every protected endpoint
- Reset tokens: 32 bytes of entropy, SHA-256 hashed at rest, single-use,
  time-limited

### Rate limiting

- Per-user (JWT hash) for authenticated endpoints
- Per-IP for anonymous endpoints
- Configurable per endpoint

### Prompt injection

- System prompts are separated from user content
- Tool outputs are validated before reuse
- Schema is authoritative - the LLM is instructed not to invent columns

---

## API reference

Full interactive docs at http://localhost:8000/docs when `APP_DEBUG=true`.

### Health

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Liveness + provider info |

### Auth

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/auth/config` | Public: is auth enabled, is email enabled |
| POST | `/api/v1/auth/register` | Create account |
| POST | `/api/v1/auth/login` | Exchange credentials for JWT |
| GET | `/api/v1/auth/me` | Current user |
| POST | `/api/v1/auth/forgot-password` | Generate reset link |
| POST | `/api/v1/auth/reset-password` | Consume token + set password |

### Datasets

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/datasets/upload` | Upload + profile a file |
| GET | `/api/v1/datasets` | List current user's datasets |
| GET | `/api/v1/datasets/{id}` | Fetch one |
| DELETE | `/api/v1/datasets/{id}` | Delete row + file |

### Data sources

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/sources/test` | Test a connection (no save) |
| POST | `/api/v1/sources` | Create + test |
| GET | `/api/v1/sources` | List |
| GET | `/api/v1/sources/{id}` | Fetch one |
| POST | `/api/v1/sources/{id}/refresh` | Re-test |
| GET | `/api/v1/sources/{id}/tables` | Table + column discovery |
| DELETE | `/api/v1/sources/{id}` | Remove |

### Chat

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/chat/stream` | SSE stream of a run |

### Columns (for filters)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/columns` | Column metadata across datasets |

### Execute (edit-and-run)

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/v1/execute/sql` | Run edited SQL |
| POST | `/api/v1/execute/python` | Run edited Python |
| POST | `/api/v1/execute/save` | Persist edit-run as new run |

### Suggestions

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/suggestions` | Profile-derived question suggestions |

### Runs

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/runs` | List (paginated) |
| GET | `/api/v1/runs/{id}` | Full run |
| GET | `/api/v1/runs/{id}/export.json` | Download JSON |
| GET | `/api/v1/runs/{id}/export.csv` | Re-run + download all rows |
| DELETE | `/api/v1/runs/{id}` | Delete |

### Templates

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/templates` | List built-ins + user's |
| POST | `/api/v1/templates` | Create |
| GET | `/api/v1/templates/{id}` | Fetch one |
| PATCH | `/api/v1/templates/{id}` | Update |
| POST | `/api/v1/templates/{id}/use` | Bump usage counter |
| DELETE | `/api/v1/templates/{id}` | Delete |

### Metrics

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/metrics` | List built-ins + user's |
| POST | `/api/v1/metrics` | Create |
| GET | `/api/v1/metrics/{id}` | Fetch one |
| PATCH | `/api/v1/metrics/{id}` | Update |
| DELETE | `/api/v1/metrics/{id}` | Delete |

### Audit

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/audit` | List events (filterable) |
| GET | `/api/v1/audit/actions` | Action catalog |
| GET | `/api/v1/audit/{id}` | Single event |

### System

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/v1/system/info` | Config + stats |
| POST | `/api/v1/system/clear-runs` | Delete all runs |
| POST | `/api/v1/system/clear-datasets` | Delete all datasets |

---

## Data model

### `users`

`id`, `email`, `username`, `hashed_password`, `is_active`, `is_superuser`,
`created_at`

### `datasets`

`id`, `user_id`, `name`, `table_name`, `file_path`, `file_type`, `row_count`,
`column_count`, `profile` (JSON), `created_at`

### `data_sources`

`id`, `user_id`, `name`, `kind`, `host`, `port`, `database`, `username`,
`password_enc`, `ssl_mode`, `tables` (JSON), `status`, `last_error`,
`last_tested_at`, `created_at`

### `analysis_runs`

`id`, `user_id`, `conversation_id`, `question`, `status`, `sql_text`,
`python_text`, `dax_text`, `answer`, `chart_spec` (JSON), `trace` (JSON),
`dataset_ids` (JSON), `source_ids` (JSON), `error`, `elapsed_ms`, `created_at`,
`completed_at`

### `templates`

`id`, `user_id`, `name`, `description`, `question`, `tags` (JSON),
`is_builtin`, `usage_count`, `created_at`

### `metrics`

`id`, `user_id`, `name`, `description`, `sql_expression`, `synonyms` (JSON),
`category`, `is_builtin`, `created_at`

### `audit_events`

`id`, `user_id`, `username`, `action`, `target_type`, `target_id`,
`details` (JSON), `ip`, `user_agent`, `created_at`

Indexed on `(action, created_at)` and `(user_id, created_at)`.

### `password_reset_tokens`

`id`, `user_id`, `token_hash`, `expires_at`, `used_at`, `created_at`

---

## Deployment

### Docker Compose

Create `docker-compose.yml` at the repo root:

```yaml
version: "3.9"

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    env_file: .env
    volumes:
      - ./data:/app/data
      - /var/run/docker.sock:/var/run/docker.sock
    restart: unless-stopped

  frontend:
    build: ./frontend
    ports:
      - "5173:5173"
    environment:
      - VITE_API_URL=http://localhost:8000
    depends_on:
      - backend
    restart: unless-stopped
```

### Production checklist

- [ ] Set `APP_ENV=production`, `APP_DEBUG=false`
- [ ] Generate fresh `SECRET_KEY` and `JWT_SECRET_KEY`
- [ ] Set `AUTH_ENABLED=true`
- [ ] Configure SMTP for password resets
- [ ] Set `RATE_LIMIT_STORAGE=redis://...` if running multiple workers
- [ ] Set `SANDBOX_ENABLED=true` with a built sandbox image
- [ ] Configure `CORS_ORIGINS` for your domain
- [ ] Put a reverse proxy (nginx / Caddy) in front and set `X-Forwarded-For`
- [ ] Back up `data/app.db` and `data/uploads/` regularly
- [ ] Set `AUDIT_RETENTION_DAYS` appropriately

### One-click deploy recipes

- **Railway** - connect repo, set env vars, deploy
- **Fly.io** - `fly launch`, mount a volume at `/app/data`, set env vars
- **Render** - Web Service + Persistent Disk
- **Fly.io + Vercel** - backend on Fly, frontend on Vercel

---

## Roadmap

**Shipped**

- Multi-provider LLM abstraction
- DuckDB engine, file profiling, DB connectors
- 7 agents (SQL, Python, DAX, Viz, Narrative, Quality, KPI)
- Multi-turn conversation context
- Semantic layer (business glossary)
- Templates
- Auth + JWT + password reset with email
- Filters (DuckDB-level scoping)
- Audit log
- Rate limiting
- Streaming narrative
- Full frontend (11 pages, 5-tab inspector, ⌘K palette)
- Export (CSV/JSON/PNG/.sql/.py)
- Edit-and-run (Monaco, diff, save-to-history)
- Settings, system info, danger zone

**Planned (Group 2 - Intelligence)**

- "Explain this SQL" button
- "Why this query" explanations
- Auto-suggest next questions
- Query history autocomplete
- Chart drill-down
- Anomaly detection agent
- Auto-dashboard

**Planned (Group 3 - UX polish)**

- Dark/light theme toggle
- SQL formatter
- Global keyboard shortcuts
- Inline-ask in command palette
- Onboarding tour
- Saved analyses / pinning
- Multi-file upload
- Chart type override
- Column-level drill-down

**Planned (Group 4 - Governance)**

- PII detection + column masking
- Conversation threads in History
- Webhooks

**Planned (Group 5 - Advanced)**

- Multi-modal input (paste a chart image)

---

## License

MIT -->
<div align="center">

# 🧊 GLASSBOX

### *Transparency in Code. Power in Architecture.*

[![Status](https://img.shields.io/badge/STATUS-UNDER%20CONSTRUCTION-orange?style=for-the-badge\&logo=githubactions\&logoColor=white)](#)
[![Commits](https://img.shields.io/badge/COMMITS-124-blue?style=for-the-badge\&logo=git\&logoColor=white)](#)
[![Builder](https://img.shields.io/badge/BUILDER-KushagraKumar04-purple?style=for-the-badge\&logo=github\&logoColor=white)](#)
[![Stars](https://img.shields.io/github/stars/KushagraKumar04/Glassbox?style=for-the-badge\&logo=github\&color=yellow)](https://github.com/KushagraKumar04/Glassbox)

> **"The best way to predict the future is to build it."**

</div>

---

## 🚧 Pardon Our Dust: The Builder is at Work 🚧

Welcome to **Glassbox**.

Right now, this repository isn't just a codebase - it's a construction site. The scaffolding is up, the foundation is poured, and the architect (that's me) is currently welding the core components together.

A **Glassbox** implies transparency - a system where you can see exactly how the gears turn. We are currently in the early, chaotic, and incredibly exciting phase of bringing this vision to life.

> [!WARNING]
> **Work in Progress:** This project is under active development. Expect breaking changes, half-built features, and the occasional spark.

---

## 📊 Current Progress

```text
Frontend Architecture  [██████████----------]  50% 🎨
Backend Systems        [██████████████------]  70% ⚙️
Core Logic Integration [██████--------------]  30% 🧠
Overall Construction   [████████------------]  45% 🚀
```

---

## 🏗️ The Blueprint (What's Being Built)

While the final shape is still taking form, the anatomy of **Glassbox** is already visible in the repository.

We are bridging the gap between a highly responsive frontend and a robust, scalable backend.

### 📁 `frontend/`

The face of the operation.

Currently being styled and optimized, with recent updates focused on `index.css` and the overall frontend architecture.

**Focus areas:**

* 🎨 Modern UI/UX
* ⚡ Responsive interactions
* 🧩 Reusable components
* 🚀 Performance optimization

### 📁 `backend/`

The engine room.

The backend architecture and data models are actively being sculpted to ensure data integrity, maintainability, and performance.

**Focus areas:**

* ⚙️ RESTful APIs
* 🗄️ Database modeling
* 🔐 Secure backend architecture
* 🧩 Modular API design

### 🔐 Environment Control

Secure configuration is managed through environment variables.

Use `.env.example` as the reference for setting up your local `.env` configuration.

> **Never commit secrets, API keys, passwords, or private credentials to the repository.**

---

## 🛠️ The Builder's Workbench

Glassbox is being forged with modern, industry-standard technologies and an architecture designed for modularity and scalability.

| Layer              | Technology / Approach                              |
| ------------------ | -------------------------------------------------- |
| 🎨 Frontend        | Modern UI principles, component-driven development |
| ⚙️ Backend         | RESTful architecture                               |
| 🗄️ Data           | Structured database modeling                       |
| 🔐 Configuration   | Environment-based configuration                    |
| 🌿 Version Control | Git & GitHub                                       |
| 🧩 Architecture    | Modular, scalable design                           |



## 🗺️ The Roadmap to Reality

Here is what the builder is plotting next:

* [x] Initialize repository & core architecture
* [x] Establish backend data models
* [ ] Finalize frontend UI/UX design
* [ ] Connect frontend and backend APIs
* [ ] Implement authentication & security layers
* [ ] Write comprehensive tests
* [ ] Optimize production architecture
* [ ] **LAUNCH DAY 🚀**

---

<div align="center">

## 🌟 Fuel the Builder's Engine 🌟

Building a project from scratch takes time, caffeine, and a lot of late nights.

If you believe in the vision of **Glassbox** and want to see it cross the finish line, the absolute best way to support the project is to **Star this repository!**

Your star is like a virtual high-five. ⭐

It keeps the motivation high, helps others discover the project, and gives the builder another reason to keep pushing forward.

<br>

[![⭐ Star this Repo](https://img.shields.io/badge/%E2%AD%90%20Star%20this%20Repo-Show%20Some%20Love-yellow?style=for-the-badge\&logo=github)](https://github.com/KushagraKumar04/Glassbox)

</div>

---

<div align="center">

<i>Built with ❤️, ☕, and a lot of late nights by <b>Kushagra Kumar</b>.</i>

<br>

<b>Check back soon. The glass is about to become crystal clear. 🔮</b>

</div>
