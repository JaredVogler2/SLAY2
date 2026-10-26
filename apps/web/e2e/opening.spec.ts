import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  expectNoClippedText,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
} from "./helpers";

/**
 * "Where your run starts": which Act 1 the run is in (two versions with different elites and bosses), the boss on the map,
 * and what the opening Ancient gave the player and how it changed the deck. Each test is a step of a real run: the player
 * knows only what the screen showed, so effects that are random (a Rare card received, what a card became) are typed in.
 */
async function startIronclad(page: Page): Promise<void> {
  await page.goto("/advisor");
  // the first interaction can race hydration: retry until the radio sticks
  await expect(async () => {
    await page.locator("label").filter({ hasText: "Ironclad" }).first().click({ timeout: 1000 });
    await expect(page.getByRole("heading", { name: "Your run" })).toBeVisible({ timeout: 1000 });
  }).toPass();
  await expect(page.getByRole("heading", { name: "Act 1 and the opening Ancient" })).toBeVisible();
}

async function addOffered(page: Page, name: string): Promise<void> {
  const box = page.getByRole("combobox", { name: /offered card/i });
  await box.fill(name);
  await box.press("Enter");
}

const act = (page: Page, name: "Overgrowth" | "Underdocks" | "Not sure") =>
  page.locator("label").filter({ hasText: new RegExp(`^${name}$`) });

