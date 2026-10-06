/**
 * Thread store — accumulates completed runs for the current conversation.
 *
 * Kept separate from `useAnalysisRun` because:
 *   - The hook streams ONE run at a time
 *   - The thread needs to persist completed runs across runs
 *   - Thread state must survive question changes
 *
 * Threads hydrate from the backend on page load via
 * `runsApi.conversation(conversationId)`.
 */
import { create } from "zustand";

import type { RunFull } from "@/features/history/api";

interface ThreadState {
  conversationId: string | null;
  runs: RunFull[];
  hydrated: boolean;

  /** Replace the whole thread. Used when hydrating from the backend. */
  setRuns: (conversationId: string, runs: RunFull[]) => void;

  /** Append one run. Used after a run completes. */
  appendRun: (run: RunFull) => void;

  /** Delete one run by id. */
  removeRun: (runId: string) => void;

  /** Reset — called when starting a new conversation. */
  clear: () => void;

  /** True if the given run id is already in the thread. */
  hasRun: (runId: string) => boolean;
}

export const useThread = create<ThreadState>((set, get) => ({
  conversationId: null,
  runs: [],
  hydrated: false,

  setRuns: (conversationId, runs) =>
    set({ conversationId, runs, hydrated: true }),

  appendRun: (run) =>
    set((s) => {
      // Ignore duplicates — a run may arrive both from the live stream
      // and from a hydration refetch
      if (s.runs.some((r) => r.id === run.id)) return s;
      return { ...s, runs: [...s.runs, run] };
    }),

  removeRun: (runId) =>
    set((s) => ({ ...s, runs: s.runs.filter((r) => r.id !== runId) })),

  clear: () => set({ conversationId: null, runs: [], hydrated: false }),

  hasRun: (runId) => get().runs.some((r) => r.id === runId),
}));