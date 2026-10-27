import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { Tile } from "@/components/ui/Tile";
import { CLASS_STYLE } from "@/lib/card-style";
import {
  ASCENSION,
  FINDING_NAMES,
  ascensionTested,
  type AscensionData,
  type AscensionFinding,
  type AscensionSize,
  type AscensionTest,
  type AscensionVerdict,
} from "@/lib/ascension";
import { formatP, pct, signed } from "@/lib/methods-data";
import type { PlayableClass } from "@slay2/game-data";

const games = (n: number): string => n.toLocaleString("en-US");
const classLabel = (c: string): string => CLASS_STYLE[c as PlayableClass].label;
/** A difference of shares as percentage points with its sign. */
const pts = (x: number): string => `${signed(x * 100, 1)} points`;

const FINDINGS: readonly AscensionFinding[] = ["synergy", "values", "neow"];

/** What each test compares and what stood behind it at Ascension 0, in the words of the registration. */
const DESCRIPTION: Record<AscensionFinding, { title: string; a: string; b: string; at0: string }> =
  {
    synergy: {
      title: "The synergy term",
      a: "the pilot that picks cards by the page's index with the synergy term",
      b: "the same pilot without it",
      at0: "the same arms at Ascension 0 with the relics kept: ADR-054",
    },
    values: {
      title: "The measured card values",
      a: "a pilot that follows the card values the site shows",
      b: "the hand-written rules",
      at0: "this pair was tested at Ascension 0 only in the simulator that drops the relics and with the earlier sets (ADR-031, ADR-034); its twin below plays the sets now shown with the relics kept",
    },
    neow: {
      title: "The opening-relic rule",
      a: "a pilot that takes the best-measured opening relic",
      b: "one that takes the first helpful relic",
      at0: "the same arms at Ascension 0 with the relics kept: ADR-055",
    },
  };

const VERDICT_TEXT: Record<AscensionVerdict, string> = {
  passed: "ahead at Ascension 9",
  "not-shown": "not shown ahead at Ascension 9",
  reversed: "behind at Ascension 9",
};

const SIZE_TEXT: Record<AscensionSize, string> = {
  smaller: "smaller than at Ascension 0",
  "about-the-same": "about the same as at Ascension 0",
  larger: "larger than at Ascension 0",
};

function badgeTone(v: AscensionVerdict): "exact" | "unverified" {
  return v === "passed" ? "exact" : "unverified";
}

function ResultTiles({
  test,
  label,
}: {
  test: Pick<AscensionTest, "reachedAct2" | "bothCompleted" | "pairedSeeds" | "wins">;
  label: string;
}) {
  const e = test.reachedAct2;
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-3" aria-label={label}>
      <Tile
        k="Past the Act-1 boss"
        value={`${pct(e.b.rate, 1)} → ${pct(e.a.rate, 1)}`}
        note={formatP(e.pairedTable.mcnemar_p)}
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
    </ul>
  );
}

