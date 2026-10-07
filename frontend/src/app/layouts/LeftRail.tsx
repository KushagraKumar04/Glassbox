import {
  Blocks,
  Code2,
  Compass,
  Database,
  History,
  LayoutDashboard,
  LayoutGrid,
  ScrollText,
  Settings,
  Sigma,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/shared/utils/cn";

interface NavItem {
  to: string;
  label: string;
  Icon: typeof Compass;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: "/home", label: "Home / Ask", Icon: Compass, end: true },
  { to: "/sources", label: "Data Sources", Icon: Database },
  { to: "/workspace", label: "Workspace", Icon: LayoutGrid },
  { to: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { to: "/workspace?tab=sql", label: "SQL / Python", Icon: Code2 },
  { to: "/history", label: "History", Icon: History },
  { to: "/templates", label: "Templates", Icon: Blocks },
  { to: "/metrics", label: "Metrics", Icon: Sigma },
  { to: "/audit", label: "Audit Log", Icon: ScrollText },
  { to: "/settings", label: "Settings", Icon: Settings },
];

export function LeftRail() {
  return (
    <aside
      className="w-[264px] flex-none flex flex-col border-r"
      style={{
        borderColor: "var(--aida-border)",
        background: "var(--aida-surface)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      {/* ── Brand ─────────────────────────────────────── */}
      <div
        data-tour="brand"
        className="px-4 py-4 flex items-center gap-2.5 border-b"
        style={{ borderColor: "var(--aida-border)" }}
      >
        <img
          src="/logo-mark.png"
          alt=""
          width={32}
          height={32}
          className="w-8 h-8 flex-none rounded-lg"
          aria-hidden="true"
        />
        <div className="leading-tight min-w-0">
          <div className="font-mono text-[13px] font-semibold tracking-tight truncate">
            Glassbox
          </div>
          <div className="font-mono text-[10px] text-muted">
            v0.1 · Local
          </div>
        </div>
      </div>

      {/* ── Navigation ────────────────────────────────── */}
      <nav data-tour="nav" className="p-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, label, Icon, end }) => (
          <NavLink
            key={label}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-[10px]",
                "text-[13.5px] text-muted transition-colors",
                "hover:bg-white/5 hover:text-txt",
                isActive && "bg-cyan/10 text-cyan",
              )
            }
          >
            <Icon size={16} strokeWidth={1.8} aria-hidden="true" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────── */}
      <div
        className="mt-auto p-3 border-t"
        style={{ borderColor: "var(--aida-border)" }}
      >
        <div className="glass rounded-xl p-3 flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-lg grid place-items-center font-mono text-[11px] font-semibold flex-none"
            style={{
              background: "linear-gradient(135deg,#8B5CF6,#22D3EE)",
              color: "#04121A",
            }}
            aria-hidden="true"
          >
            AK
          </div>
          <div className="min-w-0">
            <div className="text-[12.5px] truncate">Local workspace</div>
            <div className="font-mono text-[10px] text-muted truncate">
              read-only · SQLite
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}