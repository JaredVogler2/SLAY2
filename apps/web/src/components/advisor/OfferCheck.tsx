"use client";

import { useMemo } from "react";

import { getCard } from "@slay2/game-data";
import { inferCounter, rarityRulesForAscension } from "@slay2/odds";

import { packObservations, sourceToReward, type PackSource, type RunState } from "@/lib/run-state";

/**
 * Cross-checks the offer against the exact odds engine. If the pack you entered cannot happen under the verified rules
 * given the packs you have already recorded, the model, the record or the game build has a problem - say so.
 */
export function OfferCheck({
  run,
  offered,
  source,
}: {
  run: RunState;
  offered: readonly string[];
  source: PackSource;
}) {
  const message = useMemo(() => {
    if (source === "event" || source === "shop" || offered.length === 0) {
      return null;
    }
    const cards = offered.flatMap((id) => {
      const c = getCard(id);
      return c ? [c] : [];
    });
    const rules = rarityRulesForAscension(run.ascension);
    const history = packObservations(run);
    if (inferCounter(history, rules).impossible) {
      return null; // the recorded history itself is already flagged by the pity tracker
    }
    const obs = {
      source: sourceToReward(source),
      cards: offered.length,
      rares: cards.filter((c) => c.rarity === "rare").length,
      uncommons: cards.filter((c) => c.rarity === "uncommon").length,
    };
    return inferCounter([...history, obs], rules).impossible
      ? "This pack cannot happen under the verified rules given the packs you have recorded (for example a rare right after a rare, or at the start of a run). Check the cards and the order of your records — or a relic, event or the scripted first run changed the odds, which SLAY2 does not model."
      : null;
  }, [run, offered, source]);
  if (!message) {
    return offered.length > 0 && offered.length !== 3 ? (
      <p className="text-xs text-muted">
        You entered {offered.length} card{offered.length === 1 ? "" : "s"}. Reward packs normally
        hold 3; the pity tracker treats whatever you record as the whole pack.
      </p>
    ) : null;
  }
  return (
    <p role="alert" className="rounded-lg border border-rose-deep bg-rose/10 p-3 text-sm text-rose">
      ⚠ {message}
    </p>
  );
}
