"use client";

import { useMemo, useState } from "react";

import {
  PLAYABLE_CLASSES,
  poolSizes,
  type CardEntry,
  type PlayableClass,
  ALL_UNLOCKED,
  NO_EPOCHS,
} from "@slay2/game-data";
import {
  Rational,
  cardAppearanceProbability,
  enumeratePack,
  forecastPack,
  inferCounter,
  maxCounter,
  pointMass,
  positionMarginals,
  rarityRulesForAscension,
  summarizePack,
  type PackObservation,
  type Rarity,
  provenanceFor,
} from "@slay2/odds";

import { CardCombobox } from "@/components/cards/CardCombobox";
import { CardTile } from "@/components/cards/CardTile";
import { Badge } from "@/components/ui/Badge";
import { BarChart } from "@/components/ui/BarChart";
import { Button } from "@/components/ui/Button";
import { ExactValue } from "@/components/ui/ExactValue";
import { LineChart } from "@/components/ui/LineChart";
import { MethodNote } from "@/components/ui/MethodNote";
import { NumberStepper } from "@/components/ui/NumberStepper";
import { Panel } from "@/components/ui/Panel";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";
import { Segmented } from "@/components/ui/Segmented";
import { Select } from "@/components/ui/Field";
import { Stat } from "@/components/ui/Stat";
import { ScrollRegion } from "@/components/ui/ScrollRegion";
import { useUrlState, parseIntInRange, parseOneOf } from "@/hooks/useUrlState";
import { CLASS_STYLE } from "@/lib/card-style";
import { pctSmart } from "@/lib/format";
import { sourceToReward, type PackSource, type RunState, packObservations } from "@/lib/run-state";

const SOURCES = ["regular", "elite", "boss", "shop", "event"] as const;
const SOURCE_LABEL: Record<PackSource, string> = {
  regular: "Normal fight",
  elite: "Elite",
  boss: "Boss",
  shop: "Shop cards",
  event: "Event / relic pack",
};
const DEFAULT_CARDS: Record<PackSource, number> = {
  regular: 3,
  elite: 3,
  boss: 3,
  shop: 5,
  event: 3,
};

interface Entry {
  id: number;
  source: PackSource;
  cards: number;
  rares: number | null;
}

