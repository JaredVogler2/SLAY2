import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { StartHpNote } from "@/components/ui/StartHpNote";
import { Tile } from "@/components/ui/Tile";
import { CLASS_STYLE } from "@/lib/card-style";
import { formatP, pct, signed } from "@/lib/methods-data";
import {
  num,
  range,
  verdictOf,
  type PooledTest,
  type SynergyConfig,
  type SynergyKeepTest,
  type SynergyTest,
  type TestMember,
  type Verdict,
} from "@/lib/synergy-evidence";
import type { PlayableClass } from "@slay2/game-data";

const classLabel = (c: string): string => CLASS_STYLE[c as PlayableClass].label;
const games = (n: number): string => n.toLocaleString("en-US");

const WITH = "the pilot with the synergy term";
const WITHOUT = "the same pilot without it";

/** A phrase that starts a sentence. */
const cap = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** "0.7 of its first judgement" for a part that is kept in part, nothing for one kept whole. */
export function configurationSentence(c: SynergyConfig): string {
  const part = (name: string, v: number): string =>
    v === 1
      ? `${name} at their first judgement`
      : v === 0
        ? `no ${name}`
        : `${name} at ${num(v, 2)} of their first judgement`;
  const margin =
    c.margin === 0
      ? "it takes the best-ranked card unless skipping ranks first"
      : `it takes the best-ranked card only if the card adds at least ${num(c.margin, 1)} index points, and skips otherwise`;
  return `${part("needs", c.needs)}, ${part("Strength, Dexterity and Focus lifts", c.scalers)}, ${part("engine credit", c.engines)}; ${margin}`;
}

