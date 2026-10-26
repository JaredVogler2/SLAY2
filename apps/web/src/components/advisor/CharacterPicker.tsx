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
  disabled = false,
}: {
  value: PlayableClass | null;
  onChange: (c: PlayableClass) => void;
  compact?: boolean;
  /** true until the page is interactive (the server draws this component too); looks the same, so nothing moves */
  disabled?: boolean;
}) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-sm font-medium text-parchment">Character</legend>
      <div
        className={cn(
          // once a class is chosen the picker shrinks to chips that flow with their names (two and five-column grids
          // clipped "Necrobinder" and its marker at every phone, tablet and laptop width), and back to the five cards from `xl` up
          compact
            ? "flex flex-wrap gap-2 xl:grid xl:grid-cols-5 xl:gap-2.5"
            : "grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5",
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
                "group relative flex cursor-pointer overflow-hidden rounded-xl border transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-teal",
                compact
                  ? "min-h-11 items-center py-1.5 pl-4 pr-3 xl:min-h-16 xl:flex-col xl:items-stretch xl:gap-1 xl:p-3"
                  : "min-h-16 flex-col gap-1 p-3",
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
                disabled={disabled}
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
              <span className={cn("flex items-center gap-2", compact ? "xl:pl-1.5" : "pl-1.5")}>
                <span aria-hidden="true" style={{ color: style.hue }} className="text-lg">
                  {style.glyph}
                </span>
                <span className="wrap-anywhere min-w-0 font-display text-base text-parchment">
                  {style.label}
                </span>
                {checked ? (
                  // a mark, not a word: "Necrobinder" and the word "selected" do not fit one card (203 px at 1280 px); on a card
                  // the mark sits in the corner, out of the name's way
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-gold xl:absolute xl:right-2.5 xl:top-2"
                  >
                    ✓
                  </span>
                ) : null}
              </span>
              {!compact ? <span className="pl-1.5 text-xs text-muted">{BLURB[c]}</span> : null}
              <span className={cn("num pl-1.5 text-xs text-dim", compact && "hidden xl:block")}>
                {facts ? `${String(facts.startingHp)} HP · ${String(facts.maxEnergy)} energy` : ""}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
