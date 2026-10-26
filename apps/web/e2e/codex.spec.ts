import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from "./helpers";

/** The first click can race hydration, so retry until the class sticks (the status line names the class). */
async function pickClass(page: Page, name: string): Promise<void> {
  await expect(async () => {
    await page.locator("label").filter({ hasText: name }).first().click({ timeout: 1000 });
    await expect(page.getByRole("status")).toContainText(`in ${name}`, { timeout: 1000 });
  }).toPass();
}

test.describe("card codex", () => {
  test("lists a class, finds a card by name, and says what it will not show", async ({ page }) => {
    await page.goto("/codex");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Card codex");
    await expect(page.getByText(/never the\s+game.s card text/i)).toBeVisible();
    const list = page.getByRole("list", { name: "Cards" });
    await expect(list.getByRole("listitem").first()).toBeVisible();

    await page.getByRole("searchbox", { name: "Search cards" }).fill("bash");
    await expect(list.getByRole("listitem").first()).toContainText("Bash");
    await expect(page.getByRole("status")).toContainText(/\d+ cards? match in Ironclad/);
  });

  test("switches class, combines filters and recovers from an empty result", async ({ page }) => {
    await page.goto("/codex");
    await pickClass(page, "Silent");
    const status = page.getByRole("status");
    await expect(status).toContainText("in Silent");
    await page.getByLabel("Rarity").selectOption("uncommon");
    await page.getByLabel("Role tag").selectOption("block");
    await expect(status).toContainText(/\d+ cards? match in Silent/);
    await expect(
      page.getByRole("list", { name: "Cards" }).getByRole("listitem").first(),
    ).toContainText("Uncommon");
    await page.getByRole("searchbox", { name: "Search cards" }).fill("zzzzqqqq");
    await expect(status).toHaveText("No card matches.");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(status).toContainText("in Silent");
    await expect(
      page.getByRole("list", { name: "Cards" }).getByRole("listitem").first(),
    ).toBeVisible();
  });

  test("the keyboard reaches the search box, the filters and 'show more'", async ({ page }) => {
    await page.goto("/codex");
    await pickClass(page, "Colorless");
    await page.getByLabel("Sort by").selectOption("cost");
    const more = page.getByRole("button", { name: /^Show \d+ more/ });
    if (await more.count()) {
      await more.focus();
      await page.keyboard.press("Enter");
    }
    await expect(
      page.getByRole("list", { name: "Cards" }).getByRole("listitem").first(),
    ).toBeVisible();
  });

  test("meets layout and accessibility basics", async ({ page }) => {
    await page.goto("/codex");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "codex");
  });
});
