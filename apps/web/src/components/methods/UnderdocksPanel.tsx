import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { Tile } from "@/components/ui/Tile";
import { CLASS_STYLE } from "@/lib/card-style";
import {
  FINDING_NAMES,
  UNDERDOCKS,
  fallNote,
  underdocksTested,
  withheldWords,
  type UnderdocksData,
  type UnderdocksFinding,
  type UnderdocksSize,
  type UnderdocksTest,
  type UnderdocksVerdict,
} from "@/lib/underdocks";
import { formatP, pct, signed } from "@/lib/methods-data";
import type { PlayableClass } from "@slay2/game-data";

const games = (n: number): string => n.toLocaleString("en-US");
const classLabel = (c: string): string => CLASS_STYLE[c as PlayableClass].label;
/** A difference of shares as percentage points with its sign. */
const pts = (x: number): string => `${signed(x * 100, 1)} points`;

const FINDINGS: readonly UnderdocksFinding[] = ["synergy", "values", "neow"];

/** What each test compares and what stood behind it in Overgrowth, in the words of the registration. */
const DESCRIPTION: Record<
  UnderdocksFinding,
  { title: string; a: string; b: string; overgrowth: string }
> = {
  synergy: {
    title: "The synergy term",
    a: "the pilot that picks cards by the page's index with the synergy term",
    b: "the same pilot without it",
    overgrowth: "the same arms in Overgrowth with the relics kept: ADR-054",
  },
  values: {
    title: "The measured card values",
    a: "a pilot that follows the card values the site shows",
    b: "the hand-written rules",
    overgrowth: "the same arms in Overgrowth with the relics kept: the twin of ADR-058",
  },
  neow: {
    title: "The opening-relic rule",
    a: "a pilot that takes the best-measured opening relic",
    b: "one that takes the first helpful relic",
    overgrowth: "the same arms in Overgrowth with the relics kept: ADR-055",
  },
};

const VERDICT_TEXT: Record<UnderdocksVerdict, string> = {
  passed: "ahead in Underdocks",
  "not-shown": "not shown ahead in Underdocks",
  reversed: "behind in Underdocks",
};

const SIZE_TEXT: Record<UnderdocksSize, string> = {
  smaller: "smaller than in Overgrowth",
  "about-the-same": "about the same as in Overgrowth",
  larger: "larger than in Overgrowth",
};

function badgeTone(v: UnderdocksVerdict): "exact" | "unverified" {
  return v === "passed" ? "exact" : "unverified";
}

function ResultTiles({ test, label }: { test: UnderdocksTest; label: string }) {
  const e = test.reachedAct2;
  const e3 = test.reachedAct3;
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label={label}>
      <Tile
        k="Past the Act-1 boss"
        value={`${pct(e.b.rate, 1)} → ${pct(e.a.rate, 1)}`}
        note={formatP(e.pairedTable.mcnemar_p)}
      />
      <Tile
        k="Past the Act-2 boss (secondary)"
        value={`${pct(e3.b.rate, 1)} → ${pct(e3.a.rate, 1)}`}
        note={formatP(e3.pairedTable.mcnemar_p)}
      />
      <Tile
        k="Pairs completed by both"
        value={games(test.bothCompleted)}
        note={`of ${games(test.pairedSeeds)}`}
      />
      <Tile
        k="Wins"
        value={`${String(test.wins.b)} → ${String(test.wins.a)}`}
        note={formatP(test.wins.pairedTable.mcnemar_p)}
      />
      <Tile
        k="Every pair (errors counted by how far they got)"
        value={`${pct(test.allPairs.bRate, 1)} → ${pct(test.allPairs.aRate, 1)}`}
        note={`${formatP(test.allPairs.p)} · ${games(test.allPairs.pairs)} pairs`}
      />
    </ul>
  );
}

