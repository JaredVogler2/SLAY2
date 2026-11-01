import Link from "next/link";

import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import {
  TEST_INFO,
  VERDICT_TEXT,
  act2Data,
  formatP,
  hasPrice,
  pctShare,
  pts,
  stageOf,
  type Act2Data,
  type Act2Test,
  type Act2TestKey,
} from "@/lib/act2";

const n = (x: number): string => x.toLocaleString("en-US");
const KEYS: readonly Act2TestKey[] = ["L", "P", "V"];
const COUNT_WORD = ["none", "one", "two", "three"] as const;
const cap = (c: string): string => c.charAt(0).toUpperCase() + c.slice(1);

function why(key: Act2TestKey, d: Act2Data): string {
  if (key === "L") return "always tested";
  if (key === "P")
    return "no threshold for the second act qualified in the development screen, so it was not played on held-out seeds";
  return d.dev?.V.anyClassFitted
    ? "the refitted values did not qualify in the development screen, so they were not played on held-out seeds"
    : "no class kept values of its own, so there was nothing to play";
}

function Row({ k, t, d }: { k: Act2TestKey; t: Act2Test | undefined; d: Act2Data }) {
  const info = TEST_INFO[k];
  return (
    <tr className="border-b border-line/60 align-top">
      <th scope="row" className="py-2 pr-3 text-left font-normal text-parchment">
        {info.title}
        <span className="block text-xs text-dim">test {k}</span>
      </th>
      {t ? (
        <>
          <td className="num py-2 pr-3 text-muted">
            {pctShare(t.shares.arm)} against {pctShare(t.shares.baseline)}
            {hasPrice(t) ? (
              <span className="block text-xs text-dim">
                at the first boss: {pctShare(t.actOne.shares.arm)} against{" "}
                {pctShare(t.actOne.shares.baseline)}
              </span>
            ) : null}
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
                t.verdict === "passed"
                  ? "exact"
                  : t.verdict === "reversed"
                    ? "unverified"
                    : "neutral"
              }
            >
              {VERDICT_TEXT[t.verdict]}
            </Badge>
          </td>
        </>
      ) : (
        <td colSpan={5} className="py-2 text-muted">
          Not played: {why(k, d)}.
        </td>
      )}
    </tr>
  );
}

