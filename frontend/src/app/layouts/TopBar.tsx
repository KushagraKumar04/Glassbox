import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Search } from "lucide-react";

import { HEALTH_POLL_MS, PROVIDER_LABELS } from "@/config/constants";
import { UserMenu } from "@/features/auth/components/UserMenu";
import { InspectorToggle } from "@/features/inspector/components/InspectorToggle";
import { ThemeToggle } from "@/features/theme/ThemeToggle";
import { apiGet } from "@/lib/http";

interface Health {
  status: string;
  env: string;
  provider: string;
  model: string;
  version: string;
}

type HealthState = "connecting" | "online" | "offline";

export function TopBar() {
  const { data, isError, isPending } = useQuery<Health>({
    queryKey: ["health"],
    queryFn: () => apiGet<Health>("/health"),
    refetchInterval: HEALTH_POLL_MS,
    retry: 0,
  });

  const state: HealthState = isError
    ? "offline"
    : isPending || !data
      ? "connecting"
      : "online";

  const dotColor =
    state === "online"
      ? "#34D399"
      : state === "connecting"
        ? "#FBBF24"
        : "#F87171";

  const providerLabel = data
    ? PROVIDER_LABELS[data.provider] ?? data.provider
    : "connecting";
  const modelLabel = data?.model ?? "";

  return (
    <header
      className="h-14 flex-none flex items-center gap-3 px-4 border-b relative z-30"
      style={{
        borderColor: "var(--aida-border)",
        background: "var(--aida-surface)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    >
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] border text-[12px] hover:bg-white/5 transition-colors cursor-pointer"
        style={{ borderColor: "var(--aida-border)" }}
      >
        <span className="font-mono text-[12px] text-txt">workspace</span>
        <ChevronDown size={11} strokeWidth={2.4} className="text-muted" />
      </button>

      <div className="chip" title={`${providerLabel} · ${modelLabel}`}>
        <span
          className={state === "online" ? "pulse-dot" : ""}
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: dotColor,
            display: "inline-block",
          }}
          aria-hidden="true"
        />
        <span className="truncate max-w-[180px]">
          {state === "offline"
            ? "backend offline"
            : state === "connecting"
              ? "connecting…"
              : `${providerLabel} · ${modelLabel}`}
        </span>
      </div>

      <div className="flex-1" />

      <InspectorToggle />
      <ThemeToggle />

      <button
        type="button"
        data-tour="palette"
        onClick={() =>
          window.dispatchEvent(new CustomEvent("open-command-palette"))
        }
        className="flex items-center gap-2 px-3 py-1.5 rounded-[10px] border text-muted hover:text-txt hover:bg-white/5 transition-colors focusable cursor-pointer"
        style={{ borderColor: "var(--aida-border)" }}
        title="Open command palette (⌘K)"
      >
        <Search size={13} strokeWidth={2} aria-hidden="true" />
        <span className="font-mono text-[11px] hidden sm:inline">
          Search or ask…
        </span>
        <kbd
          className="font-mono text-[10px] px-1.5 py-0.5 rounded border hidden md:inline"
          style={{ borderColor: "var(--aida-border)" }}
        >
          ⌘K
        </kbd>
      </button>

      <UserMenu />
    </header>
  );
}