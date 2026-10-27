import { CATALOG } from "./catalog";
import type { CardEntry, CardClass } from "./types";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) {
      i += 1;
      if (i === needle.length) {
        return true;
      }
    }
  }
  return needle.length === 0;
}

/** Score in [0, 100]; 0 = no match. Exact > prefix > word-prefix > substring > subsequence. */
export function matchScore(query: string, card: Pick<CardEntry, "id" | "name">): number {
  const q = normalize(query);
  if (q.length === 0) {
    return 1;
  }
  const name = normalize(card.name);
  const id = card.id.toLowerCase().replace(/_/g, " ");
  if (name === q || id === q) {
    return 100;
  }
  if (name.startsWith(q)) {
    return 90;
  }
  const words = name.split(" ");
  if (words.some((w) => w.startsWith(q))) {
    return 80;
  }
  const qWords = q.split(" ");
  if (qWords.length > 1 && qWords.every((qw) => words.some((w) => w.startsWith(qw)))) {
    return 75;
  }
  if (name.includes(q)) {
    return 60;
  }
  if (q.length >= 3 && isSubsequence(q.replace(/ /g, ""), name.replace(/ /g, ""))) {
    return 30;
  }
  return 0;
}

export interface SearchOptions {
  readonly classes?: readonly CardClass[];
  readonly limit?: number;
  readonly rewardEligibleOnly?: boolean;
}

export function searchCards(query: string, options: SearchOptions = {}): CardEntry[] {
  const { classes, limit = 12, rewardEligibleOnly = false } = options;
  const scored: { card: CardEntry; score: number }[] = [];
  for (const card of CATALOG.cards) {
    if (classes && !classes.includes(card.class)) {
      continue;
    }
    if (rewardEligibleOnly && !card.rewardEligible) {
      continue;
    }
    const score = matchScore(query, card);
    if (score > 0) {
      scored.push({ card, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
  return scored.slice(0, limit).map((s) => s.card);
}
