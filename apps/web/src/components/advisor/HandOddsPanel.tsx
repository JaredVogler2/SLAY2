"use client";

import { useMemo, useState } from "react";

import { getCard } from "@slay2/game-data";
import { handReport, type DeckEntry } from "@slay2/decision";

import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { ExactValue } from "@/components/ui/ExactValue";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import type { RunState } from "@/lib/run-state";

/** Exact opening-hand odds for the roles in the deck you actually have (same engine as the Odds page). */
export function HandOddsPanel({ run }: { run: RunState }) {
  const [hand, setHand] = useState(5);
  const entries: DeckEntry[] = useMemo(
    () =>
      run.deck.flatMap((d) => {
        const card = getCard(d.id);
        return card ? [{ card, count: d.count }] : [];
      }),
    [run.deck],
  );
  const report = useMemo(() => handReport(entries, hand), [entries, hand]);
  return (
    <Panel
      eyebrow="Your opening hand"
      title="What this deck draws"
      headingLevel={3}
      aside={<Badge tone="exact">Exact</Badge>}
    >
      <NumberStepper
        label="Cards in your hand"
        value={hand}
        onChange={setHand}
        min={1}
        max={10}
        hint="5 normally; change it for relics that alter your hand size."
        className="mb-4 max-w-xs"
      />
      <ScrollRegion label="Opening-hand odds by role">
        <table className="w-full min-w-[30rem] text-left text-sm">
          <caption className="sr-only">
            Chance of drawing at least one card of each role, for a deck of {report.deckSize} cards
          </caption>
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Role
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                In deck
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                ≥1 in opening hand
              </th>
              <th scope="col" className="py-2 font-medium">
                ≥1 in first two hands
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {report.rows.map((row) => (
              <tr key={row.group} className="align-top">
                <th scope="row" className="py-2.5 pr-3 font-medium text-parchment">
                  {row.label}
                </th>
                <td className="num py-2.5 pr-3">{row.inDeck}</td>
                <td className="py-2.5 pr-3">
                  <ExactValue value={row.openingHand} digits={1} />
                </td>
                <td className="py-2.5">
                  <ExactValue value={row.firstTwoHands} digits={1} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      <Disclosure summary="What this assumes" className="mt-4">
        <ul className="list-disc space-y-1.5 pl-5">
          {report.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </Disclosure>
    </Panel>
  );
}
