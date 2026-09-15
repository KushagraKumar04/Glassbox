/**
 * POST-based SSE client.
 *
 * The native EventSource only supports GET, so we parse the SSE framing
 * ourselves from a fetch ReadableStream. Handles:
 *   - multi-line `data:` continuations
 *   - `event:` type switching
 *   - UTF-8 across chunk boundaries
 *   - optional AbortSignal for cancel
 */
import { tokenStore } from "@/features/auth/api";
export interface SSEEvent {
  /** Event name — defaults to "message" if the server omits one. */
  event: string;
  /** Parsed JSON payload (or the raw string if it wasn't valid JSON). */
  data: unknown;
}

export interface SSEOptions {
  signal?: AbortSignal;
  /** Called on every parsed frame. */
  onEvent: (e: SSEEvent) => void;
  /** Called when the stream closes cleanly. */
  onClose?: () => void;
  /** Called on network / parse failure. */
  onError?: (err: Error) => void;
}

/**
 * Open a POST SSE stream and dispatch events until the server closes.
 */
export async function streamSSE(
  url: string,
  body: unknown,
  opts: SSEOptions,
): Promise<void> {
  const { signal, onEvent, onClose, onError } = opts;

  let res: Response;
  try {
    const token = tokenStore.get();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    onError?.(e as Error);
    return;
  }

  if (!res.ok || !res.body) {
    onError?.(new Error(`SSE failed: ${res.status} ${res.statusText}`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // sse-starlette (and the SSE spec) allow CRLF line endings.
      // Normalize to LF so our "\n\n" separator logic works.
      // Safe: JSON-escaped newlines inside payloads use backslash escapes,
      // not raw CR/LF bytes.
      buffer = buffer.replace(/\r\n/g, "\n");

      // Frames are separated by a blank line ("\n\n").
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const parsed = parseFrame(frame);
        if (parsed) onEvent(parsed);
      }
    }

    // Flush any trailing frame without a terminating blank line.
    if (buffer.trim()) {
      const parsed = parseFrame(buffer);
      if (parsed) onEvent(parsed);
    }

    onClose?.();
  } catch (e) {
    if ((e as Error).name === "AbortError") return;
    onError?.(e as Error);
  }
}

/**
 * Parse a single SSE frame (a block of `key: value` lines).
 */
function parseFrame(frame: string): SSEEvent | null {
  let event = "message";
  const dataLines: string[] = [];

  for (const rawLine of frame.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue; // comment / heartbeat

    const colon = line.indexOf(":");
    if (colon === -1) continue;

    const field = line.slice(0, colon).trim();
    let value = line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value.trim();
    else if (field === "data") dataLines.push(value);
  }

  if (dataLines.length === 0) return null;

  const raw = dataLines.join("\n");
  let data: unknown = raw;
  try {
    data = JSON.parse(raw);
  } catch {
    // Leave as string — caller can decide.
  }

  return { event, data };
}