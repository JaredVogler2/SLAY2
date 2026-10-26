import { readFileSync } from "node:fs";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export interface MeasuredSetInfo {
  readonly character: string;
  /** the label the pages print for the class */
  readonly label: string;
  /** the held-out test of acting on the class's values, when it has been run */
  readonly validation: { readonly passed: boolean } | null;
}

/**
 * The classes whose card values the site ships, read from the generated file the pages are built from, so a test follows the
 * data (a class whose held-out test finishes changes what its pages say) instead of a hard-coded idea of which class is which.
 */
export function measuredSets(): readonly MeasuredSetInfo[] {
  const file = join(__dirname, "..", "src", "content", "cardvalues.generated.json");
  const data = JSON.parse(readFileSync(file, "utf8")) as {
    sets: { character: string; validation: { passed: boolean } | null }[];
  };
  return data.sets.map((s) => ({
    character: s.character,
    label: s.character.charAt(0).toUpperCase() + s.character.slice(1),
    validation: s.validation,
  }));
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
