import type { Metadata } from "next";
import Link from "next/link";

import { AscensionLadder } from "@/components/insights/AscensionLadder";
import { CardSurprises } from "@/components/insights/CardSurprises";
import { CoverageMatrix } from "@/components/insights/CoverageMatrix";
import { EvidenceLegend } from "@/components/insights/EvidenceBadge";
import { Findings } from "@/components/insights/Findings";
import { LaterStudy } from "@/components/insights/LaterStudy";
import { LeverLadder } from "@/components/insights/LeverLadder";
import { OpenQuestions } from "@/components/insights/OpenQuestions";
import { RunsEnd } from "@/components/insights/RunsEnd";
import { SecondBoss } from "@/components/insights/SecondBoss";
import { SynergyAtlas } from "@/components/insights/SynergyAtlas";
import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { act2Data } from "@/lib/act2";
import { INSIGHTS, count, roughly } from "@/lib/insights";
import { allSets } from "@/lib/cardvalues";
import { act2CardName, atlasData } from "@/lib/insights-server";

const PLAYED = INSIGHTS.games.completed + INSIGHTS.games.exploration.completed;

export const metadata: Metadata = {
  title: "Insights",
  description: `What simulated Slay the Spire 2 games say about what moves the odds of a run: how big the differences between simulated pilots are, where runs end, what matters at the second boss, where card ratings and measurements disagree, how cards work together, what each Ascension changes, and what this site does and does not capture of the game.`,
};

const LATER = act2Data();

const SECTIONS: readonly (readonly [string, string])[] = [
  ["findings", "Findings"],
  ["levers", "Levers"],
  ["runs-end", "Where runs end"],
  ["second-boss", "The second boss"],
  // the Act-2 study (ADR-060) is shown once its fit exists
  ...(LATER?.fit ? ([["later", "After the first boss"]] as const) : []),
  ["cards", "Card surprises"],
  ["synergy", "Synergy atlas"],
  ["ascension", "Ascension"],
  ["coverage", "What the site captures"],
  ["open", "Not known yet"],
];

