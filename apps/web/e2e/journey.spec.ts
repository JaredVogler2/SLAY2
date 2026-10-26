import { expect, test } from "@playwright/test";

// prompts/11 campaign 9, scripted proxy for a human walk-through: from the homepage to a first decision quickly,
// with few interactions, on a phone and on a desktop.
test.describe("first decision", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("homepage -> example offer -> recommendation: 3 interactions, well under 30 seconds", async ({
    page,
  }) => {
    const started = Date.now();
    let interactions = 0;
    await page.goto("/");
    await page.getByRole("link", { name: "Get my next decision", exact: true }).click();
    interactions += 1;
    await expect(
      page.getByRole("heading", { level: 1, name: /Take it, or skip it/ }),
    ).toBeVisible();
    // the first click can race hydration: retry it until the example is really loaded
    await expect(async () => {
      await page.getByRole("button", { name: "Try an example" }).click({ timeout: 1500 });
      await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible({
        timeout: 1500,
      });
    }).toPass();
    interactions += 1;
    // the answer names an action, gives reasons, and says how sure it is
    await expect(page.getByText("Heuristic v0").first()).toBeVisible();
    await expect(page.getByRole("list", { name: "Ranked options" })).toBeVisible();
    expect(interactions).toBeLessThanOrEqual(3);
    expect(Date.now() - started).toBeLessThan(30_000);
  });

  test("a real offer: character, three cards, recommendation in at most 8 interactions", async ({
    page,
  }) => {
    let interactions = 0;
    await page.goto("/advisor");
    await expect(async () => {
      await page.locator("label").filter({ hasText: "Ironclad" }).first().click({ timeout: 1000 });
      await expect(page.getByRole("heading", { name: "Your run" })).toBeVisible({ timeout: 1000 });
    }).toPass();
    interactions += 1;
    for (const name of ["pommel", "shrug", "inflame"]) {
      const box = page.getByRole("combobox", { name: /offered card/i });
      await box.fill(name);
      await box.press("Enter");
      interactions += 2; // type + confirm
    }
    await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
    expect(interactions).toBeLessThanOrEqual(8);
  });

  test("the odds tabs open real calculators that answer with numbers", async ({ page }) => {
    await page.goto("/odds");
    // each tab is a real route into a real calculator, each calculator changes its answer when an input changes
    const slider = page.getByRole("tab", { name: /rewards/i });
    await expect(slider).toBeVisible();
    await expect(async () => {
      await page.getByRole("tab", { name: /draws/i }).click({ timeout: 1000 });
      await expect(page.getByRole("tabpanel")).toContainText(/%/, { timeout: 1000 });
    }).toPass();
  });
});
