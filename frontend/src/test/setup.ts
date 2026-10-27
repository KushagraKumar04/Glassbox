import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

/**
 * Global test teardown. Runs after every test in every file:
 *  - cleanup()             — unmount React trees
 *  - clearAllMocks()       — reset call history + args
 *  - unstubAllGlobals()    — undo vi.stubGlobal(fetch, ...) etc.
 *  - useRealTimers()       — undo vi.useFakeTimers()
 */
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});