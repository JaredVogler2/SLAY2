import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ALL_UNLOCKED, rewardPool, starterDeck } from "@slay2/game-data";
import { evaluateDraft, type DraftRequest } from "@slay2/decision";

import { RecommendationPanel } from "@/components/advisor/RecommendationPanel";
import { SkipCheckNote } from "@/components/advisor/SkipCheckNote";
import { SkipCheckPanel } from "@/components/methods/SkipCheckPanel";
import {
  SKIP,
  skipClassLine,
  skipLegSummary,
  skipLegs,
  skipSentence,
  skipStage,
  type SkipClassRow,
  type SkipData,
  type SkipLeg,
  type SkipLegKey,
  type SkipRegistered,
} from "@/lib/skip";

afterEach(cleanup);

const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;

const REGISTERED: SkipRegistered = {
  adr: "ADR-065",
  registered: true,
  price: { from: 20, perCard: 1, legacyFrom: 30, legacyPerCard: 0.6 },
  margins: { firstBossShare: -0.01, meanFloors: -0.25, interval: 0.95 },
  classLevel: 0.01,
  seeds: 2000,
  precondition: {
    file: "experiments/skip/precondition.json",
    sha256: "0".repeat(64),
    games: 2000,
    minimumGapInSkipShare: 0.02,
  },
  result: null,
};

const row = (over: Partial<SkipClassRow> = {}): SkipClassRow => ({
  pairs: 1950,
  s1: 0.45,
  s0: 0.45,
  onlyS1: 60,
  onlyS0: 60,
  p: 1,
  behind: false,
  ahead: false,
  meanFloors: 0,
  ...over,
});

function leg(
  key: SkipLegKey,
  over: Partial<SkipLeg> = {},
  classes: Partial<Record<string, SkipClassRow>> = {},
): SkipLeg {
  return {
    act1: key === "og" ? "overgrowth" : "underdocks",
    file: `experiments/skip/pooled-slot-${key}.json`,
    sha256: "1".repeat(64),
    pairs: 10000,
    bothCompleted: 9800,
    excludedNotCompleted: 200,
    pastActOneBoss: {
      s1: 0.452,
      s0: 0.455,
      onlyS1: 300,
      onlyS0: 310,
      exactP: 0.8,
      difference: -0.003,
      interval95: [-0.0095, 0.0035],
    },
    meanFloors: { difference: -0.02, interval95: [-0.09, 0.05] },
    wins: { s1: 7, s0: 8, onlyS1: 4, onlyS0: 5 },
    notBehind: { firstBoss: true, meanFloors: true },
    verdict: "not-behind",
    classes: Object.fromEntries(CLASSES.map((c) => [c, classes[c] ?? row()])),
    skipShares: {
      s1: { share: 0.07, cardRewards: 5000, skipped: 350 },
      s0: { share: 0.01, cardRewards: 5000, skipped: 50 },
    },
    ...over,
  };
}

const behindLeg = (key: SkipLegKey): SkipLeg =>
  leg(key, {
    pastActOneBoss: {
      s1: 0.43,
      s0: 0.455,
      onlyS1: 250,
      onlyS0: 400,
      exactP: 1e-6,
      difference: -0.025,
      interval95: [-0.034, -0.016],
    },
    notBehind: { firstBoss: false, meanFloors: true },
    verdict: "not-shown-harmless",
  });

const withLegs = (
  legs: Partial<Record<SkipLegKey, SkipLeg>>,
  harmless: boolean | null,
): SkipData => ({
  ...REGISTERED,
  result: { legs, harmless },
});

describe("the stage of the check", () => {
  it("is none when the study is not registered, registered before the legs, half done with one leg, harmless with two that are not behind, and not shown if one is behind", () => {
    expect(skipStage({ registered: false })).toBe("none");
    expect(skipStage(REGISTERED)).toBe("registered");
    expect(skipStage(withLegs({ og: leg("og") }, null))).toBe("partial");
    expect(skipStage(withLegs({ ud: leg("ud") }, null))).toBe("partial");
    expect(skipStage(withLegs({ og: leg("og"), ud: leg("ud") }, true))).toBe("harmless");
    expect(skipStage(withLegs({ og: leg("og"), ud: behindLeg("ud") }, false))).toBe("not-shown");
    expect(skipStage(withLegs({ og: behindLeg("og") }, null))).toBe("not-shown");
  });

  it("lists the legs that are in, Overgrowth first", () => {
    expect(skipLegs(withLegs({ ud: leg("ud"), og: leg("og") }, true)).map(([k]) => k)).toEqual([
      "og",
      "ud",
    ]);
    expect(skipLegs(REGISTERED)).toEqual([]);
    expect(skipLegs({ registered: false })).toEqual([]);
  });

  it("ships the registered study, and the stage it reads follows the legs the exported file holds", () => {
    expect(SKIP.registered).toBe(true);
    const verdicts = skipLegs(SKIP).map(([, leg]) => leg.verdict);
    const expected =
      verdicts.length === 0
        ? "registered"
        : verdicts.includes("not-shown-harmless")
          ? "not-shown"
          : verdicts.length === 2
            ? "harmless"
            : "partial";
    expect(skipStage(SKIP)).toBe(expected);
    // an exported file never claims "harmless" without both legs, and never has legs without a reading of them
    if (SKIP.registered && verdicts.length < 2)
      expect(SKIP.result?.harmless ?? null).not.toBe(true);
  });
});

