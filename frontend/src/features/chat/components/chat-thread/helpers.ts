/**
 * Helpers for extracting typed artifacts from a persisted RunFull.
 * RunFull is a flat record (sql_text, python_text, dax_text, chart_spec,
 * trace, answer) — we expose a findArtifactFromRun shim so the thread
 * can ask for `next_questions` (which we don't persist yet) and other
 * computed views without special-casing every field.
 */
import type { RunFull } from "@/features/history/api";
import type { NextQuestion } from "../../types";

const _nextQsCache = new WeakMap<RunFull, NextQuestion[] | null>();

/**
 * Extract a well-known artifact from a RunFull.
 *
 * Today only `next_questions` is supported — it's derived from the SQL
 * on-demand when the thread renders. Everything else (SQL, Python, DAX,
 * chart, trace, answer) is a top-level field on RunFull and read directly.
 */
export function findArtifactFromRun<T>(
  run: RunFull,
  kind: "next_questions",
): T | null {
  if (kind !== "next_questions") return null;
  if (_nextQsCache.has(run)) {
    const cached = _nextQsCache.get(run);
    return (cached as unknown as T) ?? null;
  }
  // No cached suggestions on the run — return null.
  // The frontend can request suggestions separately if needed;
  // for now, thread mode relies on the live run's `next_questions`
  // artifact which is only available in single-run streaming.
  _nextQsCache.set(run, null);
  return null;
}