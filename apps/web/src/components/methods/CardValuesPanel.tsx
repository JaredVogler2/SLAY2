import { getCard, type PlayableClass } from "@slay2/game-data";

import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { Tile } from "@/components/ui/Tile";
import { CLASS_STYLE } from "@/lib/card-style";
import {
  KEEP_VALUES_TEST,
  adoptedByPooledTest,
  againstText,
  allSets,
  extremes,
  formatBeta,
  isValidated,
  keepValuesVerdict,
  oddsMultiplier,
  signCounts,
  type CardValueSet,
  type KeepValuesTest,
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

const games = (n: number): string => n.toLocaleString("en-US");

const KEEP_BADGE = {
  gain: {
    tone: "exact",
    text: "new values ahead",
    title:
      "The pilot that follows the values measured with the relics kept got past the Act-1 boss more often at the registered level",
  },
  none: {
    tone: "unverified",
    text: "no difference shown",
    title:
      "The difference is within what chance explains at the registered level; that does not show the values make no difference",
  },
  loss: {
    tone: "unverified",
    text: "new values behind",
    title:
      "The pilot that follows the values the site showed got past the Act-1 boss more often at the registered level",
  },
} as const;

/** The registration of the test, shown until its result exists: what the values were measured in, and that they change only by a rule. */
function KeepValuesRegistered() {
  return (
    <section
      aria-labelledby="cv-keep"
      className="mt-6 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted"
    >
      <h3 id="cv-keep" className="mb-2 font-display text-lg text-parchment">
        The values measured again with the relics kept
      </h3>
      <p>
        Every value below was fitted from runs of a simulator that drops the relics a run gains
        after its first fight (gap G14), so those runs held two relics. The values are being
        measured again from random drafting with the relics kept and tested once against these
        (ADR-053, registered before any of its games): the same pilot following the new values
        against the same pilot following the values below, on held-out seeds, the five classes
        pooled. This page shows the result when it exists, whichever way it goes, and the values
        below change only if the test says so, by a rule fixed beforehand.
      </p>
    </section>
  );
}

/**
 * The one registered test of the card values measured again with the relics kept (ADR-053): the pooled result, the rule of item 5
 * applied to it, and, class by class, which set the site shows. Every number is read from the exporter's file.
 */
function KeepValuesTestBlock({ test }: { test: KeepValuesTest }) {
  const verdict = keepValuesVerdict(test);
  const badge = KEEP_BADGE[verdict];
  const p = test.primary;
  const e = p.reachedAct2;
  const t = e.pairedTable;
  const adopted = test.adopted.map(classLabel);
  const kept = Object.keys(test.classes)
    .filter((c) => !test.classes[c]?.adopted)
    .map(classLabel);
  const list = (names: readonly string[]): string =>
    names.length <= 1
      ? (names[0] ?? "")
      : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1] ?? ""}`;
  return (
    <section
      aria-labelledby="cv-keep"
      className="mt-6 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted"
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 id="cv-keep" className="font-display text-lg text-parchment">
          The values measured again with the relics kept
        </h3>
        <Badge tone={badge.tone} title={badge.title}>
          {badge.text}
        </Badge>
      </div>
      <ul
        className="mb-4 grid gap-3 sm:grid-cols-3"
        aria-label="Result of the test of the card values measured with the relics kept"
      >
        <Tile
          k="Past the Act-1 boss"
          value={`${pct(e.b.rate, 1)} → ${pct(e.a.rate, 1)}`}
          note={`current → new values; ${formatP(t.mcnemar_p)}`}
        />
        <Tile
          k="Mean floor reached"
          value={signed(p.floorDifference.meanAMinusB)}
          note={`${signed(p.floorDifference.ci95[0] ?? 0)} to ${signed(p.floorDifference.ci95[1] ?? 0)}`}
        />
        <Tile
          k="Wins"
          value={`${String(p.wins.b)} → ${String(p.wins.a)}`}
          note={`${formatP(p.wins.pairedTable.mcnemar_p)}${p.wins.a + p.wins.b > 0 ? ", each re-derived" : ""}`}
        />
      </ul>
      <p>
        The values on this page were first fitted from runs of a simulator that drops the relics a
        run gains after its first fight (gap G14). They were measured again from random drafting
        with the relics kept and tested once, as registered before any of these games (ADR-053): the
        pilot that follows the new values against the same pilot following the values the site
        showed, both played with the relics kept on the same held-out seeds ({games(p.pairedSeeds)}{" "}
        pairs, {games(p.bothCompleted)} completed by both; the others ended in a simulator error or
        a timeout, which with the relics kept come deep into a run, after the Act-1 boss in nearly
        every case (ADR-053), so leaving them out of the pair reads the share past the boss slightly
        low in both arms alike). Primary endpoint, fixed beforehand: the share of games that got
        past the Act-1 boss, paired by seed, the five classes pooled, exact McNemar test, level{" "}
        {test.alpha}, one test. {pct(e.a.rate, 1)} with the new values against {pct(e.b.rate, 1)}{" "}
        with the current ones ({games(t.a_only)} games only with the new values, {games(t.b_only)}{" "}
        only with the current ones).{" "}
        {verdict === "gain" ? (
          <>
            <strong className="font-medium text-parchment">New values ahead.</strong> By the rule
            fixed before the test, the Codex, the advisor&rsquo;s second opinion and the pilots use
            the new values for {list(adopted) || "no class"}
            {kept.length > 0
              ? `; ${list(kept)} keep${kept.length === 1 ? "s" : ""} the current set, because the class's own comparison shows the current values significantly ahead`
              : ""}
            .
          </>
        ) : verdict === "loss" ? (
          <>
            <strong className="font-medium text-parchment">New values behind.</strong> The pilot
            that follows the values the site showed did better, so every current set stays.
          </>
        ) : (
          <>
            <strong className="font-medium text-parchment">No difference shown.</strong> The values
            did not change enough to matter for this pilot, which is not proof that they never
            would. The current sets stay, and they have now been compared with the relics kept.
          </>
        )}
      </p>
      <ScrollRegion label="Card values measured with the relics kept, by class">
        <table className="mt-4 w-full min-w-[34rem] text-left text-sm">
          <caption className="pb-2 text-left font-display text-base text-gold">
            By class (descriptive: one pooled test was registered, not five)
          </caption>
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Class
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Past the boss, current → new
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Only new / only current
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Own test
              </th>
              <th scope="col" className="py-2 font-medium">
                Shown
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {p.members.map((m) => {
              const c = test.classes[m.character];
              return (
                <tr key={m.character} className="align-top">
                  <th scope="row" className="py-2 pr-3 font-medium text-parchment">
                    {classLabel(m.character)}
                  </th>
                  <td className="num py-2 pr-3">
                    {pct(m.reachedAct2.b, 1)} → {pct(m.reachedAct2.a, 1)}
                  </td>
                  <td className="num py-2 pr-3 text-muted">
                    {c?.own.aOnly} / {c?.own.bOnly}
                  </td>
                  <td className="num py-2 pr-3 text-muted">{c ? formatP(c.own.p) : ""}</td>
                  <td className="py-2 text-muted">
                    {c?.adopted ? "the new values" : "the current values"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollRegion>
      <p className="mt-4 text-xs text-dim">
        What this does not show: anything about the live game (the repaired simulator is not the
        game either), a pilot that plays very differently, synergies (the model is additive), or the
        effect of any single relic on the values.
      </p>
    </section>
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
        {adoptedByPooledTest(set) ? (
          <Badge
            tone="exact"
            title={`The pooled test of the five classes favoured these values over ${against}, and this class's own games do not show ${against} significantly ahead (ADR-053)`}
          >
            adopted by the pooled test
          </Badge>
        ) : isValidated(set) ? (
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
            {set.validation?.against === "first-values" ||
            set.validation?.against === "current-values" ? (
              <>
                Both arms are {test.a.policy}, the same pilot with the same thresholds, and each
                takes the offered card with the largest measured value if that value is above zero
                (and the deck is under 32 cards), otherwise it skips
                {set.validation.against === "current-values"
                  ? ", both played with the relics kept"
                  : ""}
                . The one change is which values it follows: {set.id} against the earlier{" "}
                {set.supersedes}.
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
            {set.validation?.against === "first-values" ||
            set.validation?.against === "current-values"
              ? newValuesSentence(test)
              : actTwoSentence(test)}
            . Mean floor reached {test.a.meanFloor.toFixed(2)} against {test.b.meanFloor.toFixed(2)}{" "}
            ({signed(test.floorDifference.meanAMinusB)}, 95% bootstrap interval{" "}
            {signed(test.floorDifference.ci95[0] ?? 0)} to{" "}
            {signed(test.floorDifference.ci95[1] ?? 0)}). Wins: {test.a.wins} against {test.b.wins}{" "}
            ({formatP(test.pairedWinTable.mcnemar_p)}).{" "}
            {set.validation
              ? set.validation.basis === "pooled"
                ? `The test that was registered is the pooled one above; this class's own comparison is secondary. By the rule registered with it (ADR-053 item 5) these values replace ${set.supersedes ?? "the earlier ones"} because the pooled test favoured them and this class's own games do not show the earlier values significantly ahead (exact McNemar p below ${String(KEEP_VALUES_TEST?.alpha ?? 0.05)} the other way, uncorrected).`
                : `Significance level for this class: ${String(set.validation.alpha)}; ${set.validation.passed ? "the primary endpoint passed" : "the primary endpoint did not pass"}.`
              : ""}
          </p>
        </div>
      ) : null}
      {set.drift ? (
        <div className="mt-6 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
          <p className="font-medium text-parchment">
            {set.relicsKept
              ? set.drift.previousPilot === set.drift.pilot
                ? "How these values moved when the relics were kept"
                : "How these values moved from the earlier measurement"
              : "How these values moved when the pilot got stronger"}
          </p>
          <p className="mt-2">
            {set.relicsKept
              ? `These values replace the earlier measurement (${set.drift.previous}), which was made in a simulator that dropped the relics a run gains after its first fight (gap G14)${set.drift.previousPilot === set.drift.pilot ? "" : `, by an older pilot (${set.drift.previousPilot}; ${set.drift.pilot} now)`}: ${set.drift.previousBossFights.toLocaleString("en-US")} runs reached the Act-1 boss and ${pct(set.drift.previousPassRate, 1)} got past it, against ${pct(set.passRate, 1)} now, with the relics kept.`
              : `These values replace the first measurement (${set.drift.previous}), which was made while a weaker pilot played: ${set.drift.previousBossFights.toLocaleString("en-US")} runs reached the Act-1 boss and ${pct(set.drift.previousPassRate, 1)} got past it, against ${pct(set.passRate, 1)} now.`}{" "}
            Over the {set.drift.cardsInBoth} cards measured in both, the two sets of values
            correlate at {set.drift.spearman.toFixed(2)}
            {set.relicsKept
              ? `; two halves of the new games, split by seed, correlate at ${set.drift.noiseSpearmanBrown.toFixed(2)} (${String(set.drift.noiseCards)} cards fitted in both halves, corrected to the full number of games), so a correlation clearly below that says the values depend on what changed`
              : `, where two measurements of the same pilot agree at ${set.drift.noiseSpearmanBrown.toFixed(2)} (the new games split by seed, ${String(set.drift.noiseCards)} cards fitted in both halves, corrected to the full number of games)`}
            . {set.drift.bestShared} of the {set.drift.k} best and {set.drift.worstShared} of the{" "}
            {set.drift.k} worst cards are shared, and {set.drift.disjointIntervals} cards have
            intervals that do not overlap (about one would by chance
            {set.relicsKept ? " if nothing had changed" : ""}).{" "}
            {set.relicsKept
              ? set.drift.previousPilot === set.drift.pilot
                ? "This is a description, not a test."
                : "The game and the pilot both changed, so this does not separate them. This is a description, not a test."
              : "The values depend on the pilot, moderately; this is a description, not a test."}
            {earlier && !set.relicsKept
              ? ` In its own test the first measurement took the pilot from ${pct(earlier.reachedAct2.b.rate, 1)} to ${pct(earlier.reachedAct2.a.rate, 1)} past the Act-1 boss against the hand-written ratings (${formatP(earlier.reachedAct2.pairedTable.mcnemar_p)}).`
              : ""}
          </p>
        </div>
      ) : null}
    </section>
  );
}

/** Measured card values and the intervention tests that check them. Every number is read from committed artifacts. */
export function CardValuesPanel({
  keepTest = KEEP_VALUES_TEST,
}: {
  /** the test of the values measured with the relics kept (ADR-053), once it has been run; the tests give their own */
  keepTest?: KeepValuesTest | null;
} = {}) {
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
      {keepTest ? <KeepValuesTestBlock test={keepTest} /> : <KeepValuesRegistered />}
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
          undervalued and one it plays well is overvalued. Synergies are not in these values (the
          model is additive; a small neural network did not predict held-out games better). The
          advisor&rsquo;s synergy term is a separate judgement, checked in{" "}
          <a className="text-teal underline decoration-dotted underline-offset-4" href="#synergy">
            the synergy section
          </a>
          .
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
