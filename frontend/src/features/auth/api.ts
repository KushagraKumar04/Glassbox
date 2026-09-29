import { API_BASE } from "@/config/constants";

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  is_active: boolean;
  is_superuser: boolean;
  created_at: string;
}

export interface AuthConfig {
  enabled: boolean;
  /** True when guest/demo mode is on — unauthenticated users can browse. */
  guest_mode: boolean;
  min_password_length: number;
  /** True when the server has SMTP configured and can send reset emails. */
  email_enabled: boolean;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  user: AuthUser;
}

const TOKEN_KEY = "aida.auth.token";

export const tokenStore = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set(token: string): void {
    try {
      window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
      /* localStorage disabled — token lives only in memory */
    }
  },
  clear(): void {
    try {
      window.localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  },
};

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") return body.detail;
    if (Array.isArray(body?.detail)) {
      return body.detail.map((d: { msg?: string }) => d.msg ?? "").join(", ");
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

export interface ForgotPasswordResponse {
  ok: boolean;
  message: string;
  /** Only present when the server has AUTH_SHOW_RESET_LINK=true (dev only). */
  reset_url?: string | null;
}

export const authApi = {
  async config(): Promise<AuthConfig> {
    const res = await fetch(`${API_BASE}/auth/config`);
    if (!res.ok) throw new Error(`config failed: ${res.status}`);
    return res.json();
  },

  async register(
    email: string,
    username: string,
    password: string,
  ): Promise<TokenResponse> {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, username, password }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
  },

  async login(username: string, password: string): Promise<TokenResponse> {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
  },

  async me(token: string): Promise<AuthUser> {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
  },

  async forgotPassword(email: string): Promise<ForgotPasswordResponse> {
    const res = await fetch(`${API_BASE}/auth/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
  },

  async resetPassword(token: string, newPassword: string): Promise<AuthUser> {
    const res = await fetch(`${API_BASE}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, new_password: newPassword }),
    });
    if (!res.ok) throw new Error(await parseError(res));
    return res.json();
  },
};