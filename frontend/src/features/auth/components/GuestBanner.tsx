import { Info, LogIn } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../store";

/**
 * Persistent strip at the top of the app shell shown to guest users.
 * Hidden for authenticated users and in single-user mode.
 */
export function GuestBanner() {
  const nav = useNavigate();
  const enabled = useAuth((s) => s.enabled);
  const config = useAuth((s) => s.config);
  const user = useAuth((s) => s.user);

  const isGuest = enabled && (config?.guest_mode ?? false) && !user;
  if (!isGuest) return null;

  const next = encodeURIComponent(
    window.location.pathname + window.location.search,
  );

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 text-[12px]"
      style={{
        background:
          "linear-gradient(90deg, rgba(34,211,238,.10), rgba(139,92,246,.10))",
        borderBottom: "1px solid rgba(34,211,238,.22)",
      }}
    >
      <Info size={13} className="text-cyan flex-none" strokeWidth={2.2} />
      <span className="text-txt/90 min-w-0 truncate">
        <strong className="font-medium">Demo mode.</strong> You can browse
        everything, but signing in is required to upload data, run analyses,
        or save work.
      </span>
      <button
        type="button"
        onClick={() => nav(`/login?next=${next}`)}
        className="ml-auto flex-none inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[11.5px] font-semibold cursor-pointer focusable"
        style={{
          background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
          color: "#04121A",
        }}
      >
        <LogIn size={11} strokeWidth={2.4} />
        Sign in
      </button>
    </div>
  );
}