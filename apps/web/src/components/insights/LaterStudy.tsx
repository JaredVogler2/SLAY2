import { EvidenceBadge } from "@/components/insights/EvidenceBadge";
import { Badge } from "@/components/ui/Badge";
import { Disclosure } from "@/components/ui/Disclosure";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import {
  ARM_LABEL,
  CLASS_VERDICT_TEXT,
  TEST_INFO,
  VERDICT_TEXT,
  formatP,
  pctShare,
  pts,
  testSentence,
  thresholdLabel,
  type Act2Data,
  type Act2DevRow,
  type Act2FitClass,
  type Act2Test,
  type Act2TestKey,
} from "@/lib/act2";
import { classLabel } from "@/lib/insights-server";

const TH = "px-2 py-1.5 text-left text-xs font-medium text-dim";
const TD = "px-2 py-1.5 align-top text-sm";
const fixed = (x: number, d = 2): string => x.toFixed(d);
const signed = (x: number, d = 2): string => `${x >= 0 ? "+" : "−"}${Math.abs(x).toFixed(d)}`;
const n = (x: number): string => x.toLocaleString("en-US");

type NameOf = (id: string) => string;

function FitBlock({ data, nameOf }: { data: Act2Data; nameOf: NameOf }) {
  const fit = data.fit;
  if (!fit) return null;
  const fights = fit.classes.reduce((s, c) => s + c.bossFights, 0);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg text-parchment">What a card is worth at the second boss</h3>
        <EvidenceBadge kind="development" />
      </div>
      <p className="max-w-3xl text-sm text-muted">
        The values on this site are for the first boss. {n(fights)} of the randomised-drafting runs
        (60 % of their card picks were random, the relics kept) reached the second boss; for each
        class they were asked two things: how much of the shown ranking carries over, and whether
        any card is worth more or less there than that ranking says. A class is given values of its
        own only if they predict held-out second-boss fights better than the scaled ranking does, by
        at least {fixed(data.gate, 3)} nats a fight; otherwise it keeps the ranking it has.
      </p>
      <ScrollRegion label="Weight of the shown ranking at the second boss, by class">
        <table className="w-full min-w-[40rem] border-collapse">
          <caption className="sr-only">
            For each class: the runs that reached the Act-2 boss, how much of the shown ranking
            carries over, and whether a card-specific part was found
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={TH}>
                Class
              </th>
              <th scope="col" className={TH}>
                Runs at the second boss
              </th>
              <th scope="col" className={TH}>
                Weight of the shown ranking there (95 %)
              </th>
              <th scope="col" className={TH}>
                Cards worth more or less than that
              </th>
            </tr>
          </thead>
          <tbody>
            {fit.classes.map((c) => (
              <tr key={c.character} className="border-b border-line/60">
                <th scope="row" className={`${TD} font-medium text-parchment`}>
                  {classLabel(c.character)}
                </th>
                <td className={`${TD} num text-muted`}>
                  {n(c.bossFights)} · {n(c.passed)} got past
                </td>
                <td className={`${TD} num text-parchment`}>
                  {c.scaleOnly
                    ? `×${fixed(c.scaleOnly.estimate)}${c.scaleOnly.ci95 ? ` (${fixed(c.scaleOnly.ci95[0] ?? 0)} to ${fixed(c.scaleOnly.ci95[1] ?? 0)})` : ""}`
                    : "not fitted"}
                </td>
                <td className={`${TD} text-muted`}>{fitText(c, data.gate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      <p className="max-w-3xl text-xs text-dim">
        ×0.25 means that a card worth +1.0 at the first boss is worth about +0.25 at the second: the
        ranking carries over at a quarter of its strength. The intervals resample whole game seeds.
        The values are fitted to runs a rules pilot played with partly random picks, so a card that
        pilot plays badly is undervalued, and one hundred cards fitted to a few hundred passes leave
        each single card uncertain; that is why the tests below ask whether following them helps.
      </p>
      {fit.classes
        .filter((c) => c.fitted && c.moved.length > 0)
        .map((c) => (
          <Disclosure
            key={c.character}
            summary={
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span>{classLabel(c.character)}</span>
                <span className="num text-xs font-normal text-dim">
                  {c.movedCount} cards with an interval that excludes zero · {c.signFlips} change
                  sign
                </span>
              </span>
            }
          >
            <ScrollRegion
              label={`${classLabel(c.character)}: cards worth more or less at the second boss`}
            >
              <table className="w-full min-w-[34rem] border-collapse">
                <caption className="sr-only">
                  {classLabel(c.character)}: the cards whose value at the second boss differs most
                  from the shown one
                </caption>
                <thead>
                  <tr className="border-b border-line">
                    <th scope="col" className={TH}>
                      Card
                    </th>
                    <th scope="col" className={TH}>
                      First boss (shown)
                    </th>
                    <th scope="col" className={TH}>
                      Second boss
                    </th>
                    <th scope="col" className={TH}>
                      Left over after the scaled ranking (95 %)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {c.moved.map((m) => (
                    <tr key={m.id} className="border-b border-line/60">
                      <th scope="row" className={`${TD} font-normal text-parchment`}>
                        {nameOf(m.id)}
                      </th>
                      <td className={`${TD} num text-muted`}>{signed(m.shown)}</td>
                      <td className={`${TD} num text-muted`}>{signed(m.value)}</td>
                      <td className={`${TD} num text-muted`}>
                        {signed(m.delta)} ({signed(m.ci95[0] ?? 0)} to {signed(m.ci95[1] ?? 0)})
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </Disclosure>
        ))}
    </div>
  );
}

function fitText(c: Act2FitClass, gate: number): string {
  if (c.gain === null)
    return `too few runs to ask (${n(c.passed)} passed): the shown ranking is kept`;
  if (!c.fitted)
    return `none found (held-out gain ${signed(c.gain, 4)} nats a fight, below ${fixed(gate, 3)}): the shown ranking is kept`;
  return `found: ${c.movedCount} cards, held-out loss ${fixed(c.logLoss?.full ?? 0, 3)} against ${fixed(c.logLoss?.scaleOnly ?? 0, 3)} nats a fight with the scale alone; the refitted values are used in the tests`;
}

function ScreenBlock({ data }: { data: Act2Data }) {
  const dev = data.dev;
  if (!dev) return null;
  const pairs = Math.max(...dev.arms.map((r) => r.pairs));
  const row = (r: Act2DevRow) => (
    <tr key={r.arm} className="border-b border-line/60">
      <th scope="row" className={`${TD} font-normal text-parchment`}>
        {ARM_LABEL[r.arm] ?? r.arm}
        {r.lateThreshold !== null ? (
          <span className="block text-xs text-dim">{thresholdLabel(r.lateThreshold)}</span>
        ) : null}
      </th>
      <td className={`${TD} num text-muted`}>
        {pctShare(r.shares.arm)} against {pctShare(r.shares.baseline)}
      </td>
      <td className={`${TD} num text-parchment`}>{pts(r.difference)}</td>
      <td className={`${TD} num text-muted`}>
        {r.armOnly} / {r.baselineOnly} · p {formatP(r.p)}
      </td>
      <td className={TD}>
        {r.eligible ? (
          <Badge tone="neutral">went forward</Badge>
        ) : (
          <span className="text-dim">no</span>
        )}
      </td>
    </tr>
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg text-parchment">The development screen</h3>
        <EvidenceBadge kind="development" />
      </div>
      <p className="max-w-3xl text-sm text-muted">
        Before any held-out game, each candidate rule played {n(pairs)} paired games on development
        seeds, and a rule went forward only if it was ahead of the baseline and its exact p was
        below {data.screenLevel} (a generous screen, not evidence).{" "}
        {dev.P.advance
          ? `For the second act, the threshold that went forward is ${String(dev.P.lateThreshold)} (${thresholdLabel(dev.P.lateThreshold)}).`
          : "No threshold for the second act qualified, so no pickier second act was tested on held-out seeds."}{" "}
        {dev.V.advance
          ? "The refitted values went forward."
          : dev.V.anyClassFitted
            ? "The refitted values did not qualify, so they were not tested on held-out seeds."
            : "No class kept values of its own, so there was nothing to test."}
      </p>
      <ScrollRegion label="The development screen: each candidate rule against the baseline">
        <table className="w-full min-w-[40rem] border-collapse">
          <caption className="sr-only">
            The candidate rules on development seeds: the share past the Act-2 boss against the
            baseline&rsquo;s, the difference, the pairs in which only the rule or only the baseline
            got past it, and whether the rule went forward
          </caption>
          <thead>
            <tr className="border-b border-line">
              <th scope="col" className={TH}>
                Rule
              </th>
              <th scope="col" className={TH}>
                Past the second boss
              </th>
              <th scope="col" className={TH}>
                Difference
              </th>
              <th scope="col" className={TH}>
                Only the rule / only the baseline
              </th>
              <th scope="col" className={TH}>
                Screen
              </th>
            </tr>
          </thead>
          <tbody>{dev.arms.map(row)}</tbody>
        </table>
      </ScrollRegion>
    </div>
  );
}

function TestCard({ t, data }: { t: Act2Test; data: Act2Data }) {
  const info = TEST_INFO[t.key];
  const tone =
    t.verdict === "passed" ? "exact" : t.verdict === "reversed" ? "unverified" : "neutral";
  return (
    <div className="rounded-xl border border-line bg-charcoal/40 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-base text-parchment">{info.title}</h4>
        <EvidenceBadge kind="registered" />
        <Badge tone={tone}>{VERDICT_TEXT[t.verdict]}</Badge>
      </div>
      <p className="mt-1 text-sm text-muted">{info.asks}</p>
      <p className="mt-2 text-sm text-parchment">{testSentence(t)}</p>
      <p className="num mt-1 text-xs text-dim">
        {t.armOnly} pairs in which only the rule got past the second boss, {t.baselineOnly} in which
        only the baseline did · read at {fixed(data.level, 4)} (the study-wise 0.05 divided by
        three)
        {t.key === "L"
          ? ` · past the first boss: ${pctShare(t.actOne.shares.arm)} against ${pctShare(t.actOne.shares.baseline)}`
          : ""}
      </p>
      <Disclosure summary={<span>Each class on its own</span>}>
        <ScrollRegion label={`${info.title}: each class on its own`}>
          <table className="w-full min-w-[32rem] border-collapse">
            <caption className="sr-only">
              {info.title}: each class&rsquo;s paired games at the second boss
            </caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={TH}>
                  Class
                </th>
                <th scope="col" className={TH}>
                  Past the second boss
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
                    {pctShare(c.shares.arm)} against {pctShare(c.shares.baseline)}
                  </td>
                  <td className={`${TD} num text-parchment`}>{pts(c.difference)}</td>
                  <td className={`${TD} num text-muted`}>
                    {c.armOnly} / {c.baselineOnly} · p {formatP(c.p)}
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

function notPlayed(key: Act2TestKey, data: Act2Data): string {
  if (key === "P")
    return "No threshold for the second act qualified in the development screen, so it was not played on held-out seeds.";
  return data.dev?.V.anyClassFitted
    ? "The refitted values did not qualify in the development screen, so they were not played on held-out seeds."
    : "No class kept values of its own, so there was nothing to play.";
}

function TestsBlock({ data }: { data: Act2Data }) {
  const tests = data.tests;
  if (!tests) return null;
  const keys: readonly Act2TestKey[] = ["L", "P", "V"];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg text-parchment">The held-out tests</h3>
        <EvidenceBadge kind="registered" />
      </div>
      <p className="max-w-3xl text-sm text-muted">
        Each rule played the same {n(data.seeds)} held-out seeds in each of the five classes as the
        baseline (the pilot that follows the shown values), with the relics kept, and was compared
        pair by pair on whether the run got past the second boss. The rule for reading each result
        was registered before any of these games: ahead only if the exact p is below{" "}
        {fixed(data.level, 4)}, the rule is ahead, and the whole-seed interval at that level
        excludes zero.
      </p>
      <div className="space-y-3">
        {keys.map((k) => {
          const t = tests.results[k];
          return t ? (
            <TestCard key={k} t={t} data={data} />
          ) : (
            <div key={k} className="rounded-xl border border-line bg-charcoal/40 p-4">
              <h4 className="text-base text-parchment">{TEST_INFO[k].title}</h4>
              <p className="mt-1 text-sm text-muted">{notPlayed(k, data)}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** What changes once the first boss is behind the run: the Act-2 study (ADR-060), at whichever stage the repository has reached. */
export function LaterStudy({ data, nameOf }: { data: Act2Data; nameOf: NameOf }) {
  return (
    <div className="space-y-8">
      <p className="max-w-3xl text-sm text-muted">
        The card values on this site are for getting past the first boss. This study asked three
        things about what happens after it, and fixed how each would be read before any game of it
        was played ({data.adr}). Every answer is about the rules-playing pilots of this project in a
        simulator that has never been compared with the live game; none is about winning, which
        these pilots do very rarely, or about a player.
      </p>
      {data.tests ? null : (
        <p className="max-w-3xl rounded-lg border border-line bg-charcoal/40 px-3 py-2 text-sm text-parchment">
          Where the study stands:{" "}
          {data.dev
            ? "the fit is done and the development screen is read; the held-out games have not been played, so there is no test result yet."
            : "the fit is done; the development screen and the held-out games have not been played, so there is no test result yet."}
        </p>
      )}
      <FitBlock data={data} nameOf={nameOf} />
      <ScreenBlock data={data} />
      <TestsBlock data={data} />
    </div>
  );
}
