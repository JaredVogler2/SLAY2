import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import {
  CLASS_VERDICT_TEXT,
  THRESH_TAGS,
  THRESHOLD_TEXT,
  advisorNote,
  downgradeNote,
  formatP,
  levelText,
  meaningOf,
  narrowSentence,
  netText,
  pctShare,
  pts,
  resultLine,
  robustSentence,
  screenSentence,
  testInfo,
  testSentence,
  threshData,
  verdictText,
  verificationNote,
  type ThreshData,
  type ThreshScreen,
  type ThreshTest,
} from "@/lib/thresh";

const n = (x: number): string => x.toLocaleString("en-US");
const cap = (c: string): string => c.charAt(0).toUpperCase() + c.slice(1);
const deck = (x: number | null | undefined): string => (x == null ? "-" : x.toFixed(1));

function ScreenTable({ screen }: { screen: ThreshScreen }) {
  return (
    <ScrollRegion label="The development screen of the threshold study">
      <table className="w-full min-w-[46rem] text-left text-sm">
        <caption className="sr-only">
          The development screen: for each threshold of the card reward of Act 2, the games won
          against the baseline on the development seeds, the net wins, the pairs, the exact p, the
          mean final deck and the share that got past the second boss. Development numbers: they
          decide only what is played next.
        </caption>
        <thead>
          <tr className="border-b border-line text-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              Threshold
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Games won
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Net wins
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Pairs
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Exact p
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              Mean final deck
            </th>
            <th scope="col" className="py-2 font-medium">
              Past the second boss
            </th>
          </tr>
        </thead>
        <tbody>
          {THRESH_TAGS.map((tag) => {
            const r = screen.rows[tag];
            const chosen = screen.best.arm === tag;
            return (
              <tr key={tag} className="border-b border-line/60 align-top">
                <th scope="row" className="py-2 pr-3 text-left font-normal text-parchment">
                  {THRESHOLD_TEXT[tag]}
                  {chosen ? (
                    <span className="block text-xs text-dim">
                      most net wins{screen.choice.advance ? ", goes forward" : ""}
                    </span>
                  ) : null}
                </th>
                <td className="num py-2 pr-3 text-muted">
                  {pctShare(r.shares.arm)} against {pctShare(r.shares.baseline)}
                  <span className="block text-xs text-dim">
                    {n(r.wins.arm)} against {n(r.wins.baseline)}
                  </span>
                </td>
                <td className="num py-2 pr-3 text-parchment">
                  {netText(r.net)}
                  <span className="block text-xs text-dim">
                    {n(r.armOnly)} / {n(r.baselineOnly)} discordant
                  </span>
                </td>
                <td className="num py-2 pr-3 text-muted">
                  {n(r.pairs)}
                  <span className="block text-xs text-dim">{n(r.excluded)} left out</span>
                </td>
                <td className="num py-2 pr-3 text-muted">{formatP(r.p)}</td>
                <td className="num py-2 pr-3 text-muted">
                  {deck(r.meanDeckSize?.arm)} cards
                  <span className="block text-xs text-dim">
                    against {deck(r.meanDeckSize?.baseline)}
                  </span>
                </td>
                <td className="num py-2 text-muted">
                  {pctShare(r.pastAct2Boss.arm, 1)}
                  <span className="block text-xs text-dim">
                    against {pctShare(r.pastAct2Boss.baseline, 1)}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollRegion>
  );
}

function TestRow({ t }: { t: ThreshTest }) {
  const info = testInfo(t);
  return (
    <tr className="border-b border-line/60 align-top">
      <th scope="row" className="py-2 pr-3 text-left font-normal text-parchment">
        {info.title}
        <span className="block text-xs text-dim">test {t.key}</span>
      </th>
      <td className="num py-2 pr-3 text-muted">
        {pctShare(t.shares.arm)} against {pctShare(t.shares.baseline)}
        <span className="block text-xs text-dim">
          {n(t.wins.arm)} against {n(t.wins.baseline)} games won
        </span>
      </td>
      <td className="num py-2 pr-3 text-parchment">
        {pts(t.difference)}
        <span className="block text-xs text-dim">
          {pts(t.ci[0] ?? 0)} to {pts(t.ci[1] ?? 0)}
        </span>
      </td>
      <td className="num py-2 pr-3 text-muted">
        {n(t.pairs)}
        <span className="block text-xs text-dim">
          {t.armOnly} / {t.baselineOnly} discordant · {n(t.excluded)} left out
        </span>
      </td>
      <td className="num py-2 pr-3 text-muted">{formatP(t.p)}</td>
      <td className="num py-2 pr-3 text-muted">
        {pctShare(t.actOne.shares.arm, 1)}
        <span className="block text-xs text-dim">
          against {pctShare(t.actOne.shares.baseline, 1)}
        </span>
      </td>
      <td className="num py-2 pr-3 text-muted">
        {pctShare(t.actTwo.shares.arm, 1)}
        <span className="block text-xs text-dim">
          against {pctShare(t.actTwo.shares.baseline, 1)}
        </span>
      </td>
      <td className="py-2">
        <Badge
          tone={
            t.verdict === "passed" ? "exact" : t.verdict === "reversed" ? "unverified" : "neutral"
          }
        >
          {verdictText(t)}
        </Badge>
        {t.narrow ? <span className="mt-1 block text-xs text-dim">a narrow pass</span> : null}
      </td>
    </tr>
  );
}

/** The threshold study (ADR-062) in the ledger of Methods: what was registered, how far it has got, the development screen as it came out, and each held-out test. */
export function ThreshPanel({ data = threshData() }: { data?: ThreshData | null }) {
  const d = data;
  if (!d) return null;
  const screen = d.screen;
  const tests = d.tests;
  const results = tests
    ? tests.order.flatMap((k) => (tests.results[k] ? [tests.results[k]] : []))
    : [];
  return (
    <Panel
      id="thresh"
      className="scroll-mt-20"
      eyebrow="Registered study"
      title="Does the Act-2 result hold on new seeds, and is another threshold better? (ADR-062)"
      headingLevel={2}
    >
      <div className="space-y-4 text-sm text-muted">
        <p>
          ADR-061 found that a pilot which takes a card in the second act only if it is worth more
          than 0.2 won a few more games than the baseline, a narrow result of one test of four. This
          study asks again, on seeds nobody has played, in the two classes that win (Ironclad and
          Defect). A development screen of six thresholds (0.1, 0.2, 0.3, 0.45, 0.6 and taking no
          card in Act 2) on {n(d.devSeeds)} fresh seeds of each class picks one by a rule fixed
          beforehand; then, on {n(d.seeds)} other fresh seeds of each class, T1 repeats the test of
          0.2 and, only if the screen sent a threshold forward, T2 tests it against the baseline and
          T3 against 0.2. Each test pools the two classes into one exact McNemar test, is read at
          0.05 divided by the number of tests played with a whole-seed interval that must exclude
          zero, and has to be confirmed by a second analysis that scores every game that did not end
          in a win as not won. How to read a result, and what each outcome would mean, was fixed
          before any game of the study was played. Everything here is play by rules-based pilots in
          a simulator that has never been compared with the live game, at Ascension 0 with the
          relics kept; winning is rare for them, and none of it is about a player.
        </p>
        {screen ? (
          <>
            <p className="font-medium text-parchment">
              The development screen as it came out (development seeds: a nomination, not a result)
            </p>
            <ScreenTable screen={screen} />
            <p>{screenSentence(screen)}</p>
            <p className="text-xs text-dim">
              The registered rule picks the threshold with the most net wins against the baseline
              (games only it won minus games only the baseline won) and sends it forward only if
              that is above zero, it is not 0.2 and it is ahead of 0.2 head to head at an exact p
              below 0.20. The record simulated the rule: with no effect anywhere it sends something
              forward in about a quarter of the draws, so an advance is weak evidence, and nothing
              advanced is not evidence that thresholds are alike.
            </p>
          </>
        ) : null}
        {tests ? (
          <>
            <p className="font-medium text-parchment">
              The held-out tests (
              {tests.results.T2 ? "three, each read at 0.05 / 3" : "one, read at 0.05"})
            </p>
            <ScrollRegion label="The held-out tests of the threshold study">
              <table className="w-full min-w-[52rem] text-left text-sm">
                <caption className="sr-only">
                  The tests: the share of the paired games that were won, for the arm against its
                  baseline, the difference with its interval, the pairs, the exact p, the shares
                  that got past the first and the second boss, and the reading
                </caption>
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Test
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Games won
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Difference ({levelText(tests.level)} interval)
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Pairs
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Exact p
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Past the first boss
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Past the second boss
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Reading
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((t) => (
                    <TestRow key={t.key} t={t} />
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            <p>{resultLine(tests.results)}</p>
            <ul className="list-disc space-y-1.5 pl-5">
              {results.map((t) => (
                <li key={t.key}>
                  <span className="text-parchment">{t.key}.</span> {testSentence(t, tests.level)}{" "}
                  {t.narrow ? narrowSentence(t) : ""} {downgradeNote(t)} {verificationNote(t)}
                </li>
              ))}
            </ul>
            <ul className="list-disc space-y-1.5 pl-5">
              {meaningOf(tests.results).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
            <Disclosure summary={<span>Each class on its own</span>}>
              <ScrollRegion label="The threshold tests, class by class">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <caption className="sr-only">
                    For each class and each test: the share of the paired games that were won, for
                    the arm against its baseline, the difference and the exact p (each class on its
                    own, uncorrected)
                  </caption>
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Class
                      </th>
                      {results.map((t) => (
                        <th key={t.key} scope="col" className="py-2 pr-3 font-medium">
                          {testInfo(t).title}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(results[0]?.perClass ?? []).map((c0, i) => (
                      <tr key={c0.character} className="border-b border-line/60 align-top">
                        <th scope="row" className="py-2 pr-3 text-left font-normal text-parchment">
                          {cap(c0.character)}
                        </th>
                        {results.map((t) => {
                          const c = t.perClass[i];
                          return (
                            <td key={t.key} className="num py-2 pr-3 text-muted">
                              {c ? (
                                <>
                                  {pctShare(c.shares.arm)} against {pctShare(c.shares.baseline)} (
                                  {pts(c.difference)})
                                  <span className="block text-xs text-dim">
                                    {c.wins.arm} / {c.wins.baseline} won · {c.armOnly} /{" "}
                                    {c.baselineOnly} · {formatP(c.p)} ·{" "}
                                    {CLASS_VERDICT_TEXT[c.verdict]} · past the first boss{" "}
                                    {pctShare(c.actOne.arm, 1)} against{" "}
                                    {pctShare(c.actOne.baseline, 1)}
                                  </span>
                                </>
                              ) : (
                                "-"
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
              <p className="mt-2 text-xs text-dim">
                Secondary and uncorrected: each class is read at 0.01 on its own, so one of them
                being below it is not a finding by itself.
              </p>
            </Disclosure>
            <Disclosure summary={<span>The records behind the tests</span>}>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  The design checks passed (otherwise the study would have stopped before any test
                  was pooled): each arm was the baseline&apos;s own game record for record where the
                  baseline never met its rule, and agreed with it about the first boss in every
                  pair.
                  {d.identity
                    ? ` Pairs in which a game was stopped by the wall clock, which depends on the load of the machine and not on the game, are not compared and are counted: ${Object.entries(
                        d.identity,
                      )
                        .map(([arm, v]) => `${arm} ${n(v.wallClockPairs)}`)
                        .join(", ")}.`
                    : ""}
                </li>
                <li>
                  Every test was also read on all pairs of games, a game that did not end in a win
                  counting as not won: a result is read as ahead or behind only if that check agrees
                  at an exact p below 0.05 and at most a tenth of the pairs were dropped.{" "}
                  {results.map((t) => `${t.key}: ${robustSentence(t)}`).join(" ")}
                </li>
                <li>
                  Each pooled file was recomputed from the raw episodes by code that shares nothing
                  with the harness ({results.map((t) => n(t.verification.exactChecks)).join(", ")}{" "}
                  exact checks a file, all agreeing).
                </li>
                <li>
                  Files:{" "}
                  {results.map((t) => `${t.file} (SHA-256 ${t.sha256.slice(0, 12)}…)`).join("; ")}.
                </li>
              </ul>
            </Disclosure>
            {advisorNote(tests.results).map((s) => (
              <p key={s}>{s}</p>
            ))}
          </>
        ) : (
          <p className="rounded-lg border border-line bg-charcoal/40 px-3 py-2 text-parchment">
            Where the study stands:{" "}
            {screen
              ? "the development screen has been read once and the held-out games have not all been played and read, so there is no test result yet."
              : "it is registered and its games have not all been played and read, so there is no result yet."}{" "}
            The record fixes what each outcome would mean, and which arm is which, before any of it
            is known.
          </p>
        )}
        <p>
          The reading of the results and what they leave open are on the{" "}
          <Link
            href="/insights#thresholds"
            className="text-teal underline decoration-dotted underline-offset-4"
          >
            Insights page
          </Link>
          .
        </p>
      </div>
    </Panel>
  );
}