function ClassTable({ test, title }: { test: AscensionTest; title: string }) {
  return (
    <ScrollRegion label={`${title}, by class`}>
      <table className="mt-3 w-full min-w-[34rem] text-left text-sm">
        <caption className="pb-2 text-left font-display text-base text-gold">By class</caption>
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
                  {m.reachedAct2.pairedTable.a_only} / {m.reachedAct2.pairedTable.b_only}
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
  finding: AscensionFinding;
  test: AscensionTest;
  level: number;
}) {
  const d = DESCRIPTION[finding];
  const [shareLo = 0, shareHi = 0] = test.clusteredDifference.ci95;
  const [lvlLo = 0, lvlHi = 0] = test.clusteredDifference.ciAtLevel.ci;
  const [floorLo = 0, floorHi = 0] = test.floorDifference.ci95;
  const a0 = test.a0;
  const twin = test.twin;
  return (
    <div className="rounded-xl border border-line bg-charcoal/40 p-4" id={`ascension-${finding}`}>
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3 className="font-display text-lg text-parchment">{d.title}</h3>
        <Badge tone={badgeTone(test.verdict)}>{VERDICT_TEXT[test.verdict]}</Badge>
        {test.size ? <Badge tone="neutral">{SIZE_TEXT[test.size]}</Badge> : null}
      </div>
      <p className="text-sm text-muted">
        {d.a} against {d.b}, the relics kept, Ascension 9, the 2,000 held-out seeds of each class,
        five classes pooled in one exact McNemar test read at {level.toFixed(4)} (and the whole-seed
        interval of the difference at the same level has to exclude zero), run once.
      </p>
      <ResultTiles test={test} label={`Result for ${d.title.toLowerCase()} at Ascension 9`} />
      <p className="mt-3 text-sm text-muted">
        {test.reachedAct2.pairedTable.a_only} pairs only with the first arm,{" "}
        {test.reachedAct2.pairedTable.b_only} only with the second. The difference of the shares,
        resampling whole seeds, is {pts(test.clusteredDifference.meanAMinusB)} (95 % {pts(shareLo)}{" "}
        to {pts(shareHi)}; at the level of the test, {pts(lvlLo)} to {pts(lvlHi)}); mean floors{" "}
        {signed(test.floorDifference.meanAMinusB)} (95 % {signed(floorLo)} to {signed(floorHi)}).
        {a0 ? (
          <>
            {" "}
            At Ascension 0 with the relics kept the same arms differ by{" "}
            <span className="num">{pts(a0.mean)}</span> (<span className="num">{pct(a0.a, 1)}</span>{" "}
            against <span className="num">{pct(a0.b, 1)}</span>, {games(a0.bothCompleted)} pairs;{" "}
            {finding === "values" ? "the twin below" : a0.adr}).{" "}
            {test.size
              ? `The result at Ascension 9 is ${SIZE_TEXT[test.size]}: ${
                  test.size === "smaller"
                    ? "the upper end of its interval is below the Ascension 0 difference"
                    : test.size === "larger"
                      ? "the lower end of its interval is above the Ascension 0 difference"
                      : "the Ascension 0 difference lies inside its interval"
                }.`
              : ""}
          </>
        ) : null}
      </p>
      <p className="mt-2 text-xs text-dim">{d.at0}.</p>
      {twin ? (
        <div className="mt-4 rounded-lg border border-line bg-charcoal/60 p-3">
          <p className="font-medium text-parchment">
            The twin at Ascension 0, the relics kept (descriptive)
          </p>
          <p className="mt-1 text-sm text-muted">
            The same two arms in the game of the earlier studies: {pct(twin.reachedAct2.a.rate, 1)}{" "}
            against {pct(twin.reachedAct2.b.rate, 1)} past the Act-1 boss (
            {formatP(twin.reachedAct2.pairedTable.mcnemar_p)}, {games(twin.bothCompleted)} pairs).
            It says what this pair does there, so that the Ascension 9 result is not mistaken for an
            effect of the Ascension that is really one of the relics kept or of the sets now shown.
            No decision depends on it.
          </p>
          <ResultTiles
            test={twin}
            label="Result of the twin of the card-value test at Ascension 0"
          />
        </div>
      ) : null}
      <div className="mt-3">
        <Disclosure summary={`${d.title}: each class on its own (uncorrected)`}>
          <ClassTable test={test} title={d.title} />
        </Disclosure>
      </div>
    </div>
  );
}

function summary(data: AscensionData): { badge: string; tone: "exact" | "unverified" } {
  const verdicts = FINDINGS.map((f) => data.tests?.[f].verdict);
  const ahead = verdicts.filter((v) => v === "passed").length;
  return {
    badge:
      ahead === FINDINGS.length
        ? "all three ahead at Ascension 9"
        : `${String(ahead)} of ${String(FINDINGS.length)} ahead at Ascension 9`,
    tone: ahead === FINDINGS.length ? "exact" : "unverified",
  };
}

/**
 * Whether three results measured at Ascension 0 hold at Ascension 9 (ADR-058): registered before any held-out game, nothing refitted,
 * three pooled tests run once, and the twin of the second at Ascension 0. Everything is read from the exporter's file; until the tests
 * have been run this says that they are registered, with what was checked on development seeds.
 */
