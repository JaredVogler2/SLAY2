"use client";

import { useMemo } from "react";

import { getCard, starterDeck, type CardEntry } from "@slay2/game-data";
import { profileDeck, type DeckEntry } from "@slay2/decision";

import { CardCombobox } from "@/components/cards/CardCombobox";
import { CardTile } from "@/components/cards/CardTile";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { deckAdd, deckRemove, deckSetUpgraded } from "@/lib/opening";
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
  const upgradedOf = (id: string): number => run.deck.find((d) => d.id === id)?.upgraded ?? 0;
  const character = run.character;
  // event cards (Neow's Fury) and curses reach the deck from the opening Ancient and from events
  const classes = character
    ? ([character, "colorless", "curse", "status", "event"] as const)
    : undefined;

  const bump = (id: string, delta: number): void => {
    onChange(delta > 0 ? deckAdd(run.deck, id, delta) : deckRemove(run.deck, id, -delta));
  };
  const upgrade = (id: string, delta: number): void => {
    const now = run.deck.find((d) => d.id === id)?.upgraded ?? 0;
    onChange(deckSetUpgraded(run.deck, id, now + delta));
  };
  const add = (card: CardEntry): void => {
    onChange(deckAdd(run.deck, card.id));
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
              <div className="mt-1 flex flex-wrap items-center gap-1 text-xs text-muted">
                <span id={`up-${card.id}`}>Upgraded</span>
                <button
                  type="button"
                  aria-label={`One fewer ${card.name} upgraded`}
                  aria-describedby={`up-${card.id}`}
                  onClick={() => {
                    upgrade(card.id, -1);
                  }}
                  className="min-h-9 min-w-9 rounded-md border border-line bg-charcoal text-parchment hover:border-rose"
                >
                  −
                </button>
                <span
                  className="num min-w-6 text-center text-parchment"
                  aria-label={`${String(upgradedOf(card.id))} upgraded`}
                >
                  {upgradedOf(card.id)}
                </span>
                <button
                  type="button"
                  aria-label={`One more ${card.name} upgraded`}
                  aria-describedby={`up-${card.id}`}
                  onClick={() => {
                    upgrade(card.id, 1);
                  }}
                  className="min-h-9 min-w-9 rounded-md border border-line bg-charcoal text-parchment hover:border-teal"
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
