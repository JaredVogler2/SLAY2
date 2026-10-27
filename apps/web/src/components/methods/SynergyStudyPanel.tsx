import { PART_WEIGHT } from "@slay2/decision";

import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { StartHpNote } from "@/components/ui/StartHpNote";
import { Tile } from "@/components/ui/Tile";
import { SynergyTestPanel } from "@/components/methods/SynergyTestPanel";
import { pct } from "@/lib/methods-data";
import {
  SYNERGY_EVIDENCE,
  change,
  kept,
  num,
  range,
  type MechanicReading,
  type SynergyEvidence,
} from "@/lib/synergy-evidence";

const games = (n: number): string => n.toLocaleString("en-US");

const SEEDS: Record<string, string> = { train: "training seeds", dev: "development seeds" };

/** The unmet-need part read one mechanic at a time: a description of where the pooled slope comes from, not a result. */
function MechanicsDisclosure({
  reading,
  bossFights,
}: {
  reading: MechanicReading;
  bossFights: number;
}) {
  return (
    <Disclosure summary="Which needs the runs support, one mechanic at a time" className="mt-5">
      <div className="space-y-3">
        <p>
          The single slope for unmet needs above hides which mechanics carry it. The same runs and
          the same model, with one column for each mechanic&rsquo;s unmet need instead of their sum,
          give the slopes below, per index point and relative to a point of the average card rating
          as above. Read this as a description, not a result: the {reading.rows.length} intervals
          are read together and not corrected for it, the tags were not changed because of it, and
          the runs are the ones the tags were audited against. A mechanic that few decks left unmet
          has an interval too wide to read, and a slope far below the pooled one says only that
          random drafts do not reward meeting that need at the weight the tags give it.
        </p>
        <ScrollRegion label="Unmet needs by mechanic">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="pb-2 text-left font-display text-base text-gold">
              Worth of a point of each mechanic&rsquo;s unmet need, relative to a point of average
              card rating
            </caption>
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Mechanic
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Decks that need it
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Mean points held back
                </th>
                <th scope="col" className="py-2 font-medium">
                  Worth of a point (95 %)
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr className="align-top">
                <th scope="row" className="py-2 pr-3 font-medium text-parchment">
                  All needs together
                </th>
                <td className="num py-2 pr-3 text-muted">all {games(bossFights)} runs</td>
                <td className="py-2 pr-3 text-muted">–</td>
                <td className="num py-2">
                  {num(reading.pooled.toQuality, 2)} ({range(reading.pooled.ci95, 2)})
                </td>
              </tr>
              {reading.rows.map((r) => (
                <tr key={r.mechanic} className="align-top">
                  <th scope="row" className="py-2 pr-3 font-medium text-parchment">
                    {r.label}
                  </th>
                  <td className="num py-2 pr-3 text-muted">{games(r.decks)}</td>
                  <td className="num py-2 pr-3 text-muted">{num(r.meanPoints, 3)}</td>
                  <td className="num py-2">
                    {num(r.ratio.toQuality, 2)} ({range(r.ratio.ci95, 2)})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        <p>
          The first row is the single slope of stage B1 fitted again on the same resamples as the
          rows below it, so that the rows can be compared with it; its interval differs a little
          from the one above.
        </p>
        <p>
          Data and code: <code className="font-mono text-xs text-parchment">{reading.file}</code>{" "}
          (sha {reading.sha256.slice(0, 12)}…, {reading.bootstrapDraws} resamples of whole seeds).
        </p>
      </div>
    </Disclosure>
  );
}

/**
 * What simulated runs say about the synergy term of the advisor's deck index (ADR-050): the exploratory reading (stage B1) with its
 * limits, and the one registered test (stage B2) once it has been run. Every figure is read from the study's own report through the
 * exporter; tests pass their own `evidence`.
 */
export function SynergyStudyPanel({
  evidence = SYNERGY_EVIDENCE,
}: { evidence?: SynergyEvidence } = {}) {
  const { table, b1, b2 } = evidence;
  if (!b1) {
    return null;
  }
  const rows = b1.cohorts.map((c) => {
    const gain = b1.perCohortGain[c.name];
    return {
      name: c.name,
      label: `${c.character}, ${SEEDS[c.partition] ?? c.partition}`,
      bossFights: c.bossFights,
      gain,
      clear: gain !== undefined && (gain.ci95[1] ?? 0) < 0,
    };
  });
  const hasNecrobinder = b1.cohorts.some((c) => c.character === "Necrobinder");
  return (
    <Panel
      eyebrow="Simulator results · exploratory"
      title="Do the synergy parts of the deck index say anything about a run?"
      aside={<Badge tone="unverified">Parity with the live game unverified</Badge>}
      headingLevel={2}
      id="synergy"
    >
      <p className="max-w-3xl text-muted">
        The advisor rates a deck by the average rating of its cards and then adjusts that for how
        the cards work together. {table.cards} cards are tagged with what each supplies to a deck
        and what its worth depends on, over {table.mechanics} mechanics such as Strength, Poison,
        Orbs or Osty. A card whose needs the deck does not meet is held back, Strength, Dexterity
        and Focus lift the cards they help, and an engine (cards that supply a mechanic together
        with cards that use it) adds. Every tag and strength is SLAY2&rsquo;s judgement from how the
        cards work, set by hand; none was fitted to a result. This section checks that judgement
        against the simulator.
      </p>
      <p className="mt-3 max-w-3xl text-muted">
        Stage B1 read the parts of the index against {games(b1.bossFights)} simulated runs that
        brought a randomly drafted deck to the Act-1 boss (Ascension 0, the veteran profile, one
        rules pilot); {pct(b1.passRate, 1)} got past it. A logistic model with class-specific
        controls (HP, max HP, potions, upgrades, the boss, relics) predicted that outcome and was
        scored on runs it had never seen (five-fold cross-validation grouped by seed); intervals
        resample whole seeds.
      </p>

      <ul
        className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Result of the exploratory reading of the synergy parts"
      >
        <Tile
          k="Held-out prediction error"
          value={`${num(b1.logLoss.index, 4)} → ${num(b1.logLoss.indexAndSynergy, 4)}`}
          note={`log loss without → with the synergy term; change ${change(b1.synergyAdded)}`}
        />
        <Tile
          k="Unmet needs"
          value={num(b1.ratios.needs.toQuality, 2)}
          note={`95 % ${range(b1.ratios.needs.ci95, 2)}`}
        />
        <Tile
          k="Lifts from Strength, Dexterity, Focus"
          value={num(b1.ratios.scalers.toQuality, 2)}
          note={`95 % ${range(b1.ratios.scalers.ci95, 2)}`}
        />
        <Tile
          k="Engines"
          value={num(b1.ratios.engines.toQuality, 2)}
          note={`95 % ${range(b1.ratios.engines.ci95, 2)}`}
        />
      </ul>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        The last three are per index point, relative to a point of the average card rating (1.00). A
        part at 1.00 predicts the outcome, point for point, as well as the average card rating does;
        an interval that includes 0 means the runs cannot tell the part from nothing. Added to a
        model that already knows which cards the deck holds, the three parts lower the held-out log
        loss from {num(b1.beyondCards.logLossCards, 4)} to{" "}
        {num(b1.beyondCards.logLossCardsAndParts, 4)} ({change(b1.beyondCards.gap)}): small, and not
        nothing. Most of what the parts predict, the cards themselves also predict.
      </p>
      <p className="mt-3 max-w-3xl text-sm text-muted">
        <strong className="font-medium text-parchment">Reading.</strong> The runs support the needs
        part at the weight it was first given, support the lifts from Strength, Dexterity and Focus
        at about {num(b1.calibratedWeights.scaler, 1)} of it, and give an engine credit no more than
        weak support (its interval includes 0). Random decks rarely hold a whole engine and the
        pilot does not build around one, so little for engines here is not evidence about players
        who build them on purpose. The index the advisor page uses keeps unmet needs{" "}
        {kept(PART_WEIGHT.needs)}, the lifts {kept(PART_WEIGHT.scalers)} and engines{" "}
        {kept(PART_WEIGHT.engines)}: the strengths a development stage chose between on separate
        simulated seeds (ADR-050 addendum D).
      </p>

      <ScrollRegion label="Synergy reading by class and seed set">
        <table className="mt-5 w-full min-w-[30rem] text-left text-sm">
          <caption className="pb-2 text-left font-display text-base text-gold">
            By class and seed set (descriptive; nothing is corrected for six readings)
          </caption>
          <thead>
            <tr className="border-b border-line text-muted">
              <th scope="col" className="py-2 pr-3 font-medium">
                Runs
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Boss fights
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                Change in held-out log loss
              </th>
              <th scope="col" className="py-2 font-medium">
                Reading
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.name} className="align-top">
                <th scope="row" className="py-2 pr-3 font-medium text-parchment">
                  {r.label}
                </th>
                <td className="num py-2 pr-3 text-muted">{games(r.bossFights)}</td>
                <td className="num py-2 pr-3 text-muted">{r.gain ? change(r.gain) : "–"}</td>
                <td className="py-2 text-muted">
                  {r.clear ? "clear gain" : "the data cannot tell"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>

      {b1.mechanics ? (
        <MechanicsDisclosure reading={b1.mechanics} bossFights={b1.bossFights} />
      ) : null}

      <Disclosure summary="How the readings changed the tags" className="mt-5">
        <div className="space-y-3">
          <p>
            The first reading showed three needs whose slope ran the wrong way: decks with more of
            that need unmet got past the boss more often. They were the Necrobinder&rsquo;s Osty,
            the Regent&rsquo;s card draw and the Defect&rsquo;s Status. A check card by card agreed.
            Reading the game&rsquo;s own files for the reason, each class&rsquo;s starting relic
            already supplies something (Bound Phylactery summons Osty, Divine Right gives Stars,
            Cracked Core channels a Lightning orb, Ring of the Snake draws cards), two Regent cards
            scale themselves when drawn, and the Status payoffs trigger on Statuses that enemies
            create.
          </p>
          <p>
            The table was corrected twice on that evidence, before any held-out game was played. The
            tags were read against these very runs, so the figures flatter them: the test below is
            on other seeds.
          </p>
          <p>
            An independent second reading then tagged every card again, blind, from the game&rsquo;s
            own card data (six readers, one for each class and one for the colorless cards). It
            found the table wrong in more than thirty places that mattered: a card&rsquo;s second
            effect not written, a need the card meets by itself or its class cannot meet, and the
            Defect&rsquo;s Status payoffs, which trigger on Statuses the player creates. All were
            corrected before any held-out game, the figures above come from the corrected table, and
            the test run that had started on the old table was thrown away unread (ADR-050, addenda
            A and B).
          </p>
        </div>
      </Disclosure>

      {b2 ? (
        <SynergyTestPanel test={b2} />
      ) : (
        <section className="mt-5 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
          <h3 className="mb-2 font-display text-lg text-parchment">The registered test</h3>
          <p>
            It has not been run on its held-out seeds. A pilot that picks each card reward by this
            index plays the same seeds as the same pilot with the synergy term switched off; the
            measure is the share of runs that get past the Act-1 boss, paired by seed, the five
            classes pooled, one exact McNemar test at level 0.05 (ADR-050, fixed before any of these
            games). It is published here as it comes out, whichever way it goes. Until then the
            synergy panel on the advisor stays a judgement, partly checked.
          </p>
        </section>
      )}

      <ul className="mt-5 list-disc space-y-1.5 pl-5 text-sm text-muted">
        <li>
          Simulated, not measured in the live game: the simulator has not been compared with a
          running STS2 build, and it only plays Overgrowth, at Ascension 0, with one rules pilot.
        </li>
        <li>
          The exploratory readings above, not the registered test, use the training and development
          seeds on which the measured card values were fitted, and the tags were corrected against
          them. Their decks were put together by random card picks, not built on purpose.
        </li>
        <li>
          Both are about getting past the first boss, not about winning (wins are rare), and not
          about the card-by-card strength of any card: the synergy table is a judgement of
          mechanics.
        </li>
        <li>
          Data, code and the protocol are in the repository:{" "}
          <code className="font-mono text-xs text-parchment">{b1.file}</code> (sha{" "}
          {b1.sha256.slice(0, 12)}…), the synergy table{" "}
          <code className="font-mono text-xs text-parchment">
            packages/game-data/data/synergy.sts2-main-0.107.1.json
          </code>{" "}
          (sha {table.sha256.slice(0, 12)}…) and <span className="text-parchment">ADR-050</span>.
        </li>
      </ul>
      {hasNecrobinder ? (
        <StartHpNote
          character="necrobinder"
          subject="readings"
          className="mt-4 text-xs text-rose"
        />
      ) : null}
    </Panel>
  );
}
