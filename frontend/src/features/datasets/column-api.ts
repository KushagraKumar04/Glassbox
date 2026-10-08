import { apiGet } from "@/lib/http";

export interface HistogramBucket {
  label: string;
  value: number;
  lower?: number | null;
  upper?: number | null;
}

export interface TopValue {
  value: string;
  count: number;
  pct: number;
}

export interface ColumnStats {
  dataset_id: string;
  table: string;
  column: string;
  kind: "numeric" | "date" | "boolean" | "text";
  dtype: string;
  row_count: number;
  null_count: number;
  null_rate: number;
  distinct_count: number;
  minimum: number | null;
  maximum: number | null;
  mean: number | null;
  median: number | null;
  p25: number | null;
  p75: number | null;
  std: number | null;
  histogram: HistogramBucket[];
  top_values: TopValue[];
  sample: unknown[];
  date_min: string | null;
  date_max: string | null;
  elapsed_ms: number;
}

export const columnApi = {
  stats: (datasetId: string, column: string) =>
    apiGet<ColumnStats>(
      `/datasets/${datasetId}/columns/${encodeURIComponent(column)}`,
    ),
};