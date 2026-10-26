import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow } from "./helpers";

/**
 * Every page, at the widths phones really have. The suite's mobile project is a Pixel 7 (412 px), which is exactly the
 * width at which the header's six links still fitted: at 390 px (an iPhone) every page scrolled sideways by 10 px, at 360 px
 * by 40 px and at 320 px /methods by 71 px, and "About" was cut off. This sweeps the narrower widths over the default state
 * of each page and over the states that put the most on the screen.
 */
const WIDTHS = [320, 360, 390];

const PAGES = [
  "/",
  "/advisor",
  "/odds?tab=rewards",
  "/odds?tab=potions",
  "/odds?tab=rooms",
  "/odds?tab=draws",
  "/odds?tab=shop",
  "/routes?a=M%3FMER&b=M%3F%3FRE&c=ESRT",
  "/codex",
  "/methods",
  "/about",
];

async function documentOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

test.describe("phone widths", () => {
  test.skip(({ isMobile }) => !isMobile, "the sweep sets its own widths: one project is enough");

  for (const width of WIDTHS) {
    test.describe(`${String(width)} px`, () => {
      test.use({ viewport: { width, height: 800 } });

      for (const route of PAGES) {
        test(`${route} does not scroll sideways`, async ({ page }) => {
          await page.goto(route, { waitUntil: "networkidle" });
          expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
          await expectNoHorizontalOverflow(page);
        });
      }

      test("the advisor with an offer and its recommendation fits", async ({ page }) => {
        await page.goto("/advisor", { waitUntil: "networkidle" });
        await page.getByRole("button", { name: "Try an example" }).click();
        await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
        expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
        await expectNoHorizontalOverflow(page);
      });

      test("every link of the header is on the screen without scrolling", async ({ page }) => {
        await page.goto("/", { waitUntil: "networkidle" });
        const nav = page.getByRole("navigation", { name: "Primary" });
        const links = nav.getByRole("link");
        await expect(links).toHaveCount(6);
        for (const link of await links.all()) {
          const box = await link.boundingBox();
          expect(box).not.toBeNull();
          expect(box?.x ?? -1).toBeGreaterThanOrEqual(0);
          expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width);
          expect(box?.height ?? 0).toBeGreaterThanOrEqual(44); // a thumb-sized target
        }
      });
    });
  }
});