describe("what the advisor says beside a recommendation that the price touched", () => {
  it("says nothing when the study is not registered", () => {
    expect(skipSentence({ registered: false })).toBeNull();
  });

  it("says that the price is a judgement and its check has not been run, before the legs", () => {
    const text = skipSentence(REGISTERED) ?? "";
    expect(text).toContain("one index point for every card from the 21st on");
    expect(text).toContain("is a judgement, not a measurement");
    expect(text).toContain("registered and has not been run yet");
    expect(text).not.toMatch(/no gross harm was found/);
  });

  it("says that no gross harm was found, with the shares of both versions of Act 1, and nothing about winning, when both legs are not behind", () => {
    const text =
      skipSentence(
        withLegs(
          {
            og: leg("og"),
            ud: leg("ud", { pastActOneBoss: { ...leg("ud").pastActOneBoss, s1: 0.31, s0: 0.312 } }),
          },
          true,
        ),
      ) ?? "";
    expect(text).toContain("in both versions of Act 1, and no gross harm was found");
    expect(text).toContain(
      "in Overgrowth the pilot that charges it got past the first boss in 45.2 % of its games against 45.5 % for version 1's price",
    );
    expect(text).toContain(
      "in Underdocks the pilot that charges it got past the first boss in 31.0 % of its games against 31.2 %",
    );
    expect(text).toContain(
      "A cost of a point at the first boss or of a quarter of a floor is ruled out; whether it helps could not be measured",
    );
    expect(text).not.toMatch(/win(s|ning) more|helps winning|improves/i);
  });

  it("names a small cost in floors, and in which version of Act 1, when its interval lies wholly below zero, and says nothing of it otherwise", () => {
    const cost = {
      meanFloors: { difference: -0.05, interval95: [-0.091, -0.0097] as [number, number] },
    };
    const text = skipSentence(withLegs({ og: leg("og"), ud: leg("ud", cost) }, true)) ?? "";
    expect(text).toContain("no gross harm was found");
    expect(text).toContain(
      "A cost of a point at the first boss or of a quarter of a floor is ruled out. In Underdocks it did reach slightly fewer floors on average (−0.05, 95 % interval −0.09 to −0.01), a small cost inside that margin; whether it helps could not be measured",
    );
    expect(text).not.toContain("In Overgrowth it did reach");
    const both = skipSentence(withLegs({ og: leg("og", cost), ud: leg("ud", cost) }, true)) ?? "";
    expect(both).toContain("In Overgrowth and Underdocks it did reach slightly fewer floors");
    // an interval that reaches zero is not a cost that shows
    const none = skipSentence(withLegs({ og: leg("og"), ud: leg("ud") }, true)) ?? "";
    expect(none).not.toContain("slightly fewer floors");
  });

  it("says that the check is half done, which leg is waiting, and that it counts only when both are in", () => {
    const text = skipSentence(withLegs({ og: leg("og") }, null)) ?? "";
    expect(text).toContain("half done");
    expect(text).toContain("Underdocks is still to come");
    expect(text).toContain("counts only when both are in");
    expect(skipSentence(withLegs({ ud: leg("ud") }, null))).toContain(
      "Overgrowth is still to come",
    );
  });

  it("says that harm could not be ruled out, not that harm was found, and where, when a leg is behind", () => {
    const text = skipSentence(withLegs({ og: leg("og"), ud: behindLeg("ud") }, false)) ?? "";
    expect(text).toContain("did not show it harmless in Underdocks");
    expect(text).toContain(
      "that is not a finding of harm, only that a gross harm could not be ruled out",
    );
    expect(text).not.toContain("Overgrowth");
  });
});

