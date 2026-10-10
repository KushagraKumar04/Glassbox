import {
  AlertTriangle,
  ArrowRight,
  Brain,
  Check,
  Loader2,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

import { useExplainWhy } from "../hooks";
import type { WhyChoice, WhyConfidence } from "../api";

interface Props {
  sql: string;
  question?: string;
  datasetIds?: string[];
  sourceIds?: string[];
  open: boolean;
}

export function SqlRationale({
  sql,
  question,
  datasetIds = [],
  sourceIds = [],
  open,
}: Props) {
  const { data, isLoading, isError, error } = useExplainWhy(
    sql,
    question,
    datasetIds,
    sourceIds,
    open,
  );

  if (!open) return null;

  if (isLoading) {
    return (
      <div
        className="rounded-xl p-4 fade-up flex items-center gap-3"
        style={{
          background: "rgba(251,191,36,.05)",
          border: "1px solid rgba(251,191,36,.25)",
        }}
      >
        <Loader2 size={14} className="text-warn animate-spin" />
        <span className="text-[12.5px] text-muted">
          Reconstructing the reasoning…
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
          <span className="font-medium">Could not generate rationale</span>
        </div>
        <div className="font-mono text-[11px] opacity-90">
          {(error as Error)?.message ?? "Unknown error"}
        </div>
      </div>
    );
  }

  return <RationaleBody data={data} />;
}

/* ── Body ────────────────────────────────────────────────── */

function RationaleBody({
  data,
}: {
  data: ReturnType<typeof useExplainWhy>["data"] & object;
}) {
  if (!data) return null;
  const d = data as {
    rationale: string;
    choices: WhyChoice[];
    confidence: WhyConfidence;
    verify: string[];
    data_caveats: string[];
    cached: boolean;
  };

  return (
    <div
      className="rounded-xl p-4 fade-up space-y-4"
      style={{
        background: "rgba(251,191,36,.04)",
        border: "1px solid rgba(251,191,36,.25)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <Brain size={13} className="text-warn flex-none" strokeWidth={2} />
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-warn">
          Why this query
        </span>
        <ConfidenceBadge confidence={d.confidence} />
        {d.cached && (
          <span
            className="chip ml-auto"
            style={{
              borderColor: "rgba(251,191,36,.3)",
              color: "#FBBF24",
            }}
            title="Served from cache — no LLM call"
          >
            <Zap size={9} strokeWidth={2.5} />
            cached
          </span>
        )}
      </div>

      {/* Rationale */}
      {d.rationale && (
        <p className="text-[13.5px] leading-relaxed text-txt/90">
          {d.rationale}
        </p>
      )}

      {/* Choices */}
      {d.choices.length > 0 && (
        <div>
          <SectionLabel>Key decisions</SectionLabel>
          <div className="space-y-2">
            {d.choices.map((c, i) => (
              <ChoiceRow key={i} choice={c} />
            ))}
          </div>
        </div>
      )}

      {/* Verify */}
      {d.verify.length > 0 && (
        <div>
          <SectionLabel
            icon={<ShieldCheck size={11} strokeWidth={2} />}
            color="#22D3EE"
          >
            Worth verifying
          </SectionLabel>
          <ul className="space-y-1">
            {d.verify.map((v, i) => (
              <li
                key={i}
                className="text-[12px] leading-relaxed flex gap-2 items-start"
                style={{ color: "#22D3EE" }}
              >
                <Check
                  size={11}
                  strokeWidth={2.5}
                  className="flex-none mt-0.5"
                />
                <span>{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Data caveats */}
      {d.data_caveats.length > 0 && (
        <div>
          <SectionLabel
            icon={<AlertTriangle size={11} strokeWidth={2} />}
            color="#FBBF24"
          >
            Data caveats
          </SectionLabel>
          <ul className="space-y-1">
            {d.data_caveats.map((c, i) => (
              <li
                key={i}
                className="text-[12px] leading-relaxed flex gap-2 items-start text-muted"
              >
                <span className="text-warn/60 flex-none">·</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ── Choice row ──────────────────────────────────────────── */

function ChoiceRow({ choice }: { choice: WhyChoice }) {
  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "var(--aida-code-bg)",
        border: "1px solid rgba(148,163,184,.15)",
      }}
    >
      <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70 mb-1.5">
        {choice.aspect}
      </div>

      {/* Chosen */}
      <div className="flex items-start gap-2 mb-1.5">
        <Sparkles
          size={11}
          className="text-cyan flex-none mt-0.5"
          strokeWidth={2.5}
        />
        <span className="text-[12.5px] font-medium leading-snug">
          {choice.chosen}
        </span>
      </div>

      {/* Reasoning */}
      {choice.reasoning && (
        <div className="text-[12px] text-muted leading-relaxed mb-2 ml-[19px]">
          {choice.reasoning}
        </div>
      )}

      {/* Alternatives */}
      {choice.alternatives.length > 0 && (
        <div className="ml-[19px] flex items-start gap-2 mt-2">
          <ArrowRight
            size={10}
            className="text-muted/50 flex-none mt-0.5"
            strokeWidth={2}
          />
          <div className="min-w-0">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted/60 block mb-1">
              Alternatives considered
            </span>
            <div className="flex flex-wrap gap-1">
              {choice.alternatives.map((a, i) => (
                <span
                  key={i}
                  className="font-mono text-[10.5px] px-1.5 py-0.5 rounded"
                  style={{
                    background: "rgba(148,163,184,.06)",
                    color: "#AAB6CC",
                    border: "1px solid rgba(148,163,184,.15)",
                    textDecoration: "line-through",
                    textDecorationColor: "rgba(170,182,204,.4)",
                  }}
                  title="Not chosen"
                >
                  {a}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Primitives ──────────────────────────────────────────── */

function ConfidenceBadge({ confidence }: { confidence: WhyConfidence }) {
  const map: Record<WhyConfidence, string> = {
    high: "#34D399",
    medium: "#FBBF24",
    low: "#F87171",
  };
  const color = map[confidence] ?? "#AAB6CC";
  return (
    <span
      className="chip"
      style={{ borderColor: `${color}55`, color }}
      title={`The agent's confidence: ${confidence}`}
    >
      confidence: {confidence}
    </span>
  );
}

function SectionLabel({
  icon,
  color = "#AAB6CC",
  children,
}: {
  icon?: React.ReactNode;
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