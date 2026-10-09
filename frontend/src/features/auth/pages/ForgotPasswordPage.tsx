import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Mail,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { authApi } from "../api";
import { useAuth } from "../store";

export function ForgotPasswordPage() {
  const { config } = useAuth();
  const emailEnabled = config?.email_enabled ?? false;

  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    message: string;
    resetUrl?: string | null;
  } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (!email.trim()) return setError("Email is required.");

    setBusy(true);
    try {
      const res = await authApi.forgotPassword(email.trim());
      setDone({ message: res.message, resetUrl: res.reset_url });
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
            Reset your password
          </h1>
          <p className="text-muted text-[12.5px] mt-1 max-w-[360px] mx-auto leading-relaxed">
            Enter your email. We'll generate a one-time reset link valid for
            30 minutes.
          </p>
        </div>

        <div className="glass-strong rounded-2xl p-6">
          {done ? (
            <SuccessBlock
              message={done.message}
              resetUrl={done.resetUrl ?? undefined}
              emailEnabled={emailEnabled}
            />
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <label className="block">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
                    Email
                  </span>
                </div>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    className="input font-mono"
                    style={{ paddingLeft: 36 }}
                    disabled={busy}
                    autoFocus
                  />
                  <Mail
                    size={14}
                    strokeWidth={1.9}
                    className="text-muted/60 absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </div>
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
                disabled={busy}
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
                    Generating link…
                  </>
                ) : (
                  "Generate reset link"
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

function SuccessBlock({
  message,
  resetUrl,
  emailEnabled,
}: {
  message: string;
  resetUrl?: string;
  emailEnabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <CheckCircle2
          size={18}
          className="text-ok flex-none mt-0.5"
          strokeWidth={2}
        />
        <div className="min-w-0">
          <div className="text-[13.5px] font-medium">
            {emailEnabled ? "Email sent" : "Reset link generated"}
          </div>
          <div className="text-[12px] text-muted leading-relaxed mt-1">
            {message}
          </div>
        </div>
      </div>

      {resetUrl ? (
        <div
          className="rounded-xl p-3 text-[11.5px] leading-relaxed break-all"
          style={{
            background: "rgba(34,211,238,.06)",
            border: "1px solid rgba(34,211,238,.3)",
          }}
        >
          <div className="font-mono text-[10px] uppercase tracking-wider text-cyan mb-2">
            Dev mode · use this link
          </div>
          <a
            href={resetUrl}
            className="font-mono text-[11px] text-cyan hover:underline"
          >
            {resetUrl}
          </a>
        </div>
      ) : emailEnabled ? (
        <div
          className="rounded-xl p-3 text-[11.5px] leading-relaxed text-muted"
          style={{
            background: "rgba(52,211,153,.06)",
            border: "1px solid rgba(52,211,153,.25)",
          }}
        >
          <strong className="text-txt">Check your inbox.</strong> The email
          should arrive within a minute. If it doesn't, check your spam
          folder, or contact your administrator.
        </div>
      ) : (
        <div
          className="rounded-xl p-3 text-[11.5px] leading-relaxed text-muted"
          style={{
            background: "var(--aida-code-bg)",
            border: "1px solid rgba(148,163,184,.16)",
          }}
        >
          <strong className="text-txt">Where to find the link:</strong> check
          the server console. The URL was logged when you submitted this form.
          (In a production deployment this step would send an email.)
        </div>
      )}
    </div>
  );
}