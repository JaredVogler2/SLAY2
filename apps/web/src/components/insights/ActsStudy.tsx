import { EvidenceBadge } from "@/components/insights/EvidenceBadge";
import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import {
  ACTS_KEYS,
  CLASS_VERDICT_TEXT,
  TEST_INFO,
  VERDICT_TEXT,
  actThreeNote,
  bossSentence,
  downgradeNote,
  excludedSentence,
  formatP,
  meaningOf,
  pctShare,
  pts,
  robustSentence,
  testSentence,
  verificationNote,
  type ActsData,
  type ActsTest,
} from "@/lib/acts";
import { classLabel } from "@/lib/insights-server";

const TH = "px-2 py-1.5 text-left text-xs font-medium text-dim";
const TD = "px-2 py-1.5 align-top text-sm";
const n = (x: number): string => x.toLocaleString("en-US");

function TestCard({ t, data }: { t: ActsTest; data: ActsData }) {
  const info = TEST_INFO[t.key];
  const tone =
    t.verdict === "passed" ? "exact" : t.verdict === "reversed" ? "unverified" : "neutral";
  const disagreement = verificationNote(t);
  return (
    <div className="rounded-xl border border-line bg-charcoal/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-base text-parchment">{info.title}</h4>
        <EvidenceBadge kind="registered" />
        <Badge tone={tone}>{VERDICT_TEXT[t.verdict]}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">{info.asks}</p>
      <p className="mt-2 text-sm text-parchment">{testSentence(t)}</p>
      <p className="mt-1 text-sm text-parchment">{bossSentence(t)}</p>
      <p className="mt-1 text-xs text-muted">{excludedSentence(t)}</p>
      <p className="mt-1 text-xs text-muted">{robustSentence(t)}</p>
      {t.downgrade !== null ? <p className="mt-1 text-xs text-rose">{downgradeNote(t)}</p> : null}
      {disagreement ? <p className="mt-1 text-xs text-muted">{disagreement}</p> : null}
      <p className="num mt-1 text-xs text-dim">
        {n(t.armOnly)} pairs in which only the rule won, {n(t.baselineOnly)} in which only the
        baseline did · {n(t.wins.arm)} against {n(t.wins.baseline)} games won · read at{" "}
        {data.level.toFixed(4)} (the study-wise 0.05 divided by four)
      </p>
      <Disclosure summary={<span>Each class on its own</span>}>
        <ScrollRegion label={`${info.title}: each class on its own`}>
          <table className="w-full min-w-[32rem] border-collapse">
            <caption className="sr-only">
              {info.title}: each class&rsquo;s paired games, the share won
            </caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={TH}>
                  Class
                </th>
                <th scope="col" className={TH}>
                  Games won
                </th>
                <th scope="col" className={TH}>
                  Difference
                </th>
                <th scope="col" className={TH}>
                  Only the rule / only the baseline
                </th>
                <th scope="col" className={TH}>
                  At 0.01 on its own
                </th>
              </tr>
            </thead>
            <tbody>
              {t.perClass.map((c) => (
                <tr key={c.character} className="border-b border-line/60">
                  <th scope="row" className={`${TD} font-normal text-parchment`}>
                    {classLabel(c.character)}
                  </th>
                  <td className={`${TD} num text-muted`}>
                    {pctShare(c.shares.arm)} against {pctShare(c.shares.baseline)} ({c.wins.arm} /{" "}
                    {c.wins.baseline})
                  </td>
                  <td className={`${TD} num text-parchment`}>{pts(c.difference)}</td>
                  <td className={`${TD} num text-muted`}>
                    {c.armOnly} / {c.baselineOnly} · {formatP(c.p)}
                  </td>
                  <td className={`${TD} text-muted`}>{CLASS_VERDICT_TEXT[c.verdict]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </Disclosure>
    </div>
  );
}

function TestsBlock({ data }: { data: ActsData }) {
  const tests = data.tests;
  if (!tests) return null;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg text-parchment">The held-out tests</h3>
        <EvidenceBadge kind="registered" />
      </div>
      <p className="max-w-3xl text-sm text-muted">
        Each pilot played the same {n(data.seeds)} held-out seeds in each of the five classes as the
        baseline (the pilot that follows the shown values), with the relics kept, and was compared
        pair by pair on whether the game was won. The rule for reading each result was registered
        before any of these games: it wins more only if the exact p is below {data.level.toFixed(4)}
        , the rule is ahead, the whole-seed interval at that level excludes zero, a second analysis
        on all pairs (a game that did not end in a win counts as not won) shows the same difference
        at an exact p below 0.05, and no more than a tenth of the pairs were dropped. The four tests
        share the baseline&rsquo;s games, so they are not independent, and a result of &ldquo;not
        shown&rdquo; is not &ldquo;no effect&rdquo;.
      </p>
      <div className="space-y-3">
        {ACTS_KEYS.map((k) => (
          <TestCard key={k} t={tests.results[k]} data={data} />
        ))}
      </div>
      <div className="space-y-2 rounded-xl border border-line bg-charcoal/40 p-4">
        <h4 className="text-base text-parchment">What the four results mean together</h4>
        {meaningOf(tests.results).map((s) => (
          <p key={s} className="text-sm text-muted">
            {s}
          </p>
        ))}
        <p className="text-xs text-dim">{actThreeNote(tests.results.A3)}</p>
      </div>
    </div>
  );
}

/** Does a pickier card rule win more games, and in which act? The acts study (ADR-061), at whichever stage the repository has reached. */
export function ActsStudy({ data }: { data: ActsData }) {
  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-muted">
        The study of the second boss (ADR-060) found that a pilot which takes only cards worth 0.2
        or more gets more of its runs past the second boss, at a price at the first. This study asks
        the question that matters more, whether such a pilot wins more games, and which act&rsquo;s
        picks carry it. It fixed how each of four tests would be read, and what every combination of
        results would mean, before any of its games was played ({data.adr}): the old lead, and a
        pilot that is pickier in Act 1 only, in Act 2 only and in Act 3 only, each against the
        baseline, on {n(data.seeds)} seeds of each class that no earlier study used. Every answer is
        about the rules-playing pilots of this project in a simulator that is unverified against the
        live game, at Ascension 0 with the relics kept. These pilots win very few games, almost all
        of them with Ironclad and Defect, so a difference in wins is a difference of a few points at
        most, and none of it is about a player.
      </p>
      {data.tests ? null : (
        <p className="max-w-3xl rounded-lg border border-line bg-charcoal/40 px-3 py-2 text-sm text-parchment">
          Where the study stands: it is registered and its held-out games have not all been played
          and read, so there is no result yet. The registration also states what the sample can and
          cannot see: the pilot that is pickier in Act 3 only can differ from the baseline only in
          the runs that reach Act 3, so &ldquo;not shown&rdquo; is the expected result for it
          whatever the effect.
        </p>
      )}
      <TestsBlock data={data} />
    </div>
  );
}
