import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

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
