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
  pctShare,
  pts,
  stageOf,
  type Act2Data,
  type Act2Test,
  type Act2TestKey,
} from "@/lib/act2";

const n = (x: number): string => x.toLocaleString("en-US");
const KEYS: readonly Act2TestKey[] = ["L", "P", "V"];

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
              {t.armOnly} / {t.baselineOnly} discordant
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
          Three pilots were compared with the baseline (the pilot that follows the shown card
          values) on whether the run got past the <strong className="text-parchment">second</strong>{" "}
          boss: one that takes only cards worth 0.2 or more in every act (the old lead of ADR-036),
          one that is pickier only in Act 2, and one that follows card values refitted for the
          second boss, in Act 2 only. Each test pools the five classes into one exact McNemar test
          on {n(d.seeds)} held-out seeds a class with the relics kept, and is read at{" "}
          {d.level.toFixed(4)} (0.05 divided by three) with a whole-seed interval that must exclude
          zero. Which of the pickier-Act-2 thresholds and whether the refitted values were played
          was decided by a rule written down before the development games.
        </p>
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
                    Difference (interval at {d.level.toFixed(4)})
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
              ? "the fit is done and the development screen is read; the held-out games have not been played."
              : "the fit is done; the development screen and the held-out games have not been played."}
          </p>
        )}
        {tests ? (
          <Disclosure summary={<span>The records behind the tests</span>}>
            <ul className="list-disc space-y-1.5 pl-5">
              <li>
                The baseline was played again for this study:{" "}
                <span className="num text-parchment">{n(tests.determinism.identical)}</span> of{" "}
                {n(tests.determinism.shared)} of its games are the games the Ascension 9 study
                played earlier, game for game
                {tests.determinism.different > 0
                  ? ` (${n(tests.determinism.different)} differ; the tests use the replayed baseline)`
                  : ""}
                .
              </li>
              {tests.robustness ? (
                <li>
                  Post hoc, not the registered endpoint: with the games that ended in a simulator
                  error kept and scored by the floor they had reached, the pooled differences are{" "}
                  {KEYS.flatMap((k) => {
                    const r = tests.robustness?.[k];
                    return r ? [`${k} ${pts(r.difference)} (exact ${formatP(r.p)})`] : [];
                  }).join(", ")}
                  .
                </li>
              ) : null}
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
