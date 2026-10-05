import { AlertCircle, Loader2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { cn } from "@/shared/utils/cn";

import { authApi } from "../api";
import { PasswordInput } from "../components/PasswordInput";
import { useAuth } from "../store";

type Mode = "login" | "register";

export function LoginPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const { setSession, config } = useAuth();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minPassword = config?.min_password_length ?? 8;
  const next = params.get("next") || "/";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (mode === "register") {
      if (!email.trim()) return setError("Email is required.");
      if (!username.trim()) return setError("Username is required.");
      if (password.length < minPassword) {
        return setError(
          `Password must be at least ${minPassword} characters.`,
        );
      }
    } else {
      if (!username.trim()) return setError("Username or email is required.");
      if (!password) return setError("Password is required.");
    }

    setBusy(true);
    try {
      const res =
        mode === "register"
          ? await authApi.register(email.trim(), username.trim(), password)
          : await authApi.login(username.trim(), password);
      setSession(res.access_token, res.user);
      nav(next, { replace: true });
    } catch (e) {
      setError((e as Error).message || "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative z-[1]">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-8">
          <img
            src="/logo-mark.png"
            alt="Glassbox"
            width={64}
            height={64}
            className="w-16 h-16 mx-auto mb-4"
            style={{
              filter:
                "drop-shadow(0 0 32px rgba(34,211,238,.45))",
            }}
          />
          <h1 className="font-mono text-[22px] font-bold tracking-tight">
            Glassbox
          </h1>
          <p className="text-muted text-[13px] mt-1">
            Ask your data. Get the answer. See the proof.
          </p>
        </div>

        <div className="glass-strong rounded-2xl p-6">
          <div
            className="flex gap-1 mb-5 p-1 rounded-xl"
            style={{ background: "var(--aida-code-bg)" }}
          >
            {(["login", "register"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => {
                  setMode(m);
                  setError(null);
                }}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors cursor-pointer focusable",
                  mode === m
                    ? "bg-cyan/15 text-cyan"
                    : "text-muted hover:text-txt",
                )}
              >
                {m === "login" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <Field label="Email" hint="for account recovery">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="input font-mono"
                  disabled={busy}
                />
              </Field>
            )}

            <Field
              label={mode === "register" ? "Username" : "Username or email"}
            >
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={mode === "register" ? "your-handle" : "you@example.com"}
                autoComplete="username"
                className="input font-mono"
                disabled={busy}
                autoFocus
              />
            </Field>

            <Field
              label="Password"
              hint={
                mode === "register" ? `min ${minPassword} chars` : undefined
              }
            >
              <PasswordInput
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete={
                  mode === "register" ? "new-password" : "current-password"
                }
                disabled={busy}
              />
            </Field>

            {error && (
              <div
                className="rounded-lg p-3 text-[12px] leading-relaxed flex items-start gap-2"
                style={{
                  background: "rgba(248,113,113,.08)",
                  border: "1px solid rgba(248,113,113,.3)",
                  color: "#F87171",
                }}
              >
                <AlertCircle size={14} strokeWidth={2} className="flex-none mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-semibold cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed focusable mt-2"
              style={{
                background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
                color: "#04121A",
                boxShadow: "0 0 24px -6px rgba(34,211,238,.55)",
              }}
            >
              {busy ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  {mode === "register" ? "Creating account…" : "Signing in…"}
                </>
              ) : (
                <>{mode === "register" ? "Create account" : "Sign in"}</>
              )}
            </button>
          </form>

          {mode === "login" && (
            <div className="text-center mt-4">
              <Link
                to="/forgot-password"
                className="text-[12px] text-muted hover:text-cyan transition-colors"
              >
                Forgot password?
              </Link>
            </div>
          )}

          <div className="text-[11px] text-muted/70 text-center mt-5 leading-relaxed">
            {mode === "register"
              ? "Your data stays on this server. Credentials are hashed with bcrypt."
              : "Enter the credentials you registered with."}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
          {label}
        </span>
        {hint && (
          <span className="font-mono text-[10px] text-muted/60">{hint}</span>
        )}
      </div>
      {children}
    </label>
  );
}