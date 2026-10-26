import type { Metadata } from "next";
import Link from "next/link";

import { CATALOG } from "@slay2/game-data";

import { CodexBrowser } from "@/components/codex/CodexBrowser";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";

export const metadata: Metadata = {
  title: "Card codex",
  description:
    "Every card SLAY2 knows for Slay the Spire 2 main v0.107.1, as facts: class, rarity, cost, type, keywords and our own role tags. No card text, no game art.",
};

export default function CodexPage() {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Reference</p>
        <h1 className="text-3xl leading-tight text-parchment sm:text-4xl">Card codex</h1>
        <p className="mt-4 text-lg text-muted">
          The {String(CATALOG.cards.length)} cards SLAY2 knows for the supported build, filterable
          by class, rarity, type and role. It lists{" "}
          <strong className="text-parchment">facts</strong> — id, name, cost, type, rarity, keywords
          — and SLAY2&apos;s own role tags, never the game&apos;s card text.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge tone="build">main 0.107.1</Badge>
          <Badge tone="neutral">facts only</Badge>
          <Badge
            tone="heuristic"
            title="The role tags are SLAY2's own reading of structured fields"
          >
            role tags are SLAY2&apos;s own
          </Badge>
        </div>
      </header>

      <CodexBrowser />

      <Panel eyebrow="Provenance" title="Where this list comes from" headingLevel={2}>
        <div className="space-y-3 text-muted">
          <p>
            The catalog is derived from structured fields (never from card text) of the supported
            build and carries its own checksum{" "}
            <code className="rounded bg-charcoal px-1.5 py-0.5 font-mono text-[0.85em] text-parchment">
              {CATALOG.sha256.slice(0, 12)}…
            </code>
            . Role tags such as “block” or “draw” are written by SLAY2 and describe what a card does
            at a glance; they are not a rating. Measured values from simulated runs are not
            published yet, so none is shown here.
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
