import type { Metadata } from "next";

import { RouteLab } from "@/components/routes/RouteLab";

export const metadata: Metadata = {
  title: "Route Lab",
  description:
    "Compare the routes you are considering through a Slay the Spire 2 act: exact odds of rare cards, potions, shops and treasure along each route (main v0.107.1). It says what a route pays, never whether you will survive it.",
};

export default function RoutesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8 max-w-3xl">
        <p className="eyebrow mb-3">Route Lab</p>
        <h1 className="text-3xl leading-tight text-parchment sm:text-4xl">
          What does each route pay?
        </h1>
        <p className="mt-4 text-lg text-muted">
          Type up to three routes through an act. Route Lab shows, exactly, what each one pays: what
          the “?” rooms turn into, rare cards, potions, gold and relics. It does not know your hit
          points or deck, so it compares what routes{" "}
          <em className="not-italic text-parchment">pay</em>, never whether you would survive them.
        </p>
      </header>
      <RouteLab />
    </div>
  );
}
