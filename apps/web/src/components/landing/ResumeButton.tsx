"use client";

import { ButtonLink } from "@/components/ui/Button";
import { useRunSummary } from "@/hooks/useRunSummary";

/** “Resume run” appears only when a run exists in this browser. */
export function ResumeButton() {
  const run = useRunSummary();
  if (!run) {
    return null;
  }
  return (
    <ButtonLink href="/advisor" variant="ghost" size="lg">
      ↺ Resume {run.name} A{run.ascension}
    </ButtonLink>
  );
}
