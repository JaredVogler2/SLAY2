"use client";

import { CHARACTER_FACTS, PLAYABLE_CLASSES, type PlayableClass } from "@slay2/game-data";

import { CLASS_STYLE } from "@/lib/card-style";
import { cn } from "@/lib/cn";

const BLURB: Record<PlayableClass, string> = {
  ironclad: "Bruiser: strength, block and self-damage.",
  silent: "Agile: shivs, poison and tempo.",
  regent: "Sovereign: stars, forge and royal blades.",
  necrobinder: "Summoner: Osty, doom and the dead.",
  defect: "Construct: orbs, focus and engines.",
};

/** Large radio cards: choose the character in one tap. */
export function CharacterPicker({
  value,
  onChange,
  compact = false,
}: {
  value: PlayableClass | null;
  onChange: (c: PlayableClass) => void;
  compact?: boolean;
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-parchment">Character</legend>
      <div
        className={cn(
          "grid gap-2.5",
          compact ? "grid-cols-2 sm:grid-cols-5" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-5",
        )}
      >
        {PLAYABLE_CLASSES.map((c) => {
          const style = CLASS_STYLE[c];
          const facts = CHARACTER_FACTS.find((f) => f.id === c);
          const checked = value === c;
          return (
            <label
              key={c}
              className={cn(
                "group relative flex min-h-16 cursor-pointer flex-col gap-1 overflow-hidden rounded-xl border p-3 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal",
                checked
                  ? "border-copper bg-copper/10"
                  : "border-line-strong bg-ink-2 hover:border-copper",
              )}
            >
              <input
                type="radio"
                name="character"
                value={c}
                checked={checked}
                onChange={() => {
                  onChange(c);
                }}
                className="sr-only"
              />
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1"
                style={{ background: style.hue }}
              />
              <span className="flex items-center gap-2 pl-1.5">
                <span aria-hidden="true" style={{ color: style.hue }} className="text-lg">
                  {style.glyph}
                </span>
                <span className="font-display text-base text-parchment">{style.label}</span>
                {checked ? <span className="ml-auto text-xs text-gold">selected</span> : null}
              </span>
              {!compact ? <span className="pl-1.5 text-xs text-muted">{BLURB[c]}</span> : null}
              <span className="num pl-1.5 text-xs text-dim">
                {facts ? `${String(facts.startingHp)} HP · ${String(facts.maxEnergy)} energy` : ""}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
