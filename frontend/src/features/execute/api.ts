import { apiPost } from "@/lib/http";

// ── SQL ──────────────────────────────────────────────────

export interface ExecuteSqlRequest {
  sql: string;
  dataset_ids: string[];
  source_ids: string[];
}

export interface ExecuteSqlResponse {
  ok: boolean;
  error: string;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  elapsed_ms: number;
}

// ── Python ───────────────────────────────────────────────

export interface ExecutePythonRequest {
  code: string;
  dataset_ids: string[];
  source_ids: string[];
}

export interface ExecutePythonResponse {
  ok: boolean;
  status: string;         // "ok" | "error" | "timeout"
  stdout: string;
  exit_code: number;
  elapsed_ms: number;
  artifacts: { name: string; size: number }[];
}

// ── Save edited run ──────────────────────────────────────

export interface SaveEditedRunRequest {
  question: string;
  sql_text: string;
  python_text: string;
  answer_summary: string;
  dataset_ids: string[];
  source_ids: string[];
  elapsed_ms: number;
  parent_run_id?: string;
}

export interface SaveEditedRunResponse {
  ok: boolean;
  run_id: string;
}

// ── API ──────────────────────────────────────────────────

export const executeApi = {
  sql: (req: ExecuteSqlRequest) =>
    apiPost<ExecuteSqlResponse>("/execute/sql", req),

  python: (req: ExecutePythonRequest) =>
    apiPost<ExecutePythonResponse>("/execute/python", req),

  save: (req: SaveEditedRunRequest) =>
    apiPost<SaveEditedRunResponse>("/execute/save", req),
};