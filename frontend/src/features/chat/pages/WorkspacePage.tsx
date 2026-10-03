import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { runsApi } from "@/features/history/api";
import {
  List,
  MessagesSquare,
  Plus,
  Rows3,
  Star,
} from "lucide-react";

import { DatasetPicker } from "@/features/datasets/components/DatasetPicker";
import {
  decodeFilters,
  encodeFilters,
} from "@/features/filters/encoding";
import { FilterBar } from "@/features/filters/components/FilterBar";
import type { FilterCondition } from "@/features/filters/types";
import { useInspector } from "@/features/inspector/store";
import { SourcePicker } from "@/features/sources/components/SourcePicker";
import { cn } from "@/shared/utils/cn";

import { AgentRail } from "../components/AgentRail";
import { AnswerStream } from "../components/AnswerStream";
import { ChatThreadView } from "../components/chat-thread/ChatThreadView";
import { Composer } from "../components/Composer";
import { fetchConversationRuns } from "../api";
import { useAnalysisRun } from "../hooks";
import { useThread } from "../thread-store";
import { findArtifact } from "../types";
import type {
  AgentStep,
  DaxArtifact,
  PythonArtifact,
  SqlArtifact,
  TraceArtifact,
} from "../types";
import type { RunFull } from "@/features/history/api";

type Mode = "single" | "thread";

function newConversationId(): string {
  return (
    Math.random().toString(36).slice(2, 8) +
    Date.now().toString(36).slice(-6)
  );
}

