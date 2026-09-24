"""
Pydantic request/response schemas — the API contract.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════
#  Chat
# ═══════════════════════════════════════════════════════════════════════════

# ═══════════════════════════════════════════════════════════════════════════
#  Filters
# ═══════════════════════════════════════════════════════════════════════════

FilterOperator = Literal[
    "=", "!=", ">", ">=", "<", "<=",
    "in", "not_in", "between",
    "contains", "not_contains",
    "is_null", "is_not_null",
]


class FilterCondition(BaseModel):
    """
    A single filter condition.

    Value shape depends on operator:
      =, !=, >, >=, <, <=   → scalar
      in, not_in            → list
      between               → [lower, upper]
      contains/not_contains → string
      is_null / is_not_null → ignored
    """
    column: str = Field(..., min_length=1, max_length=255)
    operator: FilterOperator
    value: Any = None


class ChatRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=2000)
    dataset_ids: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    conversation_id: str | None = None
    filters: list[FilterCondition] = Field(default_factory=list)


class ColumnInfo(BaseModel):
    """Column metadata for the filter UI."""
    name: str
    type: str
    kind: Literal["numeric", "date", "boolean", "text"]
    from_datasets: list[str] = Field(default_factory=list)
    distinct_preview: list[Any] = Field(default_factory=list)


class ChatEvent(BaseModel):
    type: Literal[
        "run_started", "agent_step", "artifact",
        "run_complete", "error", "done",
    ]
    payload: dict[str, Any] = Field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════
#  Dataset
# ═══════════════════════════════════════════════════════════════════════════

class DatasetOut(BaseModel):
    id: str
    name: str
    table_name: str
    file_type: str
    row_count: int
    column_count: int
    profile: dict[str, Any]
    created_at: str


class ColumnProfile(BaseModel):
    name: str
    type: str
    total: int | None = None
    nulls: int | None = None
    cardinality: int | None = None
    null_rate: float | None = None


class DatasetProfile(BaseModel):
    table: str
    row_count: int
    column_count: int
    columns: list[ColumnProfile]
    sample: list[dict[str, Any]]
    source_path: str


# ═══════════════════════════════════════════════════════════════════════════
#  DataSource
# ═══════════════════════════════════════════════════════════════════════════

SourceKind = Literal["postgres", "mysql", "sqlite"]


class SourceCredentials(BaseModel):
    """Ephemeral — never persisted directly."""
    host: str = ""
    port: int = 0
    database: str = ""
    username: str = ""
    password: str = ""
    ssl_mode: str = "prefer"


class SourceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    kind: SourceKind
    host: str = ""
    port: int = 0
    database: str = ""
    username: str = ""
    password: str = ""
    ssl_mode: str = "prefer"


class SourceTest(BaseModel):
    """Test a connection without saving it."""
    kind: SourceKind
    host: str = ""
    port: int = 0
    database: str = ""
    username: str = ""
    password: str = ""
    ssl_mode: str = "prefer"


class SourceOut(BaseModel):
    id: str
    name: str
    kind: str
    host: str
    port: int
    database: str
    username: str
    ssl_mode: str
    status: str
    last_error: str
    last_tested_at: str | None
    created_at: str
    table_count: int
    tables: list[dict[str, Any]] = []


class SourceTestResult(BaseModel):
    ok: bool
    error: str = ""
    tables: list[dict[str, Any]] = []
    table_count: int = 0


# ═══════════════════════════════════════════════════════════════════════════
#  Runs
# ═══════════════════════════════════════════════════════════════════════════

class RunSummary(BaseModel):
    id: str
    conversation_id: str | None = None
    question: str
    status: str
    elapsed_ms: int
    dataset_count: int = 0
    source_count: int = 0
    created_at: str


# ═══════════════════════════════════════════════════════════════════════════
#  Auth
# ═══════════════════════════════════════════════════════════════════════════

class RegisterRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)
    username: str = Field(..., min_length=3, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)


class LoginRequest(BaseModel):
    """Accepts username OR email in the `username` field."""
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class UserOut(BaseModel):
    id: str
    email: str
    username: str
    is_active: bool
    is_superuser: bool
    created_at: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserOut


# ═══════════════════════════════════════════════════════════════════════════
#  Health
# ═══════════════════════════════════════════════════════════════════════════

class HealthOut(BaseModel):
    status: str
    env: str
    provider: str
    model: str
    version: str

# ═══════════════════════════════════════════════════════════════════════════
#  Templates
# ═══════════════════════════════════════════════════════════════════════════

class TemplateIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=500)
    question: str = Field(..., min_length=3, max_length=2000)
    tags: list[str] = Field(default_factory=list)


class TemplateOut(BaseModel):
    id: str
    user_id: str | None
    name: str
    description: str
    question: str
    tags: list[str]
    is_builtin: bool
    usage_count: int
    created_at: str


# ═══════════════════════════════════════════════════════════════════════════
#  Execute (edit-and-run)
# ═══════════════════════════════════════════════════════════════════════════

class ExecuteSqlRequest(BaseModel):
    sql: str = Field(..., min_length=1, max_length=50_000)
    dataset_ids: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)


class ExecuteSqlResponse(BaseModel):
    ok: bool
    error: str = ""
    columns: list[str] = []
    rows: list[dict[str, Any]] = []
    row_count: int = 0
    truncated: bool = False
    elapsed_ms: int = 0


class ExecutePythonRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=20_000)
    dataset_ids: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)


class ExecutePythonResponse(BaseModel):
    ok: bool
    status: str = ""              # ok | error | timeout
    stdout: str = ""
    exit_code: int = 0
    elapsed_ms: int = 0
    artifacts: list[dict[str, Any]] = []

class SaveEditedRunRequest(BaseModel):
    """Persist an edit-and-run as a first-class AnalysisRun."""
    question: str = Field(..., min_length=1, max_length=2000)
    sql_text: str = ""
    python_text: str = ""
    dax_text: str = ""
    answer_summary: str = ""
    dataset_ids: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    elapsed_ms: int = 0
    parent_run_id: str | None = None


class SaveEditedRunResponse(BaseModel):
    ok: bool
    run_id: str

# ═══════════════════════════════════════════════════════════════════════════
#  Metrics (semantic layer)
# ═══════════════════════════════════════════════════════════════════════════

class MetricIn(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    sql_expression: str = Field(default="", max_length=1000)
    synonyms: list[str] = Field(default_factory=list)
    category: str = Field(default="", max_length=64)


class MetricOut(BaseModel):
    id: str
    user_id: str | None
    name: str
    description: str
    sql_expression: str
    synonyms: list[str]
    category: str
    is_builtin: bool
    created_at: str


# ═══════════════════════════════════════════════════════════════════════════
#  Password reset
# ═══════════════════════════════════════════════════════════════════════════

class ForgotPasswordRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=255)


class ForgotPasswordResponse(BaseModel):
    """Always success — never reveals whether the email exists."""
    ok: bool = True
    message: str = (
        "If that email is registered, a reset link has been generated. "
        "Check the server logs."
    )
    # Only populated when AUTH_SHOW_RESET_LINK=true (dev only)
    reset_url: str | None = None


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10, max_length=200)
    new_password: str = Field(..., min_length=1, max_length=256)


# ═══════════════════════════════════════════════════════════════════════════
#  Audit log
# ═══════════════════════════════════════════════════════════════════════════

class AuditEventOut(BaseModel):
    id: str
    user_id: str | None
    username: str
    action: str
    target_type: str
    target_id: str
    details: dict[str, Any]
    ip: str
    user_agent: str
    created_at: str


class AuditPage(BaseModel):
    events: list[AuditEventOut]
    total: int
    limit: int
    offset: int


# ═══════════════════════════════════════════════════════════════════════════
#  SQL Explanation
# ═══════════════════════════════════════════════════════════════════════════

class ExplainStep(BaseModel):
    step: str
    detail: str = ""


class ExplainSqlRequest(BaseModel):
    sql: str = Field(..., min_length=1, max_length=50_000)
    question: str = Field(default="", max_length=2000)


class ExplainSqlResponse(BaseModel):
    summary: str
    steps: list[ExplainStep] = []
    tables: list[str] = []
    columns: list[str] = []
    assumptions: list[str] = []
    warnings: list[str] = []
    cached: bool = False

# ═══════════════════════════════════════════════════════════════════════════
#  Why This Query
# ═══════════════════════════════════════════════════════════════════════════

class WhyChoice(BaseModel):
    aspect: str
    chosen: str
    alternatives: list[str] = []
    reasoning: str = ""


class WhyQueryRequest(BaseModel):
    sql: str = Field(..., min_length=1, max_length=50_000)
    question: str = Field(default="", max_length=2000)
    dataset_ids: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)


class WhyQueryResponse(BaseModel):
    rationale: str
    choices: list[WhyChoice] = []
    confidence: Literal["high", "medium", "low"] = "medium"
    verify: list[str] = []
    data_caveats: list[str] = []
    cached: bool = False


# ═══════════════════════════════════════════════════════════════════════════
#  Next Questions
# ═══════════════════════════════════════════════════════════════════════════

class NextQuestion(BaseModel):
    question: str
    reason: str = ""


class NextQuestionsResponse(BaseModel):
    questions: list[NextQuestion] = []
    cached: bool = False


# ═══════════════════════════════════════════════════════════════════════════
#  Drill-down
# ═══════════════════════════════════════════════════════════════════════════

class DrilldownRequest(BaseModel):
    """Re-run a query filtered to one chart point."""
    sql: str = Field(..., min_length=1, max_length=50_000)
    column: str = Field(..., min_length=1, max_length=255)
    value: Any = None
    dataset_ids: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)


class DrilldownResponse(BaseModel):
    ok: bool
    error: str = ""
    column: str = ""
    value: Any = None
    columns: list[str] = []
    rows: list[dict[str, Any]] = []
    row_count: int = 0
    truncated: bool = False
    elapsed_ms: int = 0

# ═══════════════════════════════════════════════════════════════════════════
#  Auto-dashboard
# ═══════════════════════════════════════════════════════════════════════════

DashboardPanelKind = Literal[
    "kpi", "trend", "comparison", "composition", "table"
]


class DashboardRequest(BaseModel):
    dataset_ids: list[str] = Field(default_factory=list)
    source_ids: list[str] = Field(default_factory=list)
    filters: list[FilterCondition] = Field(default_factory=list)
    max_panels: int = Field(default=8, ge=1, le=16)


class DashboardPanel(BaseModel):
    id: str
    kind: DashboardPanelKind
    title: str
    subtitle: str = ""
    unit: str = ""
    format: str = "number"          # number | currency | percent
    sql: str = ""
    spec: dict[str, Any] = {}       # chart spec (xKey, yKeys, etc.)
    data: list[dict[str, Any]] = []
    value: float | None = None      # for kpi kind
    score: float = 0.0


class DashboardResponse(BaseModel):
    panels: list[DashboardPanel]
    elapsed_ms: int
    dataset_count: int
    source_count: int
    filters_count: int

# ═══════════════════════════════════════════════════════════════════════════
#  Pinning
# ═══════════════════════════════════════════════════════════════════════════

class PinRequest(BaseModel):
    pinned: bool