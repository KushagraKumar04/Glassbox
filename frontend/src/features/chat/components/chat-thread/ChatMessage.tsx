/**
 * One Q&A pair in the thread.
 *
 * Renders compact by default: question bubble + answer summary + chips row.
 * Clicking a chip reveals the full artifact for that message only.
 * At most one artifact is open per message.
 */
import {
  AlertTriangle,
  BarChart3,
  Brain,
  Code2,
  FileCode2,
  HelpCircle,
  ListTree,
  ShieldAlert,
  Sigma,
  Sparkles,
} from "lucide-react";
import { useState } from "react";

import { ChartRenderer } from "@/features/charts/components/ChartRenderer";
import { SqlExplanation } from "@/features/explain/components/SqlExplanation";
import { SqlRationale } from "@/features/explain/components/SqlRationale";
import type { RunFull } from "@/features/history/api";
import { cn } from "@/shared/utils/cn";
import { formatRelative } from "@/shared/utils/time";

import type { ChartSpec, NextQuestion } from "../../types";
import { findArtifactFromRun } from "./helpers";
import { NextQuestions } from "@/features/suggestions/components/NextQuestions";

type ArtifactTab =
  | "chart"
  | "sql"
  | "python"
  | "dax"
  | "trace"
  | "assumptions"
  | "anomalies"
  | null;

interface Props {
  run: RunFull;
  /** True while this run is the newest active one. */
  active?: boolean;
  onAsk?: (q: string) => void;
  disabled?: boolean;
}

