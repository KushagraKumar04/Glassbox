import {
  Check,
  CircleAlert,
  Copy,
  Download,
  GitCompare,
  Loader2,
  Play,
  RotateCcw,
  Save,
} from "lucide-react";
import { useEffect, useState } from "react";

import type { Artifact, PythonArtifact } from "@/features/chat/types";
import { findArtifact } from "@/features/chat/types";
import { MonacoEditor } from "@/features/execute/components/MonacoEditor";
import { MonacoDiff } from "@/features/execute/components/MonacoDiff";
import {
  executeApi,
  type ExecutePythonResponse,
} from "@/features/execute/api";
import { downloadText, safeFilename } from "@/shared/utils/export";

import { useInspector } from "../store";

export function PythonPanel({ artifacts }: { artifacts: Artifact[] }) {
  const artifact = findArtifact(artifacts, "python") as
    | PythonArtifact
    | undefined;
  const datasetIds = useInspector((s) => s.datasetIds);
  const sourceIds = useInspector((s) => s.sourceIds);
  const runId = useInspector((s) => s.runId);
  const artifactsFull = useInspector((s) => s.artifacts);

  const original = artifact?.content ?? "";
  const [code, setCode] = useState(original);
  const [copied, setCopied] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ExecutePythonResponse | null>(null);
  const [savedRunId, setSavedRunId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);

  useEffect(() => {
    setCode(original);
    setResult(null);
    setSavedRunId(null);
    setDiffOpen(false);
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
    downloadText(code + "\n", safeFilename("analysis", "py"), "text/x-python");
  };

  const reset = () => {
    setCode(original);
    setResult(null);
    setDiffOpen(false);
  };

  const run = async () => {
    if (!code.trim() || running) return;
    setRunning(true);
    setResult(null);
    setDiffOpen(false);
    try {
      const res = await executeApi.python({
        code,
        dataset_ids: datasetIds,
        source_ids: sourceIds,
      });
      setResult(res);
    } catch (e) {
      setResult({
        ok: false,
        status: "error",
        stdout: (e as Error).message,
        exit_code: -1,
        elapsed_ms: 0,
        artifacts: [],
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
            "Edited Python run"
          : "Edited Python run";

      const res = await executeApi.save({
        question: `[edited] ${questionText}`.slice(0, 500),
        sql_text: "",
        python_text: code,
        answer_summary: `Edit-and-run: ${result.status} in ${result.elapsed_ms}ms`,
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
        No Python artifact yet. Run an analysis to see generated code here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="chip">sandbox-ready</span>
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
          <Download size={10} strokeWidth={2} /> .py
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
      </div>

      {artifact.explanation && (
        <div className="text-[12.5px] text-muted leading-relaxed">
          {artifact.explanation}
        </div>
      )}

      {diffOpen ? (
        <MonacoDiff
          original={original}
          modified={code}
          language="python"
          height={Math.min(520, Math.max(220, code.split("\n").length * 20 + 40))}
        />
      ) : (
        <MonacoEditor
          value={code}
          language="python"
          onChange={setCode}
          onRun={() => void run()}
          editorKey={runId ?? "py"}
          minHeight={140}
          maxHeight={520}
        />
      )}

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
          {datasetIds.length || sourceIds.length
            ? "runs against selected data"
            : "runs against all data"}
        </span>
      </div>

      {result && <PythonResult result={result} />}

      <div
        className="mt-4 pt-4 border-t"
        style={{ borderColor: "rgba(148,163,184,.16)" }}
      >
        <div className="font-mono text-[10.5px] uppercase tracking-wider text-muted/70 mb-2">
          Sandbox policy
        </div>
        {[
          ["CPU limit", "2 vCPU"],
          ["Memory limit", "2 GB"],
          ["Wall time", "30s"],
          ["Network", "disabled by default"],
        ].map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between py-1.5 text-[12px]"
          >
            <span className="text-muted">{k}</span>
            <span className="font-mono text-[11px] text-txt/80">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Result ─────────────────────────────────────────────── */

function PythonResult({ result }: { result: ExecutePythonResponse }) {
  const isError = !result.ok;

  return (
    <div
      className="rounded-xl overflow-hidden fade-up"
      style={{
        background: "var(--aida-code-bg)",
        border: isError
          ? "1px solid rgba(248,113,113,.3)"
          : "1px solid rgba(52,211,153,.3)",
      }}
    >
      <div
        className="flex items-center gap-2 px-3.5 py-2.5"
        style={{ borderBottom: "1px solid rgba(148,163,184,.16)" }}
      >
        {isError ? (
          <CircleAlert
            size={13}
            strokeWidth={2.5}
            className="text-err flex-none"
          />
        ) : (
          <Check size={13} strokeWidth={2.5} className="text-ok flex-none" />
        )}
        <span
          className="font-mono text-[11.5px]"
          style={{ color: isError ? "#F87171" : "#34D399" }}
        >
          {isError ? result.status || "error" : "ok"}
        </span>
        <span className="font-mono text-[10.5px] text-muted">
          · {result.elapsed_ms}ms
        </span>
        {!isError && (
          <span className="font-mono text-[10.5px] text-muted">
            · exit {result.exit_code}
          </span>
        )}
      </div>

      {result.stdout ? (
        <pre
          className="font-mono text-[11.5px] leading-[1.6] p-3.5 overflow-x-auto whitespace-pre-wrap break-words max-h-[360px] overflow-y-auto"
          style={{
            color: isError ? "#F87171" : "#E8EEF8",
            background: "transparent",
          }}
        >
          {result.stdout}
        </pre>
      ) : (
        <div className="px-3.5 py-3 text-[11.5px] text-muted/70 italic">
          (no output)
        </div>
      )}

      {result.artifacts.length > 0 && (
        <div
          className="px-3.5 py-2 text-[10.5px] text-muted font-mono"
          style={{ borderTop: "1px solid rgba(148,163,184,.16)" }}
        >
          {result.artifacts.length} artifact
          {result.artifacts.length === 1 ? "" : "s"} written
        </div>
      )}
    </div>
  );
}