test.describe("where your run starts", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("records the Act 1 version and its boss, lists what it can throw at you, and survives a reload", async ({
    page,
  }) => {
    await startIronclad(page);
    await expect(page.getByText("Until you do, they are not weighed.")).toBeVisible();

    await act(page, "Underdocks").click();
    await expect(page.locator("#adv-boss")).toBeVisible();
    // only the three bosses of this version are offered
    await expect(page.locator("#adv-boss option")).toHaveText([
      "Not sure / not shown",
      "Waterfall Giant",
      "Soul Fysh",
      "Lagavulin Matriarch",
    ]);
    await page.locator("#adv-boss").selectOption("soul-fysh");

    await page.getByText(/What Underdocks can throw at you/).click();
    for (const name of [
      "Phantasmal Gardeners",
      "Skulking Colony",
      "Terror Eel",
      "Waterfall Giant",
      "Soul Fysh",
      "Lagavulin Matriarch",
    ]) {
      await expect(page.locator("li strong", { hasText: name }).first()).toBeVisible();
    }
    // the fight the player named is marked, and only that one
    const marked = page.locator("li", { has: page.locator("strong", { hasText: "Soul Fysh" }) });
    await expect(marked.getByText("on your map")).toBeVisible();
    await expect(
      page
        .locator("li", { has: page.locator("strong", { hasText: "Waterfall Giant" }) })
        .getByText("on your map"),
    ).toHaveCount(0);
    await expect(page.getByText(/never played Underdocks/).first()).toBeVisible();

    await page.reload();
    await expect(act(page, "Underdocks")).toBeVisible();
    await expect(page.locator("#adv-boss")).toHaveValue("soul-fysh");

    // the other version has other fights, and a boss that belongs to the old one is dropped rather than kept
    await act(page, "Overgrowth").click();
    await expect(page.locator("#adv-boss")).toHaveValue("");
    await page.getByText(/What Overgrowth can throw at you/).click();
    await expect(page.locator("li strong", { hasText: "Bygone Effigy" })).toBeVisible();
    await expect(page.locator("li strong", { hasText: "The Kin" })).toBeVisible();
    await expect(page.getByText("Soul Fysh", { exact: true })).toHaveCount(0);
  });

  test("Precarious Shears: two cards leave the deck, the HP loss is logged, and nothing happens until it is all filled in", async ({
    page,
  }) => {
    await startIronclad(page);
    await page.locator("#adv-opening").selectOption("PRECARIOUS_SHEARS");
    const apply = page.getByRole("button", { name: /Apply to my deck and HP/ });
    await expect(apply).toBeDisabled();
    await expect(page.getByText("choose 2 from your deck")).toBeVisible();

    const removed = page.getByLabel(/A card you removed/);
    await removed.nth(0).selectOption("STRIKE_IRONCLAD");
    await expect(apply).toBeDisabled();
    await removed.nth(1).selectOption("STRIKE_IRONCLAD");
    await expect(apply).toBeEnabled();
    await apply.click();

    const log = page.getByRole("list", { name: "Recorded from the opening Ancient" });
    await expect(log).toContainText("Precarious Shears");
    await expect(log).toContainText("Removed Strike from the deck.");
    await expect(log).toContainText("HP −16 (now 64 of 80).");
    await expect(page.getByRole("heading", { name: "8 cards" })).toBeVisible();
    await expect(page.getByLabel("3 copies")).toHaveCount(1); // Strike went from 5 to 3

    await page.reload();
    await expect(
      page.getByRole("list", { name: "Recorded from the opening Ancient" }),
    ).toContainText("Precarious Shears");
    await expect(page.getByRole("heading", { name: "8 cards" })).toBeVisible();
  });

  test("Neow's Torment puts Neow's Fury in the deck, and Undo takes it back", async ({ page }) => {
    await startIronclad(page);
    await page.locator("#adv-opening").selectOption("NEOWS_TORMENT");
    await expect(page.getByText("Adds to the deck:")).toContainText("Neow's Fury");
    await page.getByRole("button", { name: /Apply to my deck and HP/ }).click();
    await expect(page.getByRole("heading", { name: "11 cards" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Deck contents" })).toContainText("Neow's Fury");
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.getByRole("heading", { name: "10 cards" })).toBeVisible();
    await expect(page.getByRole("list", { name: "Recorded from the opening Ancient" })).toHaveCount(
      0,
    );
  });

  test("Leafy Poultice: a Strike and a Defend become the cards the player names; max HP falls", async ({
    page,
  }) => {
    await startIronclad(page);
    await page.locator("#adv-opening").selectOption("LEAFY_POULTICE");
    const apply = page.getByRole("button", { name: /Apply to my deck and HP/ });
    await expect(apply).toBeDisabled();
    for (const [what, card] of [
      ["strike", "anger"],
      ["defend", "shrug"],
    ] as const) {
      const box = page.getByRole("combobox", { name: new RegExp(`what your ${what} became`, "i") });
      await box.fill(card);
      await box.press("Enter");
    }
    await expect(apply).toBeEnabled();
    await apply.click();
    const log = page.getByRole("list", { name: "Recorded from the opening Ancient" });
    await expect(log).toContainText("Transformed Strike into Anger.");
    await expect(log).toContainText("Transformed Defend into Shrug It Off.");
    await expect(log).toContainText("Max HP −12 (now 68).");
    const deck = page.getByRole("list", { name: "Deck contents" });
    await expect(deck).toContainText("Anger");
    await expect(deck).toContainText("Shrug It Off");
    await expect(page.getByRole("heading", { name: "10 cards" })).toBeVisible();
  });

  test("an upgrade is part of the deck: Neow's Talisman upgrades one Strike and one Defend, and the deck shows it", async ({
    page,
  }) => {
    await startIronclad(page);
    await page.locator("#adv-opening").selectOption("NEOWS_TALISMAN");
    await page.getByRole("button", { name: /Apply to my deck and HP/ }).click();
    await expect(page.getByLabel("1 upgraded")).toHaveCount(2);
    // and by hand, for the upgrades that happen at rest sites
    await page.getByRole("button", { name: "One more Bash upgraded" }).click();
    await expect(page.getByLabel("1 upgraded")).toHaveCount(3);
    // never more upgraded copies than copies
    await page.getByRole("button", { name: "One more Bash upgraded" }).click();
    await expect(page.getByLabel("1 upgraded")).toHaveCount(3);
  });

  test("the Act 1 version tilts the ranking, says so as its own line, and can be switched off; Underdocks says the measured values are not for it", async ({
    page,
  }) => {
    await startIronclad(page);
    await act(page, "Underdocks").click();
    await addOffered(page, "pommel");
    await addOffered(page, "shrug");
    await addOffered(page, "inflame");
    const options = page.getByRole("list", { name: "Ranked options" });
    await expect(options).toBeVisible();
    await expect(options).toContainText("Act 1 context (Underdocks)");
    await expect(page.getByText("You said you are in Underdocks.")).toBeVisible();

    const shape = page.getByLabel(/Let this shape the ranking/);
    await expect(shape).toBeChecked();
    await shape.uncheck();
    await expect(options).not.toContainText("Act 1 context");
    await shape.check();
    await expect(options).toContainText("Act 1 context (Underdocks)");

    // Overgrowth: the same advisor, another set of fights, and the simulated values are for it
    await act(page, "Overgrowth").click();
    await expect(options).toContainText("Act 1 context (Overgrowth)");
    await expect(page.getByText("You said you are in Underdocks.")).toHaveCount(0);
    await expect(page.getByText(/Every simulated run was played in Overgrowth/)).toBeVisible();
  });

  test("the start of the run is in the exported file, and importing it brings it back", async ({
    page,
  }) => {
    await startIronclad(page);
    await act(page, "Underdocks").click();
    await page.locator("#adv-boss").selectOption("lagavulin-matriarch");
    await page.locator("#adv-opening").selectOption("NEOWS_TALISMAN");
    await page.getByRole("button", { name: /Apply to my deck and HP/ }).click();
    await expect(
      page.getByRole("list", { name: "Recorded from the opening Ancient" }),
    ).toBeVisible();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: /Export run/ }).click(),
    ]);
    const text = await readFile(await download.path(), "utf8");
    const saved = JSON.parse(text) as {
      act1: string;
      act1Boss: string;
      opening: { entries: { id: string; lines: string[] }[] };
      deck: { id: string; count: number; upgraded?: number }[];
    };
    expect(saved.act1).toBe("underdocks");
    expect(saved.act1Boss).toBe("lagavulin-matriarch");
    expect(saved.opening.entries[0]?.id).toBe("NEOWS_TALISMAN");
    expect(saved.deck.find((d) => d.id === "STRIKE_IRONCLAD")?.upgraded).toBe(1);

    page.once("dialog", (d) => void d.accept());
    await page.getByRole("button", { name: "New run" }).click();
    await expect(page.getByRole("heading", { name: "Choose your character" })).toBeVisible();

    await page.getByLabel("Import a SLAY2 run file").setInputFiles({
      name: "run.json",
      mimeType: "application/json",
      buffer: Buffer.from(text),
    });
    await expect(page.locator("#adv-boss")).toHaveValue("lagavulin-matriarch");
    await expect(
      page.getByRole("list", { name: "Recorded from the opening Ancient" }),
    ).toContainText("Neow's Talisman");

    // a file that names a boss of the other version is refused, not half-loaded
    const bad = { ...JSON.parse(text), act1: "overgrowth" } as Record<string, unknown>;
    await page.getByLabel("Import a SLAY2 run file").setInputFiles({
      name: "bad.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(bad)),
    });
    await expect(page.getByRole("status")).toContainText("Invalid run file");
    await expect(page.locator("#adv-boss")).toHaveValue("lagavulin-matriarch");
  });

  test("the panel is accessible with an option open, and fits at the widths people have", async ({
    page,
  }) => {
    await startIronclad(page);
    await act(page, "Underdocks").click();
    await page.locator("#adv-boss").selectOption("soul-fysh");
    await page.getByText(/What Underdocks can throw at you/).click();
    await page.locator("#adv-opening").selectOption("HEFTY_TABLET");
    await expectNoSeriousA11yViolations(page, "advisor with an opening option open");
    await expectNoHorizontalOverflow(page);
    await expectNoClippedText(page);
    const over = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(over).toBeLessThanOrEqual(0);
  });
});
