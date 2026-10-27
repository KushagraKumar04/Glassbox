import { beforeEach, describe, expect, it, vi } from "vitest";
import { streamSSE, type SSEEvent } from "./sse";
import { tokenStore } from "@/features/auth/api";

vi.mock("@/features/auth/api", () => ({
  tokenStore: {
    get: vi.fn(),
  },
}));

const mockedTokenStore = vi.mocked(tokenStore);

/**
 * Helper to construct a mock fetch Response containing a ReadableStream.
 */
function mockSSEResponse(
  chunks: (string | Uint8Array)[],
  { status = 200 }: { status?: number } = {}
): Response {
  let index = 0;
  const stream = new ReadableStream({
    async pull(controller) {
      if (index < chunks.length) {
        const chunk = chunks[index++];
        if (typeof chunk === "string") {
          controller.enqueue(new TextEncoder().encode(chunk));
        } else {
          controller.enqueue(chunk);
        }
      } else {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status,
    // Native Response leaves statusText empty by default; populate it
    // so the error message matches real server behavior.
    statusText: status >= 400 ? "Internal Server Error" : "OK",
    headers: { "Content-Type": "text/event-stream" },
  });
}

describe("streamSSE", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
    mockedTokenStore.get.mockReset().mockReturnValue(null);
  });

  // ── Happy Path ────────────────────────────────────────────

  it("parses a simple event", async () => {
    fetchMock.mockResolvedValueOnce(
      mockSSEResponse(['event: test\ndata: {"foo":"bar"}\n\n'])
    );
    const onEvent = vi.fn();
    const onClose = vi.fn();

    await streamSSE("/test", {}, { onEvent, onClose });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0]).toEqual({
      event: "test",
      data: { foo: "bar" },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("defaults event to 'message' when omitted", async () => {
    fetchMock.mockResolvedValueOnce(
      mockSSEResponse(['data: {"hello":"world"}\n\n'])
    );
    const onEvent = vi.fn();
    await streamSSE("/test", {}, { onEvent });

    expect(onEvent).toHaveBeenCalledWith({
      event: "message",
      data: { hello: "world" },
    });
  });

  it("handles multiple events in one chunk", async () => {
    fetchMock.mockResolvedValueOnce(
      mockSSEResponse([
        'data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c":3}\n\n',
      ])
    );
    const onEvent = vi.fn();
    await streamSSE("/test", {}, { onEvent });

    expect(onEvent).toHaveBeenCalledTimes(3);
    expect(onEvent.mock.calls[0][0].data).toEqual({ a: 1 });
    expect(onEvent.mock.calls[1][0].data).toEqual({ b: 2 });
    expect(onEvent.mock.calls[2][0].data).toEqual({ c: 3 });
  });

  it("joins multi-line data fields with newline", async () => {
    fetchMock.mockResolvedValueOnce(
      mockSSEResponse(['data: line 1\ndata: line 2\ndata: line 3\n\n'])
    );
    const onEvent = vi.fn();
    await streamSSE("/test", {}, { onEvent });

    expect(onEvent).toHaveBeenCalledWith({
      event: "message",
      data: "line 1\nline 2\nline 3", // Not valid JSON, falls back to string
    });
  });

  it("keeps non-JSON data as a string", async () => {
    fetchMock.mockResolvedValueOnce(
      mockSSEResponse(['data: plain text\n\n'])
    );
    const onEvent = vi.fn();
    await streamSSE("/test", {}, { onEvent });

    expect(onEvent).toHaveBeenCalledWith({
      event: "message",
      data: "plain text",
    });
  });

  it("ignores comments and empty lines", async () => {
    fetchMock.mockResolvedValueOnce(
      mockSSEResponse([': keepalive\n\ndata: {"ok":true}\n\n'])
    );
    const onEvent = vi.fn();
    await streamSSE("/test", {}, { onEvent });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].data).toEqual({ ok: true });
  });

  it("normalizes CRLF line endings", async () => {
    fetchMock.mockResolvedValueOnce(
      mockSSEResponse(['event: test\r\ndata: {"foo":"bar"}\r\n\r\n'])
    );
    const onEvent = vi.fn();
    await streamSSE("/test", {}, { onEvent });

    expect(onEvent).toHaveBeenCalledWith({
      event: "test",
      data: { foo: "bar" },
    });
  });

  it("flushes a trailing frame without a double newline", async () => {
    fetchMock.mockResolvedValueOnce(
      mockSSEResponse(['data: {"last":true}']) // Note: no \n\n at the end
    );
    const onEvent = vi.fn();
    await streamSSE("/test", {}, { onEvent });

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent.mock.calls[0][0].data).toEqual({ last: true });
  });

  it("correctly decodes UTF-8 characters split across chunks", async () => {
    // 'é' is 0xC3 0xA9 in UTF-8
    const chunk1 = new Uint8Array([0x64, 0x61, 0x74, 0x61, 0x3A, 0x20, 0xC3]); // "data: " + first byte of é
    const chunk2 = new Uint8Array([0xA9, 0x0A, 0x0A]); // second byte + "\n\n"

    fetchMock.mockResolvedValueOnce(mockSSEResponse([chunk1, chunk2]));
    const onEvent = vi.fn();
    await streamSSE("/test", {}, { onEvent });

    expect(onEvent).toHaveBeenCalledWith({
      event: "message",
      data: "é",
    });
  });

  // ── Auth & Headers ────────────────────────────────────────

  it("includes Authorization header if token exists", async () => {
    mockedTokenStore.get.mockReturnValue("abc123");
    fetchMock.mockResolvedValueOnce(mockSSEResponse([]));

    await streamSSE("/test", {}, { onEvent: vi.fn() });

    const init = fetchMock.mock.calls[0][1];
    expect(init.headers.Authorization).toBe("Bearer abc123");
  });

  // ── Error Handling ────────────────────────────────────────

  it("calls onError if response is not ok", async () => {
    fetchMock.mockResolvedValueOnce(mockSSEResponse([], { status: 500 }));
    const onError = vi.fn();
    await streamSSE("/test", {}, { onEvent: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith(
      new Error("SSE failed: 500 Internal Server Error")
    );
  });

  it("calls onError on fetch network failure", async () => {
    fetchMock.mockRejectedValueOnce(new Error("Network down"));
    const onError = vi.fn();
    await streamSSE("/test", {}, { onEvent: vi.fn(), onError });

    expect(onError).toHaveBeenCalledWith(new Error("Network down"));
  });

  it("handles AbortError during fetch silently (no onError, no onClose)", async () => {
    const abortErr = new DOMException("Aborted", "AbortError");
    fetchMock.mockRejectedValueOnce(abortErr);

    const onError = vi.fn();
    const onClose = vi.fn();
    await streamSSE("/test", {}, { onEvent: vi.fn(), onError, onClose });

    expect(onError).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("handles AbortError during stream read silently", async () => {
    // Create a stream that throws an AbortError when pulled
    const stream = new ReadableStream({
      pull(controller) {
        controller.error(new DOMException("Aborted", "AbortError"));
      },
    });
    fetchMock.mockResolvedValueOnce(new Response(stream));

    const onError = vi.fn();
    const onClose = vi.fn();
    await streamSSE("/test", {}, { onEvent: vi.fn(), onError, onClose });

    expect(onError).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});