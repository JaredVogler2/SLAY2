import type { Metadata } from "next";

import { CardValuesPanel } from "@/components/methods/CardValuesPanel";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import evidence from "@/content/evidence.generated.json";
import {
  GROUP_LABEL,
  comparisonSentence,
  formatP,
  largestReport,
  policyLabel,
  pct,
  ruleSummary,
  rulesBySection,
  signed,
  statusGroup,
  totals,
  verification,
  winSentence,
  type StatusGroup,
} from "@/lib/methods-data";

export const metadata: Metadata = {
  title: "Evidence & Methods",
  description:
    "Every rule SLAY2 uses with its evidence class, the verification layers behind the exact odds, and every simulator result with its sample size, interval and known gaps.",
};

const GROUP_TONE: Record<StatusGroup, BadgeTone> = {
  verified: "exact",
  corroborated: "build",
  secondary: "unverified",
  recorded: "neutral",
};

const NOT_EVALUATED = [
  [
    "Advisor win delta",
    "The card advisor's own index is still a heuristic and says so. Measured values from simulated runs exist (above and on the codex) and a policy that follows them beat the hand-written ratings in simulation, but the advisor does not use them yet and nothing here is a win probability for the live game.",
  ],
  [
    "Live-game parity of the simulator",
    "Not verified: no owned game copy was available. Simulator win rates are model output.",
  ],
  [
    "Beta build v0.111.0",
    "Unsupported: rules not verified (card rarities and the White Beast Statue potion interaction already differ).",
  ],
  [
    "Co-op",
    "Unsupported: per-seat odds exist in the game, scaling and shared decisions are unverified.",
  ],
  [
    "Neural policies",
    "None deployed, and no advice on this site comes from a neural network. A research combat network trained locally has not beaten the rules baseline on held-out simulated combats (record: experiments/rl/results in the repository).",
  ],
] as const;

