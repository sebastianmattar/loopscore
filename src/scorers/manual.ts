import type { ManualResult } from "../types.js";

/** Returns a pending ManualResult to be filled in later via `bench review`. */
export function createManualPending(): ManualResult {
  return {
    score: null,
    notes: null,
    reviewedAt: null,
    pending: true,
  };
}

/** Fills in a manual result after review. */
export function applyManualScore(score: number, notes: string): ManualResult {
  return {
    score,
    notes,
    reviewedAt: new Date().toISOString(),
    pending: false,
  };
}
