"use client";

import { useMemo, useState } from "react";

import {
  cardRemovalCost,
  combatGoldRange,
  priceDistribution,
  type ShopItem,
  provenanceFor,
} from "@slay2/odds";

import { Badge } from "@/components/ui/Badge";
import { BarChart } from "@/components/ui/BarChart";
import { ExactValue } from "@/components/ui/ExactValue";
import { MethodNote } from "@/components/ui/MethodNote";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { Segmented } from "@/components/ui/Segmented";
import { Stat } from "@/components/ui/Stat";

type Kind = "card" | "colorless" | "relic" | "potion";

export function EconomyCalculator({ ascension }: { ascension: number }) {
  const [kind, setKind] = useState<Kind>("card");
  const [rarity, setRarity] = useState<"common" | "uncommon" | "rare" | "shop">("uncommon");
  const [sale, setSale] = useState(false);
  const [removals, setRemovals] = useState(0);

  const effectiveRarity = kind !== "relic" && rarity === "shop" ? "uncommon" : rarity;
  const dist = useMemo(() => {
    const nonShop = effectiveRarity === "shop" ? "uncommon" : effectiveRarity;
    const item: ShopItem =
      kind === "relic"
        ? { kind: "relic", rarity: effectiveRarity }
        : kind === "potion"
          ? { kind: "potion", rarity: nonShop }
          : { kind: "card", rarity: nonShop, colorless: kind === "colorless" };
    return priceDistribution(item, sale && (kind === "card" || kind === "colorless"));
  }, [kind, effectiveRarity, sale]);
  const prices = [...dist.pmf.keys()].sort((a, b) => a - b);
  const bars = prices.map((p) => ({ label: String(p), value: dist.pmf.get(p)?.toNumber() ?? 0 }));

  return (
    <div className="space-y-6">
      <Panel
        eyebrow="Merchant"
        title="What should this cost?"
        aside={<Badge tone="exact">Exact</Badge>}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <Segmented
              legend="Item"
              value={kind}
              onChange={setKind}
              options={[
                { value: "card", label: "Class card" },
                { value: "colorless", label: "Colorless card" },
                { value: "relic", label: "Relic" },
                { value: "potion", label: "Potion" },
              ]}
            />
            <Segmented
              legend="Rarity"
              value={effectiveRarity}
              onChange={setRarity}
              options={[
                { value: "common", label: "Common" },
                { value: "uncommon", label: "Uncommon" },
                { value: "rare", label: "Rare" },
                ...(kind === "relic" ? [{ value: "shop" as const, label: "Shop relic" }] : []),
              ]}
            />
            {kind === "card" || kind === "colorless" ? (
              <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={sale}
                  onChange={(e) => {
                    setSale(e.target.checked);
                  }}
                  className="h-5 w-5 accent-copper"
                />
                On sale (one class card per shop is half price)
              </label>
            ) : null}
          </div>
          <div aria-live="polite" className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <Stat
                label="Lowest"
                value={`${String(dist.min)}g`}
                className="[&_p:nth-child(2)]:text-3xl"
              />
              <Stat
                label="Average"
                value={<ExactValue value={dist.mean} digits={1} format="number" label="exact" />}
                tone="exact"
                className="[&_p:nth-child(2)]:text-3xl"
              />
              <Stat
                label="Highest"
                value={`${String(dist.max)}g`}
                className="[&_p:nth-child(2)]:text-3xl"
              />
            </div>
            <BarChart
              title="Price distribution"
              bars={bars}
              yFormat={(v) => `${(v * 100).toFixed(1)}%`}
              xLabel="Price (gold)"
            />
          </div>
        </div>
        <div className="mt-6">
          <MethodNote provenance={provenanceFor("shop")} />
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel eyebrow="Card removal" title="The price of thinning your deck" headingLevel={3}>
          <NumberStepper
            label="Removals already bought"
            value={removals}
            onChange={setRemovals}
            min={0}
            max={30}
          />
          <p className="mt-4 text-sm text-muted">
            Ascension {ascension}:{" "}
            {ascension >= 6 ? "Inflation applies (100 + 50n)." : "base pricing (75 + 25n)."}
          </p>
          <p className="mt-3 font-display text-4xl text-teal">
            {cardRemovalCost(removals, ascension)}g
          </p>
          <ol className="mt-3 flex flex-wrap gap-2 text-sm text-muted">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="rounded-md border border-line bg-charcoal px-2 py-1">
                <span className="num">#{removals + i + 1}</span>{" "}
                <span className="num text-parchment">
                  {cardRemovalCost(removals + i, ascension)}g
                </span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel eyebrow="Combat gold" title="What a fight pays" headingLevel={3}>
          <ScrollRegion label="Combat gold ranges">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Combat gold ranges</caption>
              <thead>
                <tr className="border-b border-line text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Room
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Range
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Average
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(["monster", "elite", "boss"] as const).map((room) => {
                  const g = combatGoldRange(room, ascension);
                  return (
                    <tr key={room}>
                      <th scope="row" className="py-2 pr-3 font-medium capitalize text-parchment">
                        {room === "monster" ? "Normal fight" : room}
                      </th>
                      <td className="num py-2 pr-3">
                        {g.min === g.max
                          ? `${String(g.min)}g`
                          : `${String(g.min)}–${String(g.max)}g`}
                      </td>
                      <td className="num py-2 text-teal">{g.mean.toFixed(1)}g</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollRegion>
          <p className="mt-3 text-sm text-muted">
            {ascension >= 3 ? "Poverty (A3+) is applied." : "Poverty (A3+) would reduce these."} The
            final boss of the last act pays nothing.
          </p>
        </Panel>
      </div>
    </div>
  );
}
