import { ChevronDown, LogOut, User as UserIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { cn } from "@/shared/utils/cn";

import { useAuth } from "../store";

export function UserMenu() {
  const nav = useNavigate();
  const { enabled, user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Auth disabled → nothing to show
  if (!enabled) return null;

  if (!user) {
    return (
      <button
        type="button"
        onClick={() => nav("/login")}
        className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] border text-[12px] text-muted hover:text-txt hover:bg-white/5 transition-colors cursor-pointer focusable"
        style={{ borderColor: "rgba(148,163,184,.16)" }}
      >
        <UserIcon size={13} strokeWidth={2} />
        <span className="font-mono text-[11px] hidden sm:inline">Sign in</span>
      </button>
    );
  }

  const initials = (user.username || user.email)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 2)
    .toUpperCase() || "??";

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2 py-1 rounded-[10px] border hover:bg-white/5 transition-colors cursor-pointer focusable"
        style={{ borderColor: "rgba(148,163,184,.16)" }}
        title={user.email}
      >
        <div
          className="w-6 h-6 rounded-md grid place-items-center font-mono text-[10px] font-bold flex-none"
          style={{
            background: "linear-gradient(135deg,#8B5CF6,#22D3EE)",
            color: "#04121A",
          }}
        >
          {initials}
        </div>
        <span className="font-mono text-[11.5px] text-txt hidden sm:inline max-w-[100px] truncate">
          {user.username}
        </span>
        <ChevronDown size={11} strokeWidth={2.4} className="text-muted" />
      </button>

      {open && (
        <div
          className={cn(
            "glass-strong rounded-xl absolute right-0 top-full mt-2 w-[240px] p-1.5 fade-up z-[100]",
          )}
          style={{ boxShadow: "0 20px 50px -10px rgba(0,0,0,.7)" }}
        >
          <div className="px-2.5 py-2 border-b" style={{ borderColor: "rgba(148,163,184,.16)" }}>
            <div className="text-[12.5px] font-medium truncate">{user.username}</div>
            <div className="font-mono text-[10.5px] text-muted truncate">
              {user.email}
            </div>
          </div>

          <button
            type="button"
            onClick={() => {
              setOpen(false);
              logout();
              nav("/login", { replace: true });
            }}
            className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[12.5px] text-left hover:bg-white/5 transition-colors cursor-pointer focusable mt-1"
            style={{ color: "#F87171" }}
          >
            <LogOut size={13} strokeWidth={2} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}