export function ChatMessage({ run, active, onAsk, disabled }: Props) {
  const [openTab, setOpenTab] = useState<ArtifactTab>(null);

  const answer = run.answer ?? { summary: "", findings: [], caveats: [] };
  const hasSql = !!run.sql_text;
  const hasPython = !!run.python_text;
  const hasDax = !!run.dax_text;
  const hasChart = !!(run.chart_spec && (run.chart_spec as ChartSpec).data?.length);
  const hasTrace = !!(run.trace && run.trace.length);
  const anomalies = (run as unknown as { anomalies?: unknown }).anomalies;
  const hasAnomalies = Array.isArray(anomalies) && anomalies.length > 0;
  const anomalyCount = hasAnomalies ? (anomalies as unknown[]).length : 0;
  const hasAssumptions = !!(
    (run.answer?.caveats && run.answer.caveats.length > 0) ||
    (run.answer?.findings && run.answer.findings.length > 0)
  );

  const toggle = (tab: ArtifactTab) =>
    setOpenTab((prev) => (prev === tab ? null : tab));

  const nextQuestions = findArtifactFromRun<NextQuestion[]>(
    run,
    "next_questions",
  );

  return (
    <div
      className={cn(
        "rounded-2xl transition-colors",
        active && "ring-1 ring-cyan/20",
      )}
    >
      {/* ── Question bubble (right-aligned) ─────────────── */}
      <div className="flex justify-end mb-3">
        <div
          className="max-w-[75%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-snug"
          style={{
            background: "rgba(139,92,246,.15)",
            border: "1px solid rgba(139,92,246,.3)",
            color: "#E8EEF8",
          }}
        >
          {run.question}
        </div>
      </div>

      {/* ── Answer card ─────────────────────────────────── */}
      <div
        className="glass rounded-2xl p-4"
        style={{ borderColor: "rgba(34,211,238,.2)" }}
      >
        <div className="flex items-center gap-2 mb-2.5">
          <Sparkles size={13} className="text-cyan" strokeWidth={2} />
          <span
            className="font-mono text-[10.5px] uppercase tracking-wider"
            style={{ color: "#22D3EE" }}
          >
            Answer
          </span>
          {run.status === "failed" && (
            <span
              className="chip"
              style={{
                borderColor: "rgba(248,113,113,.3)",
                color: "#F87171",
              }}
            >
              failed
            </span>
          )}
        </div>

        <p className="text-[14px] leading-relaxed mb-2">
          {answer.summary || "(no summary)"}
        </p>

        {answer.findings && answer.findings.length > 0 && (
          <ul className="space-y-1.5 text-[13px] mt-3">
            {answer.findings.map((f, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="text-muted font-mono text-[11px] mt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        )}

        {answer.caveats && answer.caveats.length > 0 && (
          <div
            className="flex items-start gap-2.5 mt-3 pt-3 border-t"
            style={{ borderColor: "rgba(148,163,184,.16)" }}
          >
            <ShieldAlert
              size={12}
              className="text-warn flex-none mt-0.5"
              strokeWidth={2}
            />
            <span className="text-[12px] text-muted">
              <strong className="text-warn font-medium">Caveats: </strong>
              {answer.caveats.join(" · ")}
            </span>
          </div>
        )}
      </div>

      {/* ── Chips row ───────────────────────────────────── */}
      <div className="flex items-center gap-1.5 flex-wrap mt-2.5">
        {hasChart && (
          <Chip
            icon={<BarChart3 size={10} strokeWidth={2} />}
            label="chart"
            active={openTab === "chart"}
            onClick={() => toggle("chart")}
          />
        )}
        {hasSql && (
          <Chip
            icon={<Code2 size={10} strokeWidth={2} />}
            label="SQL"
            active={openTab === "sql"}
            onClick={() => toggle("sql")}
          />
        )}
        {hasPython && (
          <Chip
            icon={<FileCode2 size={10} strokeWidth={2} />}
            label="Python"
            active={openTab === "python"}
            onClick={() => toggle("python")}
          />
        )}
        {hasDax && (
          <Chip
            icon={<Sigma size={10} strokeWidth={2} />}
            label="DAX"
            active={openTab === "dax"}
            onClick={() => toggle("dax")}
          />
        )}
        {hasAnomalies && (
          <Chip
            icon={<AlertTriangle size={10} strokeWidth={2} />}
            label={`anomalies · ${anomalyCount}`}
            active={openTab === "anomalies"}
            onClick={() => toggle("anomalies")}
          />
        )}
        {hasTrace && (
          <Chip
            icon={<ListTree size={10} strokeWidth={2} />}
            label="trace"
            active={openTab === "trace"}
            onClick={() => toggle("trace")}
          />
        )}

        <span className="ml-auto font-mono text-[10.5px] text-muted/70">
          {(run.elapsed_ms / 1000).toFixed(1)}s ·{" "}
          {formatRelative(run.created_at)}
        </span>
      </div>

      {/* ── Expanded artifact ───────────────────────────── */}
      {openTab && (
        <div className="mt-3 fade-up">
          {openTab === "chart" && hasChart && (
            <ChartRenderer
              spec={run.chart_spec as ChartSpec}
              filenameHint={run.question}
              sql={run.sql_text}
              datasetIds={run.dataset_ids ?? []}
              sourceIds={run.source_ids ?? []}
            />
          )}
          {openTab === "sql" && hasSql && (
            <SqlBlock
              sql={run.sql_text}
              question={run.question}
              datasetIds={run.dataset_ids ?? []}
              sourceIds={run.source_ids ?? []}
            />
          )}
          {openTab === "python" && hasPython && (
            <pre
              className="glass rounded-xl p-3.5 font-mono text-[12px] leading-[1.6] overflow-x-auto whitespace-pre"
              style={{ background: "var(--aida-code-bg)" }}
            >
              {run.python_text}
            </pre>
          )}
          {openTab === "dax" && hasDax && (
            <pre
              className="glass rounded-xl p-3.5 font-mono text-[12px] leading-[1.6] overflow-x-auto whitespace-pre"
              style={{
                background: "var(--aida-code-bg)",
                borderColor: "rgba(139,92,246,.3)",
              }}
            >
              {run.dax_text}
            </pre>
          )}
          {openTab === "anomalies" && hasAnomalies && (
            <div className="glass rounded-xl p-3.5">
              <div className="text-[11.5px] text-muted mb-2">
                Anomalies are computed on the live run and not persisted to
                history. Re-run the question to see them again.
              </div>
            </div>
          )}
          {openTab === "trace" && hasTrace && (
            <div className="glass rounded-xl p-3.5">
              <div className="space-y-0">
                {run.trace.map((e, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-1.5 text-[11.5px]"
                    style={{
                      borderBottom:
                        i < run.trace.length - 1
                          ? "1px solid rgba(148,163,184,.1)"
                          : undefined,
                    }}
                  >
                    <span className="font-mono text-[10px] text-muted/60 w-5 flex-none">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="font-mono text-violet w-[130px] flex-none">
                      {e.stage}
                    </span>
                    <span className="font-mono text-muted flex-1 truncate">
                      {e.detail ?? ""}
                    </span>
                    <span className="font-mono text-[10px] text-muted/60">
                      {e.ts}ms
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Next questions (compact) ────────────────────── */}
      {onAsk && nextQuestions && nextQuestions.length > 0 && (
        <div className="mt-3">
          <NextQuestions
            questions={nextQuestions}
            onAsk={onAsk}
            disabled={disabled}
          />
        </div>
      )}
    </div>
  );
}

/* ── Chips ──────────────────────────────────────────────── */

function Chip({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-mono text-[11px] cursor-pointer transition-colors focusable",
        active
          ? "bg-cyan/15 text-cyan"
          : "text-muted hover:text-txt hover:bg-white/5",
      )}
      style={{
        border: active
          ? "1px solid rgba(34,211,238,.35)"
          : "1px solid rgba(148,163,184,.16)",
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ── SQL sub-block with explain/why ─────────────────────── */

function SqlBlock({
  sql,
  question,
  datasetIds,
  sourceIds,
}: {
  sql: string;
  question: string;
  datasetIds: string[];
  sourceIds: string[];
}) {
  const [explainOpen, setExplainOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="glass rounded-xl p-3.5">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted">
            SQL
          </span>
          <button
            type="button"
            onClick={() => setExplainOpen((v) => !v)}
            className="chip cursor-pointer hover:brightness-125 focusable ml-auto"
            style={
              explainOpen
                ? { borderColor: "rgba(139,92,246,.4)", color: "#8B5CF6" }
                : undefined
            }
          >
            <HelpCircle size={10} strokeWidth={2} />
            explain
          </button>
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            className="chip cursor-pointer hover:brightness-125 focusable"
            style={
              whyOpen
                ? { borderColor: "rgba(251,191,36,.4)", color: "#FBBF24" }
                : undefined
            }
          >
            <Brain size={10} strokeWidth={2} />
            why
          </button>
        </div>

        <pre
          className="font-mono text-[12px] leading-[1.6] overflow-x-auto p-3 rounded-lg whitespace-pre"
          style={{ background: "var(--aida-code-bg)" }}
        >
          {sql}
        </pre>

        <div className="mt-3 space-y-3">
          <SqlExplanation sql={sql} question={question} open={explainOpen} />
          <SqlRationale
            sql={sql}
            question={question}
            datasetIds={datasetIds}
            sourceIds={sourceIds}
            open={whyOpen}
          />
        </div>
      </div>
    </div>
  );
}
