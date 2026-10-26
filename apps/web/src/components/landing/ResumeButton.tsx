"use client";

import { CHARACTER_NAMES } from "@slay2/game-schema";

import { ButtonLink } from "@/components/ui/Button";
import { useRunState } from "@/lib/run-store";

/** “Resume run” appears only when a run exists in this browser. */
export function ResumeButton() {
  const run = useRunState();
  if (!run?.character) {
    return null;
  }
  const name = CHARACTER_NAMES[run.character.toUpperCase() as keyof typeof CHARACTER_NAMES];
  return (
    <ButtonLink href="/advisor" variant="ghost" size="lg">
      ↺ Resume {name} A{run.ascension}
    </ButtonLink>
  );
}
