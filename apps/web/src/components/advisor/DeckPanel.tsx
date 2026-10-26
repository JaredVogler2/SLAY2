"use client";

import { useMemo } from "react";

import { getCard, starterDeck, type CardEntry } from "@slay2/game-data";
import { profileDeck, type DeckEntry } from "@slay2/decision";

import { CardCombobox } from "@/components/cards/CardCombobox";
import { CardTile } from "@/components/cards/CardTile";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import type { RunState } from "@/lib/run-state";

/** Deck editor: counts per card, add by name, reset to the starter deck. Everything is a canonical catalog id. */
export function DeckPanel({
  run,
  onChange,
}: {
  run: RunState;
  onChange: (deck: RunState["deck"]) => void;
}) {
  const entries: DeckEntry[] = useMemo(
    () =>
      run.deck.flatMap((d) => {
        const card = getCard(d.id);
        return card ? [{ card, count: d.count }] : [];
      }),
    [run.deck],
  );
  const profile = useMemo(() => profileDeck(entries), [entries]);
  const character = run.character;
  const classes = character ? ([character, "colorless", "curse", "status"] as const) : undefined;

  const bump = (id: string, delta: number): void => {
    const next = run.deck
      .map((d) => (d.id === id ? { ...d, count: d.count + delta } : d))
      .filter((d) => d.count > 0)
      .map((d) => ({ ...d, count: Math.min(d.count, 30) }));
    onChange(next);
  };
  const add = (card: CardEntry): void => {
    const exists = run.deck.some((d) => d.id === card.id);
    onChange(
      exists
        ? run.deck.map((d) => (d.id === card.id ? { ...d, count: Math.min(30, d.count + 1) } : d))
        : [...run.deck, { id: card.id, count: 1 }],
    );
  };

  return (
    <Panel
      eyebrow="Your deck"
      title={`${String(profile.size)} cards`}
      aside={
        character ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              onChange(starterDeck(character));
            }}
          >
            Reset to starter deck
          </Button>
        ) : null
      }
      headingLevel={3}
    >
      <dl className="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        {[
          ["Avg. energy cost", profile.averageEnergyCost.toFixed(2)],
          ["Starter cards", `${String(Math.round(profile.starterShare * 100))}%`],
          ["Damage / block", `${String(profile.groups.damage)} / ${String(profile.groups.block)}`],
          ["Draw / scaling", `${String(profile.groups.draw)} / ${String(profile.groups.scaling)}`],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-line bg-charcoal/40 px-3 py-2">
            <dt className="text-xs text-muted">{k}</dt>
            <dd className="num font-display text-lg text-parchment">{v}</dd>
          </div>
        ))}
      </dl>
      <CardCombobox
        label="Add a card to your deck"
        onSelect={add}
        {...(classes ? { classes } : {})}
        placeholder="e.g. Shrug It Off"
      />
      <ul className="mt-4 grid gap-2 sm:grid-cols-2" aria-label="Deck contents">
        {entries.map(({ card, count }) => (
          <li key={card.id}>
            <CardTile card={card} compact className="h-full">
              <div className="mt-1 flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Remove one ${card.name}`}
                  onClick={() => {
                    bump(card.id, -1);
                  }}
                  className="min-h-9 min-w-9 rounded-md border border-line-strong bg-charcoal text-parchment hover:border-rose"
                >
                  −
                </button>
                <span
                  className="num min-w-8 text-center text-parchment"
                  aria-label={`${String(count)} copies`}
                >
                  ×{count}
                </span>
                <button
                  type="button"
                  aria-label={`Add one ${card.name}`}
                  onClick={() => {
                    bump(card.id, 1);
                  }}
                  className="min-h-9 min-w-9 rounded-md border border-line-strong bg-charcoal text-parchment hover:border-teal"
                >
                  +
                </button>
              </div>
            </CardTile>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
