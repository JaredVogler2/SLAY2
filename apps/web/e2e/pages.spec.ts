import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from "./helpers";

test.describe("methods", () => {
  test("is an honest ledger: rules with evidence, verification layers, simulator results with intervals", async ({
    page,
  }) => {
    await page.goto("/methods");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("ledger");
    await expect(page.getByRole("heading", { name: /Four independent layers/ })).toBeVisible();
    await expect(page.getByText("Parity with the live game unverified").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Paired comparisons" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /Things this site does not know/ }),
    ).toBeVisible();

    // every batch row carries its denominator and Wilson interval
    const batches = page.getByRole("region", { name: "Simulator batches" });
    await expect(batches.getByRole("row")).not.toHaveCount(0);
    await expect(batches.getByText(/\(0\.00%–\d+\.\d+%\)/).first()).toBeVisible();
  });

  test("explains the card values with their intervals, the caveats and the pre-registered test", async ({
    page,
  }) => {
    await page.goto("/methods#card-values");
    const panel = page.locator("#card-values");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { level: 2 })).toContainText("randomised drafting");
    await expect(panel.getByRole("table", { name: "Highest measured values" })).toBeVisible();
    await expect(panel.getByRole("table", { name: "Lowest measured values" })).toBeVisible();
    await expect(panel).toContainText(/Does acting on the \w+ values help\?/);
    await expect(panel).toContainText(/Past the Act-1 boss: \d+\.\d% for rules_v2/);
    await expect(panel).toContainText("Simulated, not measured in the live game");
  });

  test("every rule is a deep-linkable anchor", async ({ page }) => {
    await page.goto("/methods#CARD-8");
    const row = page.locator("#CARD-8");
    await expect(row).toBeVisible();
    await expect(row).toContainText("CARD-8");
  });

  test("meets layout and accessibility basics", async ({ page }) => {
    await page.goto("/methods");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "methods");
  });
});

test.describe("about", () => {
  test("states what the site is, is not, and what is undecided", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("independent fan project");
    await expect(page.getByText(/not affiliated/i).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /What stays in your browser/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /still undecided/ })).toBeVisible();
    await expect(page.getByText("No public contact channel has been configured")).toBeVisible();
  });

  test("meets layout and accessibility basics", async ({ page }) => {
    await page.goto("/about");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "about");
  });
});

test.describe("not found", () => {
  test("unknown paths answer 404 with a helpful, accessible page", async ({ page }) => {
    const response = await page.goto("/definitely-not-a-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("not on the map");
    await expect(
      page.getByRole("list", { name: "Where to go instead" }).getByRole("link"),
    ).toHaveCount(3);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "not-found");
  });
});

test.describe("navigation", () => {
  test("the header reaches every top-level page", async ({ page, isMobile }) => {
    await page.goto("/");
    for (const [name, heading] of [
      ["Advisor", /Take it, or skip it/i],
      ["Odds", /Exact odds/i],
      ["Codex", /Card codex/i],
      ["Methods", /ledger/i],
    ] as const) {
      const link = page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name });
      await expect(link, `${name} link${isMobile ? " (mobile)" : ""}`).toBeVisible();
      await link.click();
      await expect(page.getByRole("heading", { level: 1 })).toContainText(heading);
      await page.goto("/");
    }
  });
});
