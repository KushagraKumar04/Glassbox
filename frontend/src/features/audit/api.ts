import { apiGet } from "@/lib/http";

export interface AuditEvent {
  id: string;
  user_id: string | null;
  username: string;
  action: string;
  target_type: string;
  target_id: string;
  details: Record<string, unknown>;
  ip: string;
  user_agent: string;
  created_at: string;
}

export interface AuditPage {
  events: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuditAction {
  id: string;
  label: string;
}

export interface AuditFilters {
  action?: string;
  user_id?: string;
  target_type?: string;
  search?: string;
  days?: number;
  limit?: number;
  offset?: number;
}

export const auditApi = {
  list: (filters: AuditFilters = {}) => {
    const p = new URLSearchParams();
    if (filters.action) p.set("action", filters.action);
    if (filters.user_id) p.set("user_id", filters.user_id);
    if (filters.target_type) p.set("target_type", filters.target_type);
    if (filters.search) p.set("search", filters.search);
    if (filters.days) p.set("days", String(filters.days));
    if (filters.limit) p.set("limit", String(filters.limit));
    if (filters.offset) p.set("offset", String(filters.offset));
    return apiGet<AuditPage>(`/audit?${p.toString()}`);
  },
  actions: () => apiGet<{ actions: AuditAction[] }>("/audit/actions"),
};