import type { Metadata } from "next";
import Link from "next/link";

import { CATALOG, RELIC_CATALOG } from "@slay2/game-data";

import { CodexViews } from "@/components/codex/CodexViews";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";

export const metadata: Metadata = {
  title: "Codex",
  description:
    "Every card and relic SLAY2 knows for Slay the Spire 2 main v0.107.1, as facts: class, rarity, cost, type, keywords, pools and our own role tags. No card or relic text, no game art.",
};

export default function CodexPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Reference</p>
        <h1 className="text-3xl leading-tight text-parchment sm:text-4xl">Codex</h1>
        <p className="mt-4 text-lg text-muted">
          The {String(CATALOG.cards.length)} cards and {String(RELIC_CATALOG.relics.length)} relics
          SLAY2 knows for the supported build, filterable by class, rarity and, for cards, type and
          role. It lists <strong className="text-parchment">facts</strong> — id, name, cost, type,
          rarity, keywords, pools — and SLAY2&apos;s own role tags, never the game&apos;s card or
          relic text.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="build">main 0.107.1</Badge>
          <Badge tone="neutral">facts and simulated values</Badge>
          <Badge
            tone="unverified"
            title="Measured in a community simulator that has not been compared with the live game"
          >
            simulated values: unverified
          </Badge>
          <Badge
            tone="heuristic"
            title="The role tags are SLAY2's own reading of structured fields"
          >
            role tags are SLAY2&apos;s own
          </Badge>
        </div>
      </header>

      <CodexViews />

      <Panel eyebrow="Provenance" title="Where this list comes from" headingLevel={2}>
        <div className="space-y-3 text-muted">
          <p>
            The catalog is derived from structured fields (never from card text) of the supported
            build and carries its own checksum{" "}
            <code className="rounded bg-charcoal px-1.5 py-0.5 font-mono text-[0.85em] text-parchment">
              {CATALOG.sha256.slice(0, 12)}…
            </code>
            . The relic list is made the same way (a name, a rarity tier and the pools that offer
            it, with its own checksum{" "}
            <code className="rounded bg-charcoal px-1.5 py-0.5 font-mono text-[0.85em] text-parchment">
              {RELIC_CATALOG.sha256.slice(0, 12)}…
            </code>
            ). Role tags such as “block” or “draw” are written by SLAY2 and describe what a card
            does at a glance; they are not a rating. Where simulated runs measured a card, its tile
            also shows that value, its interval and how many runs it rests on (method, caveats and
            the test of whether acting on the values helps are on{" "}
            <Link
              href="/methods#card-values"
              className="text-teal underline decoration-dotted underline-offset-4"
            >
              Evidence &amp; methods
            </Link>
            ). Those numbers come from a simulator that has not been compared with the live game.
          </p>
          <p>
            Missing a card? The rewards pool excludes cards that only appear through events or
            progression, which is why “card-reward pool only” is a filter. See{" "}
            <Link
              href="/about"
              className="text-teal underline decoration-dotted underline-offset-4"
            >
              About &amp; rights
            </Link>{" "}
            for what the site deliberately does not contain.
          </p>
        </div>
      </Panel>
    </div>
  );
}
