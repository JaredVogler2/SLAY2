"use client";

import Link from "next/link";

import { useRunSummary } from "@/hooks/useRunSummary";

/** Shown in the header only when a run is saved in this browser. */
export function ResumeChip() {
  const run = useRunSummary();
  if (!run) {
    return null;
  }
  return (
    <Link
      href="/advisor"
      className="ml-1 hidden min-h-11 items-center gap-2 rounded-lg border border-copper/60 bg-copper/10 px-3 text-sm text-gold hover:bg-copper/20 md:inline-flex"
    >
      <span aria-hidden="true">↺</span>
      Resume
      {/* the class and ascension only where the header has the room: a tablet's row is full with the six links */}
      <span className="hidden xl:inline">
        {" · "}
        {run.name} A{run.ascension}
      </span>
    </Link>
  );
}
