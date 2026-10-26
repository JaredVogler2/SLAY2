import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { contactLink } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "About & rights",
  description:
    "What SLAY2 is, what it deliberately does not contain, where its rules and data come from, what stays in your browser, and what is still undecided.",
};

const INCLUDED = [
  "Original code, mathematics, tests and interface design.",
  "Factual identifiers for cards: canonical id, display name, class, rarity, cost and type, with provenance.",
  "Our own short role tags such as “attack”, “block” or “draw”, written by us.",
  "Aggregated results from our own simulator experiments, always labelled as simulator output.",
  "A hand-drawn SVG illustration made for this site.",
] as const;

const EXCLUDED = [
  "Game art, icons, audio, fonts, logos or card frames.",
  "Card, relic, potion or event text, flavour text or descriptions, from the game or from any site.",
  "Bulk dumps or mirrors of extracted game data, decompiled code or game files.",
  "AI-generated imagery presented as art.",
  "Accounts, advertising, trackers, cookies or paid features.",
] as const;

function Bullets({ items }: { items: readonly ReactNode[] }) {
  return (
    <ul className="space-y-2 text-sm text-muted">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5">
          <span
            aria-hidden="true"
            className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-copper"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function AboutPage() {
  const contact = contactLink();
  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 px-4 py-10 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">About &amp; rights</p>
        <h1 className="text-3xl leading-tight text-parchment sm:text-4xl">
          An independent fan project, built to be checked
        </h1>
        <p className="mt-4 text-lg text-muted">
          SLAY2 is a free, noncommercial strategy companion for{" "}
          <em className="not-italic text-parchment">Slay the Spire 2</em>. It is not affiliated
          with, endorsed by or sponsored by Mega Crit. The game, its name and its content belong to
          their owners.
        </p>
      </header>

      <Panel eyebrow="Purpose" title="What it is for" headingLevel={2}>
        <div className="space-y-3 text-muted">
          <p>
            The aim is to make decisions in the Spire easier to reason about: exact odds where the
            rules are known, an explainable card advisor where they are not, and a public ledger of
            what has and has not been verified. Nothing here plays the game for you and nothing
            reads the game while it runs.
          </p>
          <p>
            It covers the current main build,{" "}
            <strong className="font-medium text-parchment">v0.107.1</strong>, solo play, ascension 0
            to 10 and the five characters. The beta build is deliberately not supported until its
            rules have been checked, because Early Access changes numbers between patches. See{" "}
            <Link
              href="/methods"
              className="text-teal underline decoration-dotted underline-offset-4"
            >
              Evidence &amp; methods
            </Link>{" "}
            for every rule and its status.
          </p>
        </div>
      </Panel>

      <Panel eyebrow="Content" title="What is on this site, and what is not" headingLevel={2}>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-base text-parchment">
              <Badge tone="exact">On this site</Badge>
            </h3>
            <Bullets items={INCLUDED} />
          </div>
          <div>
            <h3 className="mb-3 flex items-center gap-2 text-base text-parchment">
              <Badge tone="neutral">Not on this site</Badge>
            </h3>
            <Bullets items={EXCLUDED} />
          </div>
        </div>
      </Panel>

      <Panel eyebrow="Provenance" title="Where the rules come from" headingLevel={2}>
        <div className="space-y-3 text-muted">
          <p>
            Each rule on the{" "}
            <Link
              href="/methods"
              className="text-teal underline decoration-dotted underline-offset-4"
            >
              methods page
            </Link>{" "}
            carries an evidence class. The strongest is the behaviour of the shipped game build,
            checked by reading its logic for facts and constants only. After that come official
            statements and community wikis, which are cited with attribution and never copied. Our
            own exact arithmetic is then tested four independent ways before a number is shown.
          </p>
          <p>
            Nothing read from the game&apos;s code or from third-party databases is redistributed:
            what we keep is the fact (for example, a constant and where it was found), not the text.
            If a rights holder objects to a source, the rules that depend on it are marked so and
            can be re-supported by other evidence.
          </p>
          <p>
            Simulator experiments run on a third-party research simulator whose agreement with the
            live game has <strong className="font-medium text-parchment">not</strong> been verified.
            Its results are shown only as simulator output with their sample size and known gaps,
            never as a promise about your next run.
          </p>
        </div>
      </Panel>

      <Panel eyebrow="Privacy" title="What stays in your browser" headingLevel={2}>
        <div className="space-y-3 text-muted">
          <p>
            Your run (character, deck, recorded rewards) is stored only in this browser&apos;s local
            storage, and in files you choose to export. There are no accounts, no cookies and no
            analytics or tracking scripts, and the pages do not send your run anywhere. Clearing
            your site data, or using “New run”, removes it. Import and export are plain JSON you can
            read.
          </p>
          <p>
            The public calculation endpoints under{" "}
            <code className="rounded bg-charcoal px-1.5 py-0.5 font-mono text-[0.85em] text-parchment">
              /api/v1
            </code>{" "}
            compute from the request you send and store nothing. They keep a short-lived, in-memory
            request counter per connecting address so one client cannot flood them; it is never
            written to disk and is best-effort.
          </p>
        </div>
      </Panel>

      <Panel eyebrow="Open decisions" title="What is deliberately still undecided" headingLevel={2}>
        <dl className="grid gap-4 sm:grid-cols-2">
          {[
            [
              "License for SLAY2’s own code",
              "Not chosen yet, so for now all rights are reserved. A permissive or a noncommercial license will be picked by the owner.",
            ],
            [
              "Money",
              "None. No ads, paywall, donations or sponsorship. Any change would need legal review and the rights holder’s confirmation first.",
            ],
            [
              "A mod for the live game",
              "Not started. It has different rights and fairness questions from a website, so it is a separate decision.",
            ],
            [
              "Live-game verification",
              "Simulator-to-game parity needs a licensed copy of the game and a reviewed bridge. Until then it is listed as unverified.",
            ],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-line bg-charcoal/40 px-4 py-3">
              <dt className="text-sm font-medium text-parchment">{k}</dt>
              <dd className="mt-1 text-sm text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel eyebrow="Corrections" title="Found a mistake?" headingLevel={2}>
        {contact ? (
          <p className="text-muted">
            Please tell us, ideally with the build number and the exact numbers you saw:{" "}
            <a
              href={contact.href}
              rel="noopener noreferrer"
              className="text-teal underline decoration-dotted underline-offset-4"
            >
              {contact.label}
            </a>
            .
          </p>
        ) : (
          <p className="text-muted">
            No public contact channel has been configured for this deployment yet. When one is, it
            will appear here. Until then, treat anything marked “unverified” or “heuristic” as
            exactly that.
          </p>
        )}
      </Panel>
    </div>
  );
}
