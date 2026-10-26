import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from "./helpers";

async function open(page: Page, query = ""): Promise<void> {
  await page.goto(`/routes${query}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("What does each route pay?");
}

const table = (page: Page) => page.getByRole("table", { name: /Rooms and expected rewards/ });
const row = (page: Page, label: RegExp) => table(page).getByRole("row", { name: label });

test.describe("route lab", () => {
  test("an example compares two routes with exact numbers", async ({ page }) => {
    await open(page);
    await expect(
      page.getByRole("heading", { name: "Add a route to see what it pays" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Try an example" }).click();
    await expect(table(page)).toBeVisible();
    // Route A is M ? M E R and route B is M ? ? R E; the numbers come from the exact engine (checked against an independent oracle)
    await expect(row(page, /^Fights/)).toContainText("3.10");
    await expect(row(page, /^Fights/)).toContainText("2.29");
    await expect(row(page, /^A rare card is offered at least once/)).toContainText("37.33%");
    await expect(row(page, /^A rare card is offered at least once/)).toContainText("27.94%");
    await expect(row(page, /^A potion drops at least once/)).toContainText("92.37%");
    await expect(row(page, /^Elite fights/)).toContainText("1");
    await expect(row(page, /^At least one “\?” becomes a shop/)).toContainText("3%");
    await expect(row(page, /^At least one “\?” becomes a shop/)).toContainText("8.82%");
    await page.getByRole("button", { name: "Clear all routes" }).click();
    await expect(
      page.getByRole("heading", { name: "Add a route to see what it pays" }),
    ).toBeVisible();
  });

  test("a route is built with buttons, typed as letters, edited and cleared", async ({ page }) => {
    await open(page);
    const list = page.getByRole("list", { name: /^Route A:/ });
    await page.getByLabel("Or type route A").fill("M ? E R");
    await expect(list.getByRole("listitem")).toHaveCount(4);
    await page.getByRole("button", { name: "Remove Elite (room 3) from route A" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await page.getByRole("button", { name: "Add Shop to route A" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(4);
    await page.getByRole("button", { name: "Undo last room of route A" }).click();
    await expect(list.getByRole("listitem")).toHaveCount(3);
    await page.getByRole("button", { name: "Clear route A" }).click();
    await expect(page.getByText("No rooms yet").first()).toBeVisible();
  });

  test("a letter that is not a room is explained and changes nothing", async ({ page }) => {
    await open(page, "?a=ME");
    const list = page.getByRole("list", { name: /^Route A:/ });
    await expect(list.getByRole("listitem")).toHaveCount(2);
    await page.getByLabel("Or type route A").fill("ME X");
    await expect(page.getByRole("alert").filter({ hasText: "“X” is not a room" })).toBeVisible();
    await expect(list.getByRole("listitem")).toHaveCount(2);
  });

  test("a route lives in the link, so a reload and a shared link show the same thing", async ({
    page,
  }) => {
    await open(page);
    await page.getByRole("button", { name: "Add Elite to route A" }).click();
    await page.getByRole("button", { name: "Add Rest site to route A" }).click();
    await expect(page).toHaveURL(/[?&]a=ER(&|$)/);
    await page.reload();
    await expect(page.getByRole("list", { name: /^Route A:/ }).getByRole("listitem")).toHaveCount(
      2,
    );
    await expect(row(page, /^Rest sites/)).toContainText("1");
  });

  test("the hidden counters change the odds: an elite pack at the pity cap", async ({ page }) => {
    await open(page, "?a=E");
    // right after a rare: 16.95% (the published figure)
    await expect(row(page, /^A rare card is offered at least once/)).toContainText("16.95%");
    await page.goto("/routes?a=E&k=45");
    // at the +40 cap each of the three cards is a rare half the time: 1 - 0.5^3
    await expect(row(page, /^A rare card is offered at least once/)).toContainText("87.5%");
    await page.goto("/routes?a=M&p=10");
    await expect(row(page, /^A potion drops at least once/)).toContainText("100%");
    await page.goto("/routes?a=M&p=0");
    await expect(row(page, /^A potion drops at least once/)).toContainText("0%");
  });

  test("Poverty changes what a treasure room pays", async ({ page }) => {
    await open(page, "?a=T");
    await expect(row(page, /^Gold from fights and treasure/)).toContainText("47");
    await expect(row(page, /^Gold from fights and treasure/)).toContainText("42 to 52");
    await page.goto("/routes?a=T&asc=3");
    await expect(row(page, /^Gold from fights and treasure/)).toContainText("35");
    await expect(row(page, /^Gold from fights and treasure/)).toContainText("31 to 39");
  });

  test("a '?' history that cannot happen is refused, not repaired", async ({ page }) => {
    await open(page, "?a=M%3F&u=eeeeeee");
    await expect(
      page.getByRole("alert").filter({ hasText: "cannot happen" }).first(),
    ).toBeVisible();
    await expect(table(page)).toHaveCount(0);
  });

  test("the “?” rooms already met this act are logged with buttons", async ({ page }) => {
    await open(page, "?a=%3F");
    await page
      .locator("summary")
      .filter({ hasText: /^Starting values/ })
      .click();
    // nothing met yet: 3% of the next "?" are shops
    await expect(row(page, /^At least one “\?” becomes a shop/)).toContainText("3%");
    const log = page.getByRole("group", { name: /Add a “\?” room that turned into/ });
    for (let i = 0; i < 3; i += 1) {
      await log.getByRole("button", { name: "Event" }).click();
    }
    // three events in a row have raised the shop counter to 4 x 3% = 12%
    await expect(row(page, /^At least one “\?” becomes a shop/)).toContainText("12%");
    await log.getByRole("button", { name: "Undo last" }).click();
    await expect(row(page, /^At least one “\?” becomes a shop/)).toContainText("9%");
  });

  test("the exact fractions are one click away and the method is stated", async ({ page }) => {
    await open(page, "?a=E");
    await page.getByText("The exact fractions behind these numbers").click();
    await expect(page.locator("code").filter({ hasText: "/" }).first()).toBeVisible();
    await page.getByText("How this is calculated").click();
    await expect(page.getByRole("link", { name: "TRS-1" })).toBeVisible();
    await expect(page.getByText("never how likely you are to win the fights")).toBeVisible();
  });

  test("keyboard and screen-reader basics hold, and nothing overflows the page", async ({
    page,
  }) => {
    await open(page, "?a=M%3FMER&b=M%3F%3FRE&c=ESRT");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page);
    // the six buttons that add a room are real buttons with unique names
    for (const room of ["Monster", "Elite", "“?” room", "Rest site", "Shop", "Treasure"]) {
      await expect(page.getByRole("button", { name: `Add ${room} to route C` })).toBeEnabled();
    }
  });

  test("it is reachable from the navigation", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("navigation", { name: "Primary" })
      .getByRole("link", { name: "Routes" })
      .click();
    await expect(page).toHaveURL(/\/routes$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "What does each route pay?",
    );
  });
});
