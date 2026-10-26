import type { Rational } from "@slay2/odds";

import { pctSmart } from "@/lib/format";
import { cn } from "@/lib/cn";

export type SegmentTone =
  "rare" | "uncommon" | "common" | "yes" | "no" | "fight" | "treasure" | "shop" | "event";

const fills: Record<SegmentTone, string> = {
  rare: "bg-copper",
  uncommon:
    "bg-teal-deep [background-image:repeating-linear-gradient(135deg,transparent_0_5px,rgb(0_0_0/0.28)_5px_7px)]",
  common:
    "bg-ink-3 [background-image:radial-gradient(rgb(255_255_255/0.22)_1px,transparent_1.2px)] [background-size:6px_6px]",
  yes: "bg-teal",
  no: "bg-ink-3",
  fight: "bg-rose-deep",
  treasure: "bg-gold",
  shop: "bg-teal-deep",
  event:
    "bg-ink-3 [background-image:radial-gradient(rgb(255_255_255/0.22)_1px,transparent_1.2px)] [background-size:6px_6px]",
};

export interface Segment {
  key: string;
  label: string;
  value: Rational;
  tone: SegmentTone;
}

/**
 * Stacked horizontal bar whose segments are labelled with text and distinguished by texture as well as colour.
 * The accessible name spells out every value.
 */
export function ProbabilityBar({
  segments,
  className,
  digits = 2,
}: {
  segments: readonly Segment[];
  className?: string;
  digits?: number;
}) {
  const summary = segments.map((s) => `${s.label} ${pctSmart(s.value, digits)}`).join(", ");
  return (
    <div className={className}>
      <div
        role="img"
        aria-label={summary}
        className="flex h-5 w-full overflow-hidden rounded-md border border-line-strong bg-charcoal"
      >
        {segments.map((s) => {
          const w = s.value.toNumber() * 100;
          return w > 0 ? (
            <div
              key={s.key}
              style={{ width: `${w.toString()}%` }}
              className={cn("h-full border-r border-charcoal/70 last:border-r-0", fills[s.tone])}
            />
          ) : null;
        })}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={cn(
                "inline-block h-3 w-3 rounded-sm border border-line-strong",
                fills[s.tone],
              )}
            />
            <span className="text-muted">{s.label}</span>
            <span className="num text-parchment">{pctSmart(s.value, digits)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
