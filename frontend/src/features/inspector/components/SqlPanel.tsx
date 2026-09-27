import {
  Brain,
  Check,
  CircleAlert,
  Copy,
  Download,
  GitCompare,
  HelpCircle,
  Loader2,
  Play,
  RotateCcw,
  Save,
  WandSparkles,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { Artifact, SqlArtifact } from "@/features/chat/types";
import { findArtifact } from "@/features/chat/types";
import { MonacoEditor } from "@/features/execute/components/MonacoEditor";
import { canFormat, formatSql } from "@/features/execute/format";
import { MonacoDiff } from "@/features/execute/components/MonacoDiff";
import {
  executeApi,
  type ExecuteSqlResponse,
} from "@/features/execute/api";
import { downloadText, safeFilename } from "@/shared/utils/export";
import { SqlExplanation } from "@/features/explain/components/SqlExplanation";
import { SqlRationale } from "@/features/explain/components/SqlRationale";
import { useInspector } from "../store";

const _MAX_PREVIEW_ROWS = 20;

export function SqlPanel({ artifacts }: { artifacts: Artifact[] }) {
  const artifact = findArtifact(artifacts, "sql") as SqlArtifact | undefined;
  const datasetIds = useInspector((s) => s.datasetIds);
  const sourceIds = useInspector((s) => s.sourceIds);
  const runId = useInspector((s) => s.runId);
  const artifactsFull = useInspector((s) => s.artifacts);

  const original = artifact?.content ?? "";
  const [code, setCode] = useState(original);
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecuteSqlResponse | null>(null);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [explainOpen, setExplainOpen] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  // Reset editor when a new SQL artifact arrives
  useEffect(() => {
    setCode(original);
    setResult(null);
    setSavedRunId(null);
    setDiffOpen(false);
    setExplainOpen(false);
    setWhyOpen(false);
  }, [original]);

  const dirty = original !== code;

  const copy = async () => {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const download = () => {
    if (!code) return;
    downloadText(code + "\n", safeFilename("query", "sql"), "application/sql");
  };

  const reset = () => {
    setCode(original);
    setResult(null);
    setDiffOpen(false);
  };
  const formatQuery = () => {
    if (!code) return;
    const formatted = formatSql(code);
    if (formatted !== code) {
      setCode(formatted);
      setResult(null);
    }
  };
  const run = async () => {
    if (!code.trim() || running) return;
    setRunning(true);
    setResult(null);
    setDiffOpen(false);
    try {
      const res = await executeApi.sql({
        sql: code,
        dataset_ids: datasetIds,
        source_ids: sourceIds,
      });
      setResult(res);
    } catch (e) {
      setResult({
        ok: false,
        error: (e as Error).message,
        columns: [],
        rows: [],
        row_count: 0,
        truncated: false,
        elapsed_ms: 0,
      });
    } finally {
      setRunning(false);
    }
  };

  const save = async () => {
    if (!result?.ok || saving) return;
    setSaving(true);
    try {
      const answerArtifact = artifactsFull.find((a) => a.kind === "answer");
      const questionText =
        answerArtifact?.kind === "answer"
          ? (answerArtifact.content as { summary?: string }).summary ??
            "Edited SQL run"
          : "Edited SQL run";

      const res = await executeApi.save({
        question: `[edited] ${questionText}`.slice(0, 500),
        sql_text: code,
        python_text: "",
        answer_summary: `Edit-and-run: ${result.row_count} row(s) in ${result.elapsed_ms}ms`,
        dataset_ids: datasetIds,
        source_ids: sourceIds,
        elapsed_ms: result.elapsed_ms,
        parent_run_id: runId ?? undefined,
      });
      setSavedRunId(res.run_id);
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  };

  if (!artifact) {
    return (
      <div className="text-[12.5px] text-muted leading-relaxed">
        No SQL artifact yet. Run an analysis to see the generated query here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="chip"
          style={{
            borderColor: artifact.valid
              ? "rgba(52,211,153,.3)"
              : "rgba(248,113,113,.3)",
            color: artifact.valid ? "#34D399" : "#F87171",
          }}
        >
          {artifact.valid ? "validated" : "invalid"}
        </span>
        {dirty && (
          <span
            className="chip"
            style={{ borderColor: "rgba(251,191,36,.3)", color: "#FBBF24" }}
          >
            edited
          </span>
        )}
        <button
          type="button"
          onClick={copy}
          className="chip cursor-pointer hover:brightness-125 focusable"
        >
          {copied ? (
            <>
              <Check size={10} strokeWidth={3} /> copied
            </>
          ) : (
            <>
              <Copy size={10} strokeWidth={2} /> copy
            </>
          )}
        </button>
        <button
          type="button"
          onClick={download}
          className="chip cursor-pointer hover:brightness-125 focusable"
        >
          <Download size={10} strokeWidth={2} /> .sql
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => setDiffOpen((v) => !v)}
            className="chip cursor-pointer hover:brightness-125 focusable"
            style={
              diffOpen
                ? { borderColor: "rgba(34,211,238,.4)", color: "#22D3EE" }
                : undefined
            }
          >
            <GitCompare size={10} strokeWidth={2} />
            {diffOpen ? "hide diff" : "diff"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setExplainOpen((v) => !v)}
          className="chip cursor-pointer hover:brightness-125 focusable"
          style={
            explainOpen
              ? { borderColor: "rgba(139,92,246,.4)", color: "#8B5CF6" }
              : undefined
          }
          title="Explain this query in plain English"
        >
          <HelpCircle size={10} strokeWidth={2} />
          {explainOpen ? "hide explanation" : "explain"}
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
          title="Why the agent chose this approach"
        >
          <Brain size={10} strokeWidth={2} />
          {whyOpen ? "hide rationale" : "why"}
        </button>
        <button
          type="button"
          onClick={formatQuery}
          disabled={!canFormat(code)}
          className="chip cursor-pointer hover:brightness-125 focusable disabled:opacity-40 disabled:cursor-not-allowed"
          title="Format this query"
        >
          <WandSparkles size={10} strokeWidth={2} />
          format
        </button>
      </div>

      {artifact.explanation && (
        <div className="text-[12.5px] text-muted leading-relaxed">
          {artifact.explanation}
        </div>
      )}

      <SqlExplanation
        sql={original}
        question={undefined}
        open={explainOpen}
      />

      <SqlRationale
        sql={original}
        question={undefined}
        datasetIds={datasetIds}
        sourceIds={sourceIds}
        open={whyOpen}
      />

      {/* Editor or diff */}
      {diffOpen ? (
        <MonacoDiff
          original={original}
          modified={code}
          language="sql"
          height={Math.min(480, Math.max(200, code.split("\n").length * 20 + 40))}
        />
      ) : (
        <MonacoEditor
          value={code}
          language="sql"
          onChange={setCode}
          onRun={() => void run()}
          editorKey={runId ?? "sql"}
          minHeight={140}
          maxHeight={480}
        />
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running || !code.trim()}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[10px] text-[12px] font-semibold cursor-pointer focusable disabled:opacity-50"
          style={{
            background: "linear-gradient(180deg,#22D3EE,#0EA5C4)",
            color: "#04121A",
          }}
          title="Run (⌘↵)"
        >
          {running ? (
            <>
              <Loader2 size={11} className="animate-spin" />
              Running…
            </>
          ) : (
            <>
              <Play size={11} strokeWidth={2.5} fill="currentColor" />
              Run
              <kbd className="font-mono text-[9.5px] opacity-70 ml-0.5">⌘↵</kbd>
            </>
          )}
        </button>

        {dirty && (
          <button
            type="button"
            onClick={reset}
            className="btn-chip focusable cursor-pointer"
          >
            <RotateCcw size={10} strokeWidth={2} />
            Reset
          </button>
        )}

        {result?.ok && !savedRunId && (
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="btn-chip focusable cursor-pointer"
            style={{ color: "#34D399" }}
          >
            {saving ? (
              <>
                <Loader2 size={10} className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Save size={10} strokeWidth={2} />
                Save to history
              </>
            )}
          </button>
        )}

        {savedRunId && (
          <span
            className="chip"
            style={{ borderColor: "rgba(52,211,153,.3)", color: "#34D399" }}
          >
            saved · {savedRunId.slice(0, 8)}
          </span>
        )}

        <span className="font-mono text-[10.5px] text-muted ml-auto">
          read-only enforced
        </span>
      </div>

      {result && <SqlResult result={result} />}
    </div>
  );
}

/* ── Result ─────────────────────────────────────────────── */

function SqlResult({ result }: { result: ExecuteSqlResponse }) {
  if (!result.ok) {
    return (
      <div
        className="rounded-xl p-3.5 text-[12px] leading-relaxed"
        style={{
          background: "rgba(248,113,113,.08)",
          border: "1px solid rgba(248,113,113,.3)",
          color: "#F87171",
        }}
      >
        <div className="flex items-start gap-2 mb-1.5">
          <CircleAlert size={13} strokeWidth={2.5} className="flex-none mt-0.5" />
          <span className="font-medium">Query failed</span>
        </div>
        <div className="font-mono text-[11px] whitespace-pre-wrap break-words opacity-90">
          {result.error || "Unknown error"}
        </div>
      </div>
    );
  }

  const preview = result.rows.slice(0, _MAX_PREVIEW_ROWS);

  return (
    <div
      className="rounded-xl overflow-hidden fade-up"
      style={{
        background: "var(--aida-code-bg)",
        border: "1px solid rgba(52,211,153,.3)",
      }}
    >
      <div
        className="flex items-center gap-2 px-3.5 py-2.5 flex-wrap"
        style={{ borderBottom: "1px solid rgba(148,163,184,.16)" }}
      >
        <Check size={13} strokeWidth={2.5} className="text-ok flex-none" />
        <span className="font-mono text-[11.5px] text-ok">
          {result.row_count.toLocaleString()} row
          {result.row_count === 1 ? "" : "s"}
        </span>
        <span className="font-mono text-[10.5px] text-muted">
          · {result.elapsed_ms}ms
        </span>
        {result.truncated && (
          <span
            className="chip ml-auto"
            style={{ borderColor: "rgba(251,191,36,.3)", color: "#FBBF24" }}
          >
            showing first {preview.length}
          </span>
        )}
      </div>

      {preview.length > 0 ? (
        <div className="overflow-x-auto max-h-[320px]">
          <table className="w-full font-mono text-[11px]">
            <thead className="sticky top-0" style={{ background: "#0B1020" }}>
              <tr className="text-left text-muted/70">
                {result.columns.map((c) => (
                  <th
                    key={c}
                    className="py-2 px-3 font-medium whitespace-nowrap"
                    style={{ borderBottom: "1px solid rgba(148,163,184,.16)" }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((row, i) => (
                <tr
                  key={i}
                  style={{ borderTop: "1px solid rgba(148,163,184,.08)" }}
                >
                  {result.columns.map((c) => (
                    <td
                      key={c}
                      className="py-1.5 px-3 whitespace-nowrap text-txt/85"
                    >
                      {formatCell(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-3.5 py-4 text-[12px] text-muted text-center">
          Query succeeded, no rows returned.
        </div>
      )}

      {result.truncated && preview.length > 0 && (
        <div
          className="px-3.5 py-2 text-[10.5px] text-muted/70 text-center font-mono"
          style={{ borderTop: "1px solid rgba(148,163,184,.16)" }}
        >
          Displayed 20 of {result.row_count.toLocaleString()} rows
        </div>
      )}
    </div>
  );
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    if (Number.isInteger(v)) return v.toLocaleString();
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}