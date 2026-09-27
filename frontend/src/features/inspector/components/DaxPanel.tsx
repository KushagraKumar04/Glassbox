import { Check, Copy, Download, Info } from "lucide-react";
import { useEffect, useState } from "react";

import type { Artifact, DaxArtifact } from "@/features/chat/types";
import { findArtifact } from "@/features/chat/types";
import { MonacoEditor } from "@/features/execute/components/MonacoEditor";
import { downloadText, safeFilename } from "@/shared/utils/export";

export function DaxPanel({ artifacts }: { artifacts: Artifact[] }) {
  const artifact = findArtifact(artifacts, "dax") as DaxArtifact | undefined;
  const runId = artifacts.find((a) => a.kind === "sql") ? "dax" : "dax";

  const original = artifact?.content ?? "";
  const [code, setCode] = useState(original);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setCode(original);
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
    downloadText(code + "\n", safeFilename("measure", "dax"), "text/plain");
  };

  if (!artifact || !artifact.content) {
    return (
      <div className="text-[12.5px] text-muted leading-relaxed">
        No DAX artifact yet. Run an analysis to see the Power BI equivalent
        here.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Status chips */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className="chip"
          style={{ borderColor: "rgba(139,92,246,.3)", color: "#8B5CF6" }}
        >
          {artifact.shape === "table"
            ? "calculated table"
            : "measure"}
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
          <Download size={10} strokeWidth={2} /> .dax
        </button>
      </div>

      {artifact.explanation && (
        <div className="text-[12.5px] text-muted leading-relaxed">
          {artifact.explanation}
        </div>
      )}

      {/* Editor — read-only-ish but editable for tweaks */}
      <MonacoEditor
        value={code}
        language="dax"
        onChange={setCode}
        editorKey={runId}
        minHeight={140}
        maxHeight={520}
      />

      {/* How-to */}
      <div
        className="rounded-xl p-3 text-[11.5px] leading-relaxed"
        style={{
          background: "rgba(139,92,246,.06)",
          border: "1px solid rgba(139,92,246,.25)",
          color: "#E8EEF8",
        }}
      >
        <div className="flex items-start gap-2 mb-2">
          <Info
            size={12}
            className="text-violet flex-none mt-0.5"
            strokeWidth={2}
          />
          <span className="font-medium text-[12px]">How to use in Power BI</span>
        </div>
        <ol className="list-decimal list-inside space-y-1 text-muted ml-1">
          <li>
            {artifact.shape === "table"
              ? "Modeling → New table → paste this expression."
              : "Modeling → New measure → paste this expression."}
          </li>
          <li>Reference the measure in a visual to slice by dimension.</li>
          <li>
            Verify table and column names match your Power BI data model — the
            schema above came from the connected dataset.
          </li>
        </ol>
      </div>

      {dirty && (
        <div className="font-mono text-[10.5px] text-muted/70">
          Local edits are not persisted. Copy or download to save them.
        </div>
      )}
    </div>
  );
}