export default function InsightsPage() {
  const atlas = atlasData();
  // the rank correlations of the measured values with the hand ratings, one for each class
  const rhos = allSets().flatMap((s) =>
    s.spearmanWithStaticRating === null ? [] : [s.spearmanWithStaticRating],
  );
  const rhoLow = Math.min(...rhos);
  const rhoHigh = Math.max(...rhos);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-4 py-10 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Insights</p>
        <h1 className="text-3xl leading-tight text-parchment sm:text-4xl">
          What moves the odds in simulated runs
        </h1>
        <p className="mt-4 text-lg text-muted">
          This project&rsquo;s ledger holds {roughly(PLAYED)} completed simulated games of{" "}
          <em className="not-italic text-parchment">Slay the Spire 2</em>. The page reads them for
          what moves the odds of getting past the first boss and the second, with a plain account of
          what they cannot say.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge tone="unverified" title="The simulator has not been compared with the live game">
            Simulated · unverified
          </Badge>
          <Badge tone="build" title="The only game build whose rules SLAY2 has verified">
            main 0.107.1
          </Badge>
        </div>
      </header>

      <nav aria-label="On this page" className="-mx-1">
        <ul className="flex flex-wrap gap-1.5">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-ink-2 px-3 text-sm text-muted hover:border-copper hover:text-parchment"
              >
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <Panel eyebrow="Read this first" title="What these figures are, and are not">
        <div className="space-y-3 text-sm text-muted">
          <p>
            Every performance figure here comes from a third-party simulator that plays Slay the
            Spire 2 locally. It has{" "}
            <strong className="font-medium text-parchment">
              never been compared with the live game
            </strong>
            , so each of them is model output about a rules-playing pilot, not a win probability for
            you. The pilots win almost nothing, so most figures are about getting past the first
            boss, and what is true of that may not be true of winning. The counts of what the game
            holds come from its extracted data, and the Ascension rules from the site&rsquo;s
            register of rules.
          </p>
          <p>
            Three known gaps of the simulator bear on what follows (the others are on{" "}
            <Link
              href="/methods"
              className="text-teal underline decoration-dotted underline-offset-4"
            >
              Evidence &amp; methods
            </Link>
            ): every game is played in Overgrowth, so the Act-1 bosses named here are
            Overgrowth&rsquo;s (G12); acts two and three have no start-of-act Ancient, so a run
            reaches them with whatever HP the boss fight left (G11); and a Necrobinder starts at 75
            HP where the game gives 66 (G13).
          </p>
          <p>
            {count(PLAYED)} completed games are in the project&rsquo;s ledger:{" "}
            {count(INSIGHTS.games.completed)} in the evidence ledger of Methods and{" "}
            {count(INSIGHTS.games.exploration.completed)} played to fit values, to explore and to
            check a setup. Not every game feeds a figure here, and the sections that report games
            say how many; they are not independent, since the same seeds are played by several
            pilots. What kind of evidence a number is matters more than its size, so the findings
            and the lever rows carry a label:
          </p>
        </div>
        <div className="mt-4">
          <EvidenceLegend />
        </div>
      </Panel>

      <Panel
        id="findings"
        className="scroll-mt-20"
        eyebrow="Findings"
        title="Six things the simulated games say"
      >
        <Findings />
      </Panel>

      <Panel
        id="levers"
        className="scroll-mt-20"
        eyebrow="Levers"
        title="How big each difference between simulated pilots is"
      >
        <p className="mb-4 max-w-3xl text-sm text-muted">
          Each lever is a pair of simulated pilots that differ in one thing, played on the same
          seeds. The bar is the difference in the share of games that got past the Act-1 boss.
          Largest first; the label says whether the advisor already helps with it.
        </p>
        <LeverLadder />
      </Panel>

      <Panel
        id="runs-end"
        className="scroll-mt-20"
        eyebrow="Where runs end"
        title="Most simulated runs end before the third act"
      >
        <RunsEnd />
      </Panel>

      <Panel
        id="second-boss"
        className="scroll-mt-20"
        eyebrow="Exploratory"
        title="The second boss looks different"
      >
        <SecondBoss />
      </Panel>

      {LATER?.fit ? (
        <Panel
          id="later"
          className="scroll-mt-20"
          eyebrow="A registered study"
          title="Does anything change once the first boss is behind the run?"
        >
          <LaterStudy data={LATER} nameOf={act2CardName} />
        </Panel>
      ) : null}

      <Panel
        id="cards"
        className="scroll-mt-20"
        eyebrow="Cards"
        title="Where the measurement and the old rating disagree"
      >
        <p className="mb-4 max-w-3xl text-sm text-muted">
          The hand-written rating of a card and its measured value agree only weakly (rank
          correlations of {rhoLow.toFixed(2)} to {rhoHigh.toFixed(2)} across the classes). Among the
          cards a reward can offer, these are the ones of each class that sit furthest from where
          their rating puts them. The{" "}
          <Link href="/codex" className="text-teal underline decoration-dotted underline-offset-4">
            Codex
          </Link>{" "}
          has every measured card.
        </p>
        <CardSurprises />
      </Panel>

      <Panel
        id="synergy"
        className="scroll-mt-20"
        eyebrow="Judgement"
        title="Synergy atlas: which cards feed which mechanic"
      >
        <p className="mb-4 max-w-3xl text-sm text-muted">
          How the advisor reads the way cards work together: for each mechanic, the cards that
          supply it and the cards whose worth depends on it.
        </p>
        <SynergyAtlas mechanics={atlas} />
        <noscript>
          <p className="mt-3 text-sm text-muted">
            The atlas lets you choose a class and a mechanic and needs JavaScript; it is showing the
            first of each.
          </p>
        </noscript>
      </Panel>

      <Panel
        id="ascension"
        className="scroll-mt-20"
        eyebrow="Ascension"
        title="What each level changes, and how much harder level 9 is"
      >
        <AscensionLadder />
      </Panel>

      <Panel
        id="coverage"
        className="scroll-mt-20"
        eyebrow="Capture"
        title="What this site holds of the game, part by part"
      >
        <CoverageMatrix />
      </Panel>

      <Panel
        id="open"
        className="scroll-mt-20"
        eyebrow="Not known yet"
        title="What the figures do not reach"
      >
        <OpenQuestions />
      </Panel>

      <p className="max-w-3xl text-sm text-dim">
        Every measured figure on this page is read from the experiment files in the repository by{" "}
        <code className="font-mono text-xs">scripts/export-site-data.mjs</code>, each against the
        counts it rests on. The rule numbers in the Ascension table, the shop prices in the note on
        gold and the room counts of the map are written from the register of rules, which the table
        cites; the counts of what the game holds come from its extracted data. The registrations,
        the results and the known gaps of the simulator are in{" "}
        <Link href="/methods" className="text-teal underline decoration-dotted underline-offset-4">
          Evidence &amp; methods
        </Link>
        .
      </p>
    </div>
  );
}
