import { Lock, LogIn, Sparkles, UserPlus, X } from "lucide-react";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { useGuestGate } from "../guest-gate";

/**
 * Modal shown when a guest attempts a write action.
 * Reads from the guest-gate store so it can be triggered from anywhere —
 * http handlers, composers, individual buttons.
 */
export function GuestSignInPrompt() {
  const nav = useNavigate();
  const { open, message, hide } = useGuestGate();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hide();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, hide]);

  if (!open) return null;

  const next = encodeURIComponent(
    window.location.pathname + window.location.search,
  );

  const goSignIn = () => {
    hide();
    nav(`/login?next=${next}`);
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center px-4"
      style={{ background: "rgba(3,7,18,.7)", backdropFilter: "blur(6px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) hide();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guest-prompt-title"
    >
      <div
        className="glass-strong rounded-2xl w-[460px] max-w-full overflow-hidden fade-up"
        style={{ boxShadow: "0 30px 90px -12px rgba(0,0,0,.9)" }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-3 px-5 py-4 border-b"
          style={{ borderColor: "var(--aida-border)" }}
        >
          <div
            className="w-9 h-9 rounded-xl grid place-items-center flex-none"
            style={{
              background: "rgba(34,211,238,.12)",
              border: "1px solid rgba(34,211,238,.3)",
            }}
            aria-hidden="true"
          >
            <Lock size={15} className="text-cyan" strokeWidth={2.2} />
          </div>
          <div className="min-w-0">
            <div
              id="guest-prompt-title"
              className="font-mono text-[13.5px] font-semibold"
            >
              Sign in to continue
            </div>
            <div className="font-mono text-[10.5px] text-muted">
              Browsing is free — actions need an account
            </div>
          </div>
          <button
            type="button"
            onClick={hide}
            className="ml-auto text-muted hover:text-txt cursor-pointer focusable p-1"
            aria-label="Close"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-[13px] text-muted leading-relaxed">
            {message ||
              "Guests can explore the interface, look at existing data, and read the docs. Signing in unlocks uploads, analyses, saved runs, and every other write action."}
          </p>

          <div
            className="rounded-xl p-3.5 text-[12px] leading-relaxed space-y-1.5"
            style={{
              background: "var(--aida-code-bg)",
              border: "1px solid var(--aida-border)",
            }}
          >
            <div className="font-mono text-[10px] uppercase tracking-wider text-muted/70 mb-1">
              What unlocks on sign-in
            </div>
            <ul className="space-y-1 text-muted">
              <li className="flex items-center gap-2">
                <Sparkles size={10} className="text-cyan flex-none" strokeWidth={2.4} />
                Upload datasets and connect databases
              </li>
              <li className="flex items-center gap-2">
                <Sparkles size={10} className="text-cyan flex-none" strokeWidth={2.4} />
                Run analyses with the full agent pipeline
              </li>
              <li className="flex items-center gap-2">
                <Sparkles size={10} className="text-cyan flex-none" strokeWidth={2.4} />
                Save, pin, export, and revisit every run
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center gap-2 px-5 py-4 border-t"
          style={{ borderColor: "var(--aida-border)" }}
        >
          <button
            type="button"
            onClick={hide}
            className="px-3.5 py-2 rounded-[10px] border text-[12.5px] cursor-pointer focusable"
            style={{ borderColor: "var(--aida-border)" }}
          >
            Keep browsing
          </button>
          <button
            type="button"
            onClick={goSignIn}
            className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-[10px] text-[12.5px] font-semibold cursor-pointer focusable"
            style={{
              background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
              color: "#04121A",
              boxShadow: "0 0 24px -6px rgba(34,211,238,.55)",
            }}
          >
            <LogIn size={12} strokeWidth={2.4} />
            Sign in
          </button>
          <button
            type="button"
            onClick={() => {
              hide();
              nav(`/login?next=${next}&mode=register`);
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[10px] border text-[12.5px] cursor-pointer focusable"
            style={{
              borderColor: "rgba(34,211,238,.35)",
              color: "#22D3EE",
            }}
          >
            <UserPlus size={12} strokeWidth={2.4} />
            Create account
          </button>
        </div>
      </div>
    </div>
  );
}