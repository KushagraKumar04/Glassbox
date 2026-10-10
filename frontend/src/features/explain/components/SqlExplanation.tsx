import {
  AlertTriangle,
  Check,
  Database,
  Info,
  ListChecks,
  Loader2,
  Sparkles,
  Table2,
  Zap,
} from "lucide-react";

import { useExplainSql } from "../hooks";
import type { ExplainResponse } from "../api";

interface Props {
  sql: string;
  question?: string;
  /** When false, the panel stays collapsed until opened by a parent. */
  open: boolean;
}

export function SqlExplanation({ sql, question, open }: Props) {
  const { data, isLoading, isError, error } = useExplainSql(sql, question, open);

  if (!open) return null;

  if (isLoading) {
    return (
      <div
        className="rounded-xl p-4 fade-up flex items-center gap-3"
        style={{
          background: "rgba(139,92,246,.06)",
          border: "1px solid rgba(139,92,246,.25)",
        }}
      >
        <Loader2 size={14} className="text-violet animate-spin" />
        <span className="text-[12.5px] text-muted">
          Explaining this query…
        </span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div
        className="rounded-xl p-3.5 text-[12px] fade-up"
        style={{
          background: "rgba(248,113,113,.08)",
          border: "1px solid rgba(248,113,113,.3)",
          color: "#F87171",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle size={13} strokeWidth={2} />
          <span className="font-medium">Could not explain</span>
        </div>
        <div className="font-mono text-[11px] opacity-90">
          {(error as Error)?.message ?? "Unknown error"}
        </div>
      </div>
    );
  }

  return <ExplanationBody data={data} />;
}

/* ── Rendered explanation ───────────────────────────────── */

function ExplanationBody({ data }: { data: ExplainResponse }) {
  return (
    <div
      className="rounded-xl p-4 fade-up space-y-4"
      style={{
        background: "rgba(139,92,246,.05)",
        border: "1px solid rgba(139,92,246,.25)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Sparkles size={13} className="text-violet flex-none" strokeWidth={2} />
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-violet">
          Plain English
        </span>
        {data.cached && (
          <span
            className="chip ml-auto"
            style={{
              borderColor: "rgba(139,92,246,.3)",
              color: "#8B5CF6",
            }}
            title="Served from cache — no LLM call"
          >
            <Zap size={9} strokeWidth={2.5} />
            cached
          </span>
        )}
      </div>

      {/* Summary */}
      {data.summary && (
        <p className="text-[13.5px] leading-relaxed text-txt/90">
          {data.summary}
        </p>
      )}

      {/* Steps */}
      {data.steps.length > 0 && (
        <div>
          <SectionLabel icon={<ListChecks size={11} strokeWidth={2} />}>
            How it works
          </SectionLabel>
          <ol className="space-y-2">
            {data.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span
                  className="w-5 h-5 rounded-md grid place-items-center flex-none mt-0.5 font-mono text-[10px] font-bold"
                  style={{
                    background: "rgba(139,92,246,.15)",
                    color: "#8B5CF6",
                  }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <div className="text-[12.5px] font-medium leading-snug">
                    {s.step}
                  </div>
                  {s.detail && (
                    <div className="text-[12px] text-muted leading-relaxed mt-0.5">
                      {s.detail}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Tables + Columns */}
      {(data.tables.length > 0 || data.columns.length > 0) && (
        <div className="grid grid-cols-2 gap-3">
          {data.tables.length > 0 && (
            <div>
              <SectionLabel icon={<Database size={11} strokeWidth={2} />}>
                Tables used
              </SectionLabel>
              <div className="flex flex-wrap gap-1">
                {data.tables.map((t) => (
                  <span
                    key={t}
                    className="font-mono text-[10.5px] px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(34,211,238,.08)",
                      color: "#22D3EE",
                      border: "1px solid rgba(34,211,238,.2)",
                    }}
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          )}

          {data.columns.length > 0 && (
            <div>
              <SectionLabel icon={<Table2 size={11} strokeWidth={2} />}>
                Output columns
              </SectionLabel>
              <div className="flex flex-wrap gap-1">
                {data.columns.map((c) => (
                  <span
                    key={c}
                    className="font-mono text-[10.5px] px-1.5 py-0.5 rounded"
                    style={{
                      background: "rgba(148,163,184,.08)",
                      color: "#AAB6CC",
                      border: "1px solid rgba(148,163,184,.2)",
                    }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Assumptions */}
      {data.assumptions.length > 0 && (
        <div>
          <SectionLabel icon={<Info size={11} strokeWidth={2} />}>
            Assumptions
          </SectionLabel>
          <ul className="space-y-1">
            {data.assumptions.map((a, i) => (
              <li
                key={i}
                className="text-[12px] leading-relaxed text-muted flex gap-2"
              >
                <span className="text-muted/50 flex-none">·</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Warnings */}
      {data.warnings.length > 0 && (
        <div>
          <SectionLabel
            icon={<AlertTriangle size={11} strokeWidth={2} />}
            color="#FBBF24"
          >
            Warnings
          </SectionLabel>
          <ul className="space-y-1">
            {data.warnings.map((w, i) => (
              <li
                key={i}
                className="text-[12px] leading-relaxed flex gap-2 items-start"
                style={{ color: "#FBBF24" }}
              >
                <AlertTriangle
                  size={11}
                  strokeWidth={2.5}
                  className="flex-none mt-0.5"
                />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Primitives ──────────────────────────────────────────── */

function SectionLabel({
  icon,
  color = "#8B5CF6",
  children,
}: {
  icon: React.ReactNode;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center gap-1.5 mb-1.5 font-mono text-[10px] uppercase tracking-wider"
      style={{ color }}
    >
      {icon}
      {children}
    </div>
  );
}

// Prevent an unused-import warning for `Check` — reserved for future use
void Check;