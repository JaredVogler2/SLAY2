import type { DeckSynergy } from "@slay2/decision";

import { Badge } from "@/components/ui/Badge";
import { Panel } from "@/components/ui/Panel";

function names(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1] ?? ""}`;
}

/**
 * What the deck is building and which cards are still waiting for support. Cards are rated by what they need and what
 * they supply (SLAY2's judgement of mechanics, `@slay2/game-data` synergy tags); this panel shows that reading of the
 * deck the recommendation above was made against.
 */
export function SynergyPanel({ synergy }: { synergy: DeckSynergy }) {
  const top = Math.max(...synergy.engines.map((e) => e.value), 1);
  return (
    <Panel
      eyebrow="Synergy · how your cards work together"
      title="What your deck is building"
      headingLevel={3}
      aside={<Badge tone="heuristic">Judgement, not measured</Badge>}
      aria-label="Synergy of your deck"
    >
      {synergy.engines.length === 0 && synergy.waiting.length === 0 ? (
        <p className="text-sm text-muted">
          No engine yet: none of your cards supply something that another card of yours needs. The
          ranking above rates each offered card by its own rating, by the roles your deck lacks and
          by what it would start to build with the cards you have.
        </p>
      ) : null}
      {synergy.engines.length > 0 ? (
        <div>
          <p className="text-sm font-medium text-parchment">Engines</p>
          <ul className="mt-2 space-y-3" aria-label="Engines in your deck">
            {synergy.engines.map((e) => (
              <li key={e.mechanic} className="text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="font-medium text-parchment">{e.label}</span>
                  <span className="num text-xs text-muted">{e.value.toFixed(1)} points</span>
                </div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-charcoal" aria-hidden="true">
                  <span
                    className="block h-full rounded-full bg-teal"
                    style={{ width: `${Math.round((e.value / top) * 100).toString()}%` }}
                  />
                </div>
                <p className="mt-1 text-muted">
                  {e.sources.length > 0 ? `Supplied by ${names(e.sources)}` : "No supplier"}
                  {e.payoffs.length > 0 ? `; used by ${names(e.payoffs)}.` : "."}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {synergy.waiting.length > 0 ? (
        <div className={synergy.engines.length > 0 ? "mt-5" : ""}>
          <p className="text-sm font-medium text-parchment">Waiting for support</p>
          <ul
            className="mt-2 space-y-1.5 text-sm text-muted"
            aria-label="Cards waiting for support"
          >
            {synergy.waiting.map((w) => (
              <li key={w.name}>
                <span className="text-parchment">
                  {w.name}
                  {w.count > 1 ? ` x${w.count.toString()}` : ""}
                </span>{" "}
                needs{" "}
                {names(
                  w.lacking.map(
                    (l) =>
                      `${l.label} (${l.suppliers.length > 0 ? `so far from ${names(l.suppliers)}` : "nothing in your deck yet"})`,
                  ),
                )}
                ; about <span className="num">{Math.round(w.heldBack * 100).toString()}</span> % of
                its rating is held back.
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-4 text-xs text-muted">
        The tags say what each card supplies and needs (Strength, Exhaust, Block, Poison, Shivs,
        Orbs, Stars, Osty, Doom and so on). They are SLAY2&rsquo;s judgement from how the cards
        work, with hand-set strengths: nothing here has been measured in games yet.
      </p>
    </Panel>
  );
}
