import { CATALOG } from "@slay2/game-data";
import { describe, expect, it } from "vitest";

import cardvalues from "@/content/cardvalues.generated.json";
import {
  CURRENT_SET_ID,
  currentSet,
  extremes,
  formatBeta,
  measuredCount,
  measuredValue,
  oddsMultiplier,
  signCounts,
  valueSign,
} from "@/lib/cardvalues";

describe("measured card values", () => {
  it("ships the set the site shows, with the facts needed to read it", () => {
    const set = currentSet();
    expect(set?.id).toBe(CURRENT_SET_ID);
    expect(set?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(set?.games).toBeGreaterThan(1000);
    expect(set?.bossFights).toBeLessThanOrEqual(set?.games ?? 0);
    expect(set?.passRate).toBeGreaterThan(0);
    expect(set?.passRate).toBeLessThan(1);
    expect(set?.batches.length).toBeGreaterThan(0);
    expect(set?.model.cvAuc).toBeGreaterThan(0.5);
    expect(set?.model.cvLogLoss).toBeLessThan(set?.model.baselineLogLoss ?? 0);
  });

  it("attaches every measurement to exactly one catalog card (simulator `_CARD` ids included)", () => {
    const ids = new Set(CATALOG.cards.map((c) => c.id));
    const seen = new Set<string>();
    for (const c of currentSet()?.cards ?? []) {
      expect(ids.has(c.id), c.id).toBe(true);
      expect(seen.has(c.id), `${c.id} twice`).toBe(false);
      seen.add(c.id);
      expect(c.simId === c.id || c.simId === `${c.id}_CARD`, c.simId).toBe(true);
    }
    expect(measuredCount()).toBe(seen.size);
    // the collision names the simulator suffixes are the reason this mapping exists
    expect(measuredValue("FEEL_NO_PAIN")?.simId).toBe("FEEL_NO_PAIN_CARD");
    expect(measuredValue("FEEL_NO_PAIN_CARD")).toBeUndefined();
  });

  it("reports each value with an interval that contains it and the number of runs it rests on", () => {
    for (const c of currentSet()?.cards ?? []) {
      const [lo = 1, hi = -1] = c.ci95;
      expect(lo <= c.beta && c.beta <= hi, c.id).toBe(true);
      expect(c.gamesWithCard, c.id).toBeGreaterThanOrEqual(30);
      expect(c.gamesWithCard, c.id).toBeLessThanOrEqual(currentSet()?.games ?? 0);
    }
    const betas = (currentSet()?.cards ?? []).map((c) => c.beta);
    expect(betas).toEqual([...betas].sort((a, b) => b - a));
  });

  it("calls a value helpful or harmful only when the whole interval is on one side of zero", () => {
    expect(valueSign({ ci95: [0.2, 0.9] })).toBe("helps");
    expect(valueSign({ ci95: [-0.9, -0.2] })).toBe("hurts");
    expect(valueSign({ ci95: [-0.1, 0.9] })).toBe("unclear");
    expect(valueSign({ ci95: [0, 0.9] })).toBe("unclear");
  });

  it("formats with a real minus sign and a plain odds multiplier", () => {
    expect(formatBeta(1.742)).toBe("+1.74");
    expect(formatBeta(-0.327)).toBe("−0.33");
    expect(formatBeta(0)).toBe("+0.00");
    expect(oddsMultiplier(0)).toBe("×1.0");
    expect(oddsMultiplier(Math.log(5.7))).toBe("×5.7");
    expect(oddsMultiplier(Math.log(0.5))).toBe("×0.50");
    expect(oddsMultiplier(Math.log(12.3))).toBe("×12");
  });

  it("lists the extremes without the starter cards and counts the signs", () => {
    const { best, worst } = extremes(5);
    expect(best).toHaveLength(5);
    expect(worst).toHaveLength(5);
    expect(best[0]?.beta ?? 0).toBeGreaterThanOrEqual(best[4]?.beta ?? 1);
    expect(worst[0]?.beta ?? 1).toBeLessThanOrEqual(worst[4]?.beta ?? 0);
    for (const c of [...best, ...worst]) {
      expect(["STRIKE_IRONCLAD", "DEFEND_IRONCLAD"]).not.toContain(c.id);
    }
    expect(best[0]?.beta ?? 0).toBeGreaterThan(worst[0]?.beta ?? 0);
    const counts = signCounts();
    expect(counts.helps + counts.hurts + counts.unclear).toBe(measuredCount());
    expect(counts.helps).toBeGreaterThan(0);
  });

  it("is the generated file, not a hand-edited one (the staleness test covers the bytes)", () => {
    expect(cardvalues.schema).toBe(1);
    expect(cardvalues.generatedFrom).toContain("experiments/cardvalue");
  });
});
