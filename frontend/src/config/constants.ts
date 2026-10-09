/**
 * App-wide constants. Everything configurable comes from Vite env vars.
 */

export const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

export const API_BASE = `${API_URL}/api/v1`;

/** Default polling / refetch intervals (ms). */
export const HEALTH_POLL_MS = 30_000;

/** Max rows we ever render in the table fallback. */
export const MAX_TABLE_ROWS = 100;

/** Local storage keys — keep them namespaced. */
export const STORAGE_KEYS = {
  lastDatasetId: "aida.lastDatasetId",
  inspectorOpen: "aida.inspectorOpen",
  inspectorTab: "aida.inspectorTab",
} as const;

/** Provider display names — used in the top bar. */
export const PROVIDER_LABELS: Record<string, string> = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
  ollama: "Ollama",
  openai_compatible: "OpenAI-compatible",
};