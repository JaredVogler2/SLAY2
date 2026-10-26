import { getCard, type PlayableClass } from "@slay2/game-data";

import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { CLASS_STYLE } from "@/lib/card-style";
import {
  againstText,
  allSets,
  extremes,
  formatBeta,
  isValidated,
  oddsMultiplier,
  signCounts,
  type CardValueSet,
  type MeasuredCard,
} from "@/lib/cardvalues";
import {
  actTwoSentence,
  formatP,
  newValuesSentence,
  pct,
  ratingsValidation,
  signed,
  valuesValidation,
} from "@/lib/methods-data";

const classLabel = (c: string): string => CLASS_STYLE[c as PlayableClass].label;

function Row({ m }: { m: MeasuredCard }) {
  const [lo, hi] = m.ci95;
  return (
    <tr className="align-top">
      <th scope="row" className="py-2 pr-3 font-medium text-parchment">
        {getCard(m.id)?.name ?? m.id}
      </th>
      <td className="num py-2 pr-3">{formatBeta(m.beta)}</td>
      <td className="num py-2 pr-3 text-muted">
        {formatBeta(lo ?? m.beta)} to {formatBeta(hi ?? m.beta)}
      </td>
      <td className="num py-2 pr-3 text-muted">{oddsMultiplier(m.beta)}</td>
      <td className="num py-2 text-muted">{m.gamesWithCard.toLocaleString("en-US")}</td>
    </tr>
  );
}

