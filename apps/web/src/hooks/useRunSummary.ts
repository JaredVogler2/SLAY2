"use client";

import { useSyncExternalStore } from "react";

import { getRunSummary, subscribeRunSummary, type RunSummary } from "@/lib/run-summary";

/** The class and ascension of the run saved in this browser (null when none, and during server rendering and hydration). */
export function useRunSummary(): RunSummary | null {
  return useSyncExternalStore(subscribeRunSummary, getRunSummary, () => null);
}
