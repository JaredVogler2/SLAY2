import Link from "next/link";

import {
  ASCENSION,
  ascensionNote,
  type AscensionData,
  type AscensionFinding,
} from "@/lib/ascension";

/**
 * What a run at Ascension 1 to 10 should know about one of the three findings (ADR-058): that it was measured at Ascension 0 and, once
 * the Ascension 9 test has been run, how that came out. It renders nothing for a run at Ascension 0 and for a run whose Ascension the
 * player has not confirmed (the advisor then assumes 0 and says so elsewhere).
 */
export function AscensionNote({
  finding,
  level,
  confirmed,
  character,
  data = ASCENSION,
  className = "",
}: {
  finding: AscensionFinding;
  level: number;
  confirmed: boolean;
  /** the run's class: when its own Ascension 9 games went the other way the line says so (ADR-058 item 5 v) */
  character?: string | null | undefined;
  data?: AscensionData;
  className?: string;
}) {
  const note = ascensionNote(finding, level, confirmed, data, character ?? undefined);
  if (!note) return null;
  const tone =
    note.kind === "passed"
      ? "border-teal-deep/70 bg-teal/10 text-teal"
      : note.kind === "registered"
        ? "border-line bg-charcoal/60 text-muted"
        : "border-copper-deep/70 bg-copper/10 text-copper";
  return (
    <p
      className={`rounded-lg border p-3 text-sm ${tone} ${className}`}
      data-ascension-note={note.kind}
    >
      <strong className="font-medium text-parchment">Your Ascension. </strong>
      {note.text}{" "}
      <Link
        className="text-teal underline decoration-dotted underline-offset-4"
        href="/methods#ascension"
      >
        Evidence &amp; methods
      </Link>
    </p>
  );
}
