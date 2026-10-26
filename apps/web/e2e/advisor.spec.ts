import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { expectNoHorizontalOverflow, expectNoSeriousA11yViolations } from "./helpers";

async function addOffered(page: Page, name: string): Promise<void> {
  const box = page.getByRole("combobox", { name: /offered card/i });
  await box.fill(name);
  await box.press("Enter");
}

async function startIronclad(page: Page): Promise<void> {
  await page.goto("/advisor");
  // the first interaction can race hydration: retry until the radio sticks
  await expect(async () => {
    await page.locator("label").filter({ hasText: "Ironclad" }).first().click({ timeout: 1000 });
    await expect(page.getByRole("heading", { name: "Your run" })).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test.describe("advisor journey", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("character -> offered cards -> recommendation -> record -> pity tracker -> reload keeps the run", async ({
    page,
  }) => {
    await startIronclad(page);
    await expect(page.getByText("10 cards")).toBeVisible();

    await addOffered(page, "pommel");
    await addOffered(page, "shrug");
    await addOffered(page, "inflame");
    const call = page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ });
    await expect(call).toBeVisible();
    await expect(page.getByText("Heuristic v0").first()).toBeVisible();
    await expect(page.getByText("Not calibrated").first()).toBeVisible();
    // every option, including skip, is listed exactly once
    const options = page.getByRole("list", { name: "Ranked options" }).locator("> li");
    await expect(options).toHaveCount(4);
    await expect(options.filter({ hasText: "Skip (take nothing)" })).toHaveCount(1);

    // record the pick that was actually taken: the deck grows and the pack is logged for the pity tracker
    await page.locator("label").filter({ hasText: "I took Inflame" }).click();
    await page.getByRole("button", { name: /Record & clear offer/ }).click();
    await expect(page.getByText("11 cards")).toBeVisible();
    await expect(page.getByText("Based on 1 recorded pack")).toBeVisible();
    await expect(page.getByRole("list", { name: "Offered cards" })).toHaveCount(0);

    // the saved run survives a reload (local-first persistence)
    await page.reload();
    await expect(page.getByText("11 cards")).toBeVisible();
    await expect(page.getByText("Based on 1 recorded pack")).toBeVisible();
  });

  test("an offer that the exact odds engine says is impossible is flagged", async ({ page }) => {
    await startIronclad(page);
    // a rare in the very first normal-fight pack has probability 0 (rare chance is 0% at the -5 start)
    await addOffered(page, "offering");
    await expect(
      page.getByRole("alert").filter({ hasText: "cannot happen under the verified rules" }),
    ).toBeVisible();
  });

  test("undo and redo walk back through edits", async ({ page }) => {
    await startIronclad(page);
    await addOffered(page, "inflame");
    await page.locator("label").filter({ hasText: "I took Inflame" }).click();
    await page.getByRole("button", { name: /Record & clear offer/ }).click();
    await expect(page.getByText("11 cards")).toBeVisible();
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.getByText("10 cards")).toBeVisible();
    await page.getByRole("button", { name: /Redo/ }).click();
    await expect(page.getByText("11 cards")).toBeVisible();
  });

  test("a curse is never recommended over skipping", async ({ page }) => {
    await startIronclad(page);
    await page.getByRole("combobox", { name: /offered card/i }).fill("regret");
    // curses are not reward-eligible, so they cannot even be offered through the picker
    await expect(
      page.getByRole("listbox", { name: /suggestions/ }).getByRole("option"),
    ).toHaveCount(0);
  });

  test("exports a valid run file and rejects a malformed import with a clear message", async ({
    page,
  }) => {
    await startIronclad(page);
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Export run/ }).click(),
    ]);
    const saved = JSON.parse(await readFile(await download.path(), "utf8")) as {
      v: number;
      character: string;
      deck: unknown[];
    };
    expect(saved).toMatchObject({ v: 1, character: "ironclad" });
    expect(saved.deck.length).toBeGreaterThan(0);

    await page.getByLabel("Import a SLAY2 run file").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from('{"v":1,"character":"watcher"}'),
    });
    await expect(page.getByRole("status")).toContainText("Invalid run file");
    await page.getByLabel("Import a SLAY2 run file").setInputFiles({
      name: "junk.json",
      mimeType: "application/json",
      buffer: Buffer.from("not json"),
    });
    await expect(page.getByRole("status")).toContainText("Not valid JSON");
  });

  test("keyboard only: the combobox follows the ARIA pattern", async ({ page }) => {
    await startIronclad(page);
    const box = page.getByRole("combobox", { name: /offered card/i });
    await box.focus();
    await box.pressSequentially("shr");
    await expect(box).toHaveAttribute("aria-expanded", "true");
    await box.press("ArrowDown");
    await expect(box).toHaveAttribute("aria-activedescendant", /opt-1$/);
    await box.press("Escape");
    await expect(box).toHaveAttribute("aria-expanded", "false");
  });

  test("meets layout and accessibility basics with an offer on screen", async ({ page }) => {
    await startIronclad(page);
    await addOffered(page, "pommel");
    await addOffered(page, "inflame");
    await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "advisor");
  });
});
