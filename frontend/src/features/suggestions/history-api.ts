import { apiGet } from "@/lib/http";

export interface HistoryMatch {
  question: string;
  last_used_at: string;
  count: number;
}

export interface HistoryResponse {
  matches: HistoryMatch[];
}

export const historyApi = {
  search: (q: string, limit = 8, signal?: AbortSignal) => {
    const params = new URLSearchParams();
    params.set("q", q);
    params.set("limit", String(limit));
    return apiGet<HistoryResponse>(
      `/suggestions/history?${params.toString()}`,
      { signal },
    );
  },
};