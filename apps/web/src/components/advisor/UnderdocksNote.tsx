import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import {
  UNDERDOCKS,
  underdocksNote,
  type UnderdocksData,
  type UnderdocksFinding,
} from "@/lib/underdocks";

/**
 * The one callout that tells a visitor in Underdocks that the simulated runs behind a panel were played in Overgrowth (gap G12: nothing was fitted in
 * Underdocks; ADR-064 tests three of the results there, and the panel says how that came out). Every advisor panel that shows simulated numbers uses it, so the
 * caveat looks the same wherever it appears: a boxed note in the colour the site keeps for risk, never a bare line that a visitor can read past.
 *
 * Given the finding the panel rests on, the note also says what the Underdocks test of that finding found (or that it is registered and has not been run),
 * from the exporter's file, with its figures and, for a passed test, how big it is beside the Overgrowth one.
 */
export function UnderdocksNote({
  children,
  className,
  finding,
  character,
  data = UNDERDOCKS,
}: {
  children: ReactNode;
  className?: string;
  /** the result the panel rests on: its Underdocks test is quoted in the note */
  finding?: UnderdocksFinding;
  /** the run's class: when its own Underdocks games went the other way the note says so (ADR-064 item 6 v) */
  character?: string | null | undefined;
  data?: UnderdocksData;
}) {
  const result = finding
    ? underdocksNote(finding, "underdocks", data, character ?? undefined)
    : null;
  return (
    <p
      role="note"
      data-underdocks-note=""
      {...(result ? { "data-underdocks-result": result.kind } : {})}
      className={cn(
        "rounded-lg border border-rose-deep/60 bg-rose/10 p-3 text-sm text-rose",
        className,
      )}
    >
      {children}
      {result ? (
        <>
          {" "}
          <strong className="font-medium text-parchment">In Underdocks. </strong>
          {result.text}{" "}
          <Link
            className="text-teal underline decoration-dotted underline-offset-4"
            href="/methods#underdocks"
          >
            Evidence &amp; methods
          </Link>
        </>
      ) : null}
    </p>
  );
}
