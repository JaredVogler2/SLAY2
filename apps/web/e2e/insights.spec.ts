import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from "./helpers";

/**
 * The insights page (ADR-059): reachable from the header, every section where the contents list says, the charts have text beside them,
 * the atlas answers the class and mechanic it is asked about, and the page is accessible and fits at the widths people have.
 */
const SECTIONS = [
  "findings",
  "levers",
  "runs-end",
  "second-boss",
  "later",
  "acts",
  "cards",
  "synergy",
  "ascension",
  "coverage",
  "open",
];

test.describe("insights", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("is reachable from the header and says first what its figures are", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Insights" })
      .click();
    await expect(page).toHaveURL(/\/insights$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "What moves the odds in simulated runs",
    );
    await expect(page.getByText("Simulated · unverified").first()).toBeVisible();
    await expect(page.getByText(/never been compared with the live game/)).toBeVisible();
  });

  test("has every section where the contents list sends you", async ({ page }) => {
    await page.goto("/insights");
    const nav = page.getByRole("navigation", { name: "On this page" });
    const links = nav.getByRole("link");
    await expect(links).toHaveCount(SECTIONS.length);
    for (const id of SECTIONS) {
      await expect(page.locator(`section#${id}`)).toHaveCount(1);
      await nav.locator(`a[href="#${id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`#${id}$`));
      await expect(page.locator(`section#${id}`)).toBeInViewport();
    }
  });

  test("ranks the levers and writes each bar's figure and interval beside it", async ({ page }) => {
    await page.goto("/insights");
    const ladder = page.locator("#levers ol > li");
    await expect(ladder).toHaveCount(7);
    await expect(ladder.first()).toContainText("Pick cards by measured value");
    await expect(ladder.first()).toContainText(/\d+\.\d% against \d+\.\d% past the Act-1 boss/);
    await expect(ladder.first().getByRole("img").first()).toHaveAttribute(
      "aria-label",
      /points past the Act-1 boss, 95 % interval/,
    );
  });

  test("shows how runs end class by class and holds the same figures as a table", async ({
    page,
  }) => {
    await page.goto("/insights");
    await expect(page.locator('#runs-end [role="img"]')).toHaveCount(12);
    await page.getByText("The figures as a table").first().click();
    const table = page.locator("#runs-end table").first();
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(10);
    // the share of the dying that happened in a boss fight is counted from the games, and the boss fights are tagged in the lists
    await expect(page.locator("#runs-end")).toContainText(
      /A boss fight ended \d+\.\d% of the runs that died at Ascension 0/,
    );
    await expect(page.locator("#runs-end")).not.toContainText(/bosses end most/i);
    await expect(page.locator("#runs-end ol li", { hasText: "Vantom" }).first()).toContainText(
      "boss",
    );
  });

  test("answers the class and the mechanic the atlas is asked about", async ({ page }) => {
    await page.goto("/insights");
    const atlas = page.locator("#synergy");
    // the first interaction can race hydration: retry until the radio sticks
    // the radios are visually hidden inside their labels, so a person clicks the label
    await expect(async () => {
      await atlas.locator("label", { hasText: /^Silent$/ }).click({ timeout: 1000 });
      await expect(atlas.getByRole("radio", { name: "Silent" })).toBeChecked({ timeout: 1000 });
    }).toPass();
    await atlas.getByLabel("Mechanic").selectOption("poison");
    await expect(atlas.getByRole("heading", { level: 3, name: "Poison" })).toBeVisible();
    await expect(atlas.getByRole("region", { name: "Cards that supply Poison" })).toBeVisible();
    await expect(atlas.getByRole("region", { name: "Cards that need Poison" })).toBeVisible();
    // a class has no cards of another class, and the colorless cards are marked
    await expect(atlas.getByRole("region", { name: "Cards that supply Poison" })).not.toContainText(
      "Inflame",
    );
    await atlas.locator("label", { hasText: /^Ironclad$/ }).click();
    await atlas.getByLabel("Mechanic").selectOption("strength");
    await expect(atlas.getByRole("region", { name: "Cards that supply Strength" })).toContainText(
      "Inflame",
    );
  });

  test("says in the coverage table what the site does not hold of the game", async ({ page }) => {
    await page.goto("/insights");
    const events = page.locator("#coverage-events");
    await expect(events).toContainText("66");
    await expect(events.locator(".sr-only").first()).toHaveText(/Not covered/);
    await expect(page.locator("#coverage-cards")).toContainText("577");
  });

  test("meets layout and accessibility basics, with every section open", async ({ page }) => {
    await page.goto("/insights");
    await page.evaluate(() => {
      document.querySelectorAll("details").forEach((d) => {
        d.open = true;
      });
    });
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "insights");
  });
});
