import { getOpeningOption } from "@slay2/game-data";

import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { Tile } from "@/components/ui/Tile";
import { formatBeta, oddsMultiplier } from "@/lib/cardvalues";
import { formatP, pct } from "@/lib/methods-data";
import {
  NEOW,
  neowStudy,
  optionIdOfLabel,
  relicValues,
  type NeowComparison,
  type NeowData,
  type NeowTest,
  type NeowValues,
} from "@/lib/neow";

const games = (n: number): string => n.toLocaleString("en-US");
const rho = (x: number | null): string => (x === null ? "n/a" : x.toFixed(2));

/** The catalog's name for a relic the simulator labelled, or the label when the catalog does not know it. */
function relicName(label: string): string {
  const id = optionIdOfLabel(label);
  return (id ? getOpeningOption(id)?.name : undefined) ?? label;
}

/** How far the two fits of the relics' values are from each other: a description, as for the card values (ADR-046), not a test. */
function ComparisonText({ c }: { c: NeowComparison }) {
  return (
    <p>
      Over the {c.relicsInBoth} relics measured in both, the two sets of values correlate at{" "}
      {rho(c.spearman)}, where two measurements of the same game agree at{" "}
      {rho(c.noise.spearmanBrown)} (the second fit&rsquo;s games split by seed,{" "}
      {c.noise.relicsInBoth} relics fitted in both halves, corrected to the full number of games).{" "}
      {c.bestShared} of the {c.k} best and {c.worstShared} of the {c.k} worst relics are shared,{" "}
      {c.disjointIntervals} have intervals that do not overlap (fewer than one relic in a hundred
      would if nothing had changed), and the first fit ranks {relicName(c.bestInFirst)} first where
      the second ranks {relicName(c.bestInRepeated)} first. This describes the values; it tests
      nothing.
    </p>
  );
}

/** The first study's values, which stay on the page once the repetition has been tested (ADR-055 item 6): measured in the simulator that drops the relics. */
function FirstValuesTable({ values }: { values: NeowValues }) {
  const relics = relicValues({ values, test: null });
  return (
    <ScrollRegion label="Values of the first study, measured in the simulator that drops the relics">
      <table className="mt-3 w-full min-w-[36rem] text-left text-sm">
        <caption className="pb-2 text-left font-display text-base text-gold">
          The first study&rsquo;s values, best first
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
  );
}

function ResultTiles({ test, label }: { test: NeowTest; label: string }) {
  return (
    <ul className="mt-3 grid gap-3 sm:grid-cols-3" aria-label={label}>
      <Tile
        k="Past the Act-1 boss"
        value={`${pct(test.reachedAct2.b.rate, 1)} → ${pct(test.reachedAct2.a.rate, 1)}`}
        note={formatP(test.reachedAct2.pairedTable.mcnemar_p)}
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

/**
 * The opening-relic study played in two games (ADR-049, ADR-055): the first in the pinned simulator, which drops every relic a run
 * gains after its first fight (gap G14), and the same study repeated with the relics kept. Which of the two the pages follow is
 * the exporter's call (`study`): the repetition once its one test has been run, whichever way it came out. Until then this says
 * that it is registered or fitted; afterwards it sets the other study beside the one shown. Everything is read from the data.
 */
export function NeowRepeatBlock({ data = NEOW }: { data?: NeowData }) {
  const repeated = data.repeated ?? null;
  const shown = neowStudy(data);
  const first = data.first ?? null;

  if (!repeated?.values) {
    return (
      <section
        id="opening-ancient-keep"
        className="mt-6 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted"
      >
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <h3 className="font-display text-lg text-parchment">
            The same study with the relics kept
          </h3>
          <Badge tone="unverified">registered (ADR-055), not run yet</Badge>
        </div>
        <p>
          Every game above was played in a simulator that drops each relic a run gains after its
          first fight (gap G14, ADR-052): a run held the starting relic and the opening pick, and
          nothing more. The study is registered to be played again with the relics kept, in the same
          design: 15,000 exploration games, one fit, and the same held-out test once. Until its
          result is in, this page and the advisor follow the study above, with that caveat. If the
          repetition does not show the rule ahead, the advisor stops naming a relic for any class.
        </p>
      </section>
    );
  }

  const v = repeated.values;
  const test = repeated.test;
  return (
    <section
      id="opening-ancient-keep"
      className="mt-6 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted"
    >
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h3 className="font-display text-lg text-parchment">
          {shown === "repeated"
            ? "The same study, played in both games"
            : "The same study with the relics kept"}
        </h3>
        {test ? (
          <Badge tone={test.passed ? "exact" : "unverified"}>
            {test.passed
              ? "rule ahead with the relics kept"
              : "rule not shown ahead with the relics kept"}
          </Badge>
        ) : (
          <Badge tone="unverified">fitted, test not run yet</Badge>
        )}
      </div>
      <p>
        The values of {games(v.games)} simulated games played with the relics kept (
        {v.relics.length} relics, sha {v.sha256.slice(0, 12)}…).{" "}
        {test
          ? shown === "repeated"
            ? "The values and the test above are these; the first study, played in the simulator that drops the relics, is below."
            : ""
          : "Its one held-out test has not been run, so this page and the advisor still follow the first study, with the caveat above."}
      </p>
      {repeated.comparison ? (
        <div className="mt-3">
          <ComparisonText c={repeated.comparison} />
        </div>
      ) : null}
      {shown === "repeated" && first?.test ? (
        <div className="mt-4">
          <p className="font-medium text-parchment">
            The first study, in the simulator that drops the relics
          </p>
          <p className="mt-1">
            {first.test.passed
              ? "Its one test had the rule ahead"
              : "Its one test did not show the rule ahead"}
            : {pct(first.test.reachedAct2.a.rate, 1)} against{" "}
            {pct(first.test.reachedAct2.b.rate, 1)} past the Act-1 boss (
            {formatP(first.test.reachedAct2.pairedTable.mcnemar_p)}). That result stays in the
            record; it was measured in a game that is harsher than the real one on this point.
          </p>
          <ResultTiles
            test={first.test}
            label="Result of the first opening-relic test, the first helpful relic against the best-measured relic"
          />
          {first.values ? (
            <div className="mt-3">
              <Disclosure summary="The first study's relic values (the simulator that drops the relics)">
                <FirstValuesTable values={first.values} />
              </Disclosure>
            </div>
          ) : null}
        </div>
      ) : null}
      {repeated.secondary ? (
        <div className="mt-4">
          <p className="font-medium text-parchment">
            The first study&rsquo;s rule in the game with the relics kept
          </p>
          <p className="mt-1">
            Taking the relic the first study measured best, against the same baseline games, with
            the relics kept: {pct(repeated.secondary.reachedAct2.a.rate, 1)} against{" "}
            {pct(repeated.secondary.reachedAct2.b.rate, 1)} past the Act-1 boss (
            {formatP(repeated.secondary.reachedAct2.pairedTable.mcnemar_p)}). It says whether the
            earlier published result held where the relics are kept; no decision depends on it.
          </p>
          <ResultTiles
            test={repeated.secondary}
            label="Result of the first study's rule played with the relics kept"
          />
        </div>
      ) : null}
    </section>
  );
}
