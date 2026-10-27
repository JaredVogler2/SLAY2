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
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Codex");
    await expect(page.getByText(/never the\s+game.s card or\s+relic text/i)).toBeVisible();
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

  test("shows what simulated runs say about a card, with interval, sample and the unverified label, and sorts by it", async ({
    page,
  }) => {
    await page.goto("/codex");
    const items = page.getByRole("list", { name: "Cards" }).getByRole("listitem");
    await expect(async () => {
      await page.getByLabel("Sort by").selectOption("value");
      await expect(items.first()).toContainText("In simulated runs", { timeout: 1000 });
    }).toPass();
    const first = await items.nth(0).innerText();
    const second = await items.nth(1).innerText();
    expect(first).toMatch(/[+−]\d\.\d\d\s*95%: [+−]\d\.\d\d to [+−]\d\.\d\d/);
    expect(first).toContain("Unverified against the live game");
    expect(first).toMatch(/Held in [\d,]+ of [\d,]+ simulated runs that reached the boss/);
    const value = (t: string): number => {
      const m = /([+−]\d\.\d\d)\s*95%/.exec(t);
      return Number((m?.[1] ?? "0").replace("−", "-"));
    };
    expect(value(first)).toBeGreaterThanOrEqual(value(second));
  });

  test("meets layout and accessibility basics", async ({ page }) => {
    await page.goto("/codex");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "codex");
  });
});

/** The first click can race hydration, so retry until the relic list is showing. */
async function showRelics(page: Page): Promise<void> {
  await expect(async () => {
    await page
      .locator("label")
      .filter({ hasText: /^Relics\s*\d+$/ })
      .click({ timeout: 1000 });
    await expect(page.getByRole("list", { name: "Relics" })).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test.describe("relic codex", () => {
  test("lists the relics as facts, finds one by name and narrows by pool and rarity", async ({
    page,
  }) => {
    await page.goto("/codex");
    await showRelics(page);
    const status = page.getByRole("status");
    await expect(status).toContainText("296 relics in All");
    await expect(page.getByText(/What a relic does is the game.s own text/)).toBeVisible();
    const list = page.getByRole("list", { name: "Relics" });

    await page.getByRole("searchbox", { name: "Search relics" }).fill("anchor");
    await expect(list.getByRole("listitem").first()).toContainText("Anchor");
    await expect(status).toContainText(/\d+ relics? match in All/);

    await page.getByRole("searchbox", { name: "Search relics" }).fill("");
    await page
      .locator("label")
      .filter({ hasText: /^Ironclad\s*\d+$/ })
      .click();
    await expect(status).toContainText("8 relics in Ironclad");
    await page.getByLabel("Relic rarity").selectOption("starter");
    await expect(status).toContainText("1 relic match in Ironclad");
    await expect(list.getByRole("listitem").first()).toContainText("Starter");

    await page.getByRole("searchbox", { name: "Search relics" }).fill("zzzzqqqq");
    await expect(status).toHaveText("No relic matches.");
    await page.getByRole("button", { name: "Clear filters" }).click();
    await expect(list.getByRole("listitem").first()).toBeVisible();
  });

  test("the relic view meets layout and accessibility basics", async ({ page }) => {
    await page.goto("/codex");
    await showRelics(page);
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "codex-relics");
  });
});