export function RarityCalculator({
  ascension,
  ascensionConfirmed,
  run,
}: {
  ascension: number;
  ascensionConfirmed: boolean;
  run: RunState | null;
}) {
  const [source, setSource] = useUrlState<PackSource>("src", "regular", parseOneOf(SOURCES));
  const [mode, setMode] = useUrlState<"known" | "history">(
    "mode",
    "known",
    parseOneOf(["known", "history"] as const),
  );
  const [k, setK] = useUrlState<number>("k", 0, parseIntInRange(0, 200));
  const [cardsOverride, setCardsOverride] = useState<number | null>(null);
  const cards = cardsOverride ?? DEFAULT_CARDS[source];
  const [entries, setEntries] = useState<Entry[]>([]);
  const [nextId, setNextId] = useState(1);
  const [draftSource, setDraftSource] = useState<PackSource>("regular");
  const [draftRares, setDraftRares] = useState<"0" | "1" | "2" | "3" | "?">("0");

  const rules = useMemo(() => rarityRulesForAscension(ascension), [ascension]);
  const reward = sourceToReward(source);
  const counterCap = maxCounter(rules);

  const inference = useMemo(() => {
    if (mode !== "history") {
      return null;
    }
    const obs: PackObservation[] = entries.map((e) => ({
      source: sourceToReward(e.source),
      cards: e.cards,
      ...(e.rares === null ? {} : { rares: e.rares }),
    }));
    return inferCounter(obs, rules);
  }, [mode, entries, rules]);

  const posterior = useMemo(() => {
    if (mode === "known") {
      return pointMass(k, rules);
    }
    return inference && !inference.impossible ? inference.posterior : null;
  }, [mode, k, rules, inference]);

  const forecast = useMemo(
    () => (posterior ? forecastPack(posterior, reward, cards, rules) : null),
    [posterior, reward, cards, rules],
  );
  const marginals = useMemo(
    () => (posterior ? positionMarginals(posterior, reward, cards, rules) : null),
    [posterior, reward, cards, rules],
  );

  const curve = useMemo(() => {
    if (source !== "regular" && source !== "elite") {
      return null;
    }
    return Array.from({ length: counterCap + 1 }, (_, i) => ({
      x: i,
      y:
        summarizePack(enumeratePack(reward, i, cards, rules), cards).atLeastOneRare.toNumber() *
        100,
    }));
  }, [source, reward, cards, rules, counterCap]);

  const posteriorBars = useMemo(() => {
    if (mode !== "history" || !posterior) {
      return null;
    }
    const keys = [...posterior.keys()].sort((a, b) => a - b);
    return keys.map((key) => ({
      label: String(key),
      value: (posterior.get(key) ?? Rational.ZERO).toNumber(),
    }));
  }, [mode, posterior]);

  const modalCounter = useMemo(() => {
    if (!posterior) {
      return null;
    }
    let best: number | null = null;
    let bestMass = Rational.ZERO;
    for (const [counter, mass] of posterior) {
      if (mass.gt(bestMass)) {
        best = counter;
        bestMass = mass;
      }
    }
    return best;
  }, [posterior]);

  const addEntry = (): void => {
    const rares = draftRares === "?" ? null : Number(draftRares);
    setEntries((prev) => [
      ...prev,
      { id: nextId, source: draftSource, cards: DEFAULT_CARDS[draftSource], rares },
    ]);
    setNextId((n) => n + 1);
  };

  const loadFromRun = (): void => {
    if (!run) {
      return;
    }
    const obs = packObservations(run);
    let id = nextId;
    const rows: Entry[] = run.packs.map((p, i) => {
      const o = obs[i];
      id += 1;
      return { id, source: p.source, cards: p.offered.length, rares: o?.rares ?? null };
    });
    setEntries(rows);
    setNextId(id + 1);
    setMode("history");
  };

  const expected = forecast?.expectedByRarity;
  return (
    <div className="space-y-6">
      <Panel
        eyebrow="Card rewards"
        title="Rarity odds and the hidden pity counter"
        aside={
          <>
            <Badge tone="exact">Exact</Badge>
            <Badge tone="build">
              {ascensionConfirmed ? `A${String(ascension)}` : "A0 assumed"}
            </Badge>
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-5">
            <Segmented
              legend="Where do the cards come from?"
              value={source}
              onChange={(s) => {
                setSource(s);
                setCardsOverride(null);
              }}
              options={SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))}
            />
            <Segmented
              legend="How much do you know about your counter?"
              value={mode}
              onChange={setMode}
              options={[
                { value: "known", label: "I know the count" },
                { value: "history", label: "Work it out from my packs" },
              ]}
            />
            {mode === "known" ? (
              <NumberStepper
                label="Non-rare cards since your last rare"
                value={Math.min(k, counterCap)}
                onChange={setK}
                min={0}
                max={counterCap}
                hint={`0 at the start of a run and right after a rare. Capped at ${String(counterCap)}${ascension >= 7 ? " (Scarcity grows half as fast)" : ""}. Every card in a pack counts, including the ones after a rare in the same pack.`}
              />
            ) : (
              <div className="space-y-3 rounded-xl border border-line bg-charcoal/40 p-4">
                <p className="text-sm text-muted">
                  List the card rewards you have seen, oldest first. Only the number of rares
                  matters — the engine works out every way the counter could have moved. Packs you
                  did not note can be added as “unknown”.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-40 flex-1">
                    <label
                      htmlFor="draft-src"
                      className="mb-1.5 block text-sm font-medium text-parchment"
                    >
                      Source
                    </label>
                    <Select
                      id="draft-src"
                      value={draftSource}
                      onChange={(e) => {
                        setDraftSource(e.target.value as PackSource);
                      }}
                    >
                      {SOURCES.map((s) => (
                        <option key={s} value={s}>
                          {SOURCE_LABEL[s]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Segmented
                    legend="Rares in that pack"
                    value={draftRares}
                    onChange={setDraftRares}
                    size="sm"
                    options={[
                      { value: "0", label: "0" },
                      { value: "1", label: "1" },
                      { value: "2", label: "2" },
                      { value: "3", label: "3" },
                      { value: "?", label: "Unknown" },
                    ]}
                  />
                  <Button variant="primary" onClick={addEntry}>
                    Add pack
                  </Button>
                </div>
                {run && run.packs.length > 0 ? (
                  <Button variant="ghost" size="sm" onClick={loadFromRun}>
                    Use the {run.packs.length} pack{run.packs.length === 1 ? "" : "s"} logged in my
                    run
                  </Button>
                ) : null}
                {entries.length > 0 ? (
                  <ol className="space-y-1.5" aria-label="Packs listed">
                    {entries.map((e, i) => (
                      <li
                        key={e.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-line bg-ink px-3 py-1.5 text-sm"
                      >
                        <span>
                          <span className="num text-muted">{i + 1}.</span> {SOURCE_LABEL[e.source]}{" "}
                          · {e.cards} cards ·{" "}
                          <strong className="font-medium text-parchment">
                            {e.rares === null
                              ? "rares unknown"
                              : `${String(e.rares)} rare${e.rares === 1 ? "" : "s"}`}
                          </strong>
                        </span>
                        <button
                          type="button"
                          className="min-h-9 rounded px-2 text-muted hover:text-rose"
                          aria-label={`Remove pack ${String(i + 1)}`}
                          onClick={() => {
                            setEntries((prev) => prev.filter((x) => x.id !== e.id));
                          }}
                        >
                          ✕
                        </button>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="text-sm text-dim">
                    No packs listed: the counter is at its starting value (−5 points).
                  </p>
                )}
                {entries.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setEntries([]);
                    }}
                  >
                    Clear list
                  </Button>
                ) : null}
              </div>
            )}
            <NumberStepper
              label="Cards in the pack"
              value={cards}
              onChange={(n) => {
                setCardsOverride(n);
              }}
              min={1}
              max={6}
              hint={
                source === "shop"
                  ? "A merchant stocks 5 class cards."
                  : "Normally 3; some relics change it."
              }
            />
          </div>

          <div aria-live="polite" className="space-y-5">
            {mode === "history" && inference?.impossible ? (
              <div
                role="alert"
                className="rounded-xl border border-rose-deep bg-rose/10 p-4 text-sm text-rose"
              >
                That list cannot happen under the verified rules (for example a rare in the very
                first normal-fight pack, whose rare chance is 0%). Check the order and the counts,
                or a relic/event may have changed the odds — which this calculator does not model.
              </div>
            ) : forecast ? (
              <>
                <Stat
                  label={`Chance of at least one rare · ${SOURCE_LABEL[source].toLowerCase()}, ${String(cards)} cards`}
                  value={<ExactValue value={forecast.atLeastOneRare} digits={2} />}
                  tone="exact"
                  note={
                    mode === "history" && posterior && posterior.size > 1 ? (
                      <>
                        Your counter is uncertain; across the plausible values this ranges from{" "}
                        <strong className="num text-parchment">
                          {pctSmart(forecast.atLeastOneRareBand.min, 1)}
                        </strong>{" "}
                        to{" "}
                        <strong className="num text-parchment">
                          {pctSmart(forecast.atLeastOneRareBand.max, 1)}
                        </strong>{" "}
                        (central 90%: {pctSmart(forecast.atLeastOneRareBand.lo, 1)}–
                        {pctSmart(forecast.atLeastOneRareBand.hi, 1)}).
                      </>
                    ) : null
                  }
                />
                <div>
                  <p className="mb-2 text-sm font-medium text-parchment">First card in the pack</p>
                  <ProbabilityBar
                    segments={[
                      { key: "rare", label: "Rare", value: forecast.firstCard.rare, tone: "rare" },
                      {
                        key: "uncommon",
                        label: "Uncommon",
                        value: forecast.firstCard.uncommon,
                        tone: "uncommon",
                      },
                      {
                        key: "common",
                        label: "Common",
                        value: forecast.firstCard.common,
                        tone: "common",
                      },
                    ]}
                  />
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium text-parchment">
                    How many rares will the pack hold?
                  </p>
                  <BarChart
                    title="Number of rares in the pack"
                    bars={forecast.rareCountPmf.map((p, i) => ({
                      label: `${String(i)} rare${i === 1 ? "" : "s"}`,
                      value: p.toNumber(),
                    }))}
                  />
                  <p className="mt-1 text-sm text-muted">
                    Expected rares:{" "}
                    <span className="num text-parchment">{forecast.expectedRares.toFixed(3)}</span>
                  </p>
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div className="mt-6">
          <MethodNote provenance={provenanceFor("rarity", { ascension, ascensionConfirmed })} />
        </div>
      </Panel>

      {forecast && marginals ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Slot by slot" eyebrow="Position in the pack" headingLevel={3}>
            <ScrollRegion label="Rarity of each card slot">
              <table className="w-full min-w-[22rem] text-left text-sm">
                <caption className="sr-only">Rarity of each card slot</caption>
                <thead>
                  <tr className="border-b border-line text-muted">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Card
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Rare
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Uncommon
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Common
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {marginals.map((m, i) => (
                    <tr key={i}>
                      <th scope="row" className="py-2 pr-3 font-medium text-parchment">
                        #{i + 1}
                      </th>
                      <td className="num py-2 pr-3 text-copper">{pctSmart(m.rare, 2)}</td>
                      <td className="num py-2 pr-3 text-teal">{pctSmart(m.uncommon, 2)}</td>
                      <td className="num py-2 text-muted">{pctSmart(m.common, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollRegion>
            <p className="mt-3 text-sm text-muted">
              Slots are not independent: a non-rare card raises the next slot’s rare chance by one
              point, and a rare drops it back to −5. Each row is that slot’s exact marginal chance.
            </p>
          </Panel>

          {curve ? (
            <Panel title="Where you are on the curve" eyebrow="Pity counter" headingLevel={3}>
              <LineChart
                points={curve}
                title={`Chance of at least one rare in a ${String(cards)}-card ${SOURCE_LABEL[source].toLowerCase()} pack, by counter`}
                description="The chance climbs from the starting offset to its cap; a rare resets it to the left edge."
                xLabel="Non-rare cards since last rare"
                yLabel="P(≥1 rare in pack)"
                marker={
                  modalCounter === null
                    ? undefined
                    : {
                        x: Math.min(modalCounter, counterCap),
                        label: mode === "known" ? "you" : "most likely",
                      }
                }
                yMax={100}
              />
            </Panel>
          ) : (
            <Panel title="Counter behaviour" eyebrow="This source" headingLevel={3}>
              <p className="text-muted">
                {source === "boss"
                  ? "A boss pack is three rares regardless of the counter, and finding a rare there still resets the counter to −5."
                  : source === "shop"
                    ? "The merchant reads your counter to roll each card's rarity but never moves it."
                    : "Events and relic packs use fixed base odds (3% rare / 34% uncommon / 63% common at A0). They never read or move the counter."}
              </p>
            </Panel>
          )}
        </div>
      ) : null}

      {posteriorBars && posteriorBars.length > 0 ? (
        <Panel
          title="Where your counter might be"
          eyebrow="Posterior from your packs"
          headingLevel={3}
        >
          <BarChart
            title="Probability of each counter value"
            bars={posteriorBars.map((b) => ({ ...b, highlight: b.label === String(modalCounter) }))}
            xLabel="Non-rare cards since last rare"
            yFormat={(v) => `${(v * 100).toFixed(1)}%`}
          />
          <p className="mt-2 text-sm text-muted">
            Computed exactly from the packs you listed. Packs marked “unknown” are summed over every
            way they could have gone.
          </p>
        </Panel>
      ) : null}

      {expected ? <SpecificCard expected={expected} source={source} /> : null}
    </div>
  );
}

function SpecificCard({
  expected,
  source,
}: {
  expected: Record<Rarity, Rational>;
  source: PackSource;
}) {
  const [cls, setCls] = useState<PlayableClass>("ironclad");
  const [card, setCard] = useState<CardEntry | null>(null);
  const [unlock, setUnlock] = useState<"all" | "none">("all");
  const sizes = poolSizes(cls, unlock === "all" ? ALL_UNLOCKED : NO_EPOCHS);
  const rarity =
    card && (card.rarity === "common" || card.rarity === "uncommon" || card.rarity === "rare")
      ? card.rarity
      : null;
  const probability = rarity ? cardAppearanceProbability(expected[rarity], sizes[rarity]) : null;
  const disabled = source === "shop";
  return (
    <Panel
      title="Will this specific card show up?"
      eyebrow="Card appearance"
      headingLevel={3}
      aside={<Badge tone="exact">Exact</Badge>}
    >
      {disabled ? (
        <p className="text-muted">
          The merchant fills type slots (two attacks, two skills, one power), so the “uniform pick
          within rarity” model does not apply to shop stock.
        </p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="spec-class"
                className="mb-1.5 block text-sm font-medium text-parchment"
              >
                Character pool
              </label>
              <Select
                id="spec-class"
                value={cls}
                onChange={(e) => {
                  setCls(e.target.value as PlayableClass);
                  setCard(null);
                }}
              >
                {PLAYABLE_CLASSES.map((c) => (
                  <option key={c} value={c}>
                    {CLASS_STYLE[c].label}
                  </option>
                ))}
              </Select>
            </div>
            <Segmented
              legend="Cards your profile has unlocked"
              value={unlock}
              onChange={(u) => {
                setUnlock(u);
              }}
              options={[
                {
                  value: "all",
                  label: "All unlocked",
                  description: "20 common / 35 uncommon / 25 rare per character in solo",
                },
                {
                  value: "none",
                  label: "No epochs revealed",
                  description: "A brand-new profile: smaller pools",
                },
              ]}
            />
            <CardCombobox
              label="Card"
              classes={[cls]}
              rewardEligibleOnly
              onSelect={setCard}
              placeholder="e.g. Inflame"
              hint="Only cards that can appear in a normal reward are listed."
            />
          </div>
          <div aria-live="polite">
            {card && probability && rarity ? (
              <div className="space-y-3">
                <CardTile card={card} />
                <p className="text-sm text-muted">
                  Expected {rarity} cards in this pack:{" "}
                  <span className="num text-parchment">{expected[rarity].toFixed(3)}</span> ÷{" "}
                  {sizes[rarity]} possible {rarity} cards ={" "}
                </p>
                <p className="font-display text-4xl text-teal">
                  <ExactValue value={probability} digits={3} />
                </p>
                <p className="text-xs text-dim">
                  Within a rarity, each slot draws uniformly from the cards not already in the pack,
                  so the chance equals the expected number of slots of that rarity divided by the
                  pool size.
                </p>
              </div>
            ) : (
              <p className="text-muted">
                Pick a card to see the exact chance it appears in this pack.
              </p>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