export default function MethodsPage() {
  const summary = ruleSummary();
  const sections = rulesBySection();
  const reports = evidence.reports;
  const comparisons = evidence.comparisons;
  const total = totals();
  const randomPolicy = largestReport("random_legal");
  const rulesPolicy = largestReport("rules_v1");
  return (
    <div className="mx-auto w-full max-w-6xl space-y-10 px-4 py-10 sm:px-6">
      <header className="max-w-3xl">
        <p className="eyebrow mb-3">Evidence &amp; methods</p>
        <h1 className="text-3xl leading-tight text-parchment sm:text-4xl">
          A ledger, not a leaderboard
        </h1>
        <p className="mt-4 text-lg text-muted">
          Every number on this site is either exact arithmetic over a rule listed below, a clearly
          labelled heuristic, or a measured simulator result with its sample size and interval.
          Where nothing has been measured, this page says “not yet evaluated”. Last audited rules
          apply to Slay the Spire 2{" "}
          <strong className="font-medium text-parchment">main v0.107.1</strong>.
        </p>
      </header>

      <Panel
        eyebrow="Rule register"
        title={`${String(Object.values(summary).reduce((a, b) => a + b, 0))} rules, each with its evidence`}
        headingLevel={2}
      >
        <ul
          className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Rules by evidence status"
        >
          {(Object.keys(summary) as StatusGroup[]).map((g) => (
            <li key={g} className="rounded-xl border border-line bg-charcoal/40 p-4">
              <p className="num font-display text-3xl text-parchment">{summary[g]}</p>
              <p className="mt-1 text-sm text-muted">{GROUP_LABEL[g]}</p>
            </li>
          ))}
        </ul>
        <p className="mb-6 max-w-3xl text-sm text-muted">
          Evidence classes: <strong className="font-medium text-parchment">E1</strong> inspection of
          the game’s own logic for v0.107.1 (read-only, local, nothing redistributed) ·{" "}
          <strong className="font-medium text-parchment">E2</strong> official Mega Crit statements ·{" "}
          <strong className="font-medium text-parchment">E3/E4/E5</strong> published wikis and
          calculators · <strong className="font-medium text-parchment">E6</strong> SLAY2’s own exact
          computation. A rule is “verified” only when its logic was read or officially stated, not
          merely repeated by a wiki.
        </p>
        <div className="space-y-6">
          {sections.map(({ section, rows }) => (
            <section key={section} aria-label={section}>
              <h3 className="mb-2 font-display text-lg text-gold">{section}</h3>
              <ScrollRegion label={`Rules: ${section}`}>
                <table className="w-full min-w-[40rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-muted">
                      <th scope="col" className="w-24 py-2 pr-3 font-medium">
                        Rule
                      </th>
                      <th scope="col" className="py-2 pr-3 font-medium">
                        What the game does
                      </th>
                      <th scope="col" className="w-56 py-2 font-medium">
                        Evidence
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={r.id} id={r.id} className="align-top target:bg-copper/10">
                        <th scope="row" className="py-3 pr-3 font-mono text-xs text-teal">
                          {r.id}
                        </th>
                        <td className="py-3 pr-3 text-parchment">{r.text}</td>
                        <td className="py-3 text-muted">
                          <p>{r.evidence}</p>
                          {r.status ? (
                            <p className="mt-1.5">
                              <Badge tone={GROUP_TONE[statusGroup(r)]}>
                                {r.status.split(" ")[0]}
                              </Badge>
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </ScrollRegion>
            </section>
          ))}
        </div>
      </Panel>

      <Panel
        eyebrow="How the exact odds are checked"
        title="Four independent layers"
        headingLevel={2}
      >
        <ol className="grid gap-4 md:grid-cols-2">
          {[
            [
              "Independent implementation",
              `A separate Python oracle (exact fractions) generated ${String(verification.goldenCases)} golden cases across ${String(verification.goldenKinds.length)} kinds of question; the TypeScript engine must match every one with exact equality.`,
            ],
            [
              "Published tables",
              "The pity-offset table (28 cells, A0 and A7), base odds, after-a-rare chances, run averages, the “?” table, shop price ranges, card removal and gold ranges are asserted against what the wikis publish.",
            ],
            [
              "Brute force and properties",
              "Hypergeometric draws are compared with explicit subset enumeration, reshuffles with permutations, and posteriors with enumeration of every outcome path. Property tests cover distributions that must sum to exactly one.",
            ],
            [
              "Mutation checks",
              "Deliberately changing a rule constant (the A7 rate, the boss reset) makes the suite fail, which shows the tests can see the rules they claim to protect.",
            ],
          ].map(([title, body]) => (
            <li key={title} className="rounded-xl border border-line bg-charcoal/40 p-4">
              <p className="font-display text-lg text-parchment">{title}</p>
              <p className="mt-2 text-sm text-muted">{body}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-muted">
          Known limit: the game compares 32-bit floats, SLAY2 uses ideal decimals; the difference is
          below 1e-6 and is stated on every result.
        </p>
      </Panel>

      <Panel
        eyebrow="Simulator results · research only"
        title="What a third-party simulator says about simple policies"
        aside={<Badge tone="unverified">Parity with the live game unverified</Badge>}
        headingLevel={2}
      >
        <p className="mb-4 max-w-3xl text-muted">
          These runs use a community Python re-implementation of STS2, driven by SLAY2’s own harness
          (it classifies simulator errors and timeouts instead of counting them as losses). They are
          baselines for building better policies, not statements about real win rates.{" "}
          {total.wins === 0 ? (
            <>
              <strong className="font-medium text-parchment">
                No policy has won a single simulated game so far
              </strong>
              ; the intervals show how little that rules out.
            </>
          ) : (
            <>
              <strong className="font-medium text-parchment">{winSentence()}</strong>; the intervals
              below show how uncertain each batch is.
            </>
          )}
        </p>
        <ScrollRegion label="Simulator batches">
          <table className="w-full min-w-[56rem] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-muted">
                <th scope="col" className="py-2 pr-3 font-medium">
                  Policy
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Cohort
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Completed games
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Wins
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Win rate (95% Wilson)
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  Mean floor
                </th>
                <th scope="col" className="py-2 font-medium">
                  Partition
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {reports.map((r) => (
                <tr key={r.id} className="align-top">
                  <th scope="row" className="py-3 pr-3 font-medium text-parchment">
                    {policyLabel({ policy: r.policy, params: r.policyParams })}
                    {r.preIsolation ? (
                      <span className="mt-1 block">
                        <Badge
                          tone="unverified"
                          title="Search on clones advanced the live game's card-id counter when this batch was produced (ADR-035): a valid simulated game, but its action trace does not replay"
                        >
                          before isolation fix
                        </Badge>
                      </span>
                    ) : null}
                    <span className="block font-mono text-[0.65rem] font-normal text-dim">
                      {r.id}
                    </span>
                  </th>
                  <td className="py-3 pr-3 text-muted">
                    {r.character} A{r.ascension} ·{" "}
                    {r.profile === "veteran" ? "veteran profile" : "first-run (scripted)"}
                  </td>
                  <td className="num py-3 pr-3">{r.completed}</td>
                  <td className="num py-3 pr-3">{r.counts.win}</td>
                  <td className="num py-3 pr-3">
                    {pct(r.winRate)}{" "}
                    <span className="text-muted">
                      ({pct(r.winRateWilson95[0] ?? 0)}–{pct(r.winRateWilson95[1] ?? 0)})
                    </span>
                  </td>
                  <td className="num py-3 pr-3">{r.meanFloor}</td>
                  <td className="py-3 text-muted">{r.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
        {comparisons.length > 0 ? (
          <div className="mt-6">
            <h3 className="mb-2 font-display text-lg text-gold">Paired comparisons</h3>
            <p className="mb-3 max-w-3xl text-sm text-muted">
              Two policies played the same seeds, so the difference is measured seed by seed. Only
              seeds where both reached a win or a death count; anything else is listed as excluded,
              never scored as a loss.
            </p>
            <ScrollRegion label="Paired comparisons">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      A vs B
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Paired games
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Mean floor A · B
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      A − B (95% bootstrap)
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Past the Act-1 boss A · B
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Wins A · B
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Partition
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {comparisons.map((c) => (
                    <tr key={c.id} className="align-top">
                      <th scope="row" className="py-3 pr-3 font-medium text-parchment">
                        {policyLabel(c.a)} vs {policyLabel(c.b)}
                        {c.preIsolation ? (
                          <span className="mt-1 block">
                            <Badge
                              tone="unverified"
                              title="A search batch in this comparison was produced before the isolation fix (ADR-035)"
                            >
                              before isolation fix
                            </Badge>
                          </span>
                        ) : null}
                        <span className="block font-mono text-[0.65rem] font-normal text-dim">
                          {c.cohort.character} A{c.cohort.ascension} · {c.cohort.profile} · sha{" "}
                          {c.contentSha256.slice(0, 10)}
                        </span>
                      </th>
                      <td className="num py-3 pr-3">
                        {c.bothCompleted}
                        {c.excludedNotCompleted > 0
                          ? ` (+${String(c.excludedNotCompleted)} excluded)`
                          : ""}
                      </td>
                      <td className="num py-3 pr-3">
                        {c.a.meanFloor.toFixed(2)} · {c.b.meanFloor.toFixed(2)}
                      </td>
                      <td className="num py-3 pr-3">
                        {signed(c.floorDifference.meanAMinusB)}{" "}
                        <span className="text-muted">
                          ({signed(c.floorDifference.ci95[0] ?? 0)} to{" "}
                          {signed(c.floorDifference.ci95[1] ?? 0)})
                        </span>
                      </td>
                      <td className="num py-3 pr-3">
                        {pct(c.reachedAct2.a.rate, 1)} · {pct(c.reachedAct2.b.rate, 1)}
                        <span className="block text-xs text-muted">
                          {formatP(c.reachedAct2.pairedTable.mcnemar_p)}
                        </span>
                      </td>
                      <td className="num py-3 pr-3">
                        {c.a.wins} · {c.b.wins}
                      </td>
                      <td className="py-3 text-muted">{c.role}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
          </div>
        ) : null}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
            <p className="font-medium text-parchment">Reading these honestly</p>
            <ul className="mt-2 list-disc space-y-1.5 pl-5">
              {randomPolicy && rulesPolicy ? (
                <li>
                  For {rulesPolicy.character}, mean floor rises from{" "}
                  {randomPolicy.meanFloor.toFixed(1)} (random legal moves, {randomPolicy.completed}{" "}
                  games) to {rulesPolicy.meanFloor.toFixed(1)} (hand-written rules,{" "}
                  {rulesPolicy.completed} games), so the harness does measure skill.
                </li>
              ) : null}
              {comparisons.map((c) => (
                <li key={c.id}>{comparisonSentence(c)}</li>
              ))}
              <li>
                Batches on the “train” partition are development results, not held-out evidence.
              </li>
              <li>
                Ascension 10 results from this simulator would not be Double Boss results (see
                gaps).
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-line bg-charcoal/40 p-4 text-sm text-muted">
            <p className="font-medium text-parchment">Known simulator gaps</p>
            <ul className="mt-2 space-y-2">
              {evidence.simulatorGaps.map((g) => (
                <li key={g.id}>
                  <span className="font-mono text-xs text-rose">{g.id}</span>
                  <span className="block">{g.summary}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-4 font-mono text-xs text-dim">
          Every batch is reproducible from a sealed seed manifest; content hashes:{" "}
          {reports
            .map((r) => `${r.id.split("-").slice(0, 1).join("")}:${r.contentSha256.slice(0, 10)}`)
            .join(" · ")}
        </p>
      </Panel>

      <CardValuesPanel />

      <Panel eyebrow="Not yet evaluated" title="Things this site does not know" headingLevel={2}>
        <dl className="grid gap-3 md:grid-cols-2">
          {NOT_EVALUATED.map(([k, v]) => (
            <div key={k} className="rounded-xl border border-line bg-charcoal/40 p-4">
              <dt className="font-medium text-parchment">{k}</dt>
              <dd className="mt-1 text-sm text-muted">{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
