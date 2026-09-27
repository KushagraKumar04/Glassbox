import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Download,
  FileJson,
  Play,
  Star,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { AnswerStream } from "@/features/chat/components/AnswerStream";
import { AgentRail } from "@/features/chat/components/AgentRail";
import type { AgentStep } from "@/features/chat/types";
import { useInspector } from "@/features/inspector/store";
import { API_BASE } from "@/config/constants";
import { exportJSON, safeFilename } from "@/shared/utils/export";
import { formatAbsolute } from "@/shared/utils/time";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { runsApi, runToArtifacts, type RunFull } from "../api";

export function RunDetailPage() {
  const nav = useNavigate();
  const { id } = useParams<{ id: string }>();
  const [confirming, setConfirming] = useState(false);

  const { data: run, isLoading, isError, error } = useQuery<RunFull>({
    queryKey: ["run", id],
    queryFn: () => runsApi.get(id!),
    enabled: !!id,
  });
  const qc = useQueryClient();
  const pinMutation = useMutation({
    mutationFn: (next: boolean) => runsApi.setPinned(id!, next),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["run", id] });
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["runs", "pinned"] });
    },
  });

  const inspectorSync = useInspector((s) => s.sync);
  const inspectorClear = useInspector((s) => s.clear);

  const steps: AgentStep[] = (run?.trace ?? []).map((e) => ({
    stage: e.stage,
    status: (e.status as AgentStep["status"]) ?? "done",
    detail: e.detail,
    ts: e.ts,
  }));

  const dedupedSteps: AgentStep[] = [];
  const seen = new Map<string, AgentStep>();
  for (const s of steps) {
    if (s.status === "done" || !seen.has(s.stage)) {
      seen.set(s.stage, s);
    }
  }
  for (const [, v] of seen) dedupedSteps.push(v);

  // Sync the inspector store so the SQL card's "why" button uses the
  // run's real dataset/source scope instead of an empty selection.
  useEffect(() => {
    if (!run) return;

    inspectorSync({
      artifacts: runToArtifacts(run),
      steps: dedupedSteps,
      state: run.status === "completed" ? "done" : "error",
      elapsedMs: run.elapsed_ms,
      runId: run.id,
      datasetIds: run.dataset_ids ?? [],
      sourceIds: run.source_ids ?? [],
    });

    return () => {
      // Clear when leaving so the next page starts fresh
      inspectorClear();
    };
  }, [run, dedupedSteps, inspectorSync, inspectorClear]);

  const remove = async () => {
    if (!id) return;
    await runsApi.remove(id);
    nav("/history", { replace: true });
  };

  const downloadJSON = () => {
    if (!run) return;
    exportJSON(run, safeFilename(run.question || "run", "json"));
  };

  const downloadCSV = () => {
    if (!id) return;
    // Backend re-runs the SQL and streams ALL rows — no client-side cap
    const url = `${API_BASE}/runs/${id}/export.csv`;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (isLoading) {
    return (
      <div className="flex-1 grid place-items-center text-muted">
        <div className="font-mono text-[12px]">Loading run…</div>
      </div>
    );
  }

  if (isError || !run) {
    return (
      <div className="flex-1 grid place-items-center text-muted">
        <div className="text-center">
          <div className="text-[13px] mb-2">Run not found</div>
          <div className="font-mono text-[11px] text-err">
            {(error as Error)?.message ?? ""}
          </div>
          <button
            type="button"
            onClick={() => nav("/history")}
            className="btn-chip focusable cursor-pointer mt-4 mx-auto"
          >
            <ArrowLeft size={11} strokeWidth={2} />
            Back to History
          </button>
        </div>
      </div>
    );
  }

  const artifacts = runToArtifacts(run);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[980px] mx-auto px-6 pt-7 pb-12">
        {/* Actions */}
        <div className="flex items-center justify-between mb-5 gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => nav("/history")}
            className="btn-chip focusable cursor-pointer"
          >
            <ArrowLeft size={11} strokeWidth={2} />
            History
          </button>

          <div className="flex gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() =>
                nav(`/workspace?q=${encodeURIComponent(run.question)}`)
              }
              className="btn-chip focusable cursor-pointer"
            >
              <Play size={10} strokeWidth={2} fill="currentColor" />
              Re-run
            </button>

            <button
              type="button"
              onClick={() => pinMutation.mutate(!run.pinned)}
              disabled={pinMutation.isPending}
              className="btn-chip focusable cursor-pointer disabled:opacity-50"
              style={
                run.pinned
                  ? { color: "#FBBF24", borderColor: "rgba(251,191,36,.35)" }
                  : undefined
              }
              title={run.pinned ? "Unpin from Home" : "Pin to Home"}
            >
              <Star
                size={10}
                strokeWidth={2}
                fill={run.pinned ? "#FBBF24" : "transparent"}
              />
              {run.pinned ? "Pinned" : "Pin"}
            </button>

            {run.sql_text && (
              <button
                type="button"
                onClick={downloadCSV}
                className="btn-chip focusable cursor-pointer"
                title="Re-run SQL and download every row as CSV"
              >
                <Download size={10} strokeWidth={2} />
                Full CSV
              </button>
            )}

            <button
              type="button"
              onClick={downloadJSON}
              className="btn-chip focusable cursor-pointer"
              title="Download the entire run as JSON"
            >
              <FileJson size={10} strokeWidth={2} />
              JSON
            </button>

            {confirming ? (
              <>
                <button
                  type="button"
                  onClick={() => void remove()}
                  className="px-2.5 py-1 rounded-md text-[10.5px] cursor-pointer focusable"
                  style={{
                    background: "rgba(248,113,113,.15)",
                    color: "#F87171",
                    border: "1px solid rgba(248,113,113,.3)",
                  }}
                >
                  Confirm delete
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className="btn-chip focusable cursor-pointer"
                >
                  Cancel
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="btn-chip focusable cursor-pointer"
                style={{ color: "#F87171" }}
              >
                <Trash2 size={10} strokeWidth={2} />
                Delete
              </button>
            )}
          </div>
        </div>

        {/* Question header */}
        <div className="mb-6">
          <div className="flex items-start gap-3">
            <div
              className="w-7 h-7 rounded-lg grid place-items-center flex-none mt-0.5 font-mono text-[10px] font-bold"
              style={{
                background: "linear-gradient(135deg,#8B5CF6,#22D3EE)",
                color: "#04121A",
              }}
            >
              Q
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium leading-snug">
                {run.question}
              </div>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span
                  className="chip"
                  style={{
                    borderColor:
                      run.status === "completed"
                        ? "rgba(52,211,153,.3)"
                        : "rgba(248,113,113,.3)",
                    color: run.status === "completed" ? "#34D399" : "#F87171",
                  }}
                >
                  {run.status}
                </span>
                <span className="chip">
                  {(run.elapsed_ms / 1000).toFixed(1)}s
                </span>
                {run.dataset_ids.length > 0 && (
                  <span className="chip">
                    {run.dataset_ids.length} file
                    {run.dataset_ids.length === 1 ? "" : "s"}
                  </span>
                )}
                {run.source_ids.length > 0 && (
                  <span className="chip">
                    {run.source_ids.length} source
                    {run.source_ids.length === 1 ? "" : "s"}
                  </span>
                )}
                <span className="chip">
                  {formatAbsolute(run.created_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <AgentRail
          steps={dedupedSteps}
          elapsedMs={run.elapsed_ms}
          state={run.status === "completed" ? "done" : "error"}
        />

        <AnswerStream
          artifacts={artifacts}
          question={run.question}
          onAsk={(q) => nav(`/workspace?q=${encodeURIComponent(q)}`)}
        />
      </div>
    </div>
  );
}
