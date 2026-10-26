"use client";

import { useSyncExternalStore } from "react";

const subscribe = (): (() => void) => () => undefined;

/** false during server rendering and hydration, true afterwards: lets client-only data (localStorage) avoid a flash. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
