"use client";

import { useMemo } from "react";

import {
  MECHANICS,
  RELIC_CATALOG,
  getRelic,
  relicTags,
  type MechanicId,
  type PlayableClass,
  type RelicPool,
} from "@slay2/game-data";

import { RelicCombobox } from "@/components/relics/RelicCombobox";
import { Panel } from "@/components/ui/Panel";
import { RELIC_RARITY_STYLE } from "@/lib/relic-codex";
import { MAX_RELICS, withRelic, withoutRelic, type RunState } from "@/lib/run-state";
import { cn } from "@/lib/cn";

/** The starting relics are counted already (the class's own supply), so they are not offered for adding. */
const STARTERS: ReadonlySet<string> = new Set(
  RELIC_CATALOG.relics.filter((r) => r.rarity === "starter").map((r) => r.id),
);

/** The mechanics a relic provides in SLAY2's reading, by label ("Strength, Energy"); empty when the table has nothing for it. */
export function providedBy(id: string): string[] {
  return Object.entries(relicTags(id).gives)
    .filter(([, g]) => g > 0)
    .map(([m]) => MECHANICS[m as MechanicId].label);
}

/** The relics the player holds, by name. Each one that provides a mechanic counts as a supplier of it in the advisor's ranking. */
export function RelicsPanel({
  run,
  character,
  onChange,
  disabled,
}: {
  run: RunState;
  character: PlayableClass;
  onChange: (next: RunState) => void;
  disabled: boolean;
}) {
  const pools = useMemo<readonly RelicPool[]>(() => [character, "shared", "event"], [character]);
  const exclude = useMemo(() => new Set([...STARTERS, ...run.relics]), [run.relics]);
  const full = run.relics.length >= MAX_RELICS;
  return (
    <Panel eyebrow="Your relics · optional" title="Which relics do you hold?" headingLevel={2}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-3 text-sm text-muted">
          <p>
            List the relics you picked up (your class&apos;s starting relic is already counted). A
            relic that provides a mechanic, such as Strength at the start of a fight, extra energy
            or card draw, counts as a supplier of it, like a card that provides it, so the cards
            that lean on that mechanic are worth more in the ranking.
          </p>
          <p>
            Which mechanics a relic provides is SLAY2&apos;s own judgement and has{" "}
            <strong className="font-medium text-parchment">not been tested in simulation</strong>.
            What a relic does beyond that (gold, healing, potions, rewards) is not modelled.
          </p>
          <fieldset disabled={disabled} className="min-w-0">
            <RelicCombobox
              label={full ? `Relics are full (${String(MAX_RELICS)})` : "Add a relic you hold"}
              pools={pools}
              exclude={exclude}
              onSelect={(relic) => {
                if (!full) {
                  onChange(withRelic(run, relic.id));
                }
              }}
              hint="Type a name and press Enter."
              placeholder="e.g. Vajra"
            />
          </fieldset>
        </div>
        <div>
          {run.relics.length === 0 ? (
            <div className="grid min-h-28 place-items-center rounded-xl border border-dashed border-line-strong p-6 text-center text-muted">
              No relics listed. The ranking then reads your class and your cards only.
            </div>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2" aria-label="Your relics">
              {run.relics.map((id) => {
                const relic = getRelic(id);
                const provides = providedBy(id);
                const rar = relic ? RELIC_RARITY_STYLE[relic.rarity] : null;
                return (
                  <li
                    key={id}
                    className="flex min-w-0 flex-col gap-1 rounded-xl border border-line-strong bg-ink-2 p-3"
                  >
                    <p className="flex items-start gap-2 font-display text-base leading-tight text-parchment">
                      <span className="min-w-0 flex-1 truncate" title={relic?.name ?? id}>
                        {relic?.name ?? id}
                      </span>
                      {rar ? (
                        <span className={cn("shrink-0 text-xs", rar.className)} title={rar.label}>
                          <span aria-hidden="true">{rar.glyph}</span>{" "}
                          <span className="sr-only">{rar.label}</span>
                        </span>
                      ) : null}
                    </p>
                    <p className="text-xs text-muted">
                      {provides.length > 0
                        ? `Counted as a supplier of ${provides.join(", ")}.`
                        : "Provides no mechanic in SLAY2's reading: the ranking reads nothing from it."}
                    </p>
                    <button
                      type="button"
                      disabled={disabled}
                      aria-label={`Remove ${relic?.name ?? id}`}
                      onClick={() => {
                        onChange(withoutRelic(run, id));
                      }}
                      className="mt-1 min-h-9 self-start rounded-md border border-line-strong px-2.5 text-xs text-muted hover:border-rose hover:text-rose"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
