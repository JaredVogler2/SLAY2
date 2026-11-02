import Link from "next/link";

import { getCard } from "@slay2/game-data";

import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { CLASS_STYLE } from "@/lib/card-style";
import { pickierOpinion } from "@/lib/pickier-opinion";
import type { PackSource, RunState } from "@/lib/run-state";
import { PICKIER_THRESHOLD, type SimulationPick } from "@/lib/simulation-pick";
import {
  formatP,
  levelText,
  pctShare,
  pts,
  type ThreshData,
  type ThreshClassResult,
  type ThreshTest,
} from "@/lib/thresh";

const nameOf = (id: string): string => getCard(id)?.name ?? id;
const n = (x: number): string => x.toLocaleString("en-US");

function says(pick: SimulationPick): string {
  if (pick.kind === "pick") return `would take ${nameOf(pick.cardId)}`;
  if (pick.kind === "skip") return "would skip";
  return "has no measurement for this offer";
}

/** The sentence that says what the registered test found, from its exported figures. */
export function evidenceSentence(
  t: ThreshTest,
  level: number,
  c: ThreshClassResult,
  label: string,
): string {
  return `In a registered test (ADR-062) on ${n(t.pairedSeeds)} seeds of Ironclad and Defect that no earlier study had played, a simulated pilot that used this bar in the card rewards of Act 2 won ${pctShare(t.shares.arm)} of the ${n(t.pairs)} paired games both pilots finished, against ${pctShare(t.shares.baseline)} for the pilot that takes any card measured above zero (${pts(t.difference)}; ${levelText(level)} interval ${pts(t.ci[0] ?? 0)} to ${pts(t.ci[1] ?? 0)}; exact ${formatP(t.p)}). In ${label} alone it won ${pctShare(c.shares.arm)} against ${pctShare(c.shares.baseline)} (${pts(c.difference)}; exact ${formatP(c.p)}).`;
}

/**
 * The optional second opinion for the card rewards of Act 2 (ADR-063): closed until the visitor opens it, shown only where the registered replication of the
 * pickier rule (ADR-062, T1) allows it, labelled as a simulated pilot's result with the figures of that test beside it, and never merged into the advisor's own
 * recommendation. It speaks for the bar 0.2 and no other: no other bar was tested on seeds the screen did not use.
 */
export function PickierOpinion({
  run,
  offered,
  source,
  data,
}: {
  run: RunState;
  offered: readonly string[];
  source: PackSource;
  /** the exporter's file by default; tests pass their own */
  data?: ThreshData | null;
}) {
  const character = run.character ?? "";
  const deckSize = run.deck.reduce((sum, d) => sum + d.count, 0);
  const o = pickierOpinion({
    character,
    actIndex: run.actIndex,
    source,
    offered,
    deckSize,
    ...(data !== undefined ? { data } : {}),
  });
  if (!o.available) return null;
  const label = run.character ? CLASS_STYLE[run.character].label : "this class";
  const bar = String(PICKIER_THRESHOLD);
  const headline =
    o.pick.kind === "pick"
      ? `In Act 2, a simulated pilot that takes a card only if it is measured above ${bar} would take ${nameOf(o.pick.cardId)}.`
      : `In Act 2, a simulated pilot that takes a card only if it is measured above ${bar} would skip this reward.`;
  const same =
    (o.pick.kind === "pick" && o.baseline.kind === "pick" && o.pick.cardId === o.baseline.cardId) ||
    (o.pick.kind === "skip" && o.baseline.kind === "skip");
  return (
    <div className="mt-4" data-testid="pickier-opinion">
      <Disclosure
        summary={
          <span>
            Act 2 · also show what a <em className="not-italic text-gold">pickier</em> simulated
            pilot did (optional)
          </span>
        }
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="unverified">Simulated · unverified</Badge>
            <Badge tone="neutral">Registered test passed · ADR-062</Badge>
            <Badge tone="neutral">Not the advisor’s index</Badge>
          </div>
          <p className="text-parchment">{headline}</p>
          <p>
            {o.pick.reason}{" "}
            {same
              ? "The ordinary simulated pilot above gives the same answer here."
              : `The ordinary simulated pilot above ${says(o.baseline)}: the two differ only in how picky they are, and only in this act.`}
          </p>
          <p>{evidenceSentence(o.test, o.level, o.classResult, label)}</p>
          <p className="text-xs text-dim">
            That is about half a point of the share of games won, by rules-playing pilots that win
            about 4% of their games, in a simulator that has never been compared with the live game.
            It is not a measurement of you: your HP, relics, deck and what a card does for your
            build matter more than one number, and this is not a recommendation to skip. Only the
            bar {bar} was tested on seeds the screening did not use, and it changes only the card
            rewards after a fight in Act 2.{" "}
            <Link
              className="text-teal underline decoration-dotted underline-offset-4"
              href="/insights#thresholds"
            >
              The result and what it does not show
            </Link>{" "}
            ·{" "}
            <Link
              className="text-teal underline decoration-dotted underline-offset-4"
              href="/methods#thresh"
            >
              Evidence &amp; methods
            </Link>
            .
          </p>
        </div>
      </Disclosure>
    </div>
  );
}
