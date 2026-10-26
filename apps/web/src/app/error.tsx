"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { runStore } from "@/lib/run-store";

/** Server-side error identifiers are safe to show (they only match a log line); messages and stacks are not. */
function digestOf(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "digest" in error) {
    const d = (error as { digest?: unknown }).digest;
    return typeof d === "string" && d.length > 0 ? d : null;
  }
  return null;
}

export default function RouteError({ error, retry }: { error: unknown; retry: () => void }) {
  const [cleared, setCleared] = useState(false);
  const digest = digestOf(error);

  useEffect(() => {
    // Console only: SLAY2 has no remote error reporting, so nothing leaves the browser.
    console.error(error);
  }, [error]);

  const clearSavedRun = (): void => {
    try {
      runStore.set(null);
      setCleared(true);
    } catch {
      setCleared(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-20 sm:px-6">
      <p className="eyebrow mb-3">Something broke</p>
      <h1 className="text-3xl leading-tight text-parchment sm:text-4xl">
        That page hit an unexpected error
      </h1>
      <p className="mt-4 text-lg text-muted">
        It is a bug in SLAY2, not something you did. Trying again often works. If it keeps
        happening, your saved run data may be the cause, and clearing it is safe: it only removes
        the run stored in this browser.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button
          variant="primary"
          onClick={() => {
            retry();
          }}
        >
          Try again
        </Button>
        <Button variant="secondary" onClick={clearSavedRun}>
          Clear my saved run
        </Button>
        <Link href="/" className="text-sm text-teal underline decoration-dotted underline-offset-4">
          Go to the start
        </Link>
      </div>
      {cleared ? (
        <p role="status" className="mt-4 text-sm text-teal">
          Saved run cleared. Try again now.
        </p>
      ) : null}
      {digest ? (
        <p className="mt-8 text-xs text-dim">
          Error reference: <code className="font-mono">{digest}</code>
        </p>
      ) : null}
    </div>
  );
}
