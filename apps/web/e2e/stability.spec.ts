import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * Cumulative layout shift while a page loads. Two things used to move the page: the web fonts swapping in half way through
 * (the headings re-wrapped: 0.09 on the landing page) and the advisor's loading skeleton being replaced by a taller page
 * (0.09 on a desktop, 0.31 on a phone, which is "poor" by the Web Vitals thresholds). The bar here is far below the
 * "good" threshold of 0.1, and the slow-network case is the one where the fonts used to arrive late.
 */
const MAX_SHIFT = 0.02;

const ROUTES = ["/", "/advisor", "/odds", "/routes", "/methods", "/codex", "/about"];

async function observeShifts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number };
    w.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (!shift.hadRecentInput) {
          w.__cls += shift.value;
        }
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function loadedShift(page: Page, route: string): Promise<number> {
  await page.goto(route, { waitUntil: "networkidle" });
  await page.waitForTimeout(800); // the late shifts: hydration, then anything keyed to it
  return page.evaluate(() => (window as unknown as { __cls: number }).__cls);
}

async function slowNetwork(context: BrowserContext, page: Page): Promise<void> {
  // the "slow 4G" profile Lighthouse uses for phones: 150 ms round trip, 1.6 Mbit/s
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
}

test.describe("layout stability", () => {
  for (const route of ROUTES) {
    test(`${route} does not shift while it loads`, async ({ page }) => {
      await observeShifts(page);
      expect(await loadedShift(page, route)).toBeLessThan(MAX_SHIFT);
    });
  }

  // the two pages that shifted before: the fonts arrive late on a slow connection and must not move the text
  for (const route of ["/", "/advisor"]) {
    test(`${route} does not shift on a slow connection either`, async ({ page, context }) => {
      await observeShifts(page);
      await slowNetwork(context, page);
      expect(await loadedShift(page, route)).toBeLessThan(MAX_SHIFT);
    });
  }

  test("the advisor is drawn before the page is interactive, and its controls wait for it", async ({
    page,
  }) => {
    // with scripts blocked the server-drawn page is all there is: the real layout, with every control inert
    await page.route("**/_next/static/chunks/**/*.js", (route) => route.abort());
    await page.goto("/advisor", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "Choose your character" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Try an example" })).toBeDisabled();
    await expect(page.getByRole("radio", { name: /Ironclad/ })).toBeDisabled();
  });
});
