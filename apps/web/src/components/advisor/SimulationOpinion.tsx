import Link from "next/link";

import { getCard } from "@slay2/game-data";
import type { DraftAction } from "@slay2/decision";

import { MeasuredValue } from "@/components/codex/MeasuredValue";
import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Panel } from "@/components/ui/Panel";
import { CLASS_STYLE } from "@/lib/card-style";
import { measuredValue, setFor } from "@/lib/cardvalues";
import type { RunState } from "@/lib/run-state";
import { simulationPick } from "@/lib/simulation-pick";

const nameOf = (id: string): string => getCard(id)?.name ?? id;

function heuristicSays(action: DraftAction): string {
  return action.kind === "skip" ? "skipping" : `taking ${nameOf(action.cardId)}`;
}

/**
 * A second opinion that is not the advisor's: what a rules pilot that follows the values measured in simulated runs would
 * do with this offer (the policy whose play was tested against the hand-written ratings, ADR-031). Shown beside the
 * heuristic, never merged into it, and labelled as unverified against the live game.
 */
export function SimulationOpinion({
  run,
  offered,
  heuristic,
}: {
  run: RunState;
  offered: readonly string[];
  heuristic: DraftAction;
}) {
  const deckSize = run.deck.reduce((n, d) => n + d.count, 0);
  const pick = simulationPick({ character: run.character ?? "", offered, deckSize });
  const set = setFor(run.character ?? "");
  const label = run.character ? CLASS_STYLE[run.character].label : "this class";
  const test = set?.validation ?? null;
  const sim: DraftAction | null =
    pick.kind === "pick"
      ? { kind: "pick", cardId: pick.cardId }
      : pick.kind === "skip"
        ? { kind: "skip" }
        : null;
  const agrees =
    sim !== null &&
    sim.kind === heuristic.kind &&
    (sim.kind === "skip" || (heuristic.kind === "pick" && sim.cardId === heuristic.cardId));
  const headline =
    pick.kind === "unmeasured"
      ? "The simulated runs have no measurement for this offer."
      : pick.kind === "pick"
        ? `A rules pilot that follows the measured values would take ${nameOf(pick.cardId)}.`
        : "A rules pilot that follows the measured values would skip.";

  return (
    <Panel
      eyebrow="Step 4 · a second opinion"
      title="What simulated runs say"
      aside={
        <>
          <Badge tone="unverified">Simulated · unverified</Badge>
          <Badge tone="neutral">Not the advisor’s index</Badge>
        </>
      }
      headingLevel={2}
      id="simulation-opinion"
    >
      <p className="text-parchment">{headline}</p>
      <p className="mt-1 text-sm text-muted">{pick.reason}</p>
      {sim ? (
        <p
          className={
            agrees
              ? "mt-3 rounded-lg border border-teal-deep/70 bg-teal/10 p-3 text-sm text-teal"
              : "mt-3 rounded-lg border border-copper-deep/70 bg-copper/10 p-3 text-sm text-copper"
          }
        >
          {agrees
            ? "This agrees with the heuristic above."
            : `This differs from the heuristic above, which prefers ${heuristicSays(heuristic)}. Neither has been checked against the live game; the heuristic is hand-written and the simulated values come from a simulator and one pilot.`}
        </p>
      ) : null}

      <ul
        className="mt-4 grid gap-3 md:grid-cols-3"
        aria-label="Measured values of the offered cards"
      >
        {offered.map((id) => {
          const m = measuredValue(id, run.character ?? "");
          return (
            <li key={id} className="min-w-0">
              <p className="truncate font-display text-parchment">{nameOf(id)}</p>
              {m ? (
                <MeasuredValue m={m.card} set={m.set} compact />
              ) : (
                <p className="mt-2 rounded-lg border border-line bg-charcoal/60 p-3 text-sm text-muted">
                  Not measured: this card was held in too few simulated runs of this class (or this
                  class has not been measured).
                </p>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4">
        <Disclosure summary="How to read this, and what it is not">
          <ul className="list-disc space-y-1.5 pl-5">
            {set ? (
              <li>
                The numbers come from {set.bossFights.toLocaleString("en-US")} simulated {label}{" "}
                runs that reached the Act-1 boss, whose card choices were partly random; a value is
                the change in the log-odds of getting past the Act-1 boss from one more copy, with
                the 95% interval from resampling whole games.
              </li>
            ) : (
              <li>
                No simulated runs of this class have been measured yet, so there are no values to
                read here.
              </li>
            )}
            {set ? (
              <li>
                {test === null
                  ? `The ${label} values have not been tested against play yet, so no rule is offered (see `
                  : test.passed
                    ? `The rule shown is the one a simulated pilot followed when it was tested against the hand-written ratings (+${((test.passRate - test.passRateBase) * 100).toFixed(0)} percentage points past the Act-1 boss on ${test.pairedGames.toLocaleString("en-US")} held-out seeds, the same seeds for both; see `
                    : `The ${label} values did not beat the hand-written ratings in the held-out test (${(test.passRate * 100).toFixed(1)}% against ${(test.passRateBase * 100).toFixed(1)}% past the Act-1 boss), so no rule is offered (see `}
                <Link
                  className="text-teal underline decoration-dotted underline-offset-4"
                  href="/methods#card-values"
                >
                  Evidence &amp; methods
                </Link>
                ).
              </li>
            ) : null}
            <li>
              The simulator has not been compared with the live game, the pilot plays the cards its
              own way, synergies are not modelled, and your HP, relics and deck matter more than a
              single number. Use it as one prior, not as a verdict.
            </li>
          </ul>
        </Disclosure>
      </div>
    </Panel>
  );
}