describe("the line of a class whose own games went against the price", () => {
  const classes = {
    silent: row({ behind: true, onlyS1: 30, onlyS0: 110, p: 4.2e-11 }),
    defect: row({ ahead: true, onlyS1: 120, onlyS0: 40 }),
  };

  it("is said for that class, in the version of Act 1 where it happened, with the pairs and the p-value", () => {
    const data = withLegs({ og: leg("og"), ud: leg("ud", {}, classes) }, true);
    const line = skipClassLine("silent", data) ?? "";
    expect(line).toContain(
      "In the simulated Underdocks games of your own class alone, version 1's price came out ahead at the first boss",
    );
    expect(line).toContain(
      "110 pairs got past it only with version 1's price against 30 only with the price of a slot (p = 4.2e-11)",
    );
    expect(line).not.toContain("Overgrowth");
  });

  it("is not said for a class that was ahead, not clear, or for no class, nor before a result", () => {
    const data = withLegs({ og: leg("og"), ud: leg("ud", {}, classes) }, true);
    expect(skipClassLine("defect", data)).toBeNull();
    expect(skipClassLine("ironclad", data)).toBeNull();
    expect(skipClassLine("silent", REGISTERED)).toBeNull();
    expect(skipClassLine("silent", { registered: false })).toBeNull();
  });

  it("is said for both versions of Act 1 when both went against it", () => {
    const data = withLegs({ og: leg("og", {}, classes), ud: leg("ud", {}, classes) }, true);
    const line = skipClassLine("silent", data) ?? "";
    expect(line).toContain("Overgrowth games");
    expect(line).toContain("Underdocks games");
  });
});

describe("the summary of a leg", () => {
  it("gives the figures and, for a leg that is behind, the condition it failed", () => {
    const ok = skipLegSummary("og", leg("og"), REGISTERED);
    expect(ok.verdict).toBe("not behind");
    expect(ok.text).toContain("9,800 paired games");
    expect(ok.text).toContain(
      "45.2 % of them against 45.5 % for version 1's price (−0.30 points, 95 % interval −0.95 to +0.35)",
    );
    expect(ok.text).toContain(
      "its mean floors reached differ by −0.02 (95 % interval −0.09 to +0.05)",
    );
    expect(ok.text).not.toContain("not shown to be harmless");
    const bad = skipLegSummary("ud", behindLeg("ud"), REGISTERED);
    expect(bad.verdict).toBe("not shown to be harmless");
    expect(bad.text).toContain(
      "The leg is not shown to be harmless: the lower end of the interval at the first boss is −3.40 points, not above −1.0",
    );
    expect(bad.text).not.toContain("of the floors");
  });

  it("says that the interval of the floors excludes zero, and that the cost lies inside the registered margin, only when it does", () => {
    const cost = leg("ud", {
      meanFloors: { difference: -0.05, interval95: [-0.091, -0.0097] },
    });
    const text = skipLegSummary("ud", cost, REGISTERED).text;
    expect(text).toContain(
      "its mean floors reached differ by −0.05 (95 % interval −0.09 to −0.01)",
    );
    expect(text).toContain(
      "The interval of the floors excludes zero: with the price the pilot reached slightly fewer floors on average, a cost inside the margin registered for it (−0.25 floors)",
    );
    expect(skipLegSummary("og", leg("og"), REGISTERED).text).not.toContain("excludes zero");
  });
});

