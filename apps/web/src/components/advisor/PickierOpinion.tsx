import Link from "next/link";

import { getCard } from "@slay2/game-data";

import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { pickierOpinion } from "@/lib/pickier-opinion";
import {
  NOT_A_RECOMMENDATION,
  ascensionSentence,
  cappedHeadline,
  classSentence,
  limitsText,
  pooledSentence,
  sizeSentence,
} from "@/lib/pickier-text";
import type { PackSource, RunState } from "@/lib/run-state";
import { PICKIER_THRESHOLD, type SimulationPick } from "@/lib/simulation-pick";
import { bossSentence, excludedSentence, narrowSentence, type ThreshData } from "@/lib/thresh";

const nameOf = (id: string): string => getCard(id)?.name ?? id;

function says(pick: SimulationPick): string {
  if (pick.kind === "pick") return `would take ${nameOf(pick.cardId)}`;
  if (pick.kind === "skip") return "would skip";
  return "has no measurement for this offer";
}

const LINK = "text-teal underline decoration-dotted underline-offset-4";
const label = (character: string): string => character.charAt(0).toUpperCase() + character.slice(1);

/**
 * The optional second opinion for the card rewards of Act 2 (ADR-063): closed until the visitor opens it, shown only where the registered replication of the
 * pickier rule (ADR-062, T1) allows it, labelled as a simulated pilot's result with the figures of that test beside it (the pooled result, each class's own row,
 * the pairs, the boss shares: what ADR-062 item 5 asks of every page that says "passed"), and never merged into the advisor's own recommendation. It speaks for
 * the bar 0.2 and no other: no other bar was tested on seeds the screen did not use.
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
  const bar = String(PICKIER_THRESHOLD);
  const headline = o.capped
    ? cappedHeadline()
    : o.pick.kind === "pick"
      ? `In Act 2, a simulated pilot that takes a card only if it is measured above ${bar} would take ${nameOf(o.pick.cardId)}.`
      : `In Act 2, a simulated pilot that takes a card only if it is measured above ${bar} would skip this reward.`;
  const same =
    (o.pick.kind === "pick" && o.baseline.kind === "pick" && o.pick.cardId === o.baseline.cardId) ||
    (o.pick.kind === "skip" && o.baseline.kind === "skip");
  return (
    <div className="mt-4" data-testid="pickier-opinion">
      <Disclosure
        summary={<span>Act 2 · also show what a pickier simulated pilot would do (optional)</span>}
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="unverified">Simulated · unverified</Badge>
            <Badge tone="neutral">Registered test passed (pooled) · {o.adr}</Badge>
            <Badge tone="neutral">Not the advisor’s index</Badge>
          </div>
          <p className="text-parchment">{headline}</p>
          <p className="font-medium text-parchment">{NOT_A_RECOMMENDATION}</p>
          <p>
            {o.capped ? "" : `${o.pick.reason} `}
            {same
              ? "The ordinary simulated pilot above gives the same answer here."
              : `The ordinary simulated pilot above ${says(o.baseline)}: the two differ only in how picky they are, and only in this act.`}
          </p>
          <p>{pooledSentence(o.test, o.level, o.seeds, o.adr)}</p>
          <ul className="list-disc space-y-1 pl-5" aria-label="The same test, class by class">
            {o.classes.map((c) => (
              <li key={c.character}>
                {classSentence(c, label(c.character), c.character === character)}
              </li>
            ))}
          </ul>
          <p>{bossSentence(o.test)}</p>
          <p>{excludedSentence(o.test)}</p>
          {o.test.narrow ? <p>{narrowSentence(o.test)}</p> : null}
          <p>{sizeSentence(o.test)}</p>
          {run.ascension > 0 ? (
            <p className="rounded-lg border border-copper-deep/70 bg-copper/10 p-3 text-copper">
              <strong className="font-medium text-parchment">Your Ascension. </strong>
              {ascensionSentence(run.ascension)}
            </p>
          ) : null}
          <p className="text-xs text-dim">
            {limitsText()}{" "}
            <Link className={LINK} href="/insights#thresholds">
              The result and what it does not show
            </Link>{" "}
            ·{" "}
            <Link className={LINK} href="/methods#thresh">
              Evidence &amp; methods: the Act-2 test
            </Link>
            .
          </p>
        </div>
      </Disclosure>
    </div>
  );
}
