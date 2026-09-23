/**
 * JSON fetch wrapper with automatic Bearer token injection.
 * On 401, clears the stored session so the router can redirect to /login.
 */
import { API_BASE } from "@/config/constants";
import { tokenStore } from "@/features/auth/api";
import { useGuestGate } from "@/features/auth/guest-gate";
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function authHeaders(): Record<string, string> {
  const token = tokenStore.get();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleUnauthorized(): void {
  tokenStore.clear();
  if (window.location.pathname !== "/login") {
    window.location.assign("/login");
  }
}

function handleForbidden(res: Response, detail: string): void {
  // Guest-mode "sign in to continue" → open the modal instead of hard-redirecting
  if (
    res.status === 403 &&
    detail.toLowerCase().includes("sign in")
  ) {
    useGuestGate.getState().show(detail);
  }
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) {
      return body.detail
        .map((d: { msg?: string }) => d.msg ?? "")
        .join(", ");
    }
    return JSON.stringify(body);
  } catch {
    try {
      return await res.text();
    } catch {
      return `HTTP ${res.status}`;
    }
  }
}
async function parseRateLimitError(res: Response): Promise<string> {
  const retryAfter = res.headers.get("Retry-After");
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") {
      return body.detail;
    }
  } catch {
    /* ignore */
  }
  if (retryAfter) {
    return `Rate limit reached. Try again in ${retryAfter} second${
      retryAfter === "1" ? "" : "s"
    }.`;
  }
  return "Rate limit reached. Please slow down.";
}

export async function apiGet<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...authHeaders(),
      ...init?.headers,
    },
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError(401, "Authentication required.");
  }
  if (res.status === 429) {
    throw new ApiError(429, await parseRateLimitError(res));
  }
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json() as Promise<T>;
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...authHeaders(),
      ...init?.headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError(401, "Authentication required.");
  }
  if (res.status === 429) {
    throw new ApiError(429, await parseRateLimitError(res));
  }
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json() as Promise<T>;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: { ...authHeaders() },
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError(401, "Authentication required.");
  }
  if (res.status === 429) {
    throw new ApiError(429, await parseRateLimitError(res));
  }
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
}

export async function apiUpload<T>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    body: fd,
    headers: {
      Accept: "application/json",
      ...authHeaders(),
    },
  });
  if (res.status === 401) {
    handleUnauthorized();
    throw new ApiError(401, "Authentication required.");
  }
  if (res.status === 429) {
    throw new ApiError(429, await parseRateLimitError(res));
  }
  if (!res.ok) throw new ApiError(res.status, await parseError(res));
  return res.json() as Promise<T>;
}