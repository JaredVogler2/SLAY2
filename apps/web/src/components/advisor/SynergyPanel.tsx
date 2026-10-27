import Link from "next/link";

import { PART_WEIGHT, type DeckSynergy, type DraftResponse } from "@slay2/decision";

import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Panel } from "@/components/ui/Panel";
import { formatP, pct } from "@/lib/stat-format";
import {
  SYNERGY_EVIDENCE,
  change,
  kept,
  num,
  part,
  verdictOf,
  type SynergyEvidence,
  type SynergyTest,
  type Verdict,
} from "@/lib/synergy-evidence";

function names(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1] ?? ""}`;
}

/** What the page's label says the synergy term has been through, by how the registered test came out (none yet: partly checked). */
const LABEL: Record<Verdict, string> = {
  ahead: "Judgement, tested in simulation",
  "not-shown": "Judgement, not shown to help",
  behind: "Judgement, worse in simulation",
};

/** The registered test in a few words, with its numbers: the part of the evidence that is about picking cards, not about predicting. */
function TestResult({ test }: { test: SynergyTest }) {
  const verdict = verdictOf(test);
  const e = test.primary.reachedAct2;
  const figures = (
    <>
      <span className="num">{pct(e.a.rate, 1)}</span> of simulated runs got past the Act&nbsp;1 boss
      against <span className="num">{pct(e.b.rate, 1)}</span> for the same pilot without the synergy
      term (held-out seeds, five classes, {formatP(e.pairedTable.mcnemar_p)})
    </>
  );
  return (
    <p>
      <strong className="text-parchment">The registered test.</strong> A simulated pilot that picks
      card rewards by this index, tested before any of its games were played:{" "}
      {verdict === "ahead" ? (
        <>
          {figures}. In simulation, adding the term improved what the index picks; that says nothing
          about the live game or about winning.
        </>
      ) : verdict === "behind" ? (
        <>
          {figures}. Adding the term made the simulated picks worse, so its strengths are a
          judgement the simulation did not support.
        </>
      ) : (
        <>
          {figures}. The test did not show that the term improves the picks, which is not the same
          as showing that it does not.
        </>
      )}{" "}
      The result and its limits are in{" "}
      <Link
        className="text-teal underline decoration-dotted underline-offset-4"
        href="/methods#synergy"
      >
        Evidence &amp; methods
      </Link>
      .
    </p>
  );
}

/**
 * What the simulated runs say about the synergy term, read from the study's own report (ADR-050): a measured claim and its
 * limits, beside a heuristic that stays a judgement.
 */
function Evidence({ evidence }: { evidence: SynergyEvidence }) {
  const b1 = evidence.b1;
  const b2 = evidence.b2;
  if (!b1) {
    return (
      <p className="mt-4 text-xs text-muted">
        The tags say what each card supplies and needs. They are SLAY2&rsquo;s judgement from how
        the cards work, with hand-set strengths: nothing here has been measured in games yet.
      </p>
    );
  }
  const clear = Object.entries(b1.perCohortGain)
    .filter(([, g]) => g.ci95[1] !== undefined && g.ci95[1] < 0)
    .map(([name]) => name.replace(/-(train|dev)$/, ""))
    .map((n) => n.charAt(0).toUpperCase() + n.slice(1));
  const classes = [...new Set(clear)];
  return (
    <>
      <p className="mt-4 text-xs text-muted">
        SLAY2&rsquo;s judgement of how the cards work,{" "}
        {b2 ? "tested in simulation" : "partly checked"}. In{" "}
        <span className="num">{b1.bossFights.toLocaleString("en-US")}</span> simulated runs that
        brought a random deck to the Act&nbsp;1 boss, decks with fewer unmet needs, and with more
        Strength, Dexterity or Focus behind the cards they lift, got past it more often; the engine
        credit got no such support.
      </p>
      <Disclosure summary="What the simulated runs show, and what they do not" className="mt-3">
        <div className="space-y-3">
          <p>
            <strong className="text-parchment">What was measured.</strong> Runs of an unofficial
            simulator that has not been compared with the live game, Ascension 0, one rule-based
            pilot, decks put together mostly by random card picks. The outcome is whether the run
            got past the Act&nbsp;1 boss. The deck index was scored by how well it predicts that on
            runs the fit never saw (cross-validation by seed).
          </p>
          <p>
            <strong className="text-parchment">What the synergy term adds.</strong> Added to the
            index it lowers the held-out prediction error by{" "}
            <span className="num">{change(b1.synergyAdded)}</span> (log loss{" "}
            <span className="num">{num(b1.logLoss.index, 4)}</span> to{" "}
            <span className="num">{num(b1.logLoss.indexAndSynergy, 4)}</span>). Per index point,
            compared with a point of average card rating, unmet needs are worth{" "}
            <span className="num">{part(b1.ratios.needs)}</span>; Strength, Dexterity and Focus
            lifting the cards they help <span className="num">{part(b1.ratios.scalers)}</span>;
            engines <span className="num">{part(b1.ratios.engines)}</span>, which the data cannot
            tell from nothing. The index counts unmet needs {kept(PART_WEIGHT.needs)}, the lift from
            Strength, Dexterity and Focus {kept(PART_WEIGHT.scalers)} and engines{" "}
            {kept(PART_WEIGHT.engines)}. Those strengths were first set by judgement; a development
            stage on separate simulated seeds then chose between settings of them (ADR-050).
          </p>
          <p>
            <strong className="text-parchment">Beyond knowing the cards.</strong> A model that
            already knows which cards the deck holds predicts a little better with the parts added (
            <span className="num">{change(b1.beyondCards.gap)}</span>): most of what they predict,
            the cards themselves also predict.
          </p>
          <p>
            <strong className="text-parchment">By class.</strong>{" "}
            {classes.length > 0
              ? `The gain is clear for ${names(classes)}; for the other classes the data cannot tell.`
              : "The data cannot tell for any single class."}
          </p>
          {b2 ? <TestResult test={b2} /> : null}
          <p>
            <strong className="text-parchment">What it is not.</strong> Not the live game, not
            winning (wins are rare), and not people who build engines on purpose: random decks
            seldom hold a whole engine, and the pilot does not build around one. The tags were read
            against these same runs (a flaw in the Necrobinder&rsquo;s Osty was found and fixed that
            way), and a second, independent reading of every card corrected more, so the figures
            flatter them.{" "}
            {b2
              ? null
              : "A held-out test of a pilot that picks cards by this index is registered before any of its games (ADR-050); its result is not in yet. "}
            The study, with its figures by class, is in{" "}
            <Link
              className="text-teal underline decoration-dotted underline-offset-4"
              href="/methods#synergy"
            >
              Evidence &amp; methods
            </Link>
            .
          </p>
        </div>
      </Disclosure>
    </>
  );
}

/**
 * What the deck is building and which cards are still waiting for support. Cards are rated by what they need and what
 * they supply (SLAY2's judgement of mechanics, `@slay2/game-data` synergy tags); this panel shows that reading of the
 * deck the recommendation above was made against.
 */
export function SynergyPanel({
  synergy,
  relics,
  evidence = SYNERGY_EVIDENCE,
}: {
  synergy: DeckSynergy;
  /** The relics the ranking counted as suppliers (what the answer says it read from the relics the player listed). */
  relics?: DraftResponse["relics"];
  evidence?: SynergyEvidence;
}) {
  const label = evidence.b2 ? LABEL[verdictOf(evidence.b2)] : "Judgement, partly checked";
  const top = Math.max(...synergy.engines.map((e) => e.value), 1);
  return (
    <Panel
      eyebrow="Synergy · how your cards work together"
      title="What your deck is building"
      headingLevel={3}
      aside={<Badge tone="heuristic">{label}</Badge>}
      aria-label="Synergy of your deck"
    >
      {relics && (relics.supplying.length > 0 || relics.taking.length > 0) ? (
        <p className="mb-4 text-xs text-muted">
          {relics.supplying.length > 0
            ? `Counted as suppliers here: ${names(relics.supplying.map((r) => `${r.name} (${r.mechanics.join(", ")})`))}. `
            : ""}
          {relics.taking.length > 0
            ? `Counted against here, because they take a mechanic away: ${names(relics.taking.map((r) => `${r.name} (${r.mechanics.join(", ")})`))}. `
            : ""}
          That reading of relics is a separate judgement with no registered test; read once against
          simulated runs that keep their relics, counting them predicted getting past the Act 1 boss
          slightly better (an exploration, see{" "}
          <Link
            className="text-teal underline decoration-dotted underline-offset-4"
            href="/methods#synergy"
          >
            Evidence &amp; methods
          </Link>
          ). The test below covers the cards.
        </p>
      ) : null}
      {synergy.engines.length === 0 && synergy.waiting.length === 0 ? (
        <p className="text-sm text-muted">
          No engine yet: none of your cards supply something that another card of yours needs. The
          ranking above rates each offered card by its own rating, by the roles your deck lacks and
          by how it works with the cards you have.
        </p>
      ) : null}
      {synergy.engines.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-parchment">Engines</p>
          {PART_WEIGHT.engines < 1 ? (
            <p className="mt-1 text-xs text-muted">
              {PART_WEIGHT.engines <= 0
                ? "Named so you can see what your deck is building; the ranking above does not count engines."
                : `Named so you can see what your deck is building; the ranking above counts ${Math.round(PART_WEIGHT.engines * 100).toString()} % of an engine's strength.`}
            </p>
          ) : null}
          <ul className="mt-2 space-y-3" aria-label="Engines in your deck">
            {synergy.engines.map((e) => (
              <li key={e.mechanic} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-parchment">{e.label}</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-charcoal" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-teal"
                    style={{ width: `${Math.round((e.value / top) * 100).toString()}%` }}
                  />
                </div>
                <p className="mt-1 text-muted">
                  {e.sources.length > 0 ? `Supplied by ${names(e.sources)}` : "No supplier"}
                  {e.payoffs.length > 0 ? `; used by ${names(e.payoffs)}.` : "."}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {synergy.waiting.length > 0 ? (
        <div className={synergy.engines.length > 0 ? "mt-5" : ""}>
          <p className="text-sm font-medium text-parchment">Waiting for support</p>
          <ul
            className="mt-2 space-y-1.5 text-sm text-muted"
            aria-label="Cards waiting for support"
          >
            {synergy.waiting.map((w) => (
              <li key={w.name}>
                <span className="text-parchment">
                  {w.name}
                  {w.count > 1 ? ` x${w.count.toString()}` : ""}
                </span>{" "}
                needs{" "}
                {names(
                  w.lacking.map(
                    (l) =>
                      `${l.label} (${l.suppliers.length > 0 ? `so far from ${names(l.suppliers)}` : "nothing in your deck yet"})`,
                  ),
                )}
                ; about <span className="num">{Math.round(w.heldBack * 100).toString()}</span> % of
                its rating is held back.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <Evidence evidence={evidence} />
    </Panel>
  );
}
