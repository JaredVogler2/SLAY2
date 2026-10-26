import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

export type BadgeTone = "exact" | "heuristic" | "unverified" | "neutral" | "build";

const tones: Record<BadgeTone, string> = {
  exact: "border-teal-deep/70 bg-teal/10 text-teal",
  heuristic: "border-copper-deep/70 bg-copper/10 text-copper",
  unverified: "border-rose-deep/70 bg-rose/10 text-rose",
  neutral: "border-line-strong bg-ink-2 text-muted",
  build: "border-gold/40 bg-gold/10 text-gold",
};

const glyph: Record<BadgeTone, string> = {
  exact: "◆",
  heuristic: "◇",
  unverified: "▲",
  neutral: "●",
  build: "⬡",
};

/** A status chip. The glyph carries the meaning in addition to the colour (colour-blind safe). */
export function Badge({
  tone = "neutral",
  children,
  title,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.7rem] uppercase tracking-[0.12em] sm:whitespace-nowrap",
        tones[tone],
      )}
    >
      <span aria-hidden="true">{glyph[tone]}</span>
      {children}
    </span>
  );
}
