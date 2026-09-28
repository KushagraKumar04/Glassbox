import { Check, ChevronDown, CircleAlert, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/shared/utils/cn";

import type { AgentStep } from "../types";

const STAGE_LABELS: Record<string, string> = {
  planning: "Planning",
  schema: "Inspecting schema",
  query: "Querying",
  compute: "Computing",
  translate: "Translating to DAX",
  visualizing: "Visualizing",
  suggest: "Suggesting follow-ups",
  anomalies: "Scanning outliers",
};

const STAGE_ORDER = [
  "planning",
  "schema",
  "query",
  "compute",
  "translate",
  "visualizing",
  "suggest",
  "anomalies",
];

interface Props {
  steps: AgentStep[];
  elapsedMs?: number | null;
  state?: "idle" | "running" | "done" | "error";
}

export function AgentRail({ steps, elapsedMs, state }: Props) {
  /**
   * Collapsed by default — the compact chip row is far less intrusive.
   * The panel auto-expands briefly when a run starts so the user sees
   * the pipeline, then auto-collapses when the run finishes.
   *
   * Manual toggles win — once the user clicks the chevron, we stop
   * overriding their preference for the current run.
   */
  const [collapsed, setCollapsed] = useState(true);
  const userOverrodeRef = useRef(false);
  const prevStateRef = useRef<string | undefined>(undefined);

  // Auto-expand on run start, auto-collapse on run finish
  useEffect(() => {
    if (userOverrodeRef.current) return;

    if (state === "running" && prevStateRef.current !== "running") {
      // New run just started — expand so the user can see the pipeline
      setCollapsed(false);
    } else if (
      (state === "done" || state === "error") &&
      prevStateRef.current === "running"
    ) {
      // Run finished — collapse to save space
      setCollapsed(true);
    }

    prevStateRef.current = state;
  }, [state]);

  if (steps.length === 0) return null;

  const running = state === "running";
  const finished = state === "done" || state === "error";

  const toggle = () => {
    userOverrodeRef.current = true;
    setCollapsed((c) => !c);
  };

  // Completion percentage for the progress bar
  const doneCount = steps.filter((s) => s.status === "done").length;
  const errored = steps.some((s) => s.status === "error");
  const progress =
    steps.length > 0 ? Math.round((doneCount / STAGE_ORDER.length) * 100) : 0;

  return (
    <div className="glass rounded-2xl mb-6 fade-up overflow-hidden">
      {/* ── Header ────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-3">
        <span
          className={running ? "pulse-dot" : ""}
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: errored
              ? "#F87171"
              : running
                ? "#22D3EE"
                : finished
                  ? "#34D399"
                  : "#AAB6CC",
            display: "inline-block",
          }}
          aria-hidden="true"
        />
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
          Agent activity
        </span>

        {elapsedMs != null && (
          <span className="ml-auto font-mono text-[10.5px] text-muted">
            {(elapsedMs / 1000).toFixed(1)}s
          </span>
        )}

        <button
          type="button"
          onClick={toggle}
          className="text-muted hover:text-txt transition-colors cursor-pointer focusable p-1"
          title={collapsed ? "Expand agent activity" : "Collapse agent activity"}
          aria-label={collapsed ? "Expand" : "Collapse"}
          aria-expanded={!collapsed}
          style={elapsedMs == null ? { marginLeft: "auto" } : undefined}
        >
          <ChevronDown
            size={13}
            strokeWidth={2}
            style={{
              transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              transition: "transform .2s ease",
            }}
          />
        </button>
      </div>

      {/* ── Collapsed chips row ───────────────────────── */}
      <div
        className="grid px-4"
        style={{
          gridTemplateRows: collapsed ? "1fr" : "0fr",
          transition: "grid-template-rows .22s ease, padding .22s ease",
          paddingBottom: collapsed ? 12 : 0,
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="flex flex-wrap gap-1.5">
            {STAGE_ORDER.map((stage) => {
              const step = steps.find((s) => s.stage === stage);
              if (!step) {
                return <Chip key={stage} stage={stage} status="pending" />;
              }
              return (
                <Chip
                  key={stage}
                  stage={stage}
                  status={step.status}
                  detail={step.detail}
                />
              );
            })}
          </div>

          {/* Progress bar */}
          {running && (
            <div
              className="mt-2.5 h-1 rounded-full overflow-hidden"
              style={{ background: "rgba(148,163,184,.12)" }}
              aria-hidden="true"
            >
              <div
                className="h-full transition-all duration-500"
                style={{
                  width: `${Math.max(4, progress)}%`,
                  background:
                    "linear-gradient(90deg,#22D3EE,#8B5CF6)",
                  boxShadow: "0 0 12px rgba(34,211,238,.5)",
                }}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Expanded detail list ──────────────────────── */}
      <div
        className="grid"
        style={{
          gridTemplateRows: collapsed ? "0fr" : "1fr",
          transition: "grid-template-rows .22s ease",
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <div className="px-4 pb-4 space-y-0.5">
            {STAGE_ORDER.map((stage) => {
              const step = steps.find((s) => s.stage === stage);
              if (!step) return null;
              return <StepRow key={stage} step={step} />;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Compact chip ──────────────────────────────────────── */

function Chip({
  stage,
  status,
  detail,
}: {
  stage: string;
  status: "running" | "done" | "error" | "pending";
  detail?: string;
}) {
  const label = STAGE_LABELS[stage] ?? stage;

  const styles: Record<string, { bg: string; border: string; color: string }> = {
    done: {
      bg: "rgba(34,211,238,.10)",
      border: "rgba(34,211,238,.28)",
      color: "#22D3EE",
    },
    running: {
      bg: "rgba(34,211,238,.18)",
      border: "rgba(34,211,238,.55)",
      color: "#22D3EE",
    },
    error: {
      bg: "rgba(248,113,113,.12)",
      border: "rgba(248,113,113,.35)",
      color: "#F87171",
    },
    pending: {
      bg: "rgba(148,163,184,.06)",
      border: "rgba(148,163,184,.16)",
      color: "#64748B",
    },
  };

  const s = styles[status] ?? styles.pending;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md font-mono text-[10.5px] whitespace-nowrap transition-colors",
        status === "running" && "relative",
      )}
      style={{
        background: s.bg,
        border: `1px solid ${s.border}`,
        color: s.color,
      }}
      title={detail || undefined}
    >
      {status === "done" && (
        <Check size={9} strokeWidth={3.5} className="flex-none" />
      )}
      {status === "running" && (
        <Loader2 size={9} className="animate-spin flex-none" />
      )}
      {status === "error" && (
        <CircleAlert size={9} strokeWidth={2.5} className="flex-none" />
      )}
      {label}
    </span>
  );
}

/* ── Full-size row (expanded view) ─────────────────────── */

function StepRow({ step }: { step: AgentStep }) {
  const done = step.status === "done";
  const err = step.status === "error";

  return (
    <div
      className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-opacity"
      style={{ opacity: done ? 0.85 : 1 }}
    >
      <span
        className="w-4 h-4 rounded-full grid place-items-center flex-none"
        style={{
          border: "1.5px solid",
          borderColor: done
            ? "#22D3EE"
            : err
              ? "#F87171"
              : "rgba(148,163,184,.35)",
          background: done ? "#22D3EE" : err ? "#F87171" : "transparent",
        }}
        aria-hidden="true"
      >
        {done && <Check size={9} className="text-[#04121A]" strokeWidth={4} />}
        {err && <CircleAlert size={9} className="text-white" strokeWidth={3} />}
        {!done && !err && (
          <Loader2 size={9} className="text-cyan animate-spin" />
        )}
      </span>

      <span className="font-mono text-[12px] w-[150px] flex-none">
        {STAGE_LABELS[step.stage] ?? step.stage}
      </span>

      <span className="font-mono text-[11px] text-muted truncate">
        {step.detail ?? ""}
      </span>

      {step.ts != null && (
        <span className="font-mono text-[10px] text-muted/60 ml-auto flex-none">
          {step.ts}ms
        </span>
      )}
    </div>
  );
}