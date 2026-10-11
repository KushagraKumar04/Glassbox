import { apiPost } from "@/lib/http";

export interface ExplainStep {
  step: string;
  detail: string;
}

export interface ExplainResponse {
  summary: string;
  steps: ExplainStep[];
  tables: string[];
  columns: string[];
  assumptions: string[];
  warnings: string[];
  cached: boolean;
}

export interface WhyChoice {
  aspect: string;
  chosen: string;
  alternatives: string[];
  reasoning: string;
}

export type WhyConfidence = "high" | "medium" | "low";

export interface WhyResponse {
  rationale: string;
  choices: WhyChoice[];
  confidence: WhyConfidence;
  verify: string[];
  data_caveats: string[];
  cached: boolean;
}

export const explainApi = {
  sql: (sql: string, question: string = "") =>
    apiPost<ExplainResponse>("/explain/sql", { sql, question }),

  why: (
    sql: string,
    question: string = "",
    datasetIds: string[] = [],
    sourceIds: string[] = [],
  ) =>
    apiPost<WhyResponse>("/explain/why", {
      sql,
      question,
      dataset_ids: datasetIds,
      source_ids: sourceIds,
    }),
};