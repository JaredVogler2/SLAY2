import Link from "next/link";

import { getCard } from "@slay2/game-data";
import type { DraftAction } from "@slay2/decision";

import { AscensionNote } from "@/components/advisor/AscensionNote";
import { MeasuredValue } from "@/components/codex/MeasuredValue";
import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Panel } from "@/components/ui/Panel";
import { StartHpNote } from "@/components/ui/StartHpNote";
import { CLASS_STYLE } from "@/lib/card-style";
import {
  adoptedByPooledTest,
  againstText,
  measuredValue,
  pointsText,
  setFor,
} from "@/lib/cardvalues";
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
      eyebrow="Step 5 · a second opinion"
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
      <p
        className={
          run.act1 === "underdocks"
            ? "mt-3 rounded-lg border border-rose-deep/60 bg-rose/10 p-3 text-sm text-rose"
            : "mt-3 text-xs text-dim"
        }
      >
        {run.act1 === "underdocks"
          ? "You said you are in Underdocks. These runs were all played in Overgrowth (the simulator never plays Underdocks), so the numbers below were not measured for your Act 1: read them as a prior about the cards, not about your fights."
          : "Every simulated run was played in Overgrowth, the Act 1 every profile starts with. The simulator never plays Underdocks."}
      </p>
      <AscensionNote
        finding="values"
        level={run.ascension}
        confirmed={run.ascensionConfirmed}
        character={run.character}
        className="mt-3"
      />
      <p className="mt-3 text-xs text-dim">
        {set?.relicsKept
          ? "These simulated runs kept the relics they gained, as the game does (the pinned simulator drops them; a harness variant repairs that, gap G14). One rules pilot played them in a simulator that has not been compared with the live game, so read the values below as a ranking of cards in a simulated game, not in yours."
          : "In the simulator a run keeps only the relics it has when its first fight starts (gap G14), so these runs held two where yours may hold more. With the relics kept, the same pilot went about three floors further, so read the values below as a ranking of cards in a harsher game than yours."}
      </p>
      <StartHpNote
        character={run.character ?? ""}
        subject="values"
        className="mt-3 text-xs text-rose"
      />
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
                  : adoptedByPooledTest(set)
                    ? `The rule shown follows values that replaced ${set.supersedes ?? "the earlier ones"} under a rule registered before the test (ADR-053): the pooled test of the five classes favoured them over ${againstText(test)}, and in the ${test.pairedGames.toLocaleString("en-US")} held-out games of ${label} alone the pilot that follows them got past the Act-1 boss in ${(test.passRate * 100).toFixed(1)}% against ${(test.passRateBase * 100).toFixed(1)}% (${pointsText(test.passRate, test.passRateBase)} percentage points, the same seeds for both), which does not show the earlier values ahead (see `
                    : test.passed
                      ? `The rule shown is the one a simulated pilot followed when it was tested against ${againstText(test)} (${pointsText(test.passRate, test.passRateBase)} percentage points past the Act-1 boss on ${test.pairedGames.toLocaleString("en-US")} paired held-out games, the same seeds for both; see `
                      : `The ${label} values did not beat ${againstText(test)} in the held-out test (${(test.passRate * 100).toFixed(1)}% against ${(test.passRateBase * 100).toFixed(1)}% past the Act-1 boss), so no rule is offered (see `}
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
              own way, the values are additive (how a card works with the rest of your deck is not
              in them), and your HP, relics and deck matter more than a single number. Use it as one
              prior, not as a verdict.
            </li>
          </ul>
        </Disclosure>
      </div>
    </Panel>
  );
}
