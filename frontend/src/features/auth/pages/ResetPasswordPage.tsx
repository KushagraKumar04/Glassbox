import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  KeyRound,
  Loader2,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";

import { authApi } from "../api";
import { PasswordInput } from "../components/PasswordInput";

export function ResetPasswordPage() {
  const nav = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const minLength = 8;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (!token) return setError("Missing reset token in the URL.");
    if (!password) return setError("Password is required.");
    if (password.length < minLength) {
      return setError(`Password must be at least ${minLength} characters.`);
    }
    if (password !== confirm) return setError("Passwords do not match.");

    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      setDone(true);
      window.setTimeout(() => nav("/login", { replace: true }), 2200);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10 relative z-[1]">
      <div className="w-full max-w-[440px]">
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
          <h1 className="font-mono text-[20px] font-bold tracking-tight">
            Set a new password
          </h1>
          <p className="text-muted text-[12.5px] mt-1">
            {token
              ? "Choose a new password for your account."
              : "This link is missing a reset token."}
          </p>
        </div>

        <div className="glass-strong rounded-2xl p-6">
          {done ? (
            <div className="space-y-4 text-center py-2">
              <CheckCircle2
                size={32}
                className="text-ok mx-auto"
                strokeWidth={2}
              />
              <div className="text-[14px] font-medium">Password updated</div>
              <div className="text-[12.5px] text-muted">
                Redirecting you to sign in…
              </div>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
                    New password
                  </span>
                  <span className="font-mono text-[10px] text-muted/60">
                    min {minLength} chars
                  </span>
                </div>
                <PasswordInput
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={busy}
                  autoFocus
                />
              </label>

              <label className="block">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
                    Confirm password
                  </span>
                </div>
                <PasswordInput
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="new-password"
                  disabled={busy}
                />
              </label>

              {error && (
                <div
                  className="rounded-lg p-3 text-[12px] leading-relaxed flex items-start gap-2"
                  style={{
                    background: "rgba(248,113,113,.08)",
                    border: "1px solid rgba(248,113,113,.3)",
                    color: "#F87171",
                  }}
                >
                  <AlertCircle
                    size={14}
                    strokeWidth={2}
                    className="flex-none mt-0.5"
                  />
                  <span>{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={busy || !token}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-semibold cursor-pointer disabled:opacity-60 focusable"
                style={{
                  background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
                  color: "#04121A",
                  boxShadow: "0 0 24px -6px rgba(34,211,238,.55)",
                }}
              >
                {busy ? (
                  <>
                    <Loader2 size={13} className="animate-spin" />
                    Updating…
                  </>
                ) : (
                  <>
                    <KeyRound size={13} strokeWidth={2.2} />
                    Set new password
                  </>
                )}
              </button>
            </form>
          )}

          <div
            className="mt-5 pt-5 border-t"
            style={{ borderColor: "rgba(148,163,184,.16)" }}
          >
            <Link
              to="/login"
              className="inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-cyan transition-colors"
            >
              <ArrowLeft size={11} strokeWidth={2} />
              Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}