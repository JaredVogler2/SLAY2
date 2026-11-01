import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import {
  ACTS_KEYS,
  CLASS_VERDICT_TEXT,
  TEST_INFO,
  VERDICT_TEXT,
  actsData,
  formatP,
  pctShare,
  pts,
  robustSentence,
  type ActsData,
  type ActsTest,
} from "@/lib/acts";

const n = (x: number): string => x.toLocaleString("en-US");
const cap = (c: string): string => c.charAt(0).toUpperCase() + c.slice(1);

function Row({ t }: { t: ActsTest }) {
  const info = TEST_INFO[t.key];
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
      <td className="py-2">
        <Badge
          tone={
            t.verdict === "passed" ? "exact" : t.verdict === "reversed" ? "unverified" : "neutral"
          }
        >
          {VERDICT_TEXT[t.verdict]}
        </Badge>
      </td>
    </tr>
  );
}

/** The acts study (ADR-061) in the ledger of Methods: what was registered, how far it has got, and each held-out test as it came out. */
export function ActsPanel({ data = actsData() }: { data?: ActsData | null }) {
  const d = data;
  if (!d) return null;
  const tests = d.tests;
  const results = tests ? ACTS_KEYS.map((k) => tests.results[k]) : [];
  return (
    <Panel
      id="acts"
      className="scroll-mt-20"
      eyebrow="Registered study"
      title="Does a pickier card rule win more games, and in which act? (ADR-061)"
      headingLevel={2}
    >
      <div className="space-y-4 text-sm text-muted">
        <p>
          Does a pilot that takes only cards worth 0.2 or more win more games than the pilot that
          follows the shown card values, and whose picks carry it if it does? Four pilots were
          registered against that baseline: the old lead of ADR-036, which is pickier in every act,
          and three that are pickier in one act only (Act 1, Act 2 or Act 3). Each test pools the
          five classes into one exact McNemar test on {n(d.seeds)} held-out seeds a class that no
          earlier study played, is read at {d.level.toFixed(4)} (0.05 divided by four) with a
          whole-seed interval that must exclude zero, and has to be confirmed by a second analysis
          that scores every game that did not end in a win as not won. How to read a result, and
          what each combination of the four would mean, was fixed before any game of the study was
          played. Everything here is play by rules-based pilots in a simulator that has never been
          compared with the live game, at Ascension 0 with the relics kept; winning is rare for
          them, and none of it is about a player.
        </p>
        {tests ? (
          <>
            <ScrollRegion label="The four held-out tests of the acts study">
              <table className="w-full min-w-[40rem] text-left text-sm">
                <caption className="sr-only">
                  The four tests: the share of the paired games that were won, for the rule against
                  the baseline, the difference with its interval, the pairs, the exact p and the
                  reading
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
                      Difference ({((1 - d.level) * 100).toFixed(2)} % interval)
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Pairs
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Exact p
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Reading
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((t) => (
                    <Row key={t.key} t={t} />
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            <Disclosure summary={<span>Each class on its own</span>}>
              <ScrollRegion label="The acts tests, class by class">
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <caption className="sr-only">
                    For each class and each test: the share of the paired games that were won, for
                    the rule against the baseline, the difference and the exact p (each class on its
                    own, uncorrected)
                  </caption>
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th scope="col" className="py-2 pr-3 font-medium">
                        Class
                      </th>
                      {results.map((t) => (
                        <th key={t.key} scope="col" className="py-2 pr-3 font-medium">
                          {TEST_INFO[t.key].title}
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
                                  {pctShare(c.shares.arm)} against {pctShare(c.shares.baseline)}
                                  <span className="block text-xs text-dim">
                                    {c.wins.arm} / {c.wins.baseline} won · {c.armOnly} /{" "}
                                    {c.baselineOnly} · {formatP(c.p)} ·{" "}
                                    {CLASS_VERDICT_TEXT[c.verdict]}
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
                Secondary and uncorrected: twenty class tests were read, so one of them being below
                0.01 is not a finding by itself. Silent and Necrobinder almost never win, so their
                rows are mostly zeros.
              </p>
            </Disclosure>
            <Disclosure summary={<span>The records behind the tests</span>}>
              <ul className="list-disc space-y-1.5 pl-5">
                <li>
                  The design checks passed (otherwise the study would have stopped before any test
                  was pooled): the pilots that are the baseline in the early acts were its own games
                  record for record where the baseline never met their rule, and agreed with it
                  about the bosses before their act in every pair.
                </li>
                <li>
                  Every test was also read on all pairs of seeds, a game that did not end in a win
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
          </>
        ) : (
          <p className="rounded-lg border border-line bg-charcoal/40 px-3 py-2 text-parchment">
            Where the study stands: it is registered and its held-out games have not all been played
            and read, so there is no result yet. The record fixes what each outcome would mean, and
            which pilot is which, before any of it is known.
          </p>
        )}
        <p>
          The reading of the results and what they leave open are on the{" "}
          <Link
            href="/insights#acts"
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
