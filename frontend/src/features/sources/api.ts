import { apiDelete, apiGet, apiPost } from "@/lib/http";

export type SourceKind = "postgres" | "mysql" | "sqlite";

export interface RemoteTable {
  schema: string;
  name: string;
  qualified: string;
  columns?: { name: string; type: string; nullable: boolean }[];
}

export interface DataSource {
  id: string;
  name: string;
  kind: SourceKind;
  host: string;
  port: number;
  database: string;
  username: string;
  ssl_mode: string;
  status: "healthy" | "error" | "unknown";
  last_error: string;
  last_tested_at: string | null;
  created_at: string;
  table_count: number;
  tables: RemoteTable[];
}

export interface SourceTestResult {
  ok: boolean;
  error: string;
  tables: RemoteTable[];
  table_count: number;
}

export interface SourceCredentials {
  name?: string;
  kind: SourceKind;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl_mode?: string;
}

export const sourcesApi = {
  list: () => apiGet<DataSource[]>("/sources"),
  get: (id: string) => apiGet<DataSource>(`/sources/${id}`),

  test: (creds: SourceCredentials) =>
    apiPost<SourceTestResult>("/sources/test", creds),

  create: (creds: SourceCredentials) =>
    apiPost<DataSource>("/sources", creds),

  refresh: (id: string) =>
    apiPost<DataSource>(`/sources/${id}/refresh`),

  tables: (id: string) =>
    apiGet<{ source_id: string; tables: RemoteTable[] }>(
      `/sources/${id}/tables`,
    ),

  remove: (id: string) => apiDelete(`/sources/${id}`),
};