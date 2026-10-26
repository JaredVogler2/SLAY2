"use client";

import { useMemo, useState } from "react";

import {
  enumeratePack,
  rarityRulesForAscension,
  summarizePack,
  type RewardSource,
} from "@slay2/odds";

import { LineChart } from "@/components/ui/LineChart";
import { ExactValue } from "@/components/ui/ExactValue";
import { Panel } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";

const REGULAR: RewardSource = { kind: "encounter", room: "regular" };
const ELITE: RewardSource = { kind: "encounter", room: "elite" };

/**
 * Live demonstration on the landing page. Everything shown is computed in the visitor's browser by the same exact
 * engine the Odds page uses. The inputs are a fixture ("example"), clearly labelled, not anybody's run.
 */
export function PityDemo() {
  const [k, setK] = useState(12);
  const rules = rarityRulesForAscension(0);
  const regular = useMemo(() => summarizePack(enumeratePack(REGULAR, k, 3, rules), 3), [k, rules]);
  const elite = useMemo(() => summarizePack(enumeratePack(ELITE, k, 3, rules), 3), [k, rules]);
  const curve = useMemo(
    () =>
      Array.from({ length: 46 }, (_, i) => ({
        x: i,
        y: summarizePack(enumeratePack(REGULAR, i, 3, rules), 3).atLeastOneRare.toNumber() * 100,
      })),
    [rules],
  );
  return (
    <Panel
      eyebrow="Try it — runs in your browser"
      title="How likely is a rare in your next reward?"
      aside={<Badge tone="exact">Exact</Badge>}
    >
      <p className="mb-5 max-w-2xl text-muted">
        Each card in a reward pack rolls its rarity against a hidden counter that starts at −5
        points and climbs one point per non-rare card. Drag the slider to see how the counter
        changes the next pack. Example inputs, Ascension 0 — not your run.
      </p>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-6">
          <div>
            <label
              htmlFor="pity-slider"
              className="flex items-baseline justify-between text-sm font-medium text-parchment"
            >
              <span>Non-rare cards since your last rare</span>
              <span className="num font-display text-2xl text-gold">{k}</span>
            </label>
            <input
              id="pity-slider"
              type="range"
              min={0}
              max={45}
              value={k}
              onChange={(e) => {
                setK(Number(e.target.value));
              }}
              className="mt-3 h-11 w-full"
              aria-valuetext={`${String(k)} non-rare cards`}
            />
            <div className="flex justify-between text-xs text-dim">
              <span>0 · just had a rare</span>
              <span>45 · counter capped</span>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-line bg-charcoal/50 p-4">
              <dt className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">
                After a normal fight
              </dt>
              <dd className="mt-1">
                <span className="font-display text-3xl text-teal">
                  <ExactValue value={regular.atLeastOneRare} digits={1} />
                </span>
                <span className="mt-1 block text-xs text-muted">
                  chance of at least one rare in the 3-card pack
                </span>
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-charcoal/50 p-4">
              <dt className="font-mono text-[0.7rem] uppercase tracking-[0.14em] text-muted">
                After an elite
              </dt>
              <dd className="mt-1">
                <span className="font-display text-3xl text-teal">
                  <ExactValue value={elite.atLeastOneRare} digits={1} />
                </span>
                <span className="mt-1 block text-xs text-muted">
                  chance of at least one rare in the 3-card pack
                </span>
              </dd>
            </div>
          </dl>
        </div>
        <LineChart
          points={curve}
          title="Chance of at least one rare in the next regular-fight pack, by counter"
          description="Rises from 0 percent just after a rare to about 70 percent when the counter is capped at 45."
          xLabel="Non-rare cards since last rare"
          yLabel="P(≥1 rare in pack)"
          marker={{ x: k, label: `${String(k)} cards` }}
          yMax={100}
        />
      </div>
    </Panel>
  );
}
