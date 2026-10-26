import type { CardClass, CardRarity } from "@slay2/game-data";

/** Original accent hues per class (not game colours): used for frames and chips, never as the only signal. */
export const CLASS_STYLE: Record<CardClass, { label: string; hue: string; glyph: string }> = {
  ironclad: { label: "Ironclad", hue: "#d8664f", glyph: "⚔" },
  silent: { label: "Silent", hue: "#62b783", glyph: "✦" },
  regent: { label: "Regent", hue: "#dcae52", glyph: "♛" },
  necrobinder: { label: "Necrobinder", hue: "#a285dc", glyph: "☾" },
  defect: { label: "Defect", hue: "#5fb0ea", glyph: "◈" },
  colorless: { label: "Colorless", hue: "#9ea8b8", glyph: "◇" },
  curse: { label: "Curse", hue: "#b4565f", glyph: "☠" },
  status: { label: "Status", hue: "#8a93a3", glyph: "✱" },
  token: { label: "Token", hue: "#8a93a3", glyph: "●" },
  event: { label: "Event", hue: "#c9a24a", glyph: "✧" },
  quest: { label: "Quest", hue: "#c9a24a", glyph: "❖" },
};

export const RARITY_STYLE: Record<CardRarity, { label: string; glyph: string; className: string }> =
  {
    basic: { label: "Starter", glyph: "○", className: "text-muted" },
    common: { label: "Common", glyph: "●", className: "text-parchment" },
    uncommon: { label: "Uncommon", glyph: "◆", className: "text-teal" },
    rare: { label: "Rare", glyph: "★", className: "text-copper" },
    ancient: { label: "Ancient", glyph: "✹", className: "text-gold" },
    event: { label: "Event", glyph: "✧", className: "text-gold" },
    curse: { label: "Curse", glyph: "☠", className: "text-rose" },
    status: { label: "Status", glyph: "✱", className: "text-muted" },
    token: { label: "Token", glyph: "●", className: "text-muted" },
    quest: { label: "Quest", glyph: "❖", className: "text-gold" },
  };

export function costLabel(cost: number | "X" | null): string {
  return cost === null ? "—" : String(cost);
}
