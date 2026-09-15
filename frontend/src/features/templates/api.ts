import { apiDelete, apiGet, apiPost } from "@/lib/http";

export interface Template {
  id: string;
  user_id: string | null;
  name: string;
  description: string;
  question: string;
  tags: string[];
  is_builtin: boolean;
  usage_count: number;
  created_at: string;
}

export interface TemplateIn {
  name: string;
  description: string;
  question: string;
  tags: string[];
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

export const templatesApi = {
  list: () => apiGet<Template[]>("/templates"),
  get: (id: string) => apiGet<Template>(`/templates/${id}`),
  create: (t: TemplateIn) => apiPost<Template>("/templates", t),
  update: (id: string, t: TemplateIn) =>
    apiPatch<Template>(`/templates/${id}`, t),
  use: (id: string) => apiPost<Template>(`/templates/${id}/use`),
  remove: (id: string) => apiDelete(`/templates/${id}`),
};