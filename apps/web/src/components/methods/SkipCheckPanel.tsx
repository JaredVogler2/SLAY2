import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { Tile } from "@/components/ui/Tile";
import { CLASS_STYLE } from "@/lib/card-style";
import { formatP, pct, signed } from "@/lib/methods-data";
import {
  SKIP,
  skipLegSummary,
  skipLegs,
  skipStage,
  type SkipData,
  type SkipLeg,
  type SkipLegKey,
  type SkipRegistered,
  type SkipStage,
} from "@/lib/skip";
import type { PlayableClass } from "@slay2/game-data";

const games = (n: number): string => n.toLocaleString("en-US");
const classLabel = (c: string): string => CLASS_STYLE[c as PlayableClass].label;
const interval = (i: readonly [number, number], scale: number, digits: number): string =>
  `${signed(i[0] * scale, digits)} to ${signed(i[1] * scale, digits)}`;

const BADGE: Record<Exclude<SkipStage, "none">, { tone: BadgeTone; text: string }> = {
  registered: { tone: "unverified", text: "registered, not run yet" },
  partial: { tone: "neutral", text: "half done" },
  harmless: { tone: "exact", text: "no gross harm found" },
  "not-shown": { tone: "unverified", text: "not shown harmless" },
};

function LegBlock({
  legKey,
  leg,
  data,
}: {
  legKey: SkipLegKey;
  leg: SkipLeg;
  data: SkipRegistered;
}) {
  const summary = skipLegSummary(legKey, leg, data);
  const b = leg.pastActOneBoss;
  const shares = leg.skipShares;
  return (
    <div className="space-y-3" data-skip-leg={legKey} data-skip-verdict={leg.verdict}>
      <h3 className="font-display text-lg text-gold">
        {summary.title}{" "}
        <Badge tone={leg.verdict === "not-behind" ? "exact" : "unverified"}>
          {summary.verdict}
        </Badge>
      </h3>
      <p>{summary.text}</p>
      <ul
        className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label={`${summary.title}: the figures`}
      >
        <Tile
          k="Past the Act-1 boss"
          value={`${pct(b.s0, 1)} → ${pct(b.s1, 1)}`}
          note={`${signed(b.difference * 100, 2)} points (95 %: ${interval(b.interval95, 100, 2)}) · ${formatP(b.exactP)}`}
        />
        <Tile
          k="Mean floors reached"
          value={signed(leg.meanFloors.difference, 2)}
          note={`95 %: ${interval(leg.meanFloors.interval95, 1, 2)}`}
        />
        <Tile
          k="Pairs completed by both"
          value={games(leg.bothCompleted)}
          note={`of ${games(leg.pairs)}`}
        />
        <Tile
          k="Wins (descriptive)"
          value={`${String(leg.wins.s0)} → ${String(leg.wins.s1)}`}
          note={`${games(leg.wins.onlyS0)} pairs only with version 1's price, ${games(leg.wins.onlyS1)} only with the slot price`}
        />
        {shares ? (
          <Tile
            k="Card rewards skipped"
            value={`${pct(shares.s0.share ?? 0, 1)} → ${pct(shares.s1.share ?? 0, 1)}`}
            note={`${games(shares.s1.skipped)} of ${games(shares.s1.cardRewards)} with the slot price`}
          />
        ) : null}
      </ul>
      <ScrollRegion label={`${summary.title}, by class`}>
        <table className="mt-1 w-full min-w-[30rem] text-left text-sm">
          <caption className="pb-2 text-left font-display text-base text-gold">
            {summary.title}: each class on its own (uncorrected, read at p below {data.classLevel})
          </caption>
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Class
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Past the Act-1 boss
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Slot price only / version 1 only
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
            {Object.entries(leg.classes).map(([cls, row]) => (
              <tr key={cls} className="align-top">
                <th scope="row" className="py-2 pr-3 font-medium text-parchment">
                  {classLabel(cls)}
                </th>
                <td className="num py-2 pr-3">
                  {pct(row.s0, 1)} → {pct(row.s1, 1)}
                </td>
                <td className="num py-2 pr-3 text-muted">
                  {games(row.onlyS1)} / {games(row.onlyS0)}
                </td>
                <td className="num py-2 pr-3 text-muted">{formatP(row.p)}</td>
                <td className="num py-2 pr-3 text-muted">{signed(row.meanFloors)}</td>
                <td className="py-2 text-muted">
                  {row.behind
                    ? "version 1's price ahead"
                    : row.ahead
                      ? "slot price ahead"
                      : "not clear"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}

/** The price of a slot and its registered simulated check (ADR-065): the design always, the figures once the legs are played. */
export function SkipCheckPanel({ data = SKIP }: { data?: SkipData } = {}) {
  if (!data.registered) return null;
  const stage = skipStage(data);
  if (stage === "none") return null;
  const badge = BADGE[stage];
  const legs = skipLegs(data);
  const pre = data.precondition;
  return (
    <Panel
      eyebrow="The advisor"
      title="Does charging for a slot do harm?"
      headingLevel={2}
      id="price-of-a-slot"
      aside={<Badge tone={badge.tone}>{badge.text}</Badge>}
    >
      <div className="space-y-3 text-sm text-muted">
        <p>
          <strong className="text-parchment">The price.</strong> The advisor&rsquo;s index used to
          grow with every card added, so it almost never recommended skipping (a pilot that played
          card rewards by it skipped under 1 % of them). Since {data.adr} it charges{" "}
          <span className="num">{data.price.perCard.toFixed(1)}</span> index point for every card
          from the <span className="num">{data.price.from + 1}st</span> on (version 1:{" "}
          <span className="num">{data.price.legacyPerCard}</span> from the{" "}
          <span className="num">{data.price.legacyFrom + 1}st</span>), because every card makes each
          of the others show up less often, and skipping now ranks first in 7.5 % of the card
          rewards simulated games reach, against 0.7 %. The number is a{" "}
          <strong className="text-parchment">judgement</strong>, chosen from how often it would make
          skipping win and labelled as one; simulated pilots that follow measured card values won
          more games when they took fewer cards, which does not say how many fewer.
        </p>
        <p>
          <strong className="text-parchment">The check.</strong> It asks only whether the price does
          gross harm where a simulation can see it. The pilot that plays card rewards by the index
          with the price is set against the same pilot with version 1&rsquo;s price, in each version
          of Act 1, five classes pooled, Ascension 0, the relics kept, the {games(data.seeds)}{" "}
          held-out seeds of each class, paired by seed, run once. A version of Act 1 is read as{" "}
          <em>not behind</em> if the lower end of the{" "}
          <span className="num">{data.margins.interval * 100} %</span> interval of the pooled
          difference in the share that got past the Act-1 boss is above{" "}
          <span className="num">{signed(data.margins.firstBossShare * 100, 1)}</span> point and the
          lower end of the interval of the mean floors reached is above{" "}
          <span className="num">{signed(data.margins.meanFloors, 2)}</span>; the price is harmless
          as far as the simulation can see only if both versions are. It cannot show that the price
          helps (the pilot wins about one game in 800) and does not try. The registration (
          {data.adr}) was pushed before any held-out game was played.
        </p>
        {pre ? (
          <p>
            <strong className="text-parchment">Checked on development seeds first.</strong>{" "}
            {games(pre.games)} games (100 per class, arm and version of Act 1) showed that both
            pilots play in both versions with the relics kept and that the price bites: the pilot
            that charges for a slot skipped at least {pre.minimumGapInSkipShare * 100} points more
            of its card rewards than the baseline in each version.
          </p>
        ) : null}
        {legs.length === 0 ? (
          <p>
            <strong className="text-parchment">Not run yet.</strong> The held-out games are played
            once and this section shows them as they come out.
          </p>
        ) : (
          <div className="space-y-6">
            {legs.map(([key, leg]) => (
              <LegBlock key={key} legKey={key} leg={leg} data={data} />
            ))}
          </div>
        )}
        <p>
          <strong className="text-parchment">What this does not claim.</strong> Nothing about
          winning with the advisor, about a person (the price is a judgement about people who build
          decks on purpose, and the simulated pilot does not), about the live game (every number is
          a rules pilot in the pinned simulator, never compared with it), about Ascensions above 0,
          or that one point from the 21st card is the best price. The method and the figures are in{" "}
          <span className="num">{data.adr}</span> of the decision log.
        </p>
      </div>
    </Panel>
  );
}
