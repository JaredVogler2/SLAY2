import { Badge } from "@/components/ui/Badge";
import {
  ADVISOR_LABEL,
  WHEN_LABEL,
  count,
  evidenceClass,
  formatP,
  ladderScale,
  leverLadder,
  pointRange,
  points,
  share,
  type LeverRow,
} from "@/lib/insights";

import { EvidenceBadge } from "./EvidenceBadge";

const clamp = (x: number): number => Math.min(100, Math.max(0, x));

function Bar({ row, scale, name }: { row: LeverRow; scale: number; name: string }) {
  const width = clamp((Math.max(0, row.difference) / scale) * 100);
  const lo = clamp((Math.max(0, row.ci95[0] ?? 0) / scale) * 100);
  const hi = clamp((Math.max(0, row.ci95[1] ?? 0) / scale) * 100);
  const label = `${name}, ${WHEN_LABEL[row.when] ?? row.when}: ${points(row.difference)} past the Act-1 boss, 95 % interval ${pointRange(row.ci95)}`;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-sm text-muted">{WHEN_LABEL[row.when] ?? row.when}</span>
        <span className="num font-display text-xl text-parchment">{points(row.difference)}</span>
      </div>
      <div role="img" aria-label={label} className="relative mt-1 h-3.5 rounded-full bg-charcoal">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${String(width)}%`,
            background: row.evidence === "registered" ? "var(--color-teal)" : "var(--color-copper)",
            opacity: row.evidence === "registered" ? 0.9 : 0.8,
          }}
        />
        <div
          aria-hidden="true"
          className="absolute top-1/2 h-0.5 -translate-y-1/2 bg-parchment"
          style={{ left: `${String(lo)}%`, width: `${String(Math.max(0, hi - lo))}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-parchment"
          style={{ left: `${String(lo)}%` }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-parchment"
          style={{ left: `calc(${String(hi)}% - 2px)` }}
        />
      </div>
      <p className="num mt-1 text-xs text-dim">
        {share(row.first)} against {share(row.second)} past the Act-1 boss · {pointRange(row.ci95)}{" "}
        ({row.method}) · {count(row.pairs)}{" "}
        {row.classes > 1 ? `pairs, ${String(row.classes)} classes` : "pairs, one class"} ·{" "}
        {formatP(row.p)}
      </p>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <EvidenceBadge kind={evidenceClass(row.evidence)} />
        {row.note ? <span className="text-xs text-dim">{row.note}</span> : null}
      </div>
    </div>
  );
}

/** Every lever with its measured size, largest first, on one axis: the difference in the share of games that got past the Act-1 boss. */
export function LeverLadder() {
  const scale = ladderScale();
  return (
    <div>
      <ol className="space-y-3">
        {leverLadder().map((l, i) => {
          const advisor = ADVISOR_LABEL[l.inAdvisor];
          return (
            <li
              key={l.id}
              id={`lever-${l.id}`}
              className="rounded-xl border border-line bg-charcoal/40 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-dim">
                    Lever {String(i + 1)}
                  </p>
                  <h3 className="text-lg leading-snug text-parchment">{l.label}</h3>
                  <p className="mt-0.5 text-sm text-muted">
                    {l.first}, against {l.second}.
                  </p>
                </div>
                {advisor ? <Badge tone={advisor.tone}>{advisor.text}</Badge> : null}
              </div>
              <div className="mt-3 space-y-4">
                {l.rows.map((r) => (
                  <Bar key={r.when} row={r} scale={scale} name={l.label} />
                ))}
              </div>
              {l.note ? <p className="mt-3 text-xs text-dim">{l.note}</p> : null}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-dim">
        Bars share one axis, 0 to {points(scale, 0).replace("+", "")}. A line across a bar is the 95
        % interval. The levers were not all measured under the same conditions (class, pilot,
        whether relics are kept), which each row says; sizes are for a rules pilot in a simulator
        that has not been compared with the live game.
      </p>
    </div>
  );
}
