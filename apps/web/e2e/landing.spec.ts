import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations, neowInfo } from "./helpers";

test.describe("landing", () => {
  test("renders the promise, a working live demo and honest coverage", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("on evidence");
    await expect(
      page.getByRole("link", { name: "Get my next decision", exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Main v0.107.1 verified")).toBeVisible();
    await expect(page.getByText("Beta v0.111.0 is refused")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Not supported" }).first()).toBeVisible();
  });

  test("the coverage table lists the start of the run, and the opening-relic values only when a valid measurement is published", async ({
    page,
  }) => {
    await page.goto("/");
    const start = page.getByRole("row", { name: /^Start of the run/ });
    await expect(start).toContainText("Overgrowth or Underdocks");
    const relics = page.getByRole("row", { name: /^Simulated opening-relic values/ });
    const { test: held, relics: measured } = neowInfo();
    if (measured.length === 0) {
      await expect(relics).toHaveCount(0);
      return;
    }
    await expect(relics).toContainText("Research");
    await expect(relics).toContainText("Simulator unverified against the live game");
    if (held === null) {
      await expect(relics).toContainText("not tested against play yet");
    } else {
      await expect(relics).toContainText(
        held.passed ? "taking the best-measured relic:" : "did not beat the first helpful one",
      );
    }
  });

  test("the pity demo recomputes with the real engine", async ({ page }) => {
    await page.goto("/");
    const slider = page.getByLabel("Non-rare cards since your last rare");
    const normal = page.getByText("After a normal fight").locator("..");
    // retry: the first interaction can race React hydration on slow devices
    await expect(async () => {
      await slider.fill("0");
      // after a rare, a normal-fight pack has no rare chance at all (rule CARD-8)
      await expect(normal.getByText("0%").first()).toBeVisible({ timeout: 1000 });
    }).toPass();
    await slider.fill("45");
    // independent closed form at the cap: 1 - (1 - 0.43)^3 = 81.4815 %
    await expect(normal.getByText("81.5%").first()).toBeVisible();
  });

  test("meets layout and accessibility basics", async ({ page }) => {
    await page.goto("/");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "landing");
  });

  test("keyboard: skip link reaches main content", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });
});
