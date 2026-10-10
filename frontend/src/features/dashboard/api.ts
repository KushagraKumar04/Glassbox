import { apiPost } from "@/lib/http";
import type { FilterCondition } from "@/features/filters/types";

export type DashboardPanelKind =
  | "kpi"
  | "trend"
  | "comparison"
  | "composition"
  | "table";

export interface DashboardPanelData {
  id: string;
  kind: DashboardPanelKind;
  title: string;
  subtitle: string;
  unit: string;
  format: "number" | "currency" | "percent";
  sql: string;
  spec: {
    type?: "bar" | "line" | "area" | "scatter";
    xKey?: string;
    yKeys?: string[];
    title?: string;
  };
  data: Record<string, unknown>[];
  value: number | null;
  score: number;
}

export interface DashboardResponse {
  panels: DashboardPanelData[];
  elapsed_ms: number;
  dataset_count: number;
  source_count: number;
  filters_count: number;
}