describe("the note beside a recommendation", () => {
  it("renders the sentence and a link to the section, and the class line when there is one", () => {
    const data = withLegs(
      {
        og: leg("og"),
        ud: leg("ud", {}, { regent: row({ behind: true, onlyS1: 20, onlyS0: 90, p: 1e-12 }) }),
      },
      true,
    );
    const { container } = render(<SkipCheckNote character="regent" data={data} />);
    const note = container.querySelector("[data-skip-check]");
    expect(note?.textContent).toContain("no gross harm was found");
    expect(note?.textContent).toContain(
      "In the simulated Underdocks games of your own class alone",
    );
    expect(screen.getByRole("link", { name: "Evidence & methods" }).getAttribute("href")).toBe(
      "/methods#price-of-a-slot",
    );
  });

  it("renders nothing when the study is not registered", () => {
    const { container } = render(<SkipCheckNote character="regent" data={{ registered: false }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the section of the Methods page", () => {
  it("renders nothing when the study is not registered", () => {
    const { container } = render(<SkipCheckPanel data={{ registered: false }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("states the design, says that nothing was run, and promises nothing, before the legs", () => {
    const { container } = render(<SkipCheckPanel data={REGISTERED} />);
    const panel = container.querySelector("#price-of-a-slot");
    expect(panel).not.toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("Does charging for a slot do harm?");
    const text = panel?.textContent ?? "";
    expect(text).toContain("registered, not run yet");
    expect(text).toContain("1.0 index point for every card from the 21st on");
    expect(text).toContain("above −1.0 point");
    expect(text).toContain("above −0.25");
    expect(text).toContain("It cannot show that the price helps");
    expect(text).toContain("2,000 games");
    expect(text).toContain("Not run yet.");
    expect(container.querySelector("[data-skip-leg]")).toBeNull();
    expect(text).toContain("Nothing about winning with the advisor");
  });

  it("shows each leg that is in with its figures, a table of the classes, and the class that went against the price, and says that the price was not shown harmless", () => {
    const data = withLegs(
      {
        og: behindLeg("og"),
        ud: leg(
          "ud",
          {},
          {
            necrobinder: row({ behind: true, onlyS1: 25, onlyS0: 100, p: 3e-12 }),
            silent: row({ ahead: true }),
          },
        ),
      },
      false,
    );
    const { container } = render(<SkipCheckPanel data={data} />);
    const og = container.querySelector("[data-skip-leg='og']");
    const ud = container.querySelector("[data-skip-leg='ud']");
    expect(og?.getAttribute("data-skip-verdict")).toBe("not-shown-harmless");
    expect(ud?.getAttribute("data-skip-verdict")).toBe("not-behind");
    expect(og?.textContent).toContain("not shown to be harmless");
    expect(ud?.textContent).toContain("not behind");
    expect(ud?.textContent).toContain("version 1's price ahead");
    expect(ud?.textContent).toContain("slot price ahead");
    expect(ud?.querySelectorAll("tbody tr")).toHaveLength(5);
    expect(og?.textContent).toContain("Card rewards skipped");
    expect(container.querySelector("#price-of-a-slot")?.textContent).toContain(
      "not shown harmless",
    );
    expect(container.querySelector("#price-of-a-slot")?.textContent).not.toContain("Not run yet.");
  });

  it("is labelled harmless as far as the simulation can see only with both legs in and not behind", () => {
    const both = render(<SkipCheckPanel data={withLegs({ og: leg("og"), ud: leg("ud") }, true)} />);
    expect(both.container.textContent).toContain("no gross harm found");
    cleanup();
    const one = render(<SkipCheckPanel data={withLegs({ og: leg("og") }, null)} />);
    expect(one.container.textContent).toContain("half done");
    expect(one.container.textContent).not.toContain("no gross harm found");
  });

  it("says how many games the pilot won once both legs are in, and the earlier estimate before that", () => {
    const both = render(<SkipCheckPanel data={withLegs({ og: leg("og"), ud: leg("ud") }, true)} />);
    expect(both.container.textContent).toContain(
      "the pilot that charges for a slot won 14 of its 20,000 games",
    );
    expect(both.container.textContent).not.toContain("one game in 800");
    cleanup();
    const one = render(<SkipCheckPanel data={withLegs({ og: leg("og") }, null)} />);
    expect(one.container.textContent).toContain("the pilot wins about one game in 800");
  });
});

// ---- on the advisor's recommendation panel, with real drafts

interface Row {
  id: string;
  count: number;
}
function draft(extra: number) {
  const pool = rewardPool("ironclad", ALL_UNLOCKED)
    .filter((c) => c.rarity === "common" || c.rarity === "uncommon")
    .map((c) => c.id);
  const deck: Row[] = starterDeck("ironclad").map((d) => ({ ...d }));
  for (let i = 0; i < extra; i += 1) {
    const id = pool[(i * 7) % pool.length] ?? "";
    const found = deck.find((d) => d.id === id);
    if (found) found.count += 1;
    else deck.push({ id, count: 1 });
  }
  const request: DraftRequest = {
    build: "sts2-main-0.107.1",
    character: "ironclad",
    ascension: 0,
    actIndex: 1,
    deck,
    offered: ["ANGER", "SHRUG_IT_OFF", "BODY_SLAM"],
    source: "regular",
    riskPreference: "balanced",
  };
  return evaluateDraft(request);
}

describe("the recommendation panel", () => {
  it("does not mention the price when the deck is small, and does once the price touched the call", () => {
    const small = render(
      <RecommendationPanel result={draft(4)} onRecord={() => undefined} character="ironclad" />,
    );
    expect(small.container.querySelector("[data-skip-check]")).toBeNull();
    cleanup();
    const big = render(
      <RecommendationPanel result={draft(14)} onRecord={() => undefined} character="ironclad" />,
    );
    const note = big.container.querySelector("[data-skip-check]");
    expect(note).not.toBeNull();
    expect(note?.textContent).toContain("The price of a slot");
    // the note says where the check stands in the stage that the exported file is in
    const WORDS = {
      registered: "registered and has not been run yet",
      partial: "half done",
      harmless: "no gross harm was found",
      "not-shown": "did not show it harmless",
      none: "",
    } as const;
    expect(note?.textContent).toContain(WORDS[skipStage(SKIP)]);
  });
});
