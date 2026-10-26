"use client";

import { useMemo, useRef, useState } from "react";

import {
  ACT1_BRIEFS,
  OPENING_OPTIONS,
  PLAYABLE_CLASSES,
  basicCardId,
  getCard,
  getOpeningOption,
  isRemovable,
  isUpgradable,
  resolveStepCards,
  type Act1Variant,
  type CardClass,
  type CardEntry,
  type OpeningOption,
  type OpeningStep,
  type PlayableClass,
} from "@slay2/game-data";

import { CardCombobox } from "@/components/cards/CardCombobox";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Panel } from "@/components/ui/Panel";
import { Segmented } from "@/components/ui/Segmented";
import { cn } from "@/lib/cn";
import { applyOpening, openingProblems, type OpeningAnswers } from "@/lib/opening";
import type { RunState } from "@/lib/run-state";

import { Act1Brief } from "./Act1Brief";
import { NeowOffer } from "./NeowOffer";

type Pick = Extract<OpeningStep, { kind: "pick" }>["from"];

interface Pool {
  readonly classes: readonly CardClass[];
  readonly rewardEligibleOnly: boolean;
  readonly filter?: (c: CardEntry) => boolean;
}

function buildPool(from: Pick, character: PlayableClass): Pool {
  switch (from) {
    case "rare":
      return { classes: [character], rewardEligibleOnly: true, filter: (c) => c.rarity === "rare" };
    case "classReward":
      return { classes: [character], rewardEligibleOnly: true };
    case "colorless":
      return { classes: ["colorless"], rewardEligibleOnly: false };
    case "otherClass":
      return { classes: PLAYABLE_CLASSES.filter((c) => c !== character), rewardEligibleOnly: true };
    case "coop":
      return {
        classes: [...PLAYABLE_CLASSES, "colorless"],
        rewardEligibleOnly: false,
        filter: (c) => c.multiplayer === "multiplayer-only",
      };
    case "curse":
      return { classes: ["curse"], rewardEligibleOnly: false };
  }
}

// The search box memoises on the identity of its pool, so a pool is built once per source and class, not on every render.
const POOLS = new Map<string, Pool>();

function poolFor(from: Pick, character: PlayableClass): Pool {
  const key = `${from}/${character}`;
  const cached = POOLS.get(key);
  if (cached) {
    return cached;
  }
  const built = buildPool(from, character);
  POOLS.set(key, built);
  return built;
}

const OWN_CLASS = new Map<PlayableClass, readonly CardClass[]>();

function ownClass(character: PlayableClass): readonly CardClass[] {
  const cached = OWN_CLASS.get(character);
  if (cached) {
    return cached;
  }
  const built: readonly CardClass[] = [character];
  OWN_CLASS.set(character, built);
  return built;
}

function cardName(id: string): string {
  return getCard(id)?.name ?? id;
}