/** The Act-2 study (ADR-060) in the ledger of Methods: what was registered, how far it has got, and each held-out test as it came out. */
export function Act2Panel({ data = act2Data() }: { data?: Act2Data | null }) {
  const d = data;
  if (!d?.fit) return null;
  const stage = stageOf(d);
  const tests = d.tests;
  const played = KEYS.filter((k) => tests?.results[k] !== undefined);
  return (
    <Panel
      id="act2"
      className="scroll-mt-20"
      eyebrow="Registered study"
      title="Does anything change once the first boss is behind the run? (ADR-060)"
      headingLevel={2}
    >
      <div className="space-y-4 text-sm text-muted">
        <p>
          Does any rule for taking cards change how often a simulated run gets past the{" "}
          <strong className="text-parchment">second</strong> boss? Three pilots were registered
          against the baseline (the pilot that follows the shown card values): one that takes only
          cards worth 0.2 or more in every act (the old lead of ADR-036), one that is pickier only
          in Act 2, and one that follows card values refitted for the second boss, in Act 2 only. A
          development screen on other seeds chose which of them were played on held-out seeds
          {tests
            ? ` (${COUNT_WORD[played.length] ?? String(played.length)} of the three were)`
            : ""}
          . Each test pools the five classes into one exact McNemar test on {n(d.seeds)} held-out
          seeds a class and is read at {d.level.toFixed(4)} (0.05 divided by three) with a
          whole-seed interval that must exclude zero; how to read a result was fixed before any
          held-out game. Everything here is play by rules-based pilots in a simulator that has never
          been compared with the live game, at Ascension 0 with the relics kept: none of it is about
          winning or about a player.
        </p>
        {d.dev ? (
          <p>
            The screen{" "}
            {d.dev.P.advance
              ? `sent the pickier second act forward at the threshold ${String(d.dev.P.lateThreshold)}`
              : "sent no threshold for the second act forward"}{" "}
            and {d.dev.V.advance ? "sent" : "did not send"} the refitted values forward; its table
            is on the Insights page.
          </p>
        ) : null}
        {tests ? (
          <ScrollRegion label="The three held-out tests of the Act-2 study">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <caption className="sr-only">
                The three tests: the share past the Act-2 boss for the rule against the baseline,
                the difference with its interval, the pairs, the exact p and the reading
              </caption>
              <thead>
                <tr className="border-b border-line text-muted">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Test
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Past the second boss
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Difference ({((1 - d.level) * 100).toFixed(1)} % interval)
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
                {KEYS.map((k) => (
                  <Row key={k} k={k} t={tests.results[k]} d={d} />
                ))}
              </tbody>
            </table>
          </ScrollRegion>
        ) : (
          <p className="rounded-lg border border-line bg-charcoal/40 px-3 py-2 text-parchment">
            Where the study stands:{" "}
            {stage === "screen"
              ? "the fit is done and the development screen is read; the held-out games are not finished and none of their results has been read."
              : "the fit is done; the development screen has not been read and no held-out result exists."}
          </p>
        )}
        {tests && played.length > 0 ? (
          <Disclosure summary={<span>Each class on its own</span>}>
            <ScrollRegion label="The Act-2 tests, class by class">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <caption className="sr-only">
                  For each class and each test played: the share past the Act-2 boss for the rule
                  against the baseline, the difference and the exact p (each class on its own,
                  uncorrected)
                </caption>
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Class
                    </th>
                    {played.map((k) => (
                      <th key={k} scope="col" className="py-2 pr-3 font-medium">
                        {TEST_INFO[k].title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(tests.results[played[0] ?? "L"]?.perClass ?? []).map((c0, i) => (
                    <tr key={c0.character} className="border-b border-line/60 align-top">
                      <th scope="row" className="py-2 pr-3 text-left font-normal text-parchment">
                        {cap(c0.character)}
                      </th>
                      {played.map((k) => {
                        const c = tests.results[k]?.perClass[i];
                        return (
                          <td key={k} className="num py-2 pr-3 text-muted">
                            {c ? (
                              <>
                                {pctShare(c.shares.arm)} against {pctShare(c.shares.baseline)}
                                <span className="block text-xs text-dim">
                                  {pts(c.difference)} · {c.armOnly} / {c.baselineOnly} ·{" "}
                                  {formatP(c.p)}
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
              Secondary and uncorrected: ten class tests were read, so one of them being below 0.01
              is not a finding by itself; each class is shown so that a gain is not read as the same
              everywhere.
            </p>
          </Disclosure>
        ) : null}
        {tests ? (
          <Disclosure summary={<span>The records behind the tests</span>}>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                The baseline was played again for this study:{" "}
                <span className="num text-parchment">{n(tests.determinism.identical)}</span> of{" "}
                {n(tests.determinism.shared)} of its games are the games the baseline played for
                ADR-058 (the Ascension 0 twin of its Ascension 9 study), game for game
                {tests.determinism.different > 0
                  ? ` (${n(tests.determinism.different)} differ; the tests use the replayed baseline)`
                  : ""}
                .
              </li>
              <li>
                Every test was also read on the pairs whose two endpoints are known, with the games
                that ended in an error after the Act-2 boss counted as passes: a result is read as
                ahead or behind only if that check agrees at an exact p below 0.05 and at most a
                tenth of the pairs were dropped.{" "}
                {KEYS.flatMap((k) => {
                  const t = tests.results[k];
                  return t
                    ? [
                        `${k}: ${pts(t.robust.difference)} (exact ${formatP(t.robust.p)}, ${n(t.robust.pairs)} pairs)`,
                      ]
                    : [];
                }).join("; ")}
                .
              </li>
              <li>
                Files:{" "}
                {KEYS.flatMap((k) => {
                  const t = tests.results[k];
                  return t ? [`${t.file} (SHA-256 ${t.sha256.slice(0, 12)}…)`] : [];
                }).join("; ")}
                {d.dev ? `; ${d.dev.file} (SHA-256 ${d.dev.sha256.slice(0, 12)}…)` : ""}.
              </li>
            </ul>
          </Disclosure>
        ) : null}
        <p>
          The reading of the results, the fit that gave the refitted values and the development
          screen are on the{" "}
          <Link
            href="/insights#later"
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
