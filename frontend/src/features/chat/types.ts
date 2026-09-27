/**
 * Frontend mirror of the SSE payloads the backend emits.
 * Keep in sync with backend/app/services/orchestrator.py + agents/*.
 */

export type RunState = "idle" | "running" | "done" | "error";

export type AgentStage =
  | "planning"
  | "schema"
  | "query"
  | "compute"
  | "visualizing";

export type StepStatus = "running" | "done" | "error";

export interface AgentStep {
  stage: AgentStage | string;
  status: StepStatus;
  detail?: string;
  /** ms since run start, set by the trace payload (not by agent_step frames). */
  ts?: number;
}

/* ── Artifacts ───────────────────────────────────────────── */

export interface SqlArtifact {
  kind: "sql";
  content: string;
  valid: boolean;
  explanation?: string;
  assumptions?: string[];
}

export interface PythonArtifact {
  kind: "python";
  content: string;
  explanation?: string;
}
export interface DaxArtifact {
  kind: "dax";
  content: string;
  explanation?: string;
  shape?: "measure" | "table";
}
export interface NextQuestion {
  question: string;
  reason?: string;
}

export interface NextQuestionsArtifact {
  kind: "next_questions";
  questions: NextQuestion[];
}
export interface Anomaly {
  row_index: number;
  column: string;
  value: number;
  mean: number;
  stdev: number;
  z_score: number;
  direction: "high" | "low";
  methods: string[];
}

export interface AnomaliesArtifact {
  kind: "anomalies";
  anomalies: Anomaly[];
  narrative?: string;
}
export type ChartType = "bar" | "line" | "area" | "scatter" | "table";

export interface ChartSpec {
  type: ChartType;
  xKey: string;
  yKeys: string[];
  title: string;
  unit?: string;
  data: Record<string, unknown>[];
  columns: string[];
}

export interface ChartArtifact {
  kind: "chart";
  spec: ChartSpec;
}
export type KPIFormat = "number" | "currency" | "percent";

export interface KPICard {
  label: string;
  value: number;
  unit?: string;
  format: KPIFormat;
  /** Numeric series for a sparkline, when applicable. */
  sparkline?: number[];
}

export interface KPIArtifact {
  kind: "kpi";
  cards: KPICard[];
  /** Optional caption, e.g. "Latest of 24 points". */
  note?: string;
}

export interface AnswerPayload {
  summary: string;
  findings?: string[];
  caveats?: string[];
}

export interface AnswerArtifact {
  kind: "answer";
  content: AnswerPayload;
}

export interface QualityPayload {
  confidence: "high" | "medium" | "low";
  warnings?: string[];
  verdict?: string;
}

export interface QualityArtifact {
  kind: "quality";
  content: QualityPayload;
}

export interface TraceEvent {
  stage: string;
  status: string;
  detail?: string;
  ts: number;
}

export interface TraceArtifact {
  kind: "trace";
  events: TraceEvent[];
}

export interface ErrorArtifact {
  kind: "error";
  message: string;
}

export type Artifact =
  | SqlArtifact
  | PythonArtifact
  | DaxArtifact
  | NextQuestionsArtifact
  | AnomaliesArtifact
  | ChartArtifact
  | KPIArtifact
  | AnswerArtifact
  | QualityArtifact
  | TraceArtifact
  | ErrorArtifact;
/* ── Helpers ─────────────────────────────────────────────── */

export function findArtifact<T extends Artifact["kind"]>(
  artifacts: Artifact[],
  kind: T,
): Extract<Artifact, { kind: T }> | undefined {
  return artifacts.find((a) => a.kind === kind) as
    | Extract<Artifact, { kind: T }>
    | undefined;
}