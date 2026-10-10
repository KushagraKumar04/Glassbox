import { API_BASE } from "@/config/constants";
import { streamSSE, type SSEEvent } from "@/lib/sse";

import type { FilterCondition } from "@/features/filters/types";

export interface ChatRequestBody {
  question: string;
  dataset_ids: string[];
  source_ids?: string[];
  conversation_id?: string;
  filters?: FilterCondition[];
}

export interface ChatStreamHandlers {
  onEvent: (e: SSEEvent) => void;
  onClose?: () => void;
  onError?: (err: Error) => void;
  signal?: AbortSignal;
}

/**
 * Open an SSE stream for one analysis run.
 *
 * Events (see backend/app/services/orchestrator.py):
 *   run_started   {run_id}
 *   agent_step    {stage, status, detail}
 *   artifact      {kind: "sql" | "python" | "chart" | "answer" | "quality" | "trace", ...}
 *   run_complete  {run_id, elapsed_ms}
 *   error         {message}
 *   done          {run_id}
 */
export async function streamChat(
  body: ChatRequestBody,
  handlers: ChatStreamHandlers,
): Promise<void> {
  return streamSSE(`${API_BASE}/chat/stream`, body, {
    signal: handlers.signal,
    onEvent: handlers.onEvent,
    onClose: handlers.onClose,
    onError: handlers.onError,
  });
}
// ═══════════════════════════════════════════════════════════════════════════
//  Conversation thread
// ═══════════════════════════════════════════════════════════════════════════

export async function fetchConversationRuns(
  conversationId: string,
  signal?: AbortSignal,
): Promise<import("@/features/history/api").RunFull[]> {
  const { tokenStore } = await import("@/features/auth/api");
  const token = tokenStore.get();
  const res = await fetch(
    `${API_BASE}/conversations/${encodeURIComponent(conversationId)}/runs`,
    {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      signal,
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to load conversation: ${res.status}`);
  }
  return res.json();
}