import { Check, ChevronDown, CircleAlert, Loader2 } from "lucide-react";
import { useState } from "react";

import type { AgentStep } from "../types";

const STAGE_LABELS: Record<string, string> = {
  planning: "Planning",
  schema: "Inspecting schema",
  query: "Querying",
  compute: "Computing",
  visualizing: "Visualizing",
};

interface Props {
  steps: AgentStep[];
  elapsedMs?: number | null;
  state?: "idle" | "running" | "done" | "error";
}

export function AgentRail({ steps, elapsedMs, state }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  if (steps.length === 0) return null;

  const running = state === "running";
  const finished = state === "done" || state === "error";

  return (
    <div className="glass rounded-2xl p-4 mb-6 fade-up">
      <div className="flex items-center gap-2 mb-3">
        <span
          className={running ? "pulse-dot" : ""}
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: running ? "#22D3EE" : finished ? "#34D399" : "#AAB6CC",
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
        {finished && (
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="text-muted hover:text-txt transition-colors cursor-pointer focusable p-1"
            title={collapsed ? "Expand" : "Collapse"}
            aria-label={collapsed ? "Expand agent activity" : "Collapse agent activity"}
          >
            <ChevronDown
              size={13}
              strokeWidth={2}
              style={{
                transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
                transition: "transform .18s ease",
              }}
            />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="space-y-0.5">
          {steps.map((s) => (
            <StepRow key={s.stage} step={s} />
          ))}
        </div>
      )}

      {collapsed && (
        <div className="flex flex-wrap gap-1.5">
          {steps.map((s) => (
            <span
              key={s.stage}
              className="font-mono text-[10px] px-2 py-1 rounded-md"
              style={{
                background:
                  s.status === "done"
                    ? "rgba(34,211,238,.1)"
                    : s.status === "error"
                      ? "rgba(248,113,113,.1)"
                      : "rgba(148,163,184,.08)",
                color:
                  s.status === "done"
                    ? "#22D3EE"
                    : s.status === "error"
                      ? "#F87171"
                      : "#AAB6CC",
              }}
            >
              {STAGE_LABELS[s.stage] ?? s.stage}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

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