function ClassTable({ test, title }: { test: UnderdocksTest; title: string }) {
  return (
    <ScrollRegion label={`${title}, by class`}>
      <table className="mt-3 w-full min-w-[34rem] text-left text-sm">
        <caption className="pb-2 text-left font-display text-base text-gold">
          {title}: each class on its own
        </caption>
        <thead>
          <tr className="border-b border-line text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Class
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Pairs
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Past the Act-1 boss
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              First only / second only
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              p
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Floors
            </th>
            <th scope="col" className="py-2 font-medium">
              At the class level
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {test.members.map((m) => {
            const c = test.classes[m.character];
            return (
              <tr key={m.character} className="align-top">
                <th scope="row" className="py-2 pr-3 font-medium text-parchment">
                  {classLabel(m.character)}
                </th>
                <td className="num py-2 pr-3 text-muted">{games(m.bothCompleted)}</td>
                <td className="num py-2 pr-3">
                  {pct(m.reachedAct2.b, 1)} → {pct(m.reachedAct2.a, 1)}
                </td>
                <td className="num py-2 pr-3 text-muted">
                  {games(m.reachedAct2.pairedTable.a_only)} /{" "}
                  {games(m.reachedAct2.pairedTable.b_only)}
                </td>
                <td className="num py-2 pr-3 text-muted">
                  {formatP(m.reachedAct2.pairedTable.mcnemar_p)}
                </td>
                <td className="num py-2 pr-3 text-muted">{signed(m.meanFloorDifference)}</td>
                <td className="py-2 text-muted">
                  {c?.ahead ? "first arm ahead" : c?.behind ? "second arm ahead" : "not clear"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

function TestBlock({
  finding,
  test,
  level,
}: {
  finding: UnderdocksFinding;
  test: UnderdocksTest;
  level: number;
}) {
  const d = DESCRIPTION[finding];
  const [shareLo = 0, shareHi = 0] = test.clusteredDifference.ci95;
  const [lvlLo = 0, lvlHi = 0] = test.clusteredDifference.ciAtLevel.ci;
  const [floorLo = 0, floorHi = 0] = test.floorDifference.ci95;
  const og = test.overgrowth;
  return (
    <div className="rounded-xl border border-line bg-charcoal/40 p-4" id={`underdocks-${finding}`}>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3 className="font-display text-lg text-parchment">{d.title}</h3>
        <Badge tone={badgeTone(test.verdict)}>{VERDICT_TEXT[test.verdict]}</Badge>
        {test.size ? <Badge tone="neutral">{SIZE_TEXT[test.size]}</Badge> : null}
        {test.withheld ? (
          <Badge tone="unverified">
            {test.primary === "reversed" ? "reversal" : "pass"} withheld by the rule
          </Badge>
        ) : null}
      </div>
      <p className="text-sm text-muted">
        {d.a} against {d.b}, the relics kept, Ascension 0, Act 1 in Underdocks, the 2,000 held-out
        seeds of each class, five classes pooled in one exact McNemar test read at{" "}
        {level.toFixed(4)} (and the whole-seed interval of the difference at the same level has to
        exclude zero), run once.
      </p>
      <ResultTiles test={test} label={`Result for ${d.title.toLowerCase()} in Underdocks`} />
      <p className="mt-3 text-sm text-muted">
        {games(test.reachedAct2.pairedTable.a_only)} pairs only with the first arm,{" "}
        {games(test.reachedAct2.pairedTable.b_only)} only with the second. The difference of the
        shares, resampling whole seeds, is {pts(test.clusteredDifference.meanAMinusB)} (95 %{" "}
        {pts(shareLo)} to {pts(shareHi)}; at the level of the test, {pts(lvlLo)} to {pts(lvlHi)});
        mean floors {signed(test.floorDifference.meanAMinusB)} (95 % {signed(floorLo)} to{" "}
        {signed(floorHi)}). In Overgrowth, with the relics kept, the same arms differ by{" "}
        <span className="num">{pts(og.mean)}</span> (<span className="num">{pct(og.a, 1)}</span>{" "}
        against <span className="num">{pct(og.b, 1)}</span>, {games(og.bothCompleted)} pairs,{" "}
        {og.adr}).{" "}
        {test.size
          ? `The result in Underdocks is ${SIZE_TEXT[test.size]}: ${
              test.size === "smaller"
                ? "the upper end of its interval at the level of the test is below the Overgrowth difference"
                : test.size === "larger"
                  ? "the lower end of its interval at the level of the test is above the Overgrowth difference"
                  : "the Overgrowth difference lies inside its interval at the level of the test"
            }.`
          : ""}
        {fallNote(test) ? ` ${fallNote(test)}` : ""}
      </p>
      <p className="mt-2 text-sm text-muted">
        <strong className="text-parchment">The analysis of every pair.</strong> The test above drops
        the pairs in which either game ended in a simulator error or a timeout (
        {games(test.pairedSeeds - test.bothCompleted)} of {games(test.pairedSeeds)}, or{" "}
        {pct(test.allPairs.excludedFraction, 1)}); the rule also asks an analysis of all{" "}
        {games(test.allPairs.pairs)} pairs to have the same arm ahead at p below 0.05, with the
        endpoint scored as the games ended: {games(test.allPairs.aOnly)} pairs past the Act-1 boss
        only with the first arm against {games(test.allPairs.bOnly)} only with the second (
        {formatP(test.allPairs.p)}).{" "}
        {test.withheld
          ? `The primary test ${test.primary === "reversed" ? "had the second arm ahead" : "had the first arm ahead"}, and ${withheldWords(test)}, so the rule does not count it.`
          : test.primary === "not-shown"
            ? "The primary test did not pass, so this analysis could not change the reading."
            : "It agrees with the primary test."}
      </p>
      <p className="mt-2 text-xs text-dim">{d.overgrowth}.</p>
      <div className="mt-3">
        <Disclosure summary={`${d.title}: each class on its own (uncorrected)`}>
          <ClassTable test={test} title={d.title} />
        </Disclosure>
      </div>
    </div>
  );
}

function summary(data: UnderdocksData): { badge: string; tone: "exact" | "unverified" } {
  const verdicts = FINDINGS.map((f) => data.tests?.[f].verdict);
  const ahead = verdicts.filter((v) => v === "passed").length;
  return {
    badge:
      ahead === FINDINGS.length
        ? "all three ahead in Underdocks"
        : `${String(ahead)} of ${String(FINDINGS.length)} ahead in Underdocks`,
    tone: ahead === FINDINGS.length ? "exact" : "unverified",
  };
}

/**
 * Whether three results measured with Act 1 in Overgrowth hold in Underdocks (ADR-064): registered before any held-out game, nothing
 * refitted, three pooled tests run once, each set beside its twin in Overgrowth on the same seeds. Everything is read from the exporter's
 * file; until the tests have been run this says that they are registered, with what was checked on development seeds.
 */
export function UnderdocksPanel({ data = UNDERDOCKS }: { data?: UnderdocksData } = {}) {
  if (!data.registered) return null;
  const tested = underdocksTested(data);
  const level = data.level ?? 0.05 / 3;
  const pre = data.precondition;
  const sum = tested ? summary(data) : null;
  const licensed = data.tests
    ? Object.entries(data.tests.neow.classes)
        .filter(([, c]) => c.ahead)
        .map(([c]) => classLabel(c))
    : [];
  return (
    <Panel
      eyebrow="Act 1"
      title="Do these results carry over to Underdocks?"
      headingLevel={2}
      id="underdocks"
      aside={
        sum ? (
          <Badge tone={sum.tone}>{sum.badge}</Badge>
        ) : (
          <Badge tone="unverified">registered ({data.adr}), not run yet</Badge>
        )
      }
    >
      <div className="space-y-3 text-sm text-muted">
        <p>
          Act 1 comes in two versions, Overgrowth and Underdocks, with the same length, opening
          Ancient and map rules and different fights, elites, bosses and events.{" "}
          {tested ? "Until this study, every" : "Every"} result on this page was measured with Act 1
          in Overgrowth, because the simulator builds every run from it. A harness variant now plays
          Underdocks (the game&rsquo;s own lists of fights and events, with nothing in the simulator
          edited), so a result could shrink, hold or reverse there.
        </p>
        <p>
          <strong className="text-parchment">The study.</strong> Three results are tested once in
          Underdocks with nothing refitted: the same pilots, the same value files and the same
          opening-relic fit, the relics kept, Ascension 0, the 2,000 held-out seeds of each class,
          the five classes pooled into one exact McNemar test per result, each read at{" "}
          <span className="num">{level.toFixed(4)}</span> (0.05 split over the three) and each also
          needing the whole-seed interval of its difference, at that level, to exclude zero, an
          analysis of every pair of seeds (the endpoint scored as the games ended, so that a game
          lost to a simulator error after the boss still counts as past it) to have the same arm
          ahead at p below 0.05, and at most a tenth of the pairs to have been dropped. Each has its
          twin in Overgrowth on the same seeds, played by an earlier study, and a passed result is
          told how big it is beside that one. The registration ({data.adr}) was written and pushed
          before any held-out game was played.
        </p>
        {pre ? (
          <p>
            <strong className="text-parchment">Checked on development seeds first.</strong>{" "}
            {games(pre.games)} games (100 per class and arm) showed that the six pilots play in
            Underdocks in all five classes with the relics kept, that all three Underdocks bosses
            are dealt, and that the act can be got through: the pilot that follows the shown card
            values got past the Act-1 boss in{" "}
            <span className="num">{pct(pre.pooledShownValues.underdocks.rate, 1)}</span> of{" "}
            {games(pre.pooledShownValues.underdocks.completed)} completed games in Underdocks
            against <span className="num">{pct(pre.pooledShownValues.overgrowth.rate, 1)}</span> of{" "}
            {games(pre.pooledShownValues.overgrowth.completed)} in Overgrowth on the same seeds.
            That compares no pilots; it shows the arms run. The harness was also checked against the
            game&rsquo;s own source: the act&rsquo;s fights, events and tags, the hit points of all
            22 of its monsters at Ascensions 0, 7, 8, 9 and 10, and the numbers of their harder
            Ascensions.
          </p>
        ) : null}
        {!tested ? (
          <p>
            <strong className="text-parchment">Not run yet.</strong> Until the result is in, a run
            that says it is in Underdocks gets a line on the synergy panel, on the simulated second
            opinion on card rewards and on the opening-relic comparison saying that the finding was
            measured with Act 1 in Overgrowth only.
          </p>
        ) : null}
      </div>
      {tested && data.tests ? (
        <div className="mt-4 space-y-4">
          {FINDINGS.map((f) => {
            const test = data.tests?.[f];
            return test ? <TestBlock key={f} finding={f} test={test} level={level} /> : null;
          })}
          <div className="rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
            <p className="font-medium text-parchment">What the advisor does with this</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              <li>
                A run that says it is in Underdocks gets, in the note on each of the three panels,
                the Underdocks result in its own words and figures, and how big a passed result is
                beside the one in Overgrowth. A run whose own class went the other way in its own
                Underdocks games (at p below {data.classLevel}) is told so. The figures on the panel
                itself are still the ones measured in Overgrowth.
              </li>
              <li>
                The opening-relic advice in Underdocks names a relic for a class only if the test
                passed and that class&rsquo;s own Underdocks games had the rule ahead at p below{" "}
                {data.classLevel}; for any other class the advisor shows the measurements and says
                it has no tested advice for Underdocks. Classes with tested advice:{" "}
                {data.tests.neow.verdict === "passed" && licensed.length > 0
                  ? licensed.join(", ")
                  : "none"}
                . A class can be left out because the rule did not help it there or because too few
                of its pairs differ to show it.
              </li>
              <li>
                A test that was not shown ahead does not withdraw its panel: the ranking and the
                values can still be read, and the note says what was found.
              </li>
            </ul>
          </div>
        </div>
      ) : null}
      <div className="mt-4 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
        <p className="font-medium text-parchment">What this does not cover</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            A fit in Underdocks: card values or relic measurements taken there could differ. That is
            a separate registration.
          </li>
          <li>
            What the simulator&rsquo;s Underdocks monsters do with their numbers and what its events
            do: they are its transcription of the game&rsquo;s code, never compared with the live
            game (gap G5). The numbers themselves are checked.
          </li>
          <li>
            Ascensions above 0 in Underdocks, the live game, a human player, and winning (the pilots
            win next to nothing).
          </li>
        </ul>
      </div>
      {tested && data.tests ? (
        <p className="mt-3 font-mono text-xs text-dim">
          {FINDINGS.map(
            (f) =>
              `${FINDING_NAMES[f]}: ${data.tests?.[f].file.split("/").pop() ?? ""} sha ${data.tests?.[f].sha256.slice(0, 12) ?? ""}`,
          ).join(" · ")}
        </p>
      ) : null}
    </Panel>
  );
}
