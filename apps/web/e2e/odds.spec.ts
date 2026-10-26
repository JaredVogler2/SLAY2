import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from "./helpers";

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/odds${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Exact odds");
}

test.describe("probability observatory", () => {
  test("card rewards: the counter drives exact odds that match the published figures", async ({
    page,
  }) => {
    await open(page, "?k=0");
    // right after a rare (or at the start of a run) a normal-fight pack cannot hold a rare
    await expect(
      page.getByText("Chance of at least one rare").locator("..").getByText("0%").first(),
    ).toBeVisible();
    await page.goto("/odds?k=45");
    // 1 - (1 - 0.43)^3 at the +40 cap
    await expect(page.getByText("81.48%").first()).toBeVisible();
    await page.goto("/odds?k=0&src=elite");
    await expect(page.getByText("16.95%").first()).toBeVisible();
  });

  test("the exact fraction is one click away and copyable", async ({ page }) => {
    await open(page, "?k=45");
    const stat = page.getByText("Chance of at least one rare").locator("..");
    await stat.getByRole("button", { name: "exact" }).first().click();
    await expect(stat.locator("code").first()).toContainText("/");
  });

  test("history mode infers the counter from packs and flags impossible histories", async ({
    page,
  }) => {
    await open(page, "?mode=history");
    const add = page.getByRole("button", { name: "Add pack" });
    await expect(async () => {
      await add.click({ timeout: 1000 });
      await expect(page.getByRole("list", { name: "Packs listed" })).toBeVisible({ timeout: 1000 });
    }).toPass();
    await add.click();
    await add.click();
    // three normal-fight packs without a rare: the counter is exactly 9 non-rare cards, so the posterior has one bar
    await expect(page.getByRole("heading", { name: "Where your counter might be" })).toBeVisible();
    // a rare in the very first normal-fight pack is impossible (0% rare chance at the −5 start)
    await page.getByRole("button", { name: "Clear list" }).click();
    await page.locator("label").filter({ hasText: /^1$/ }).click();
    await add.click();
    await expect(page.getByRole("alert").filter({ hasText: "cannot happen" })).toBeVisible();
  });

  test("a specific card's chance is the expected slots of its rarity over the pool size", async ({
    page,
  }) => {
    await open(page, "?k=0&src=boss");
    // boss pack = three rares drawn from 25: 3/25 = 12%
    const card = page.getByRole("combobox", { name: "Card", exact: true });
    await card.fill("inflame");
    await card.press("Enter");
    // Inflame is an uncommon: a boss pack holds none
    await expect(page.getByText("0%").first()).toBeVisible();
    await card.fill("demon form");
    await card.press("Enter");
    await expect(page.getByText("12%").first()).toBeVisible();
  });

  test("potions: two misses raise the stored chance by twenty points", async ({ page }) => {
    await open(page, "?tab=potions");
    const noPotion = page.getByRole("button", { name: "No potion" }).first();
    await expect(async () => {
      await noPotion.click({ timeout: 1000 });
      await expect(page.getByRole("list", { name: "Fights logged" })).toBeVisible({
        timeout: 1000,
      });
    }).toPass();
    await noPotion.click();
    // 40% + 2 x 10 = 60% for the next normal fight
    await expect(
      page.getByText("Next normal fight").locator("..").getByText("60%").first(),
    ).toBeVisible();
  });

  test("question-mark rooms start at 85% event and react to a shop", async ({ page }) => {
    await open(page, "?tab=rooms");
    await expect(
      page.getByRole("img", { name: /Event 85%.*Fight 10%.*Shop 3%.*Treasure 2%/ }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Shop", exact: true }).click();
    await expect(page.getByRole("list", { name: "Rooms logged" })).toBeVisible();
  });

  test("draws: opening hand with one copy in a ten-card deck is exactly 50%", async ({ page }) => {
    await open(page, "?tab=draws&pile=10&copies=1&draws=5");
    await expect(
      page.getByText("Chance of drawing at least 1").locator("..").getByText("50%").first(),
    ).toBeVisible();
    await page.goto("/odds?tab=draws&pile=3&copies=1&draws=5");
    await expect(
      page.getByRole("alert").filter({ hasText: "cannot draw more cards" }),
    ).toBeVisible();
  });

  test("shop: removal gets dearer with Inflation (A6+)", async ({ page }) => {
    await open(page, "?tab=shop&asc=6");
    await expect(page.getByText("Inflation applies (100 + 50n)")).toBeVisible();
    await expect(page.getByText("100g").first()).toBeVisible();
  });

  for (const tab of ["rewards", "potions", "rooms", "draws", "shop"]) {
    test(`tab ${tab}: layout and accessibility`, async ({ page }) => {
      await open(page, `?tab=${tab}`);
      await expectNoHorizontalOverflow(page);
      await expectNoSeriousA11yViolations(page, tab);
    });
  }

  test("tabs follow the keyboard pattern", async ({ page }) => {
    await open(page);
    const first = page.getByRole("tab", { name: "Card rewards" });
    await first.focus();
    await first.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Potions" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("tab", { name: "Potions" }).press("End");
    await expect(page.getByRole("tab", { name: "Shop & gold" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  test("refuses to guess: ascension is shown as assumed until chosen", async ({ page }) => {
    await open(page);
    await expect(page.getByText("Ascension not set · A0 assumed")).toBeVisible();
    await page.getByLabel("Ascension").selectOption("7");
    await expect(page.getByText(/^\W?A7$/).first()).toBeVisible();
  });
});