function MemberRow({ m }: { m: TestMember }) {
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

/** "with the term 61.2 % against without it 59.8 % (210 games only with the term got past the Act-1 boss, 188 only without it; exact McNemar p = 0.21)". */
function compare(
  e: PooledTest["reachedAct2"],
  boss: "Act-1" | "Act-2",
  a: string,
  b: string,
): string {
  const t = e.pairedTable;
  return `${a} ${pct(e.a.rate, 1)} against ${b} ${pct(e.b.rate, 1)} (${games(t.a_only)} games only ${a} got past the ${boss} boss, ${games(t.b_only)} only ${b}; exact McNemar ${formatP(t.mcnemar_p)})`;
}

const BADGE: Record<Verdict, { tone: "exact" | "unverified"; text: string; title: string }> = {
  ahead: {
    tone: "exact",
    text: "ahead, in simulation",
    title:
      "The pilot with the synergy term got past the Act-1 boss more often at the registered level",
  },
  "not-shown": {
    tone: "unverified",
    text: "not shown",
    title:
      "The difference is within what chance explains at the registered level; that does not show the term makes no difference",
  },
  behind: {
    tone: "unverified",
    text: "worse, in simulation",
    title:
      "The pilot without the synergy term got past the Act-1 boss more often at the registered level",
  },
};

function Reading({ verdict, test }: { verdict: Verdict; test: SynergyTest }) {
  const t = test.primary.reachedAct2.pairedTable;
  if (verdict === "ahead") {
    return (
      <>
        <strong className="font-medium text-parchment">Ahead.</strong> In simulated play on held-out
        seeds, adding the synergy term improved what the heuristic index picks ({games(t.a_only)}{" "}
        games only the pilot with the term got past the boss, {games(t.b_only)} only the one without
        it, {formatP(t.mcnemar_p)}, level {test.alpha}). That is all this shows: the simulator has
        not been compared with the live game, the pilot does not build around an engine on purpose,
        and getting past the first boss is not winning.
      </>
    );
  }
  if (verdict === "behind") {
    return (
      <>
        <strong className="font-medium text-parchment">Worse.</strong> Adding the synergy term made
        the simulated picks worse ({games(t.b_only)} games only the pilot without the term got past
        the boss, {games(t.a_only)} only the one with it, {formatP(t.mcnemar_p)}, level {test.alpha}
        ). The label and numbers of the advisor&rsquo;s synergy panel say so, and the change is
        recorded in the decision log (ADR-050).
      </>
    );
  }
  return (
    <>
      <strong className="font-medium text-parchment">Not shown.</strong> The difference is within
      what chance explains at the registered level ({formatP(t.mcnemar_p)}, level {test.alpha}).
      That does not show that the term makes no difference, only that this test, on these games,
      could not tell. The advisor&rsquo;s synergy panel stays a judgement and says so.
    </>
  );
}

/** The five classes of a pooled test, one row each (descriptive: one test was registered, not five). */
function ClassTable({ members, label }: { members: readonly TestMember[]; label: string }) {
  return (
    <ScrollRegion label={label}>
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
              Past the boss, without → with
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Only with / only without
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
          {members.map((m) => (
            <MemberRow key={m.character} m={m} />
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

/**
 * The one registered held-out test of the synergy term (ADR-050): a pilot that picks card rewards by the deck index with the term
 * against the same pilot without it, and, reported whatever the primary shows, the secondary comparisons and what each arm's decks
 * held. Every number is read from the exporter's file; the words around it follow from the registered reading rule.
 */
export function SynergyTestPanel({ test }: { test: SynergyTest }) {
  const verdict = verdictOf(test);
  const p = test.primary;
  const perClass = new Set(p.members.map((m) => m.pairedSeeds));
  const seedsPerClass = perClass.size === 1 ? [...perClass][0] : undefined;
  const badge = BADGE[verdict];
  const hasWins = p.wins.a + p.wins.b > 0;
  const profile = test.profile;
  const hasNecrobinder = p.members.some((m) => m.character === "necrobinder");
  return (
    <section className="mt-5 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 className="font-display text-lg text-parchment">The registered test</h3>
        <Badge tone={badge.tone} title={badge.title}>
          {badge.text}
        </Badge>
      </div>
      <ul
        className="mb-4 grid gap-3 sm:grid-cols-3"
        aria-label="Result of the registered test of the synergy term"
      >
        <Tile
          k="Past the Act-1 boss"
          value={`${pct(p.reachedAct2.b.rate, 1)} → ${pct(p.reachedAct2.a.rate, 1)}`}
          note={`without → with the term; ${formatP(p.reachedAct2.pairedTable.mcnemar_p)}`}
        />
        <Tile
          k="Mean floor reached"
          value={signed(p.floorDifference.meanAMinusB)}
          note={`${signed(p.floorDifference.ci95[0] ?? 0)} to ${signed(p.floorDifference.ci95[1] ?? 0)}`}
        />
        <Tile
          k="Wins"
          value={`${String(p.wins.b)} → ${String(p.wins.a)}`}
          note={`${formatP(p.wins.pairedTable.mcnemar_p)}${hasWins ? ", each re-derived" : ""}`}
        />
      </ul>
      <p>
        <strong className="font-medium text-parchment">{cap(WITH)}</strong> and{" "}
        <strong className="font-medium text-parchment">{WITHOUT}</strong> are one rules pilot whose
        card-reward screen is decided by the deck index; the only difference is whether the index
        has its synergy term. Both skip a card only by the same rule (
        {test.astar.margin === 0
          ? "when skipping ranks first"
          : `a card has to add ${num(test.astar.margin, 1)} index points`}
        ). They played the same held-out seeds, {games(seedsPerClass ?? p.pairedSeeds)}{" "}
        {seedsPerClass ? "in each class " : ""}({games(p.pairedSeeds)} pairs,{" "}
        {games(p.bothCompleted)} completed by both; the others ended in a simulator error or a
        timeout, which says nothing about play, and are left out of the pair:{" "}
        {games(p.notFinished.a)} games of the pilot with the term and {games(p.notFinished.b)} of
        the one without). The primary endpoint, fixed before any of these games: the share of games
        that got past the Act-1 boss, paired by seed, pooled over the five classes, exact McNemar
        test, two-sided, level {test.alpha}, one test. {pct(p.reachedAct2.a.rate, 1)} with the term
        against {pct(p.reachedAct2.b.rate, 1)} without it, a difference of{" "}
        <span className="num">
          {signed(p.clusteredDifference.meanAMinusB * 100, 1)} points (95 %{" "}
          {signed((p.clusteredDifference.ci95[0] ?? 0) * 100, 1)} to{" "}
          {signed((p.clusteredDifference.ci95[1] ?? 0) * 100, 1)}, resampling whole seeds)
        </span>
        . <Reading verdict={verdict} test={test} />
      </p>

      {hasNecrobinder ? (
        <StartHpNote character="necrobinder" subject="chances" className="mt-3 text-xs text-rose" />
      ) : null}
      <ClassTable members={p.members} label="Registered test of the synergy term by class" />

      <div className="mt-5 space-y-3">
        <p>
          <strong className="font-medium text-parchment">Got past the Act-2 boss.</strong>{" "}
          {cap(compare(p.reachedAct3, "Act-2", "with the term", "without it"))}. Mean floors reached
          differ by{" "}
          <span className="num">
            {signed(p.floorDifference.meanAMinusB)} (95 % {range(p.floorDifference.ci95, 2)})
          </span>
          .
        </p>
        {test.noTermAtZero ? (
          <p>
            <strong className="font-medium text-parchment">
              Everything the study changed, together.
            </strong>{" "}
            Against the index without the term and without a skip margin (what the page did before
            the term):{" "}
            {cap(
              compare(
                test.noTermAtZero.reachedAct2,
                "Act-1",
                "as chosen",
                "with no term and no margin",
              ),
            )}
            .
          </p>
        ) : null}
        <p>
          <strong className="font-medium text-parchment">Against measured card values.</strong>{" "}
          {cap(
            compare(
              test.measured.reachedAct2,
              "Act-1",
              "the synergy pilot",
              "the measured-values pilot",
            ),
          )}
          . The hand-set index is not expected to beat what the simulator rewards (ADR-031,
          ADR-034); this reports how far apart they are, and is why the advisor keeps the measured
          values as a separate second opinion.
        </p>
        {profile ? (
          <p>
            <strong className="font-medium text-parchment">
              What the arms did on the card screens.
            </strong>{" "}
            The pilot with the term skipped{" "}
            <span className="num">
              {pct(profile.astar.skipRate.value ?? 0, 1)} ({games(profile.astar.skipped)} of{" "}
              {games(profile.astar.offers)})
            </span>{" "}
            of the card rewards it was offered, the pilot without it{" "}
            <span className="num">
              {pct(profile.d0star.skipRate.value ?? 0, 1)} ({games(profile.d0star.skipped)} of{" "}
              {games(profile.d0star.offers)})
            </span>
            . The decks they brought to the Act-1 boss held{" "}
            <span className="num">{num(profile.astar.atBoss.unmet.mean ?? 0, 3)}</span> and{" "}
            <span className="num">{num(profile.d0star.atBoss.unmet.mean ?? 0, 3)}</span> index
            points of unmet needs on average (paired difference{" "}
            <span className="num">
              {num(profile.difference.measures.unmet.mean ?? 0, 3)} (95 %{" "}
              {range(profile.difference.measures.unmet.ci95 ?? [0, 0], 3)})
            </span>{" "}
            over {games(profile.difference.pairs)} pairs, read at the first judgement of every part,
            so that the two arms are measured on one scale; less negative is fewer unmet needs).
          </p>
        ) : null}
      </div>

      <Disclosure summary="How the configuration was chosen" className="mt-5">
        <div className="space-y-3">
          <p>
            Before any held-out game, a development stage on other seeds (1,000 per class, ADR-050)
            compared four ways of weighting the hand-set parts with the index without the term, and
            then two skip margins. The rule was fixed in advance and applied by a program to its own
            output: the weights chosen were{" "}
            <strong className="font-medium text-parchment">
              {configurationSentence(test.astar)}
            </strong>{" "}
            (arm {test.astar.arm}).
          </p>
          <ScrollRegion label="Development stage comparisons">
            <table className="w-full min-w-[28rem] text-left text-sm">
              <caption className="pb-2 text-left font-display text-base text-gold">
                Pooled difference in the share past the Act-1 boss, five classes
              </caption>
              <thead>
                <tr className="border-b border-line text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Arm
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Against
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Difference (95 %)
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Pairs
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[
                  ...Object.entries(test.selection.phase1.differences).map(
                    ([arm, d]) => ({ arm, against: "no term", d }) as const,
                  ),
                  ...Object.entries(test.selection.phase2.differences).map(
                    ([arm, d]) => ({ arm, against: `${test.astar.arm}, margin 0`, d }) as const,
                  ),
                ].map(({ arm, against, d }) => (
                  <tr key={arm} className="align-top">
                    <th scope="row" className="py-2 pr-3 font-medium text-parchment">
                      {arm}
                    </th>
                    <td className="py-2 pr-3 text-muted">{against}</td>
                    <td className="num py-2 pr-3">
                      {signed(d.difference * 100, 1)} points ({signed((d.ci95[0] ?? 0) * 100, 1)} to{" "}
                      {signed((d.ci95[1] ?? 0) * 100, 1)})
                    </td>
                    <td className="num py-2 text-muted">{games(d.pairs)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollRegion>
          <p>These are tuning games, not a test: nothing in them counts toward the result above.</p>
        </div>
      </Disclosure>
    </section>
  );
}

function KeepReading({ verdict, test }: { verdict: Verdict; test: SynergyKeepTest }) {
  const t = test.primary.reachedAct2.pairedTable;
  if (verdict === "ahead") {
    return (
      <>
        <strong className="font-medium text-parchment">Ahead again.</strong> With the relics kept,
        adding the synergy term still improved what the heuristic index picks ({games(t.a_only)}{" "}
        games only the pilot with the term got past the boss, {games(t.b_only)} only the one without
        it, {formatP(t.mcnemar_p)}, level {test.alpha}). The same limits hold: the simulator, even
        with its relics repaired, has not been compared with the live game, and getting past the
        first boss is not winning.
      </>
    );
  }
  if (verdict === "behind") {
    return (
      <>
        <strong className="font-medium text-parchment">Worse.</strong> With the relics kept, adding
        the synergy term made the simulated picks worse ({games(t.b_only)} games only the pilot
        without the term got past the boss, {games(t.a_only)} only the one with it,{" "}
        {formatP(t.mcnemar_p)}, level {test.alpha}). The label and numbers of the advisor&rsquo;s
        synergy panel say so, and the change is recorded in the decision log (ADR-054).
      </>
    );
  }
  return (
    <>
      <strong className="font-medium text-parchment">Not shown.</strong> With the relics kept, this
      test could not tell the two pilots apart at the registered level ({formatP(t.mcnemar_p)},
      level {test.alpha}). That does not show that the term makes no difference, only that this
      test, on these games, could not tell. The advisor&rsquo;s synergy panel says the term was
      tested twice and what each test found.
    </>
  );
}

/**
 * The registered test of the synergy term repeated with the relics kept (ADR-054): the same two pilots, the same level, one pooled
 * comparison, and the secondary comparisons reported whatever it shows. The words around the numbers follow from the reading rule
 * of ADR-054 item 4.
 */
export function SynergyKeepTestPanel({
  test,
  first,
}: {
  test: SynergyKeepTest;
  /** the first test, for the one sentence that sets the two side by side */
  first: SynergyTest | null;
}) {
  const verdict = verdictOf(test);
  const p = test.primary;
  const badge = BADGE[verdict];
  const hasNecrobinder = p.members.some((m) => m.character === "necrobinder");
  const e = p.reachedAct2;
  return (
    <section
      aria-labelledby="synergy-keep-test"
      className="mt-5 rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted"
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <h3 id="synergy-keep-test" className="font-display text-lg text-parchment">
          The same test with the relics kept
        </h3>
        <Badge tone={badge.tone} title={badge.title}>
          {badge.text}
        </Badge>
      </div>
      <ul
        className="mb-4 grid gap-3 sm:grid-cols-3"
        aria-label="Result of the registered test of the synergy term repeated with the relics kept"
      >
        <Tile
          k="Past the Act-1 boss"
          value={`${pct(e.b.rate, 1)} → ${pct(e.a.rate, 1)}`}
          note={`without → with the term; ${formatP(e.pairedTable.mcnemar_p)}`}
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
        The first test was played in a simulator that drops every relic a run gains after its first
        fight (gap G14), so its runs held two relics. This is the same test with the relics kept,
        registered before any of its games (ADR-054): {cap(WITH)} against {WITHOUT}, the same
        configuration, the same level ({test.alpha}), the same kind of held-out seeds (
        {games(p.pairedSeeds)} pairs, {games(p.bothCompleted)} completed by both;{" "}
        {games(p.notFinished.a)} games of the pilot with the term and {games(p.notFinished.b)} of
        the one without ended in a simulator error or a timeout, which says nothing about play, and
        are left out of the pair). Primary endpoint: the share of games that got past the Act-1
        boss, paired by seed, pooled over the five classes, exact McNemar test, one test.{" "}
        {pct(e.a.rate, 1)} with the term against {pct(e.b.rate, 1)} without it, a difference of{" "}
        <span className="num">
          {signed(p.clusteredDifference.meanAMinusB * 100, 1)} points (95 %{" "}
          {signed((p.clusteredDifference.ci95[0] ?? 0) * 100, 1)} to{" "}
          {signed((p.clusteredDifference.ci95[1] ?? 0) * 100, 1)}, resampling whole seeds)
        </span>
        . <KeepReading verdict={verdict} test={test} />
        {first ? (
          <>
            {" "}
            The first test, without the relics: {pct(first.primary.reachedAct2.a.rate, 1)} with the
            term against {pct(first.primary.reachedAct2.b.rate, 1)} without it.
          </>
        ) : null}
      </p>
      {hasNecrobinder ? (
        <StartHpNote character="necrobinder" subject="chances" className="mt-3 text-xs text-rose" />
      ) : null}
      <ClassTable
        members={p.members}
        label="Registered test of the synergy term repeated with the relics kept, by class"
      />
      <div className="mt-5 space-y-3">
        <p>
          <strong className="font-medium text-parchment">Got past the Act-2 boss.</strong>{" "}
          {cap(compare(p.reachedAct3, "Act-2", "with the term", "without it"))}. Mean floors reached
          differ by{" "}
          <span className="num">
            {signed(p.floorDifference.meanAMinusB)} (95 % {range(p.floorDifference.ci95, 2)})
          </span>
          .
        </p>
        <p>
          <strong className="font-medium text-parchment">What this does not show.</strong> Anything
          about the live game (the repaired simulator is not the game either: the Ancients of acts
          two and three are missing, Underdocks is never played, some relics may be implemented
          imperfectly), a pilot that chooses relics or builds an engine on purpose, the relic
          reading (both pilots read the class alone here), or winning.
        </p>
      </div>
    </section>
  );
}