function Table({ title, rows }: { title: string; rows: readonly MeasuredCard[] }) {
  return (
    <ScrollRegion label={title}>
      <table className="w-full min-w-[28rem] text-left text-sm">
        <caption className="pb-2 text-left font-display text-lg text-gold">{title}</caption>
        <thead>
          <tr className="border-b border-line text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Card
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
              Runs
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((m) => (
            <Row key={m.id} m={m} />
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

/** One class: how much data, the highest and lowest values, and the held-out test of acting on them. */
function ClassBlock({ set }: { set: CardValueSet }) {
  const { best, worst } = extremes(set, 6);
  const counts = signCounts(set);
  const test = valuesValidation(set.character);
  const label = classLabel(set.character);
  // the baseline the pilot that follows these values was compared with
  const against = set.validation ? againstText(set.validation) : "the hand-written ratings";
  // a set that replaces an earlier one: the earlier set's own test, and how far this one moved from it
  const earlier = set.supersedes ? ratingsValidation(set.character) : undefined;
  return (
    <section className="mt-8 border-t border-line pt-6" aria-labelledby={`cv-${set.character}`}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 id={`cv-${set.character}`} className="font-display text-xl text-parchment">
          {label}
        </h3>
        {isValidated(set) ? (
          <Badge tone="exact" title={`Acting on these values beat ${against} in the held-out test`}>
            validated in simulation
          </Badge>
        ) : test ? (
          <Badge
            tone="unverified"
            title={`Acting on these values did not beat ${against} at the pre-registered level`}
          >
            measurement only
          </Badge>
        ) : (
          <Badge tone="neutral" title="The held-out test has not been run">
            not tested yet
          </Badge>
        )}
      </div>
      <p className="max-w-3xl text-sm text-muted">
        {set.bossFights.toLocaleString("en-US")} simulated {label} runs reached the Act-1 boss;{" "}
        {pct(set.passRate, 1)} got past it. The model predicts held-out games with AUC{" "}
        {set.model.cvAuc.toFixed(3)} (log-loss {set.model.cvLogLoss.toFixed(3)} against{" "}
        {set.model.baselineLogLoss.toFixed(3)} without the cards); intervals resample whole game
        seeds ({set.model.bootstrapDraws} draws). {String(counts.helps)} of{" "}
        {String(set.cards.length)} measured cards have an interval above zero,{" "}
        {String(counts.hurts)} below, {String(counts.unclear)} include it. Correlation with the
        hand-written rating the advisor uses (Spearman):{" "}
        {set.spearmanWithStaticRating?.toFixed(2) ?? "not computed"}.
      </p>
      <div className="mt-4 grid gap-6 lg:grid-cols-2">
        <Table title={`Highest measured values · ${label}`} rows={best} />
        <Table title={`Lowest measured values · ${label}`} rows={worst} />
      </div>
      {test ? (
        <div className="mt-6 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
          <ul
            className="mb-4 grid gap-3 sm:grid-cols-3"
            aria-label={`Result of the ${label} test, ${against} against the measured values`}
          >
            {[
              [
                "Past the Act-1 boss",
                `${pct(test.reachedAct2.b.rate, 1)} → ${pct(test.reachedAct2.a.rate, 1)}`,
                formatP(test.reachedAct2.pairedTable.mcnemar_p),
              ],
              [
                "Mean floor reached",
                `${test.b.meanFloor.toFixed(2)} → ${test.a.meanFloor.toFixed(2)}`,
                `${signed(test.floorDifference.meanAMinusB)} (${signed(test.floorDifference.ci95[0] ?? 0)} to ${signed(test.floorDifference.ci95[1] ?? 0)})`,
              ],
              [
                "Wins",
                `${String(test.b.wins)} → ${String(test.a.wins)}`,
                `${formatP(test.pairedWinTable.mcnemar_p)}${test.a.wins + test.b.wins > 0 ? ", each re-derived" : ""}`,
              ],
            ].map(([k, value, note]) => (
              <li key={k} className="rounded-lg border border-line bg-ink-2 p-3">
                <p className="text-xs text-muted">{k}</p>
                <p className="num mt-1 font-display text-2xl text-parchment">{value}</p>
                <p className="num mt-0.5 text-xs text-dim">{note}</p>
              </li>
            ))}
          </ul>
          <p className="font-medium text-parchment">
            Does acting on the {label} values help? (pre-registered test)
          </p>
          <p className="mt-2">
            {set.validation?.against === "first-values" ? (
              <>
                Both arms are {test.a.policy}, the same pilot with the same thresholds, and each
                takes the offered card with the largest measured value if that value is above zero
                (and the deck is under 32 cards), otherwise it skips. The one change is which values
                it follows: {set.id} against the earlier {set.supersedes}.
              </>
            ) : (
              <>
                {test.a.policy} is {test.b.policy} with one change: it takes the offered card with
                the largest measured value if that value is above zero (and the deck is under 32
                cards), otherwise it skips.
              </>
            )}{" "}
            Both played the same {test.pairedSeeds.toLocaleString("en-US")} held-out seeds (
            {test.bothCompleted.toLocaleString("en-US")} completed by both).{" "}
            {set.validation?.against === "first-values"
              ? newValuesSentence(test)
              : actTwoSentence(test)}
            . Mean floor reached {test.a.meanFloor.toFixed(2)} against {test.b.meanFloor.toFixed(2)}{" "}
            ({signed(test.floorDifference.meanAMinusB)}, 95% bootstrap interval{" "}
            {signed(test.floorDifference.ci95[0] ?? 0)} to{" "}
            {signed(test.floorDifference.ci95[1] ?? 0)}). Wins: {test.a.wins} against {test.b.wins}{" "}
            ({formatP(test.pairedWinTable.mcnemar_p)}).{" "}
            {set.validation
              ? `Significance level for this class: ${String(set.validation.alpha)}; ${set.validation.passed ? "the primary endpoint passed" : "the primary endpoint did not pass"}.`
              : ""}
          </p>
        </div>
      ) : null}
      {set.drift ? (
        <div className="mt-6 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
          <p className="font-medium text-parchment">
            How these values moved when the pilot got stronger
          </p>
          <p className="mt-2">
            These values replace the first measurement ({set.drift.previous}), which was made while
            a weaker pilot played: {set.drift.previousBossFights.toLocaleString("en-US")} runs
            reached the Act-1 boss and {pct(set.drift.previousPassRate, 1)} got past it, against{" "}
            {pct(set.passRate, 1)} now. Over the {set.drift.cardsInBoth} cards measured in both, the
            two sets of values correlate at {set.drift.spearman.toFixed(2)}, where two measurements
            of the same pilot agree at {set.drift.noiseSpearmanBrown.toFixed(2)} (the new games
            split by seed, {set.drift.noiseCards} cards fitted in both halves, corrected to the full
            number of games). {set.drift.bestShared} of the {set.drift.k} best and{" "}
            {set.drift.worstShared} of the {set.drift.k} worst cards are shared, and{" "}
            {set.drift.disjointIntervals} cards have intervals that do not overlap (about one would
            by chance). The values depend on the pilot, moderately; this is a description, not a
            test.
            {earlier
              ? ` In its own test the first measurement took the pilot from ${pct(earlier.reachedAct2.b.rate, 1)} to ${pct(earlier.reachedAct2.a.rate, 1)} past the Act-1 boss against the hand-written ratings (${formatP(earlier.reachedAct2.pairedTable.mcnemar_p)}).`
              : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** Measured card values and the intervention tests that check them. Every number is read from committed artifacts. */
export function CardValuesPanel() {
  const sets = allSets();
  if (sets.length === 0) {
    return null;
  }
  return (
    <Panel
      eyebrow="Simulator results · research only"
      title="What randomised drafting says a card is worth"
      aside={<Badge tone="unverified">Parity with the live game unverified</Badge>}
      headingLevel={2}
      id="card-values"
    >
      <p className="max-w-3xl text-muted">
        In simulated runs the card-reward choice was replaced, 60% of the time, by a random pick
        among the offered cards and “skip”. Chance rather than taste decided which cards reached the
        Act-1 boss, so a regression of “got past the boss” on the deck, the HP, the potions and the
        relics gives each card a marginal value: the change in log-odds from one more copy. The
        protocol and the way each value is judged (a held-out test of whether playing by the values
        beats playing by the hand-written ratings, written down before the held-out games were
        played) are the same for every class.
      </p>
      {sets.map((set) => (
        <ClassBlock key={set.id} set={set} />
      ))}
      <ul className="mt-6 list-disc space-y-1.5 pl-5 text-sm text-muted">
        <li>
          Simulated, not measured in the live game: the simulator has not been compared with a
          running STS2 build.
        </li>
        <li>
          Specific to the pilot: the rules policy plays the cards, so a card it plays badly is
          undervalued and one it plays well is overvalued. Synergies are not modelled (the model is
          additive; a small neural network did not predict held-out games better).
        </li>
        <li>
          A value is conditional on the HP, potions and relics a run brought to the boss; it is not
          a tier list, and shops, events and rests were not randomised.
        </li>
        <li>
          Data, code and the test protocols are in the repository:{" "}
          {sets.map((s, i) => (
            <span key={s.id}>
              {i > 0 ? ", " : ""}
              <code className="font-mono text-xs text-parchment">{s.file}</code> (sha{" "}
              {s.sha256.slice(0, 12)}…)
            </span>
          ))}
          .
        </li>
      </ul>
    </Panel>
  );
}
