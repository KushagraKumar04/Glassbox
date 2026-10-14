import { apiGet } from "@/lib/http";

import type { ColumnInfo } from "./types";

export const filtersApi = {
  columns: (datasetIds: string[]) => {
    const p = new URLSearchParams();
    if (datasetIds.length > 0) {
      p.set("dataset_ids", datasetIds.join(","));
    }
    const qs = p.toString();
    return apiGet<ColumnInfo[]>(`/columns${qs ? `?${qs}` : ""}`);
  },
};