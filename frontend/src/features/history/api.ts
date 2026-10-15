import { apiDelete, apiGet, apiPost } from "@/lib/http";

import type { Artifact, ChartSpec, TraceEvent } from "@/features/chat/types";

export interface RunSummary {
  id: string;
  conversation_id: string | null;
  question: string;
  status: "completed" | "failed" | "pending" | "running";
  elapsed_ms: number;
  dataset_count: number;
  source_count: number;
  pinned: boolean;
  pinned_at: string | null;
  created_at: string;
}

export interface RunFull extends RunSummary {
  sql_text: string;
  python_text: string;
  dax_text: string;
  answer: {
    summary: string;
    findings?: string[];
    caveats?: string[];
  };
  chart_spec: Partial<ChartSpec>;
  trace: TraceEvent[];
  dataset_ids: string[];
  source_ids: string[];
  error: string;
  completed_at: string | null;
}

export const runsApi = {
  list: (limit = 100) => apiGet<RunSummary[]>(`/runs?limit=${limit}`),
  get: (id: string) => apiGet<RunFull>(`/runs/${id}`),
  remove: (id: string) => apiDelete(`/runs/${id}`),
  listPinned: (limit = 12) =>
    apiGet<RunSummary[]>(`/runs/pinned?limit=${limit}`),
  setPinned: (id: string, pinned: boolean) =>
    apiPost<RunSummary>(`/runs/${id}/pin`, { pinned }),
};

/**
 * Convert a persisted run into the same Artifact[] shape the workspace uses
 * so AnswerStream and the inspector panels can render it unchanged.
 */
export function runToArtifacts(run: RunFull): Artifact[] {
  const out: Artifact[] = [];

  if (run.sql_text) {
    out.push({
      kind: "sql",
      content: run.sql_text,
      valid: !run.error,
      explanation: "",
      assumptions: [],
    });
  }

  if (run.python_text) {
    out.push({
      kind: "python",
      content: run.python_text,
      explanation: "",
    });
  }

  if (run.dax_text) {
    out.push({
      kind: "dax",
      content: run.dax_text,
      explanation: "",
      shape: "measure",
    });
  }

  const spec = run.chart_spec as ChartSpec | undefined;
  if (spec && spec.data && Array.isArray(spec.data) && spec.data.length > 0) {
    out.push({ kind: "chart", spec });
  }

  if (run.answer?.summary) {
    out.push({
      kind: "answer",
      content: {
        summary: run.answer.summary,
        findings: run.answer.findings ?? [],
        caveats: run.answer.caveats ?? [],
      },
    });
  }

  if (run.trace?.length) {
    out.push({ kind: "trace", events: run.trace });
  }

  if (run.error) {
    out.push({ kind: "error", message: run.error });
  }

  return out;
}