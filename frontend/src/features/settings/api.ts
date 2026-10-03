import { apiGet, apiPost } from "@/lib/http";

export interface SystemInfo {
  app: {
    name: string;
    version: string;
    env: string;
    display_timezone: string;
  };
  llm: {
    provider: string;
    model: string;
    temperature: number;
    max_tokens: number;
  };
  limits: {
    max_upload_size_mb: number;
    max_query_rows: number;
    query_timeout_seconds: number;
    sandbox_enabled: boolean;
    sandbox_timeout_seconds: number;
    max_concurrent_runs: number;
  };
  auth: {
    enabled: boolean;
  };
  stats: {
    datasets: number;
    sources: number;
    runs: number;
    conversations: number;
    uploads_bytes: number;
    artifacts_bytes: number;
  };
}

export const systemApi = {
  info: () => apiGet<SystemInfo>("/system/info"),
  clearRuns: () => apiPost<{ deleted: number }>("/system/clear-runs"),
  clearDatasets: () =>
    apiPost<{ deleted: number }>("/system/clear-datasets"),
};