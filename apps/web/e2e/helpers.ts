import { readFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export interface MeasuredSetInfo {
  readonly character: string;
  /** the label the pages print for the class */
  readonly label: string;
  /** simulated runs of this class that reached the Act-1 boss */
  readonly bossFights: number;
  /** the held-out test of acting on the class's values, when it has been run */
  readonly validation: {
    readonly passed: boolean;
    /** what licenses the set: the class's own comparison, or the pooled test of the five classes and its rule (ADR-053) */
    readonly basis?: "own" | "pooled";
    readonly passRate: number;
    readonly passRateBase: number;
    readonly pairedGames: number;
  } | null;
}

/**
 * The classes whose card values the site ships, read from the generated file the pages are built from, so a test follows the
 * data (a class whose held-out test finishes changes what its pages say) instead of a hard-coded idea of which class is which.
 */
export function measuredSets(): readonly MeasuredSetInfo[] {
  const file = join(__dirname, "..", "src", "content", "cardvalues.generated.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as {
    sets: {
      character: string;
      bossFights: number;
      validation: MeasuredSetInfo["validation"];
    }[];
  };
  return data.sets.map((s) => ({
    character: s.character,
    label: s.character.charAt(0).toUpperCase() + s.character.slice(1),
    bossFights: s.bossFights,
    validation: s.validation,
  }));
}

/**
 * The display names of a class's best-measured cards that the advisor can offer (cards of the class's own pool, eligible as a
 * card reward), best first. Read from the same generated file and the same catalog the pages are built from.
 */
export function bestMeasuredCardNames(character: string, n: number): string[] {
  const catalogFile = join(
    __dirname,
    "..",
    "..",
    "..",
    "packages",
    "game-data",
    "data",
    "cards.sts2-main-0.107.1.json",
  );
  const catalog = (
    JSON.parse(readFileSync(catalogFile, "utf8")) as {
      cards: { id: string; name: string; class: string; rewardEligible: boolean }[];
    }
  ).cards;
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const valuesFile = join(__dirname, "..", "src", "content", "cardvalues.generated.json");
  const data = JSON.parse(readFileSync(valuesFile, "utf8")) as {
    sets: { character: string; cards: { id: string }[] }[];
  };
  const set = data.sets.find((x) => x.character === character);
  if (!set) {
    throw new Error(`expected shipped card values for ${character}`);
  }
  const names: string[] = [];
  for (const c of set.cards) {
    const entry = byId.get(c.id);
    if (entry?.class === character && entry.rewardEligible) {
      names.push(entry.name);
    }
  }
  return names.slice(0, n);
}

/** One class's shipped set; the test fails loudly when the class is missing instead of passing on `undefined`. */
export function requireMeasuredSet(character: string): MeasuredSetInfo {
  const set = measuredSets().find((s) => s.character === character);
  if (!set) {
    throw new Error(`expected shipped card values for ${character}`);
  }
  return set;
}

/** Fails the test on serious/critical axe violations (WCAG 2.2 A/AA tags). */
export async function expectNoSeriousA11yViolations(page: Page, context?: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(
    serious.map(
      (v) =>
        `${v.id}: ${v.help} (${String(v.nodes.length)} nodes) e.g. ${v.nodes[0]?.target.join(" ") ?? ""}`,
    ),
    context ?? "axe violations",
  ).toEqual([]);
}

/** No element may stick out of the viewport horizontally (outside horizontally scrollable containers). */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  const offenders = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1)) {
        let p = el.parentElement;
        let scrollable = false;
        while (p && p !== document.body) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden") {
            scrollable = true;
            break;
          }
          p = p.parentElement;
        }
        if (!scrollable) {
          out.push(`${el.tagName.toLowerCase()} right=${String(Math.round(r.right))}`);
        }
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, vw, out: out.slice(0, 6) };
  });
  expect(
    offenders.scrollWidth,
    `horizontal scroll: ${offenders.out.join(", ")}`,
  ).toBeLessThanOrEqual(offenders.vw);
}

/**
 * Text that an `overflow: hidden` box cuts off (a label that does not fit its card), apart from screen-reader-only text and
 * deliberate ellipsis. Pages used to clip "Necrobinder" and "selected" in the advisor's character cards at every phone and
 * tablet width without any test noticing: nothing overflowed the page, the box just hid the end of the word.
 */
export async function expectNoClippedText(page: Page): Promise<void> {
  const clipped = await page.evaluate(() => {
    const out: string[] = [];
    for (const el of document.querySelectorAll("body *")) {
      const cs = getComputedStyle(el);
      if (!/(hidden|clip)/.test(cs.overflowX) || cs.textOverflow === "ellipsis") {
        continue;
      }
      if (typeof el.className === "string" && el.className.includes("sr-only")) {
        continue;
      }
      if (el.clientWidth === 0 || el.scrollWidth <= el.clientWidth + 1) {
        continue;
      }
      const box = el.getBoundingClientRect();
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = node.textContent?.trim() ?? "";
        if (text === "" || node.parentElement?.closest(".sr-only") != null) {
          continue; // screen-reader-only text is clipped by design
        }
        const range = document.createRange();
        range.selectNodeContents(node);
        if (range.getBoundingClientRect().right > box.right + 1) {
          out.push(`${el.tagName.toLowerCase()}: “${text.slice(0, 30)}”`);
          break;
        }
      }
    }
    return out;
  });
  expect(clipped, "text cut off by an overflow:hidden box").toEqual([]);
}

export interface NeowInfo {
  /** the held-out test of playing by the opening-relic values, when it has been run */
  readonly test: {
    readonly passed: boolean;
    readonly bothCompleted: number;
    readonly alpha: number;
    readonly members: readonly {
      readonly character: string;
      readonly reachedAct2: {
        readonly a: number;
        readonly b: number;
        readonly pairedTable: { readonly mcnemar_p: number };
      };
    }[];
  } | null;
  /** measured relics by the simulator's label; empty while no valid measurement is published */
  readonly relics: readonly {
    readonly label: string;
    readonly beta: number;
    readonly kind: string;
  }[];
}

/** The opening-relic values and the result of their one test, read from the generated file the pages are built from. */
export function neowInfo(): NeowInfo {
  const file = join(__dirname, "..", "src", "content", "neow.generated.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as {
    values: { relics: NeowInfo["relics"] } | null;
    test: NeowInfo["test"];
  };
  return { test: data.test, relics: data.values?.relics ?? [] };
}

/**
 * Whether the advisor may say what the tested rule would take for a class (ADR-049): the pooled test passed and the class's own
 * games had the rule ahead at the test's level split over its classes. The same rule as `classResult` in the web library, read
 * from the file again so that a test does not trust the code it is testing.
 */
export function neowAdvisedFor(character: string): boolean {
  const { test } = neowInfo();
  const member = test?.members.find((m) => m.character === character);
  if (!test || !member || !test.passed) {
    return false;
  }
  return (
    member.reachedAct2.a > member.reachedAct2.b &&
    member.reachedAct2.pairedTable.mcnemar_p < test.alpha / test.members.length
  );
}
