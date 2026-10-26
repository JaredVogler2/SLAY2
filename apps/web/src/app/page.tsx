import type { Metadata } from "next";

import { HeroSpire } from "@/components/brand/HeroSpire";
import { PityDemo } from "@/components/landing/PityDemo";
import { ResumeButton } from "@/components/landing/ResumeButton";
import { Badge } from "@/components/ui/Badge";
import { ButtonLink } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { coverage } from "@/lib/cardvalues";

export const metadata: Metadata = {
  title: { absolute: "SLAY2 — The Spire Intelligence Observatory" },
};

const PILLARS = [
  {
    eyebrow: "Exact odds",
    title: "Numbers you can check",
    body: "Card-reward rarity with the hidden pity counter, potion drops, “?” room outcomes, draw probabilities and shop prices — computed in exact rational arithmetic, verified against an independent implementation and the published tables.",
    href: "/odds",
    cta: "Open the observatory",
    tone: "exact" as const,
    badge: "Exact",
  },
  {
    eyebrow: "Advisor",
    title: "Advice that shows its work",
    body: "Enter the cards you are offered. SLAY2 ranks them against your deck, breaks the score into reasons, and tells you how stable the call is. It is a transparent heuristic today — labelled as one, never dressed up as a win probability.",
    href: "/advisor",
    cta: "Get my next decision",
    tone: "heuristic" as const,
    badge: "Heuristic v0",
  },
  {
    eyebrow: "Evidence",
    title: "A ledger, not a leaderboard",
    body: "Every rule has a source, every model a measured result with its sample size — and “not yet evaluated” where nothing has been measured. Third-party simulator results are research output with unverified live-game parity.",
    href: "/methods",
    cta: "Read the evidence",
    tone: "neutral" as const,
    badge: "Audited",
  },
];

export default function Home() {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-6 px-4 pb-12 pt-10 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:pb-20 lg:pt-16">
          <div className="relative z-10">
            <p className="eyebrow mb-4">The Spire Intelligence Observatory</p>
            <h1 className="text-[2.35rem] leading-[1.08] text-parchment sm:text-5xl lg:text-[3.6rem]">
              Make every draft decision <span className="text-gold">on evidence.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-muted">
              SLAY2 is an independent strategy companion for Slay the Spire 2. It calculates reward,
              potion, “?” room and draw odds <em className="not-italic text-parchment">exactly</em>,
              tracks the hidden counters behind them, and explains its card advice — without passing
              off a guess as a fact.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <ButtonLink href="/advisor" variant="primary" size="lg">
                Get my next decision
              </ButtonLink>
              <ButtonLink href="/odds" size="lg">
                Explore exact odds
              </ButtonLink>
              <ResumeButton />
            </div>
            <ul className="mt-8 flex flex-wrap gap-2" aria-label="Key facts">
              <li>
                <Badge tone="exact">Exact arithmetic</Badge>
              </li>
              <li>
                <Badge tone="build">Main v0.107.1 verified</Badge>
              </li>
              <li>
                <Badge tone="neutral">No account · runs in your browser</Badge>
              </li>
            </ul>
          </div>
          <div className="relative mx-auto w-full max-w-[520px]">
            <HeroSpire className="h-auto w-full" />
          </div>
        </div>
        <div className="hairline" />
      </section>

      <div className="mx-auto w-full max-w-6xl space-y-14 px-4 pt-12 sm:px-6">
        <PityDemo />

        <section aria-labelledby="pillars">
          <h2 id="pillars" className="sr-only">
            What SLAY2 does
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {PILLARS.map((p) => (
              <Panel
                key={p.title}
                eyebrow={p.eyebrow}
                title={p.title}
                aside={<Badge tone={p.tone}>{p.badge}</Badge>}
                headingLevel={3}
              >
                <p className="text-muted">{p.body}</p>
                <div className="mt-5">
                  <ButtonLink href={p.href} variant="ghost" size="sm">
                    {p.cta} →
                  </ButtonLink>
                </div>
              </Panel>
            ))}
          </div>
        </section>

        <Panel eyebrow="Coverage notice" title="What is — and is not — supported today">
          <ScrollRegion label="Support status by feature">
            <table className="w-full min-w-[34rem] border-collapse text-left text-sm">
              <caption className="sr-only">Support status by feature</caption>
              <thead>
                <tr className="border-b border-line text-muted">
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Area
                  </th>
                  <th scope="col" className="py-2 pr-4 font-medium">
                    Status
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[
                  [
                    "Game build",
                    "Supported",
                    "Main v0.107.1 (Steam build 23811903). Beta v0.111.0 is refused until its rules are verified.",
                  ],
                  [
                    "Characters & ascension",
                    "Supported",
                    "Ironclad, Silent, Regent, Necrobinder, Defect · Ascension 0–10 (STS2 has no A11–A20, no Act 4, no keys).",
                  ],
                  [
                    "Exact odds",
                    "Supported",
                    "Rarity + pity counter (incl. A7), potion counter, “?” rooms, draws, shop prices, gold.",
                  ],
                  [
                    "Card advisor",
                    "Heuristic v0",
                    "Transparent and uncalibrated. Class coverage is limited by how much each card’s effect is tagged. Where simulated runs tested a class’s card values, the advisor adds a labelled second opinion beside it.",
                  ],
                  [
                    "Simulated card values",
                    "Research",
                    coverage()
                      .map((c) => `${c.label}: ${c.detail}`)
                      .join(" · ") +
                      ". Simulator unverified against the live game; see Evidence & methods.",
                  ],
                  [
                    "Route comparison",
                    "Supported",
                    "Type up to three routes through an act: exact “?” outcomes, rare-card and potion odds, gold and relics along each. It compares what routes pay, never whether you would survive them.",
                  ],
                  [
                    "Combat lab, map pathfinder, shops, events",
                    "Planned",
                    "Not available yet; nothing on this site pretends otherwise.",
                  ],
                  [
                    "Co-op",
                    "Not supported",
                    "Per-seat odds exist in the game; scaling and shared decisions are unverified.",
                  ],
                ].map(([area, status, detail]) => (
                  <tr key={area}>
                    <th scope="row" className="py-3 pr-4 font-medium text-parchment">
                      {area}
                    </th>
                    <td className="py-3 pr-4">
                      <Badge
                        tone={
                          status === "Supported"
                            ? "exact"
                            : status === "Heuristic v0"
                              ? "heuristic"
                              : status === "Research"
                                ? "build"
                                : "unverified"
                        }
                      >
                        {status}
                      </Badge>
                    </td>
                    <td className="py-3 text-muted">{detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        </Panel>
      </div>
    </>
  );
}
