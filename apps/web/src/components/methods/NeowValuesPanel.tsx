import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { Tile } from "@/components/ui/Tile";
import { CLASS_STYLE } from "@/lib/card-style";
import { formatBeta, oddsMultiplier } from "@/lib/cardvalues";
import { formatP, pct, signed } from "@/lib/methods-data";
import {
  classAlpha,
  classResult,
  neowTest,
  neowValues,
  relicValues,
  type NeowMember,
} from "@/lib/neow";
import type { PlayableClass } from "@slay2/game-data";

const classLabel = (c: string): string => CLASS_STYLE[c as PlayableClass].label;
const games = (n: number): string => n.toLocaleString("en-US");

function MemberRow({ m }: { m: NeowMember }) {
  const t = m.reachedAct2.pairedTable;
  return (
    <tr className="align-top">
      <th scope="row" className="py-2 pr-3 font-medium text-parchment">
        {classLabel(m.character)}
      </th>
      <td className="num py-2 pr-3 text-muted">{games(m.bothCompleted)}</td>
      <td className="num py-2 pr-3">
        {pct(m.reachedAct2.b, 1)} → {pct(m.reachedAct2.a, 1)}
      </td>
      <td className="num py-2 pr-3 text-muted">
        {t.a_only} / {t.b_only}
      </td>
      <td className="num py-2 pr-3 text-muted">
        {m.b.wins} → {m.a.wins}
      </td>
      <td className="num py-2 text-muted">{signed(m.meanFloorDifference)}</td>
    </tr>
  );
}

/**
 * The opening Ancient's relics as simulated runs measured them (ADR-041), and the one held-out test of playing by the values.
 * Every number is read from the exporter's file; the words around the test follow from whether it passed.
 */
