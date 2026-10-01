import { apiDelete, apiGet, apiPost } from "@/lib/http";

export interface Metric {
  id: string;
  user_id: string | null;
  name: string;
  description: string;
  sql_expression: string;
  synonyms: string[];
  category: string;
  is_builtin: boolean;
  created_at: string;
}

export interface MetricIn {
  name: string;
  description: string;
  sql_expression: string;
  synonyms: string[];
  category: string;
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const { API_BASE } = await import("@/config/constants");
  const { tokenStore } = await import("@/features/auth/api");
  const token = tokenStore.get();
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(detail || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const metricsApi = {
  list: () => apiGet<Metric[]>("/metrics"),
  create: (m: MetricIn) => apiPost<Metric>("/metrics", m),
  update: (id: string, m: MetricIn) => apiPatch<Metric>(`/metrics/${id}`, m),
  remove: (id: string) => apiDelete(`/metrics/${id}`),
};