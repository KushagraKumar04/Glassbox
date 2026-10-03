import { create } from "zustand";

import { STEPS } from "./steps";

const STORAGE_KEY = "glassbox.onboarding.completed";

function hasCompleted(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markCompleted(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* localStorage disabled — tour will re-show next session */
  }
}

interface TourState {
  active: boolean;
  stepIndex: number;
  completed: boolean;

  /** Start the tour from step 0. */
  start: () => void;

  /** Advance to the next step. Finishes if this is the last one. */
  next: () => void;

  /** Go back one step. No-op at step 0. */
  prev: () => void;

  /** Jump to a specific step (for the dots). */
  goTo: (i: number) => void;

  /** End early — marks as completed so it doesn't nag again. */
  skip: () => void;

  /** Finish normally — marks as completed. */
  finish: () => void;

  /** Reset completion flag (used by "restart tour" actions). */
  reset: () => void;
}

export const useTour = create<TourState>((set, get) => ({
  active: false,
  stepIndex: 0,
  completed: hasCompleted(),

  start: () => set({ active: true, stepIndex: 0 }),

  next: () => {
    const { stepIndex } = get();
    if (stepIndex >= STEPS.length - 1) {
      get().finish();
      return;
    }
    set({ stepIndex: stepIndex + 1 });
  },

  prev: () => set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) })),

  goTo: (i) =>
    set({ stepIndex: Math.max(0, Math.min(STEPS.length - 1, i)) }),

  skip: () => {
    markCompleted();
    set({ active: false, stepIndex: 0, completed: true });
  },

  finish: () => {
    markCompleted();
    set({ active: false, stepIndex: 0, completed: true });
  },

  reset: () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    set({ completed: false });
  },
}));