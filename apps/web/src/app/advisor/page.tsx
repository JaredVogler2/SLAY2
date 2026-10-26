import type { Metadata } from "next";

import { AdvisorWorkbench } from "@/components/advisor/AdvisorWorkbench";

export const metadata: Metadata = {
  title: "Card Advisor",
  description:
    "Enter the cards you are offered and get an explainable ranking against your deck, including skip. A transparent heuristic, not a win probability. Runs in your browser.",
};

export default function AdvisorPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
      <header className="mb-8 max-w-3xl">
        <p className="eyebrow mb-3">Instant advisor</p>
        <h1 className="text-3xl leading-tight text-parchment sm:text-4xl">Take it, or skip it?</h1>
        <p className="mt-4 text-lg text-muted">
          Enter your card reward and SLAY2 ranks every option — skipping included — against your
          deck, shows the reasons behind each number, and tells you how fragile the call is. The
          ranking is a transparent heuristic today: it has not been calibrated against outcomes, and
          it never claims a win probability.
        </p>
      </header>
      <AdvisorWorkbench />
    </div>
  );
}
