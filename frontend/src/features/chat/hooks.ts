import { useCallback, useRef, useState } from "react";

import { streamChat } from "./api";
import type { AgentStep, Artifact, RunState } from "./types";

import type { FilterCondition } from "@/features/filters/types";

export interface UseAnalysisRun {
  run: (
    question: string,
    datasetIds: string[],
    sourceIds?: string[],
    conversationId?: string,
    filters?: FilterCondition[],
  ) => Promise<void>;
  cancel: () => void;
  reset: () => void;
  steps: AgentStep[];
  artifacts: Artifact[];
  state: RunState;
  question: string;
  elapsedMs: number | null;
  runId: string | null;
  /** Live text buffer of the narrative as it streams. Empty when idle. */
  streamingAnswer: string;
}

const STEP_ORDER = [
  "planning",
  "schema",
  "query",
  "compute",
  "translate",
  "visualizing",
  "suggest",
  "anomalies",
];

export function useAnalysisRun(): UseAnalysisRun {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [state, setState] = useState<RunState>("idle");
  const [question, setQuestion] = useState("");
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [streamingAnswer, setStreamingAnswer] = useState("");
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSteps([]);
    setArtifacts([]);
    setState("idle");
    setQuestion("");
    setElapsedMs(null);
    setRunId(null);
    setStreamingAnswer("");
  }, []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState("error");
    setStreamingAnswer("");
  }, []);

  const run = useCallback(
    async (
      q: string,
      datasetIds: string[],
      sourceIds: string[] = [],
      conversationId?: string,
      filters: FilterCondition[] = [],
    ) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;

      setQuestion(q);
      setSteps([]);
      setArtifacts([]);
      setElapsedMs(null);
      setRunId(null);
      setStreamingAnswer("");
      setState("running");

      await streamChat(
        {
          question: q,
          dataset_ids: datasetIds,
          source_ids: sourceIds,
          conversation_id: conversationId,
          filters,
        },
        {
          signal: ctrl.signal,
          onEvent: ({ event, data }) => {
            const d = (data ?? {}) as Record<string, unknown>;

            switch (event) {
              case "run_started": {
                setRunId(String(d.run_id ?? ""));
                break;
              }

              case "agent_step": {
                const stage = String(d.stage ?? "");
                const status = (d.status as AgentStep["status"]) ?? "running";
                const detail = d.detail ? String(d.detail) : undefined;

                setSteps((prev) => {
                  const idx = prev.findIndex((s) => s.stage === stage);
                  const next: AgentStep = { stage, status, detail };
                  if (idx === -1) return [...prev, next];
                  const copy = [...prev];
                  copy[idx] = next;
                  return copy;
                });
                break;
              }

              case "narrative_delta": {
                const delta = String(d.delta ?? "");
                if (delta) {
                  setStreamingAnswer((prev) => prev + delta);
                }
                break;
              }

              case "artifact": {
                const art = data as Artifact;
                // When the final answer artifact lands, clear the live buffer
                if (art.kind === "answer") {
                  setStreamingAnswer("");
                }
                setArtifacts((prev) => [...prev, art]);
                break;
              }

              case "run_complete": {
                setElapsedMs(
                  typeof d.elapsed_ms === "number" ? d.elapsed_ms : null,
                );
                setState("done");
                break;
              }

              case "error": {
                setArtifacts((prev) => [
                  ...prev,
                  {
                    kind: "error",
                    message: String(d.message ?? "Unknown error"),
                  },
                ]);
                setState("error");
                setStreamingAnswer("");
                break;
              }

              case "done":
              default:
                break;
            }
          },
          onClose: () => {
            setState((s) => (s === "running" ? "done" : s));
            setStreamingAnswer("");
          },
          onError: (err) => {
            if (err.name === "AbortError") return;
            setArtifacts((prev) => [
              ...prev,
              { kind: "error", message: err.message },
            ]);
            setState("error");
            setStreamingAnswer("");
          },
        },
      );
    },
    [],
  );

  return {
    run,
    cancel,
    reset,
    steps: sortSteps(steps),
    artifacts,
    state,
    question,
    elapsedMs,
    runId,
    streamingAnswer,
  };
}

function sortSteps(steps: AgentStep[]): AgentStep[] {
  return [...steps].sort((a, b) => {
    const ai = STEP_ORDER.indexOf(a.stage);
    const bi = STEP_ORDER.indexOf(b.stage);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}