import { apiGet } from "@/lib/http";

export interface Suggestion {
  question: string;
  reason?: string;
  dataset?: string;
}

export interface SuggestionsResponse {
  suggestions: Suggestion[];
  source: "datasets" | "default";
}

export const suggestionsApi = {
  list: (datasetIds?: string[], limit = 6) => {
    const params = new URLSearchParams();
    if (datasetIds && datasetIds.length > 0) {
      params.set("dataset_ids", datasetIds.join(","));
    }
    params.set("limit", String(limit));
    return apiGet<SuggestionsResponse>(`/suggestions?${params.toString()}`);
  },
};