/** The chosen cards of a step, as removable chips. */
function Chosen({
  ids,
  onRemove,
  label,
}: {
  ids: readonly string[];
  onRemove: (index: number) => void;
  label: string;
}) {
  if (ids.length === 0) {
    return null;
  }
  return (
    <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={label}>
      {ids.map((id, i) => (
        <li key={`${id}-${String(i)}`}>
          <button
            type="button"
            onClick={() => {
              onRemove(i);
            }}
            aria-label={`Remove ${cardName(id)} from this answer`}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-copper bg-copper/15 px-2.5 text-sm text-gold hover:border-rose hover:text-rose"
          >
            <span className="wrap-anywhere">{cardName(id)}</span>
            <span aria-hidden="true">×</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type DeckRow = RunState["deck"][number];

/** A card the game lets a player remove or transform: not one with the Eternal keyword (Ascender's Bane and others, DECK-1). */
const removable = (d: DeckRow): boolean => isRemovable(d.id);
/** A card with a base copy left that the game lets a player upgrade: not a curse, a status or a quest card (DECK-1). */
const upgradable = (d: DeckRow): boolean => isUpgradable(d.id) && d.count - (d.upgraded ?? 0) > 0;

function DeckSelect({
  run,
  label,
  value,
  onChange,
  allow,
}: {
  run: RunState;
  label: string;
  value: string;
  onChange: (id: string) => void;
  allow: (row: DeckRow) => boolean;
}) {
  return (
    <div className="min-w-0">
      <label className="mb-1.5 block text-sm font-medium text-parchment">
        {label}
        <Select
          className="mt-1.5"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
        >
          <option value="">Choose a card from your deck…</option>
          {run.deck.filter(allow).map((d) => (
            <option key={d.id} value={d.id}>
              {cardName(d.id)} ×{d.count}
              {(d.upgraded ?? 0) > 0 ? ` (${String(d.upgraded)} upgraded)` : ""}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}

function StepFields({
  step,
  index,
  run,
  character,
  answers,
  setAnswer,
}: {
  step: OpeningStep;
  index: number;
  run: RunState;
  character: PlayableClass;
  answers: OpeningAnswers;
  setAnswer: (index: number, value: readonly string[]) => void;
}) {
  const answer = answers[index] ?? [];
  switch (step.kind) {
    case "add":
      return (
        <p className="text-sm text-parchment">
          Adds to the deck:{" "}
          <strong className="font-medium text-gold">
            {resolveStepCards(character, step.cards).map(cardName).join(", ")}
          </strong>
        </p>
      );
    case "pick": {
      const pool = poolFor(step.from, character);
      const full = answer.length >= step.count;
      return (
        <div className="min-w-0">
          <p className="mb-1.5 text-sm font-medium text-parchment">
            {step.label}
            {step.count > 1 ? ` (${String(answer.length)} of ${String(step.count)})` : ""}
          </p>
          <Chosen
            ids={answer}
            label={step.label}
            onRemove={(i) => {
              setAnswer(
                index,
                answer.filter((_, j) => j !== i),
              );
            }}
          />
          {full ? null : (
            <CardCombobox
              label={`Search for: ${step.label.toLowerCase()}`}
              classes={pool.classes}
              rewardEligibleOnly={pool.rewardEligibleOnly}
              {...(pool.filter ? { filter: pool.filter } : {})}
              onSelect={(card) => {
                setAnswer(index, [...answer, card.id]);
              }}
              placeholder="Type a card name…"
            />
          )}
        </div>
      );
    }
    case "remove": {
      return (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {Array.from({ length: step.count }, (_, i) => (
            <DeckSelect
              key={i}
              run={run}
              label={
                step.count > 1
                  ? `${step.label} (${String(i + 1)} of ${String(step.count)})`
                  : step.label
              }
              value={answer[i] ?? ""}
              allow={removable}
              onChange={(id) => {
                const next = [...answer];
                next[i] = id;
                setAnswer(index, next.slice(0, step.count));
              }}
            />
          ))}
        </div>
      );
    }
    case "transform": {
      const target = step.only ? answer[0] : answer[1];
      const setTarget = (id: string): void => {
        setAnswer(index, step.only ? [id] : [answer[0] ?? "", id]);
      };
      return (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {step.only ? (
            <p className="text-sm text-parchment">
              Transforms one{" "}
              <strong className="font-medium text-gold">
                {cardName(basicCardId(character, step.only))}
              </strong>
              .
            </p>
          ) : (
            <DeckSelect
              run={run}
              label="The card you transformed"
              value={answer[0] ?? ""}
              allow={removable}
              onChange={(id) => {
                setAnswer(index, [id, answer[1] ?? ""]);
              }}
            />
          )}
          <div className="min-w-0">
            <p className="mb-1.5 text-sm font-medium text-parchment">{step.label}</p>
            {target ? (
              <Chosen
                ids={[target]}
                label={step.label}
                onRemove={() => {
                  setTarget("");
                }}
              />
            ) : (
              <CardCombobox
                label={`Search for: ${step.label.toLowerCase()}`}
                classes={ownClass(character)}
                rewardEligibleOnly
                onSelect={(card) => {
                  setTarget(card.id);
                }}
                placeholder="Type a card name…"
              />
            )}
          </div>
        </div>
      );
    }
    case "upgrade":
      return (
        <p className="text-sm text-parchment">
          Upgrades one{" "}
          <strong className="font-medium text-gold">
            {step.cards.map((r) => cardName(basicCardId(character, r))).join(" and one ")}
          </strong>
          .
        </p>
      );
    case "upgradeChosen":
      return (
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          {Array.from({ length: step.count }, (_, i) => (
            <DeckSelect
              key={i}
              run={run}
              label={step.label}
              allow={upgradable}
              value={answer[i] ?? ""}
              onChange={(id) => {
                const next = [...answer];
                next[i] = id;
                setAnswer(index, next.slice(0, step.count));
              }}
            />
          ))}
        </div>
      );
    case "maxHp":
      return (
        <p className="text-sm text-parchment">
          Max HP{" "}
          <strong className="num font-medium text-gold">
            {step.delta > 0 ? "+" : "−"}
            {Math.abs(step.delta)}
          </strong>
          .
        </p>
      );
    case "hp":
      return (
        <p className="text-sm text-parchment">
          HP{" "}
          <strong className="num font-medium text-gold">
            {step.delta > 0 ? "+" : "−"}
            {Math.abs(step.delta)}
          </strong>
          .
        </p>
      );
    case "info":
      return <p className="text-sm text-muted">{step.text}</p>;
  }
}

function OptionForm({
  option,
  run,
  character,
  onApply,
  onCancel,
}: {
  option: OpeningOption;
  run: RunState;
  character: PlayableClass;
  onApply: (answers: OpeningAnswers) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<OpeningAnswers>({});
  const problems = useMemo(() => openingProblems(run, option, answers), [run, option, answers]);
  const askedSomething = option.steps.some((s) => s.kind !== "info");
  return (
    <div className="space-y-4 rounded-xl border border-line bg-charcoal/40 p-4">
      <div>
        <p className="flex flex-wrap items-center gap-2">
          <strong className="font-display text-lg text-parchment">{option.name}</strong>
          <Badge tone={option.kind === "positive" ? "exact" : "unverified"}>
            {option.kind === "positive" ? "helpful" : "costly"}
          </Badge>
        </p>
        <p className="mt-1 text-sm text-muted">{option.summary}</p>
        {option.offeredWhen ? <p className="mt-1 text-xs text-dim">{option.offeredWhen}</p> : null}
      </div>
      <div>
        <p className="mb-2 text-sm font-medium text-parchment">How it changed your run</p>
        <div className="space-y-3">
          {option.steps.map((step, i) => (
            <StepFields
              key={i}
              step={step}
              index={i}
              run={run}
              character={character}
              answers={answers}
              setAnswer={(index, value) => {
                setAnswers((prev) => ({ ...prev, [index]: value }));
              }}
            />
          ))}
        </div>
      </div>
      {problems.length > 0 ? (
        <ul className="space-y-1 text-sm text-rose" aria-label="Still to fill in">
          {problems.slice(0, 3).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          disabled={problems.length > 0}
          onClick={() => {
            onApply(answers);
          }}
        >
          {askedSomething ? "Apply to my deck and HP" : "Record this"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

/**
 * Step 2: where this run starts. Which Act 1 it is (the two versions have different elites and bosses), the boss on the map,
 * and what the opening Ancient gave the player with its effect on the deck. All optional: nothing here blocks Step 3.
 */
export function OpeningPanel({
  run,
  onChange,
  useContext,
  onUseContextChange,
  disabled,
}: {
  run: RunState;
  onChange: (next: RunState) => void;
  useContext: boolean;
  onUseContextChange: (on: boolean) => void;
  disabled: boolean;
}) {
  const character = run.character;
  const [optionId, setOptionId] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const openingSelect = useRef<HTMLSelectElement>(null);
  const option = optionId ? getOpeningOption(optionId) : undefined;
  if (!character) {
    return null;
  }
  const variant = run.act1;
  const helpful = OPENING_OPTIONS.filter((o) => o.kind === "positive");
  const costly = OPENING_OPTIONS.filter((o) => o.kind === "cursed");

  const setVariant = (next: Act1Variant | "unknown"): void => {
    const act1 = next === "unknown" ? null : next;
    const keepBoss =
      act1 !== null &&
      run.act1Boss !== null &&
      ACT1_BRIEFS[act1].bosses.some((b) => b.id === run.act1Boss);
    onChange({ ...run, act1, act1Boss: keepBoss ? run.act1Boss : null });
  };

  return (
    <Panel
      eyebrow="Step 2 · optional"
      title="Act 1 and the opening Ancient"
      headingLevel={2}
      aside={<Badge tone="heuristic">Judgement, not measured</Badge>}
    >
      <div className="space-y-6">
        <div className="space-y-4">
          <Segmented
            legend="Which Act 1 are you in?"
            value={variant ?? "unknown"}
            onChange={setVariant}
            options={[
              { value: "overgrowth", label: "Overgrowth" },
              { value: "underdocks", label: "Underdocks" },
              { value: "unknown", label: "Not sure" },
            ]}
          />
          <p className="text-xs text-muted">
            Act 1 comes in two versions with different elites, bosses and ordinary fights. Every
            profile starts with Overgrowth; Underdocks only appears once it has been unlocked. The
            act&rsquo;s name is shown when it starts.
          </p>
          {variant ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <label
                    htmlFor="adv-boss"
                    className="mb-1.5 block text-sm font-medium text-parchment"
                  >
                    Boss on your map
                  </label>
                  <Select
                    id="adv-boss"
                    value={run.act1Boss ?? ""}
                    onChange={(e) => {
                      onChange({ ...run, act1Boss: e.target.value || null });
                    }}
                  >
                    <option value="">Not sure / not shown</option>
                    {ACT1_BRIEFS[variant].bosses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </Select>
                  <p className="mt-1.5 text-xs text-muted">
                    Naming it makes the advisor count this boss alone, instead of the average of
                    this version&rsquo;s three.
                  </p>
                </div>
                <label
                  className={cn(
                    "flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm",
                    useContext
                      ? "border-copper bg-copper/10 text-parchment"
                      : "border-line-strong text-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-[rgb(212_154_98)]"
                    checked={useContext}
                    onChange={(e) => {
                      onUseContextChange(e.target.checked);
                    }}
                  />
                  <span className="min-w-0">
                    Let this shape the ranking
                    <span className="mt-0.5 block text-xs text-muted">
                      Compared with the average Act 1 (both versions together), shifts the
                      advisor&rsquo;s weights toward what these elites and bosses ask of a deck:
                      usually a few percent, never more than 30 %. Switch it off to compare.
                    </span>
                  </span>
                </label>
              </div>
              <Act1Brief variant={variant} boss={run.act1Boss} />
              {variant === "underdocks" ? (
                <p className="rounded-lg border border-rose-deep/60 bg-rose/10 px-3 py-2 text-sm text-rose">
                  The simulated runs behind the measured card values never played Underdocks, so
                  that second opinion is for Overgrowth only.
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-muted">
              Say which Act 1 you are in and the advisor can weigh its elites and bosses. Until you
              do, they are not weighed.
            </p>
          )}
        </div>

        <div className="space-y-4 border-t border-line pt-5">
          <div>
            <h3 className="text-lg text-parchment">The opening Ancient</h3>
            <p className="mt-1 text-sm text-muted">
              Every run begins with Neow, who offers three relics: two helpful and one costly.
              Record the one you took and what it did to your deck. Several effects are random, so
              only you know the result.
            </p>
          </div>
          <NeowOffer
            run={run}
            disabled={disabled}
            recorded={run.opening.entries.map((e) => e.id)}
            onRecord={(id) => {
              setOptionId(id);
              setNotice(null);
              // the form for the relic opens under the select that now names it: leave the keyboard there
              requestAnimationFrame(() => {
                openingSelect.current?.focus();
              });
            }}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <label
                htmlFor="adv-opening"
                className="mb-1.5 block text-sm font-medium text-parchment"
              >
                What did you take?
              </label>
              <Select
                id="adv-opening"
                ref={openingSelect}
                value={optionId}
                disabled={disabled}
                onChange={(e) => {
                  setOptionId(e.target.value);
                  setNotice(null);
                }}
              >
                <option value="">Choose a relic…</option>
                <optgroup label="Helpful options">
                  {helpful.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Costly options (the third one)">
                  {costly.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </optgroup>
              </Select>
            </div>
          </div>
          {option ? (
            <OptionForm
              key={option.id}
              option={option}
              run={run}
              character={character}
              onCancel={() => {
                setOptionId("");
              }}
              onApply={(answers) => {
                const result = applyOpening(run, option.id, answers);
                onChange(result.run);
                setOptionId("");
                setNotice(
                  `Recorded ${option.name}. ${result.lines.filter((l) => !l.startsWith("Not tracked")).join(" ")}`.trim(),
                );
              }}
            />
          ) : null}
          {!run.ascensionConfirmed ? (
            <p className="text-xs text-muted">
              Your starting hit points and deck assume Ascension 0 until you choose the ascension in
              Step 1: from Ascension 2 the opening heal is 80 % of your HP, and from Ascension 5
              your deck starts with Ascender&rsquo;s Bane.
            </p>
          ) : null}
          {notice ? (
            <p
              role="status"
              className="rounded-lg border border-teal-deep/60 bg-teal/10 px-3 py-2 text-sm text-teal"
            >
              {notice} Undo (above) takes it back.
            </p>
          ) : null}
          {run.opening.entries.length > 0 && run.hp ? (
            <p className="text-sm text-parchment">
              After the opening:{" "}
              <strong className="num font-medium text-gold">
                HP {run.hp.current} of {run.hp.max}
              </strong>
              . Counted from the start of the run; fights since are not tracked.
            </p>
          ) : null}
          {run.opening.entries.length > 0 ? (
            <ol className="space-y-2" aria-label="Recorded from the opening Ancient">
              {run.opening.entries.map((e, i) => {
                const o = getOpeningOption(e.id);
                return (
                  <li
                    key={`${e.id}-${String(i)}`}
                    className="rounded-lg border border-line bg-charcoal/40 px-3 py-2 text-sm"
                  >
                    <strong className="font-medium text-parchment">{o?.name ?? e.id}</strong>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                      {e.lines.map((l, j) => (
                        <li key={`${String(j)}-${l}`}>{l}</li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ol>
          ) : null}
        </div>
      </div>
    </Panel>
  );
}
