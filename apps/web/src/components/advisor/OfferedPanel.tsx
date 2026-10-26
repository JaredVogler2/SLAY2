"use client";

import { useMemo } from "react";

import { getCard, type PlayableClass } from "@slay2/game-data";

import { CardCombobox } from "@/components/cards/CardCombobox";
import { CardTile } from "@/components/cards/CardTile";
import { Panel } from "@/components/ui/Panel";
import { Segmented } from "@/components/ui/Segmented";
import type { PackSource } from "@/lib/run-state";

export const ADVISOR_SOURCES = ["regular", "elite", "boss", "event"] as const;
const SOURCE_LABEL: Record<(typeof ADVISOR_SOURCES)[number], string> = {
  regular: "Normal fight",
  elite: "Elite",
  boss: "Boss",
  event: "Event / relic",
};

/** The cards the game is offering right now. 1-5 canonical catalog cards, picked by name. */
export function OfferedPanel({
  character,
  offered,
  onChange,
  source,
  onSourceChange,
}: {
  character: PlayableClass;
  offered: readonly string[];
  onChange: (next: string[]) => void;
  source: PackSource;
  onSourceChange: (s: (typeof ADVISOR_SOURCES)[number]) => void;
}) {
  const cards = useMemo(
    () =>
      offered.flatMap((id) => {
        const card = getCard(id);
        return card ? [card] : [];
      }),
    [offered],
  );
  const taken = useMemo(() => new Set(offered), [offered]);
  const full = offered.length >= 5;
  return (
    <Panel eyebrow="Step 3" title="What are you being offered?" headingLevel={2}>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <div className="space-y-5">
          <Segmented
            legend="Where is the reward from?"
            value={source === "shop" ? "regular" : source}
            onChange={onSourceChange}
            options={ADVISOR_SOURCES.map((s) => ({ value: s, label: SOURCE_LABEL[s] }))}
          />
          <CardCombobox
            label={
              full
                ? "Offer is full (5 cards)"
                : `Add an offered card (${String(offered.length)} of 3 usual)`
            }
            classes={[character, "colorless"]}
            rewardEligibleOnly
            exclude={taken}
            onSelect={(c) => {
              if (!full) {
                onChange([...offered, c.id]);
              }
            }}
            hint="Type a name and press Enter. Skipping is always an option, so it is added for you."
            placeholder="e.g. Pommel Strike"
          />
        </div>
        <div>
          {cards.length === 0 ? (
            <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-line-strong p-6 text-center text-muted">
              Add the cards on your reward screen, in any order.
              <br />
              Three cards and a few seconds is all it takes.
            </div>
          ) : (
            <ul className="grid gap-2.5 sm:grid-cols-2" aria-label="Offered cards">
              {cards.map((c) => (
                <li key={c.id}>
                  <CardTile card={c} className="h-full">
                    <button
                      type="button"
                      onClick={() => {
                        onChange(offered.filter((id) => id !== c.id));
                      }}
                      className="mt-1 min-h-9 self-start rounded-md border border-line-strong px-2.5 text-xs text-muted hover:border-rose hover:text-rose"
                    >
                      Remove
                    </button>
                  </CardTile>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}
