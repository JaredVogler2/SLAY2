import type { Metadata } from "next";

import { OddsWorkbench } from "@/components/odds/OddsWorkbench";

export const metadata: Metadata = {
  title: "Probability Observatory",
  description:
    "Exact card-reward rarity with the hidden pity counter, potion drops, ? room outcomes, draw probabilities, shop prices and gold for Slay the Spire 2 (main v0.107.1).",
};

export default function OddsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8 max-w-3xl">
        <p className="eyebrow mb-3">Probability Observatory</p>
        <h1 className="text-3xl leading-tight text-parchment sm:text-4xl">
          Exact odds, with the arithmetic in plain sight
        </h1>
        <p className="mt-4 text-lg text-muted">
          Every number below is computed in exact rational arithmetic from rules checked against the
          game’s own data and the published tables. Tap “exact” beside any percentage to see the
          fraction behind it. Where a relic or mode changes the rules, the calculator says what it
          does <em className="not-italic text-parchment">not</em> model.
        </p>
      </header>
      <OddsWorkbench />
    </div>
  );
}
