import { create } from "zustand";

import type {
  AgentStep,
  Artifact,
  RunState,
} from "@/features/chat/types";

export type InspectorTab = "sql" | "python" | "dax" | "trace" | "assumptions";

interface InspectorState {
  open: boolean;
  tab: InspectorTab;

  artifacts: Artifact[];
  steps: AgentStep[];
  state: RunState;
  elapsedMs: number | null;
  runId: string | null;

  datasetIds: string[];
  sourceIds: string[];

  setOpen: (open: boolean) => void;
  toggle: () => void;
  setTab: (tab: InspectorTab) => void;

  sync: (payload: {
    artifacts: Artifact[];
    steps: AgentStep[];
    state: RunState;
    elapsedMs: number | null;
    runId: string | null;
    datasetIds: string[];
    sourceIds: string[];
  }) => void;

  clear: () => void;
}

export const useInspector = create<InspectorState>((set) => ({
  // Closed by default. Workspace auto-opens on first run of the session.
  open: false,
  tab: "sql",
  artifacts: [],
  steps: [],
  state: "idle",
  elapsedMs: null,
  runId: null,
  datasetIds: [],
  sourceIds: [],

  setOpen: (open) => set({ open }),
  toggle: () => set((s) => ({ open: !s.open })),
  setTab: (tab) => set({ tab }),

  sync: ({
    artifacts,
    steps,
    state,
    elapsedMs,
    runId,
    datasetIds,
    sourceIds,
  }) =>
    set({
      artifacts,
      steps,
      state,
      elapsedMs,
      runId,
      datasetIds,
      sourceIds,
    }),

  clear: () =>
    set({
      artifacts: [],
      steps: [],
      state: "idle",
      elapsedMs: null,
      runId: null,
      datasetIds: [],
      sourceIds: [],
    }),
}));