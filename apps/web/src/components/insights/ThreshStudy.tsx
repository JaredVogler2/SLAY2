import { EvidenceBadge } from "@/components/insights/EvidenceBadge";
import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { classLabel } from "@/lib/insights-server";
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
  verdictText,
  verificationNote,
  type ThreshData,
  type ThreshScreen,
  type ThreshTest,
} from "@/lib/thresh";

const TH = "px-2 py-1.5 text-left text-xs font-medium text-dim";
const TD = "px-2 py-1.5 align-top text-sm";
const n = (x: number): string => x.toLocaleString("en-US");

/** The six thresholds of the development screen by their net wins against the baseline: a dose-response picture with the numbers beside the bars. */
function DoseResponse({ screen }: { screen: ThreshScreen }) {
  const max = Math.max(1, ...THRESH_TAGS.map((tag) => Math.abs(screen.rows[tag].net)));
  return (
    <ScrollRegion label="Net wins against the baseline for each threshold, on the development seeds">
      <table className="w-full min-w-[30rem] border-collapse">
        <caption className="sr-only">
          Net wins against the baseline for each threshold of the card reward of Act 2 (games only
          the threshold won minus games only the baseline won), on the development seeds
        </caption>
        <thead>
          <tr className="border-b border-line">
            <th scope="col" className={TH}>
              Threshold
            </th>
            <th scope="col" className={TH}>
              Net wins
            </th>
            <th scope="col" className={TH}>
              <span className="sr-only">Bar</span>
            </th>
            <th scope="col" className={TH}>
              Mean final deck
            </th>
          </tr>
        </thead>
        <tbody>
          {THRESH_TAGS.map((tag) => {
            const r = screen.rows[tag];
            const width = `${String(Math.round((Math.abs(r.net) / max) * 100))}%`;
            return (
              <tr key={tag} className="border-b border-line/60">
                <th scope="row" className={`${TD} font-normal text-parchment`}>
                  {THRESHOLD_TEXT[tag]}
                </th>
                <td className={`${TD} num text-parchment`}>
                  {netText(r.net)}
                  <span className="block text-xs text-dim">
                    {n(r.armOnly)} / {n(r.baselineOnly)} discordant · {formatP(r.p)}
                  </span>
                </td>
                <td className={`${TD} w-1/3`} aria-hidden="true">
                  <div className="h-3 rounded bg-ink-2">
                    <div
                      className={`h-3 rounded ${r.net >= 0 ? "bg-teal/70" : "bg-rose/70"}`}
                      style={{ width }}
                    />
                  </div>
                </td>
                <td className={`${TD} num text-muted`}>
                  {r.meanDeckSize?.arm == null ? "-" : r.meanDeckSize.arm.toFixed(1)} cards
                  <span className="block text-xs text-dim">
                    against{" "}
                    {r.meanDeckSize?.baseline == null ? "-" : r.meanDeckSize.baseline.toFixed(1)}
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

function TestCard({ t, level }: { t: ThreshTest; level: number }) {
  const info = testInfo(t);
  const tone =
    t.verdict === "passed" ? "exact" : t.verdict === "reversed" ? "unverified" : "neutral";
  const disagreement = verificationNote(t);
  return (
    <div className="rounded-xl border border-line bg-charcoal/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-base text-parchment">{info.title}</h4>
        <EvidenceBadge kind="registered" />
        <Badge tone={tone}>{verdictText(t)}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">{info.asks}</p>
      <p className="mt-2 text-sm text-parchment">{testSentence(t, level)}</p>
      {t.narrow ? <p className="mt-1 text-sm text-parchment">{narrowSentence(t)}</p> : null}
      <p className="mt-1 text-xs text-muted">
        {n(t.excluded)} of {n(t.pairedSeeds)} pairs were left out of the first analysis because a
        game did not finish (a simulator error, a step or turn limit or a timeout), never read as a
        loss. The share of the paired games that got past the second boss was{" "}
        {pctShare(t.actTwo.shares.arm, 1)} against {pctShare(t.actTwo.shares.baseline, 1)}.
      </p>
      <p className="mt-1 text-xs text-muted">{robustSentence(t)}</p>
      {t.downgrade !== null ? <p className="mt-1 text-xs text-rose">{downgradeNote(t)}</p> : null}
      {disagreement ? <p className="mt-1 text-xs text-muted">{disagreement}</p> : null}
      <p className="num mt-1 text-xs text-dim">
        {n(t.armOnly)} pairs in which only the arm won, {n(t.baselineOnly)} in which only its
        baseline did · {n(t.wins.arm)} against {n(t.wins.baseline)} games won · read at{" "}
        {levelText(level)} confidence
      </p>
      <Disclosure
        summary={
          <span>
            Each class on its own<span className="sr-only"> ({info.title})</span>
          </span>
        }
      >
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
                  Only the arm / only the baseline
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

/** Does the Act-2 result hold on new seeds, and is another threshold better? The threshold study (ADR-062), at whichever stage the repository has reached. */
export function ThreshStudy({ data }: { data: ThreshData }) {
  const { screen, tests } = data;
  const played = tests
    ? tests.order.flatMap((k) => {
        const t = tests.results[k];
        return t ? [t] : [];
      })
    : [];
  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-muted">
        The study of the acts (ADR-061) found that a pilot which takes a card in the second act only
        if it is worth more than 0.2 won a few more games than the baseline, a narrow result of one
        test of four, and the threshold 0.2 had never been compared with another on wins. This study
        asks again on seeds nobody has played, in the two classes that win (Ironclad and Defect),
        and screens six thresholds first ({data.adr}): the choice of the screen goes forward only by
        a rule fixed beforehand. The rule for reading each test was fixed before any of its games
        was played. Every answer is about the rules-playing pilots of this project in a simulator
        that is unverified against the live game, at Ascension 0 with the relics kept, and these
        pilots win very few games, so a difference is a few tenths of a point of the share of games
        won; none of it is about a player.
      </p>
      {screen ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg text-parchment">
              How the six thresholds did on the development seeds
            </h3>
            <EvidenceBadge kind="development" />
          </div>
          <p className="max-w-3xl text-sm text-muted">
            {n(data.devSeeds)} seeds of each class that nobody had played, read once. This is a
            nomination, not a result: the registered rule takes the threshold with the most net wins
            and sends it forward only if it beats 0.2 head to head. Simulating that rule, the record
            found that it sends something forward in about a quarter of the draws even when no
            threshold does anything, so what follows is weak evidence, and nothing sent forward is
            not evidence that thresholds are alike.
          </p>
          <DoseResponse screen={screen} />
          <p className="max-w-3xl text-sm text-parchment">{screenSentence(screen)}</p>
        </div>
      ) : null}
      {tests ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg text-parchment">The held-out tests</h3>
            <EvidenceBadge kind="registered" />
          </div>
          <p className="max-w-3xl text-base text-parchment">{resultLine(tests.results)}</p>
          <p className="max-w-3xl text-sm text-muted">
            Each arm played the same {n(data.seeds)} held-out seeds in each of the two classes as
            its baseline, with the relics kept, and was compared pair by pair on whether the game
            was won. Each test is read at {tests.levelLabel} ({levelText(tests.level)} confidence):
            the arm wins more only if the exact p is below that, the arm is ahead, the whole-seed
            interval at that level excludes zero, a second analysis on all pairs (a game that did
            not end in a win counts as not won) shows the same difference at an exact p below 0.05,
            and no more than a tenth of the pairs were dropped. The tests share games, so they are
            not independent, and a result of &ldquo;not shown&rdquo; is not &ldquo;no effect&rdquo;.
          </p>
          <div className="space-y-3">
            {played.map((t) => (
              <TestCard key={t.key} t={t} level={tests.level} />
            ))}
          </div>
          <div className="space-y-2 rounded-xl border border-line bg-charcoal/40 p-4">
            <h4 className="text-base text-parchment">What the results mean</h4>
            {meaningOf(tests.results).map((s) => (
              <p key={s} className="text-sm text-muted">
                {s}
              </p>
            ))}
          </div>
          <div className="space-y-2 rounded-xl border border-line bg-charcoal/40 p-4">
            <h4 className="text-base text-parchment">What this changes for the advisor</h4>
            {advisorNote(tests.results).map((s) => (
              <p key={s} className="text-sm text-muted">
                {s}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <p className="max-w-3xl rounded-lg border border-line bg-charcoal/40 px-3 py-2 text-sm text-parchment">
          Where the study stands:{" "}
          {screen
            ? "the development screen has been read once and the held-out games have not all been played and read, so there is no test result yet."
            : "it is registered and its games have not all been played and read, so there is no result yet."}{" "}
          The registration also states what the sample can and cannot see: if the true effect of 0.2
          is a third the size ADR-061 saw, the replication has between about one chance in three and
          one in two of showing it (it depends on whether the screen sends another threshold
          forward, which splits the level), so &ldquo;not shown&rdquo; is a likely result even if
          the effect is real.
        </p>
      )}
    </div>
  );
}