export function WorkspacePage() {
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const {
    run,
    cancel,
    reset,
    steps,
    artifacts,
    state,
    question,
    elapsedMs,
    runId,
    streamingAnswer,
  } = useAnalysisRun();

  const inspectorSync = useInspector((s) => s.sync);
  const inspectorClear = useInspector((s) => s.clear);
  const qc = useQueryClient();
  const [isPinned, setIsPinned] = useState(false);
  const pinMutation = useMutation({
    mutationFn: (next: boolean) =>
      runsApi.setPinned(runId!, next),
    onSuccess: (data) => {
      setIsPinned(data.pinned);
      qc.invalidateQueries({ queryKey: ["runs"] });
      qc.invalidateQueries({ queryKey: ["runs", "pinned"] });
    },
  });

  const threadRuns = useThread((s) => s.runs);
  const threadHydrated = useThread((s) => s.hydrated);
  const setThreadRuns = useThread((s) => s.setRuns);
  const appendThreadRun = useThread((s) => s.appendRun);
  const clearThread = useThread((s) => s.clear);
  const hasThreadRun = useThread((s) => s.hasRun);

  const fired = useRef<string | null>(null);
  const [selectedDatasetIds, setSelectedDatasetIds] = useState<string[]>([]);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);

  const conversationId = params.get("c") ?? "";
  const mode: Mode = (params.get("mode") as Mode) === "thread" ? "thread" : "single";

  const filters: FilterCondition[] = useMemo(
    () => decodeFilters(params.get("f")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [params.get("f")],
  );

  // Ensure a conversation id exists
  useEffect(() => {
    if (!conversationId) {
      const fresh = newConversationId();
      const next = new URLSearchParams(params);
      next.set("c", fresh);
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Hydrate thread when in thread mode + conversation id known
  useEffect(() => {
    if (mode !== "thread") return;
    if (!conversationId) return;
    if (threadHydrated && useThread.getState().conversationId === conversationId) {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const runs = await fetchConversationRuns(conversationId);
        if (!cancelled) setThreadRuns(conversationId, runs);
      } catch {
        if (!cancelled) setThreadRuns(conversationId, []);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, conversationId]);

  // Enriched steps (trace timestamps merged back)
  const enrichedSteps: AgentStep[] = useMemo(() => {
    const trace = findArtifact(artifacts, "trace") as TraceArtifact | undefined;
    if (!trace?.events?.length) return steps;
    const tsByStage = new Map<string, number>();
    for (const ev of trace.events) {
      if (ev.status === "done") tsByStage.set(ev.stage, ev.ts);
    }
    return steps.map((s) => ({ ...s, ts: tsByStage.get(s.stage) ?? s.ts }));
  }, [steps, artifacts]);

  // Auto-fire from ?q=
  // Depends on both conversationId and the current q param so navigating
  // to a new ?q= within the same conversation still triggers a run.
  useEffect(() => {
    const q = params.get("q");
    if (q && fired.current !== q && conversationId) {
      fired.current = q;
      run(q, selectedDatasetIds, selectedSourceIds, conversationId, filters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, params.get("q")]);

  // Sync inspector
  useEffect(() => {
    inspectorSync({
      artifacts,
      steps: enrichedSteps,
      state,
      elapsedMs,
      runId,
      datasetIds: selectedDatasetIds,
      sourceIds: selectedSourceIds,
    });
  }, [
    artifacts,
    enrichedSteps,
    state,
    elapsedMs,
    runId,
    selectedDatasetIds,
    selectedSourceIds,
    inspectorSync,
  ]);

  // Reset the pinned flag when a new run starts
  useEffect(() => {
    setIsPinned(false);
  }, [runId]);

  // When a run completes, append it to the thread
  useEffect(() => {
    if (state !== "done" && state !== "error") return;
    if (!runId || !conversationId) return;
    if (hasThreadRun(runId)) return;

    const sql = findArtifact(artifacts, "sql") as SqlArtifact | undefined;
    const py = findArtifact(artifacts, "python") as PythonArtifact | undefined;
    const dax = findArtifact(artifacts, "dax") as DaxArtifact | undefined;
    const trace = findArtifact(artifacts, "trace") as TraceArtifact | undefined;
    const answer = findArtifact(artifacts, "answer") as
      | { kind: "answer"; content: { summary: string; findings?: string[]; caveats?: string[] } }
      | undefined;
    const chart = findArtifact(artifacts, "chart") as
      | { kind: "chart"; spec: Record<string, unknown> }
      | undefined;

    const synthetic: RunFull = {
      id: runId,
      conversation_id: conversationId,
      question,
      status: state === "error" ? "failed" : "completed",
      elapsed_ms: elapsedMs ?? 0,
      dataset_count: selectedDatasetIds.length,
      source_count: selectedSourceIds.length,
      created_at: new Date().toISOString(),
      sql_text: sql?.content ?? "",
      python_text: py?.content ?? "",
      dax_text: dax?.content ?? "",
      answer: answer?.content ?? { summary: "", findings: [], caveats: [] },
      chart_spec: (chart?.spec ?? {}) as never,
      trace: trace?.events ?? [],
      dataset_ids: selectedDatasetIds,
      source_ids: selectedSourceIds,
      error: state === "error" ? "Run failed." : "",
      completed_at: new Date().toISOString(),
      pinned: false,
      pinned_at: null,
    };

    appendThreadRun(synthetic);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, runId, conversationId]);

  const setMode = (m: Mode) => {
    const next = new URLSearchParams(params);
    next.set("mode", m);
    setParams(next, { replace: true });
  };

  const setFilters = (next: FilterCondition[]) => {
    const url = new URLSearchParams(params);
    const enc = encodeFilters(next);
    if (enc) url.set("f", enc);
    else url.delete("f");
    setParams(url, { replace: true });
  };

  const handleRun = (q: string) => {
    fired.current = q;
    const next = new URLSearchParams(params);
    next.set("q", q);
    if (!next.get("c")) next.set("c", newConversationId());
    setParams(next, { replace: true });
    run(
      q,
      selectedDatasetIds,
      selectedSourceIds,
      next.get("c") ?? undefined,
      filters,
    );
  };

  const handleNewConversation = () => {
    fired.current = null;
    setSelectedDatasetIds([]);
    setSelectedSourceIds([]);
    reset();
    inspectorClear();
    clearThread();
    const fresh = newConversationId();
    setParams({ c: fresh, mode }, { replace: true });
  };

  return (
    <>
      {/* Mode + conversation strip */}
      <div
        className="flex-none flex items-center gap-2 px-5 py-2 border-b"
        style={{
          borderColor: "var(--aida-border)",
          background: "var(--aida-surface)",
        }}
      >
        <ModeToggle value={mode} onChange={setMode} />

        {conversationId && (
          <span
            className="chip"
            style={{
              borderColor: "rgba(139,92,246,.3)",
              color: "#8B5CF6",
            }}
            title="Follow-ups in this conversation reuse the prior context"
          >
            <MessagesSquare size={10} strokeWidth={2} />
            {conversationId.slice(0, 6)}
          </span>
        )}

        {threadRuns.length > 0 && mode === "thread" && (
          <span className="chip">{threadRuns.length} message{threadRuns.length === 1 ? "" : "s"}</span>
        )}

        <button
          type="button"
          onClick={handleNewConversation}
          className="chip cursor-pointer hover:brightness-125 focusable ml-auto"
          title="Start a fresh conversation"
        >
          <Plus size={10} strokeWidth={2.5} />
          new conversation
        </button>
      </div>

      {/* Content area — swaps between single and thread */}
      {mode === "single" ? (
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[980px] mx-auto px-6 pt-7 pb-10">
            {!question && (
              <div className="text-center py-28 text-muted">
                <div className="font-mono text-[13px] mb-2">
                  No active analysis
                </div>
                <div className="text-[12.5px] mb-6">
                  Ask a question below, or pick one from Home.
                </div>
                <button
                  type="button"
                  onClick={() => nav("/home")}
                  className="chip cursor-pointer hover:brightness-125 focusable"
                >
                  ← Browse suggested questions
                </button>
              </div>
            )}

            {question && (
              <div className="mb-6 fade-up">
                <div className="flex items-start gap-3">
                  <div
                    className="w-7 h-7 rounded-lg grid place-items-center flex-none mt-0.5 font-mono text-[10px] font-bold"
                    style={{
                      background: "linear-gradient(135deg,#8B5CF6,#22D3EE)",
                      color: "#04121A",
                    }}
                    aria-hidden="true"
                  >
                    Q
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium leading-snug">
                      {question}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <span className="chip">state: {state}</span>
                      {elapsedMs != null && (
                        <span className="chip">
                          {(elapsedMs / 1000).toFixed(1)}s
                        </span>
                      )}
                    <span
                      className="chip"
                      style={{
                        borderColor: "rgba(52,211,153,.3)",
                        color: "#34D399",
                      }}
                    >
                      read-only ✓
                    </span>

                    {state === "done" && runId && (
                      <button
                        type="button"
                        onClick={() => pinMutation.mutate(!isPinned)}
                        disabled={pinMutation.isPending}
                        className="chip cursor-pointer hover:brightness-125 focusable disabled:opacity-50"
                        style={
                          isPinned
                            ? {
                                borderColor: "rgba(251,191,36,.4)",
                                color: "#FBBF24",
                              }
                            : undefined
                        }
                        title={isPinned ? "Unpin from Home" : "Pin to Home"}
                      >
                        <Star
                          size={10}
                          strokeWidth={2}
                          fill={isPinned ? "#FBBF24" : "transparent"}
                        />
                        {isPinned ? "pinned" : "pin"}
                      </button>
                    )}
                  </div>
                  </div>
                </div>
              </div>
            )}

            <AgentRail
              steps={enrichedSteps}
              elapsedMs={elapsedMs}
              state={state}
            />
            <AnswerStream
              artifacts={artifacts}
              streamingAnswer={streamingAnswer}
              question={question}
              onAsk={(q) => handleRun(q)}
            />
          </div>
        </main>
      ) : (
        <ChatThreadView
          runs={threadRuns}
          streaming={{
            active: state === "running",
            question,
            steps: enrichedSteps,
            artifacts,
            state,
            elapsedMs,
            streamingAnswer,
          }}
          onAsk={(q) => handleRun(q)}
        />
      )}

      <FilterBar
        filters={filters}
        onChange={setFilters}
        datasetIds={selectedDatasetIds}
        disabled={state === "running"}
      />

      <Composer
        onRun={handleRun}
        onCancel={cancel}
        state={state}
        sourceSlot={
          <div className="flex items-center gap-2 flex-wrap">
            <DatasetPicker
              selectedIds={selectedDatasetIds}
              onChange={setSelectedDatasetIds}
            />
            <SourcePicker
              selectedIds={selectedSourceIds}
              onChange={setSelectedSourceIds}
            />
          </div>
        }
      />
    </>
  );
}

/* ── Mode toggle ─────────────────────────────────────────── */

function ModeToggle({
  value,
  onChange,
}: {
  value: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <div
      className="flex gap-1 p-0.5 rounded-lg flex-none"
      style={{ background: "var(--aida-code-bg)" }}
    >
      {(
        [
          ["single", "Single", <List key="l" size={11} strokeWidth={2} />],
          ["thread", "Thread", <Rows3 key="r" size={11} strokeWidth={2} />],
        ] as const
      ).map(([id, label, icon]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-mono text-[11px] cursor-pointer transition-colors focusable",
            value === id
              ? "bg-cyan/15 text-cyan"
              : "text-muted hover:text-txt",
          )}
          title={
            id === "single"
              ? "One focused question at a time"
              : "Chat-style — every question stays visible"
          }
        >
          {icon}
          {label}
        </button>
      ))}
    </div>
  );
}

