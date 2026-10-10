import { apiPost } from "@/lib/http";

export interface DrilldownRequest {
  sql: string;
  column: string;
  value: unknown;
  dataset_ids: string[];
  source_ids: string[];
}

export interface DrilldownResponse {
  ok: boolean;
  error: string;
  column: string;
  value: unknown;
  columns: string[];
  rows: Record<string, unknown>[];
  row_count: number;
  truncated: boolean;
  elapsed_ms: number;
}

export const drilldownApi = {
  run: (req: DrilldownRequest) =>
    apiPost<DrilldownResponse>("/drilldown", req),
};