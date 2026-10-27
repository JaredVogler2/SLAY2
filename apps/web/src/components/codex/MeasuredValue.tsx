import { cn } from "@/lib/cn";
import {
  formatBeta,
  measurementsOf,
  oddsMultiplier,
  valueSign,
  type CardValueSet,
  type MeasuredCard,
  type ValueSign,
} from "@/lib/cardvalues";

const CLASS_NAME: Record<string, string> = {
  ironclad: "Ironclad",
  silent: "Silent",
  regent: "Regent",
  necrobinder: "Necrobinder",
  defect: "Defect",
};

// glyph + word carry the meaning, the colour only repeats it (colour-blind safe); not the "exact" teal badge of the odds tools
const SIGN_LABEL: Record<ValueSign, string> = {
  helps: "▲ helped",
  hurts: "▼ hurt",
  unclear: "● unclear",
};
const SIGN_TEXT: Record<ValueSign, string> = {
  helps: "text-teal",
  hurts: "text-rose",
  unclear: "text-muted",
};
const SIGN_STROKE: Record<ValueSign, string> = {
  helps: "var(--color-teal)",
  hurts: "var(--color-rose)",
  unclear: "var(--color-dim)",
};

// the axis every tile shares, so the whiskers can be compared by eye (log-odds per extra copy)
const AXIS_MIN = -1;
const AXIS_MAX = 2.25;
const W = 240;
const H = 16;
const x = (v: number): number =>
  ((Math.min(AXIS_MAX, Math.max(AXIS_MIN, v)) - AXIS_MIN) / (AXIS_MAX - AXIS_MIN)) * W;

/** A forest-plot row: the point estimate and its 95 % bootstrap interval on a fixed axis with the zero line. */
export function Whisker({ m, sign }: { m: Pick<MeasuredCard, "beta" | "ci95">; sign: ValueSign }) {
  const [lo, hi] = m.ci95;
  return (
    <div aria-hidden="true">
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        className="h-4 w-full"
        focusable="false"
        preserveAspectRatio="none"
      >
        <rect x={0} y={H / 2 - 0.5} width={W} height={1} fill="var(--color-line)" />
        <line
          x1={x(0)}
          x2={x(0)}
          y1={0}
          y2={H}
          stroke="var(--color-line-strong)"
          strokeWidth={1.5}
        />
        <line
          x1={x(lo ?? m.beta)}
          x2={x(hi ?? m.beta)}
          y1={H / 2}
          y2={H / 2}
          stroke={SIGN_STROKE[sign]}
          strokeWidth={3}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="relative -mt-4 h-4">
        <span
          className="absolute top-1/2 block h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${String((x(m.beta) / W) * 100)}%`, background: SIGN_STROKE[sign] }}
        />
      </div>
      <div className="mt-0.5 flex justify-between text-[0.65rem] text-dim">
        <span>hurts</span>
        <span>helps</span>
      </div>
    </div>
  );
}

/**
 * What the simulated runs say about one card, with the interval, the sample and the label that says it is a simulation.
 * The words are generated from the numbers: nothing here is a verdict about the real game.
 */
export function MeasuredValue({
  m,
  set,
  compact = false,
  showClass = false,
}: {
  m: MeasuredCard;
  set: CardValueSet;
  compact?: boolean;
  showClass?: boolean;
}) {
  const sign = valueSign(m);
  const [lo, hi] = m.ci95;
  return (
    <div className="mt-2 rounded-lg border border-line bg-charcoal/60 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted">
          In simulated runs{showClass ? ` · ${CLASS_NAME[set.character] ?? set.character}` : ""}
        </p>
        <span
          className={cn("font-mono text-[0.7rem] uppercase tracking-[0.12em]", SIGN_TEXT[sign])}
          title={
            sign === "unclear"
              ? "The 95% interval includes zero: the runs cannot tell whether this card helped or hurt."
              : `The whole 95% interval is ${sign === "helps" ? "above" : "below"} zero.`
          }
        >
          {SIGN_LABEL[sign]}
        </span>
      </div>
      <p className="num mt-1.5 flex flex-wrap items-baseline gap-x-2 text-base font-medium text-parchment">
        {formatBeta(m.beta)}
        <span className="text-xs font-normal text-muted">
          95%: {formatBeta(lo ?? m.beta)} to {formatBeta(hi ?? m.beta)}
        </span>
      </p>
      <div className="mt-1.5">
        <Whisker m={m} sign={sign} />
      </div>
      {compact ? (
        <p className="mt-1.5 text-xs text-dim">
          Odds {oddsMultiplier(m.beta)} per copy · held in {m.gamesWithCard.toLocaleString("en-US")}{" "}
          simulated runs.
        </p>
      ) : (
        <>
          <p className="mt-1.5 text-xs text-muted">
            Odds of getting past the Act-1 boss {oddsMultiplier(m.beta)} per copy.
          </p>
          <p className="mt-1 text-xs text-dim">
            Held in {m.gamesWithCard.toLocaleString("en-US")} of{" "}
            {set.bossFights.toLocaleString("en-US")} simulated runs that reached the boss.{" "}
            {set.relicsKept
              ? "Those runs kept the relics they gained (gap G14, repaired in the harness)."
              : "Those runs kept only two relics, because the simulator drops the rest (gap G14)."}{" "}
            Unverified against the live game.
          </p>
        </>
      )}
    </div>
  );
}

/** Every measurement of a catalog card id: one block for a class card, one per measured class for a colorless card. */
export function MeasuredForCard({ cardId }: { cardId: string }) {
  const all = measurementsOf(cardId);
  return (
    <>
      {all.map((x) => (
        <MeasuredValue key={x.set.id} m={x.card} set={x.set} showClass={all.length > 1} />
      ))}
    </>
  );
}
