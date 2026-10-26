"use client";

import { useCallback, useSyncExternalStore } from "react";

type Primitive = string | number | boolean;

const EVENT = "slay2:urlchange";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

const getSearch = (): string => window.location.search;
const getServerSearch = (): string => "";

/**
 * State kept in the query string (history.replaceState), so a configuration can be shared as a link. The URL is the
 * single source of truth, read through useSyncExternalStore: the server and the first client render use `initial`, and
 * the real value appears right after hydration without an effect. Only primitive, non-private values belong here
 * (never run data).
 */
export function useUrlState<T extends Primitive>(
  key: string,
  initial: T,
  parse: (raw: string) => T | undefined,
): [T, (next: T) => void] {
  const search = useSyncExternalStore(subscribe, getSearch, getServerSearch);
  const raw = new URLSearchParams(search).get(key);
  const parsed = raw === null ? undefined : parse(raw);
  const value = parsed ?? initial;

  const set = useCallback(
    (next: T) => {
      const url = new URL(window.location.href);
      if (next === initial) {
        url.searchParams.delete(key);
      } else {
        url.searchParams.set(key, String(next));
      }
      window.history.replaceState(null, "", url);
      window.dispatchEvent(new Event(EVENT));
    },
    [key, initial],
  );
  return [value, set];
}

export const parseIntInRange =
  (min: number, max: number) =>
  (raw: string): number | undefined => {
    const n = Number(raw);
    return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
  };

export const parseOneOf =
  <T extends string>(allowed: readonly T[]) =>
  (raw: string): T | undefined =>
    (allowed as readonly string[]).includes(raw) ? (raw as T) : undefined;
