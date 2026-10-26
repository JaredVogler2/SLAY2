"use client";

import Link from "next/link";

import { CHARACTER_NAMES } from "@slay2/game-schema";

import { useRunState } from "@/lib/run-store";

/** Shown in the header only when a run is saved in this browser. */
export function ResumeChip() {
  const run = useRunState();
  if (!run?.character) {
    return null;
  }
  return (
    <Link
      href="/advisor"
      className="ml-1 hidden min-h-11 items-center gap-2 rounded-lg border border-copper/60 bg-copper/10 px-3 text-sm text-gold hover:bg-copper/20 sm:inline-flex"
    >
      <span aria-hidden="true">↺</span>
      Resume · {CHARACTER_NAMES[run.character.toUpperCase() as keyof typeof CHARACTER_NAMES]} A
      {run.ascension}
    </Link>
  );
}