export function NeowValuesPanel() {
  const values = neowValues();
  if (!values) {
    return null;
  }
  const test = neowTest();
  const relics = relicValues();
  const flagged = relics.filter((r) => r.exclusionFlag);
  const byPassRate = [...values.classes].sort((a, b) => a.passRate - b.passRate);
  const lowest = byPassRate[0];
  const highest = byPassRate[byPassRate.length - 1];
  const rederived = test ? test.members.reduce((n, m) => n + m.a.wins, 0) : 0;
  const seedCounts = new Set(test?.members.map((m) => m.pairedSeeds));
  const perClass = seedCounts.size === 1 ? [...seedCounts][0] : undefined;
  const notAdvised =
    test?.passed === true
      ? test.members
          .filter((m) => !classResult(m.character)?.helped)
          .map((m) => classLabel(m.character))
      : [];
  return (
    <Panel
      eyebrow="Simulator results · research only"
      title="What randomised opening choices say a relic is worth"
      aside={<Badge tone="unverified">Parity with the live game unverified</Badge>}
      headingLevel={2}
      id="opening-ancient"
    >
      <p className="max-w-3xl text-muted">
        Every run opens at Neow, who offers three relics. In simulated runs the relic was taken at
        random among the three offered, so chance rather than taste decided which relic a run began
        with. {games(values.games)} games ({games(values.model.seeds)} seeds, each played by every
        one of the {values.classes.length} classes, Ascension 0, the veteran profile, the first Act
        1, Overgrowth) were fitted with one value per relic and one starting point per class: a
        value is the change in the log-odds of getting past the Act-1 boss from taking that relic
        instead of the average one, shrunk toward zero so that the largest of {relics.length}{" "}
        estimates is not simply the luckiest. How much the relic tells beyond the class,
        cross-validated by seed: log-loss {values.model.cvLogLoss.toFixed(3)} with the relics
        against {values.model.baselineLogLoss.toFixed(3)} with the class alone (AUC{" "}
        {values.model.cvAuc.toFixed(3)}). Intervals resample whole seeds, because the games of one
        seed share the offer and the relic taken ({values.model.bootstrapDraws} draws).
      </p>

      {test ? (
        <section className="mt-6 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h3 className="font-display text-lg text-parchment">The one held-out test</h3>
            {test.passed ? (
              <Badge
                tone="exact"
                title="Playing by these values beat taking the first helpful relic"
              >
                passed its test, in simulation
              </Badge>
            ) : (
              <Badge
                tone="unverified"
                title="Playing by these values did not beat taking the first helpful relic at the pre-registered level"
              >
                measurement only
              </Badge>
            )}
          </div>
          <ul
            className="mb-4 grid gap-3 sm:grid-cols-3"
            aria-label="Result of the opening-relic test, the first helpful relic against the best-measured relic"
          >
            <Tile
              k="Past the Act-1 boss"
              value={`${pct(test.reachedAct2.b.rate, 1)} → ${pct(test.reachedAct2.a.rate, 1)}`}
              note={formatP(test.reachedAct2.pairedTable.mcnemar_p)}
            />
            <Tile
              k="Mean floor reached"
              value={signed(test.floorDifference.meanAMinusB)}
              note={`${signed(test.floorDifference.ci95[0] ?? 0)} to ${signed(test.floorDifference.ci95[1] ?? 0)}`}
            />
            <Tile
              k="Wins"
              value={`${String(test.wins.b)} → ${String(test.wins.a)}`}
              note={`${formatP(test.wins.pairedTable.mcnemar_p)}${rederived + test.wins.b > 0 ? ", each re-derived" : ""}`}
            />
          </ul>
          <p>
            <strong className="font-medium text-parchment">{test.a}</strong> is{" "}
            <strong className="font-medium text-parchment">{test.b}</strong> with one change: it
            takes the offered relic with the largest measured value (a costly one is allowed)
            instead of the first helpful one. Both played the same held-out seeds,{" "}
            {games(perClass ?? test.pairedSeeds)} {perClass ? "in each class " : ""}(
            {games(test.pairedSeeds)} pairs, {games(test.bothCompleted)} completed by both; the
            others ended in a simulator error or a timeout, which says nothing about play, and are
            left out of the pair). The primary endpoint, fixed before any of these games: the share
            of games that got past the Act-1 boss, paired by seed, pooled over the five classes,
            exact McNemar test, two-sided, level {test.alpha}, one test.{" "}
            {test.passed ? "It passed" : "It did not pass"}: {pct(test.reachedAct2.a.rate, 1)}{" "}
            against {pct(test.reachedAct2.b.rate, 1)} ({test.reachedAct2.pairedTable.a_only} games
            only the best-measured relic got past the boss, {test.reachedAct2.pairedTable.b_only}{" "}
            only the first helpful one, {formatP(test.reachedAct2.pairedTable.mcnemar_p)}).{" "}
            {test.passed
              ? "On the strength of that test, and only that, the advisor can say which of three offered relics a simulated pilot would take."
              : "So the values are reported as measurements that did not improve play, and the advisor does not say which relic to take."}
          </p>
          <ScrollRegion label="Opening-relic test by class">
            <table className="mt-4 w-full min-w-[34rem] text-left text-sm">
              <caption className="pb-2 text-left font-display text-base text-gold">
                By class (descriptive: one test was registered, not five)
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
                    Past the boss
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Only best / only first
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Wins
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Floors
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {test.members.map((m) => (
                  <MemberRow key={m.character} m={m} />
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          {test.passed ? (
            <p className="mt-3">
              The advisor says what the rule would take for a class only if that class&rsquo;s own
              games favoured it too (ahead, exact McNemar p below {classAlpha(test).toPrecision(2)},
              the test&rsquo;s level split over the classes): a rule written down before the games
              were played, which can remove advice and never add it.{" "}
              {notAdvised.length > 0
                ? `For ${notAdvised.join(" and ")} it did not, so the advisor gives no advice there.`
                : "In every class it did."}
            </p>
          ) : null}
        </section>
      ) : (
        <p className="mt-6 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
          The held-out test of playing by these values has not been run, so the advisor does not say
          which relic to take.
        </p>
      )}

      <section className="mt-6" aria-labelledby="neow-values-heading">
        <ScrollRegion label="Measured values of the opening relics">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <caption
              id="neow-values-heading"
              className="pb-2 text-left font-display text-lg text-gold"
            >
              Every measured relic, best first
            </caption>
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Relic
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Kind
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Value
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  95% interval
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Odds
                </th>
                <th scope="col" className="py-2 font-medium">
                  Taken in
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {relics.map((r) => (
                <tr key={r.id} className="align-top">
                  <th scope="row" className="py-2 pr-3 font-medium text-parchment">
                    {r.name}
                    {r.exclusionFlag ? (
                      <span className="ml-1 text-xs font-normal text-rose">(flagged)</span>
                    ) : null}
                  </th>
                  <td className="py-2 pr-3 text-muted">
                    {r.optionKind === "positive" ? "helpful" : "costly"}
                  </td>
                  <td className="num py-2 pr-3">{formatBeta(r.beta)}</td>
                  <td className="num py-2 pr-3 text-muted">
                    {formatBeta(r.ci95[0] ?? r.beta)} to {formatBeta(r.ci95[1] ?? r.beta)}
                  </td>
                  <td className="num py-2 pr-3 text-muted">{oddsMultiplier(r.beta)}</td>
                  <td className="num py-2 text-muted">{games(r.taken)} runs</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </section>

      <ul className="mt-6 list-disc space-y-1.5 pl-5 text-sm text-muted">
        <li>
          Simulated, not measured in the live game: the simulator has not been compared with a
          running STS2 build, and it only plays Overgrowth, at Ascension 0, with one rules pilot.
        </li>
        <li>
          One value per relic for all five classes (a few thousand games per class are too few to
          estimate each relic&rsquo;s effect class by class), so the same value moves the chance of
          a class that starts near the middle by more points than one that starts near either end:
          with the average relic the classes range from {pct(lowest?.passRate ?? 0, 0)} (
          {lowest ? classLabel(lowest.character) : ""}) to {pct(highest?.passRate ?? 0, 0)} (
          {highest ? classLabel(highest.character) : ""}).
        </li>
        <li>
          The Ancients of acts two and three are not simulated. Massive Scroll, a co-op option, is
          never offered in a solo run and was never measured; a relic taken fewer than{" "}
          {values.model.minTaken} times would count as the average.
        </li>
        {flagged.length > 0 ? (
          <li>
            {flagged.map((r) => r.name).join(", ")}:{" "}
            {flagged.map((r) => `${r.excluded} of ${games(r.taken + r.excluded)} games`).join(", ")}{" "}
            ended in a simulator error or a timeout, more often than chance explains (the overall
            rate is {pct(values.excludedGames / (values.games + values.excludedGames), 1)}). The
            value rests on the games that finished. The rule that was tested does not use the flag.
          </li>
        ) : null}
        <li>
          Data, code and the test protocol are in the repository:{" "}
          <code className="font-mono text-xs text-parchment">{values.file}</code> (sha{" "}
          {values.sha256.slice(0, 12)}…)
          {test ? (
            <>
              ,{" "}
              <code className="font-mono text-xs text-parchment">
                experiments/neow/{test.id}.json
              </code>{" "}
              (sha {test.contentSha256.slice(0, 12)}…)
            </>
          ) : null}
          .
        </li>
      </ul>
    </Panel>
  );
}
