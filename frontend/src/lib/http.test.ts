import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted by vitest before the imports below) ─────
vi.mock("@/config/constants", () => ({
  API_BASE: "http://test.local",
}));

vi.mock("@/features/auth/api", () => ({
  tokenStore: {
    get: vi.fn(),
    set: vi.fn(),
    clear: vi.fn(),
  },
}));

vi.mock("@/features/auth/guest-gate", () => ({
  useGuestGate: {
    getState: vi.fn(),
  },
}));

import { apiDelete, apiGet, apiPost, ApiError } from "./http";
import { tokenStore } from "@/features/auth/api";
import { useGuestGate } from "@/features/auth/guest-gate";

const mockedTokenStore = vi.mocked(tokenStore);
const mockedGetState = vi.mocked(useGuestGate.getState);

const fetchMock = vi.fn();

function makeResponse(
  body: unknown,
  {
    status = 200,
    headers = {},
  }: { status?: number; headers?: Record<string, string> } = {},
): Response {
  const isJson = typeof body !== "string";
  return new Response(
    body === null
      ? null
      : isJson
        ? JSON.stringify(body)
        : body,
    {
      status,
      headers: {
        "Content-Type": isJson ? "application/json" : "text/plain",
        ...headers,
      },
    },
  );
}

describe("http", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();

    mockedTokenStore.get.mockReset().mockReturnValue(null);
    mockedTokenStore.clear.mockReset();
    mockedGetState.mockReset();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        pathname: "/workspace",
        assign: vi.fn(),
        href: "http://localhost/",
      },
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  apiGet — success + auth header
  // ═══════════════════════════════════════════════════════════

  describe("apiGet", () => {
    it("returns parsed JSON on 200", async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ hello: "world" }));
      const result = await apiGet<{ hello: string }>("/test");
      expect(result).toEqual({ hello: "world" });
    });

    it("includes Bearer header when token is present", async () => {
      mockedTokenStore.get.mockReturnValue("abc123");
      fetchMock.mockResolvedValueOnce(makeResponse({}));
      await apiGet("/test");
      const init = fetchMock.mock.calls[0][1];
      expect(init.headers.Authorization).toBe("Bearer abc123");
    });

    // ── Error branches ────────────────────────────────────

    it("on 401 clears token and throws ApiError", async () => {
      mockedTokenStore.get.mockReturnValue("abc123");
      fetchMock.mockResolvedValueOnce(makeResponse(null, { status: 401 }));
      await expect(apiGet("/test")).rejects.toMatchObject({
        status: 401,
        name: "ApiError",
      });
      expect(mockedTokenStore.clear).toHaveBeenCalled();
    });

    it("on 403 with 'sign in' detail opens guest gate", async () => {
      const showMock = vi.fn();
      // Cast to unknown first, then to the expected type to bypass strict
      // partial mocking — we only care about `show` in these tests.
      mockedGetState.mockReturnValue(
        { show: showMock } as unknown as ReturnType<typeof useGuestGate.getState>
      );
      fetchMock.mockResolvedValueOnce(
        makeResponse(
          { detail: "Please sign in to continue" },
          { status: 403 },
        ),
      );
      await expect(apiGet("/test")).rejects.toBeInstanceOf(ApiError);
      expect(showMock).toHaveBeenCalledWith("Please sign in to continue");
    });

    it("on 403 without 'sign in' detail does NOT open guest gate", async () => {
      const showMock = vi.fn();
      // Cast to unknown first, then to the expected type to bypass strict
      // partial mocking — we only care about `show` in these tests.
      mockedGetState.mockReturnValue(
        { show: showMock } as unknown as ReturnType<typeof useGuestGate.getState>
      );
      fetchMock.mockResolvedValueOnce(
        makeResponse({ detail: "Forbidden" }, { status: 403 }),
      );
      await expect(apiGet("/test")).rejects.toBeInstanceOf(ApiError);
      expect(showMock).not.toHaveBeenCalled();
    });

    it("on 404 parses detail string into message", async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse({ detail: "Not found" }, { status: 404 }),
      );
      await expect(apiGet("/test")).rejects.toMatchObject({
        status: 404,
        message: "Not found",
      });
    });

    it("on 422 with detail array joins messages", async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(
          {
            detail: [
              { msg: "field a required" },
              { msg: "field b invalid" },
            ],
          },
          { status: 422 },
        ),
      );
      await expect(apiGet("/test")).rejects.toMatchObject({
        status: 422,
        message: "field a required, field b invalid",
      });
    });

    it("on 429 with Retry-After includes seconds in message", async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(null, {
          status: 429,
          headers: { "Retry-After": "30" },
        }),
      );
      await expect(apiGet("/test")).rejects.toMatchObject({
        status: 429,
        message: expect.stringContaining("30 seconds"),
      });
    });

    it("on 429 with Retry-After=1 uses singular 'second'", async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse(null, {
          status: 429,
          headers: { "Retry-After": "1" },
        }),
      );
      await expect(apiGet("/test")).rejects.toMatchObject({
        status: 429,
        message: expect.stringContaining("1 second"),
      });
      await expect(apiGet("/test")).rejects.not.toMatchObject({
        message: expect.stringContaining("1 seconds"),
      });
    });

    it("on 500 with non-JSON body falls back to text", async () => {
      fetchMock.mockResolvedValueOnce(
        makeResponse("Internal Server Error", { status: 500 }),
      );
      await expect(apiGet("/test")).rejects.toMatchObject({
        status: 500,
        message: "Internal Server Error",
      });
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  apiPost
  // ═══════════════════════════════════════════════════════════

  describe("apiPost", () => {
    it("serializes body and sets Content-Type", async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({ ok: true }));
      await apiPost("/test", { foo: "bar" });
      const init = fetchMock.mock.calls[0][1];
      expect(init.method).toBe("POST");
      expect(init.headers["Content-Type"]).toBe("application/json");
      expect(init.body).toBe(JSON.stringify({ foo: "bar" }));
    });

    it("omits body when undefined", async () => {
      fetchMock.mockResolvedValueOnce(makeResponse({}));
      await apiPost("/test");
      const init = fetchMock.mock.calls[0][1];
      expect(init.body).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════
  //  apiDelete
  // ═══════════════════════════════════════════════════════════

  describe("apiDelete", () => {
    it("returns void on 200", async () => {
      fetchMock.mockResolvedValueOnce(makeResponse(null, { status: 200 }));
      const result = await apiDelete("/test");
      expect(result).toBeUndefined();
    });
  });
});