export function AscensionPanel({ data = ASCENSION }: { data?: AscensionData } = {}) {
  if (!data.registered) return null;
  const tested = ascensionTested(data);
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
      eyebrow="Ascension"
      title="Do these results hold above Ascension 0?"
      headingLevel={2}
      id="ascension"
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
          Every result on this page was measured at Ascension 0, and the advisor takes runs from
          Ascension 0 to 10. The simulator plays Ascensions 0 to 9; at 10 it never enters the second
          boss (gap G1). Ascension 9 is the hardest level it plays, and one where a deck needs
          different things, so a result at Ascension 0 could shrink, hold or reverse there.
        </p>
        <p>
          <strong className="text-parchment">The study.</strong> Three results are tested once at
          Ascension 9 with nothing refitted: the same pilots, the same value files and the same
          opening-relic fit, the relics kept, the 2,000 held-out seeds of each class, the five
          classes pooled into one exact McNemar test per result, each read at{" "}
          <span className="num">{level.toFixed(4)}</span> (0.05 split over the three) and each also
          needing the whole-seed interval of its difference, at that level, to exclude zero. The
          card-value test also has a twin at Ascension 0 with the relics kept, because the sets now
          shown had never been played against the hand-written rules in that game. The registration
          ({data.adr}) was written and pushed before any held-out game was played.
        </p>
        {pre ? (
          <p>
            <strong className="text-parchment">Checked on development seeds first.</strong>{" "}
            {games(pre.games)} games (100 per class and arm) showed that the six pilots play at
            Ascension 9 in all five classes with the relics kept, and that the Ascension is in
            force: the pilot that follows the shown card values got past the Act-1 boss in{" "}
            <span className="num">{pct(pre.pooledShownValues.ascension9.rate, 1)}</span> of{" "}
            {games(pre.pooledShownValues.ascension9.completed)} completed games at Ascension 9
            against <span className="num">{pct(pre.pooledShownValues.ascension0.rate, 1)}</span> of{" "}
            {games(pre.pooledShownValues.ascension0.completed)} at Ascension 0 on the same seeds.
            That compares no pilots; it shows the arms run. The simulator&rsquo;s code was also read
            back against the rule register for what each Ascension changes:{" "}
            {data.ascensionCheck?.claims.join("; ")}. Not read back: the gold of Ascension 3, and
            the HP and damage of the Ascension 8 and 9 enemies (gap G2 records an audit of the
            Ascension 8 HP).
          </p>
        ) : null}
        {!tested ? (
          <p>
            <strong className="text-parchment">Not run yet.</strong> Until the result is in, a run
            at Ascension 1 to 10 gets a line on the synergy panel, on the simulated second opinion
            on card rewards and on the opening-relic comparison saying that the finding was measured
            at Ascension 0 only.
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
                A run at Ascension 1 to 10 gets one line on each of the three panels with the
                Ascension 9 result in its own words and figures, how big a passed result is beside
                the one at Ascension 0, and where its level lies (between the two levels tested, the
                level tested, or beyond it). A run whose own class went the other way in its own
                Ascension 9 games (at p below {data.classLevel}) is told so.
              </li>
              <li>
                The opening-relic advice at Ascension 1 to 10 names a relic for a class only if the
                Ascension 9 test passed and that class&rsquo;s own Ascension 9 games had the rule
                ahead at p below {data.classLevel}. Licensed:{" "}
                {data.tests.neow.verdict === "passed" && licensed.length > 0
                  ? licensed.join(", ")
                  : "no class"}
                .
              </li>
              <li>
                A test that was not shown ahead does not withdraw its panel: the ranking and the
                values can still be read, and the line says what was found.
              </li>
            </ul>
          </div>
        </div>
      ) : null}
      <div className="mt-4 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
        <p className="font-medium text-parchment">What this does not cover</p>
        <ul className="mt-2 list-disc space-y-1.5 pl-5">
          <li>
            Ascension 10 (the second boss is never played, gap G1) and the levels from 1 to 8: only
            0 and 9 are tested, and nothing is said about the ones between beyond where they lie.
          </li>
          <li>
            A fit at Ascension 9: values or relic measurements taken there could differ. That is a
            separate registration.
          </li>
          <li>
            The live game, the Ancients of acts two and three (gap G11), Underdocks (gap G12), the
            Necrobinder&rsquo;s 66 HP (gap G13: the class plays at 75 HP here, as in every earlier
            study), a human player, and winning (the pilots win next to nothing at Ascension 9).
          </li>
        </ul>
      </div>
      {tested && data.tests ? (
        <p className="mt-3 font-mono text-xs text-dim">
          {FINDINGS.map(
            (f) =>
              `${FINDING_NAMES[f]}: ${data.tests?.[f].file.split("/").pop() ?? ""} sha ${data.tests?.[f].sha256.slice(0, 12) ?? ""}`,
          ).join(" · ")}
          {data.tests.values.twin
            ? ` · twin: ${data.tests.values.twin.file.split("/").pop() ?? ""} sha ${data.tests.values.twin.sha256.slice(0, 12)}`
            : ""}
        </p>
      ) : null}
    </Panel>
  );
}
