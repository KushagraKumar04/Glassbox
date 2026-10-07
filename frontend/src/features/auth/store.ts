import { create } from "zustand";

import { authApi, tokenStore, type AuthConfig, type AuthUser } from "./api";

type AuthStatus = "bootstrapping" | "anonymous" | "authenticated";

interface AuthState {
  status: AuthStatus;
  enabled: boolean;
  config: AuthConfig | null;
  user: AuthUser | null;
  error: string | null;

  /** Called once on app boot. */
  bootstrap: () => Promise<void>;

  /** Called by the login page after a successful response. */
  setSession: (token: string, user: AuthUser) => void;

  /** Clear token + user. */
  logout: () => void;

  /** True only when auth is enabled AND a user is present. */
  isAuthenticated: () => boolean;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: "bootstrapping",
  enabled: false,
  config: null,
  user: null,
  error: null,

  bootstrap: async () => {
    set({ status: "bootstrapping", error: null });

    // 1. Ask the backend whether auth is enabled
    let config: AuthConfig;
    try {
      config = await authApi.config();
    } catch (e) {
      // Backend offline — assume auth is off so the UI can still load
      set({
        status: "anonymous",
        enabled: false,
        config: {
          enabled: false,
          guest_mode: false,
          min_password_length: 8,
          email_enabled: false,
        },
        user: null,
        error: (e as Error).message,
      });
      return;
    }

    // 2. Auth disabled → anonymous, no token needed
    if (!config.enabled) {
      tokenStore.clear();
      set({
        status: "anonymous",
        enabled: false,
        config,
        user: null,
        error: null,
      });
      return;
    }

    // 3. Auth enabled → try to restore from a stored token
    const token = tokenStore.get();
    if (!token) {
      set({
        status: "anonymous",
        enabled: true,
        config,
        user: null,
        error: null,
      });
      return;
    }

    try {
      const user = await authApi.me(token);
      set({
        status: "authenticated",
        enabled: true,
        config,
        user,
        error: null,
      });
    } catch {
      // Token invalid or expired — clear and start fresh
      tokenStore.clear();
      set({
        status: "anonymous",
        enabled: true,
        config,
        user: null,
        error: null,
      });
    }
  },

  setSession: (token, user) => {
    tokenStore.set(token);
    set({
      status: "authenticated",
      user,
      error: null,
    });
  },

  logout: () => {
    tokenStore.clear();
    set({ status: "anonymous", user: null, error: null });
  },

  isAuthenticated: () => {
    const s = get();
    return s.status === "authenticated" && !!s.user;
  },
}));

/**
 * Synchronous check — is the current session a guest?
 *
 * True when:
 *   - auth is enabled
 *   - guest mode is on
 *   - no user is logged in
 *
 * Safe to call from anywhere (not just React components).
 */
export function isGuestNow(): boolean {
  const s = useAuth.getState();
  return (
    s.enabled &&
    (s.config?.guest_mode ?? false) &&
    s.status !== "authenticated"
  );
}