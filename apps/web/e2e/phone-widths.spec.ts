import { expect, test, type Page } from "@playwright/test";

import { expectNoClippedText, expectNoHorizontalOverflow, neowInfo } from "./helpers";

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

const NO_RELIC_VALUES = neowInfo().relics.length === 0;

/** The advisor with Neow's three relics set beside the simulated values: three tiles, a verdict and the caveats on the screen. */
async function compareNeowOffer(page: Page): Promise<void> {
  await page.goto("/advisor", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Try an example" }).click();
  await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
  await page.getByText(/What did Neow offer\? Compare the three/).click();
  await page.getByLabel("First helpful option").selectOption("FISHING_ROD");
  await page.getByLabel("Second helpful option").selectOption("WINGED_BOOTS");
  await page.getByLabel("Costly option").selectOption("SILVER_CRUCIBLE");
  await expect(
    page.getByRole("list", { name: "Measured values of the relics offered" }).getByRole("listitem"),
  ).toHaveCount(3);
}

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
          await expectNoClippedText(page);
        });
      }

      test("the advisor with an offer and its recommendation fits", async ({ page }) => {
        await page.goto("/advisor", { waitUntil: "networkidle" });
        await page.getByRole("button", { name: "Try an example" }).click();
        await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
        expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
        await expectNoHorizontalOverflow(page);
        await expectNoClippedText(page);
      });

      test("the advisor with Neow's three relics compared fits", async ({ page }) => {
        test.skip(NO_RELIC_VALUES, "no valid opening-relic measurement is published");
        await compareNeowOffer(page);
        expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
        await expectNoHorizontalOverflow(page);
        await expectNoClippedText(page);
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

/**
 * Tablets and small laptops. The advisor's five character cards used to clip their names between 640 and 1024 px, and the
 * header of a visitor with a saved run (the "Resume" chip) and the build badge were 40 to 120 px wider than a screen of 640
 * to 800 px.
 */
test.describe("tablet and small laptop widths", () => {
  test.skip(({ isMobile }) => !isMobile, "the sweep sets its own widths: one project is enough");

  for (const width of [640, 768, 1024, 1280]) {
    test.describe(`${String(width)} px`, () => {
      test.use({ viewport: { width, height: 900 } });

      test("the header of a visitor with a saved run fits", async ({ page }) => {
        await page.goto("/advisor", { waitUntil: "networkidle" });
        await page.getByRole("button", { name: "Try an example" }).click();
        await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
        await page.goto("/", { waitUntil: "networkidle" });
        expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
        await expectNoClippedText(page);
        // the chip needs the single-row header (from 768 px); below that the six links are the way back
        await expect(page.getByRole("link", { name: /^Resume/ })).toBeVisible({
          visible: width >= 768,
        });
      });

      test("the advisor with an offer fits and cuts nothing off", async ({ page }) => {
        await page.goto("/advisor", { waitUntil: "networkidle" });
        await page.getByRole("button", { name: "Try an example" }).click();
        await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
        expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
        await expectNoClippedText(page);
      });

      test("the advisor with Neow's three relics compared fits and cuts nothing off", async ({
        page,
      }) => {
        test.skip(NO_RELIC_VALUES, "no valid opening-relic measurement is published");
        await compareNeowOffer(page);
        expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
        await expectNoClippedText(page);
      });

      for (const route of ["/routes?a=M%3FMER&b=M%3F%3FRE&c=ESRT", "/codex", "/odds?tab=rewards"]) {
        test(`${route} fits and cuts nothing off`, async ({ page }) => {
          await page.goto(route, { waitUntil: "networkidle" });
          expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
          await expectNoClippedText(page);
        });
      }
    });
  }
});

/**
 * Every class, at the widths where the five class cards or chips are laid out differently. "Necrobinder" is the longest
 * name, and its "selected" label was cut off on every laptop and desktop (1280 and 1440 px), which no test saw because the
 * suite only ever selected Ironclad.
 */
test.describe("every class selected", () => {
  test.skip(({ isMobile }) => !isMobile, "the sweep sets its own widths: one project is enough");

  for (const width of [360, 768, 1024, 1280, 1440]) {
    test.describe(`${String(width)} px`, () => {
      test.use({ viewport: { width, height: 900 } });

      for (const name of ["Ironclad", "Silent", "Regent", "Necrobinder", "Defect"]) {
        test(`the advisor with ${name} selected cuts nothing off`, async ({ page }) => {
          await page.goto("/advisor", { waitUntil: "networkidle" });
          await page.locator("label").filter({ hasText: name }).first().click();
          await expect(page.getByRole("heading", { name: "Your run" })).toBeVisible();
          expect(await documentOverflow(page)).toBeLessThanOrEqual(0);
          await expectNoClippedText(page);
        });
      }
    });
  }
});
