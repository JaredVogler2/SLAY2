import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  expectNoClippedText,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  neowAdvisedFor,
  neowInfo,
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
    await expect(log).toContainText("HP −16.");
    await expect(page.getByText("After the opening:")).toContainText("HP 64 of 80");
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
    await expect(log).toContainText("Max HP −12.");
    await expect(page.getByText("After the opening:")).toContainText("HP 68 of 68");
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
    // and a simulated run keeps only the relics it has when its first fight starts (gap G14): said beside the simulated values
    await expect(
      page.getByText(/keeps only the relics it has when its first fight starts \(gap G14\)/),
    ).toBeVisible();
  });

  test("the ascension sets how the run starts: Neow heals 80 % from A2, and Ascender's Bane joins the deck at A5 and cannot be removed", async ({
    page,
  }) => {
    await startIronclad(page);
    await expect(page.getByText(/assume Ascension 0 until you choose the ascension/)).toBeVisible();
    await page.locator("#adv-asc").selectOption("5");
    await expect(page.getByText(/assume Ascension 0 until you choose the ascension/)).toHaveCount(
      0,
    );
    await expect(page.getByRole("list", { name: "Deck contents" })).toContainText(
      "Ascender's Bane",
    );
    await expect(page.getByRole("heading", { name: "11 cards" })).toBeVisible();

    // the Bane has the Eternal keyword: the game does not let a player remove it, so it is not offered as an answer
    await page.locator("#adv-opening").selectOption("PRECISE_SCISSORS");
    const removed = page.getByLabel(/The card you removed/);
    await expect(removed.locator("option", { hasText: "Ascender's Bane" })).toHaveCount(0);
    await expect(removed.locator("option", { hasText: "Strike" })).toHaveCount(1);
    await page.locator("#adv-opening").selectOption("PRECARIOUS_SHEARS");
    await page
      .getByLabel(/A card you removed/)
      .nth(0)
      .selectOption("STRIKE_IRONCLAD");
    await page
      .getByLabel(/A card you removed/)
      .nth(1)
      .selectOption("STRIKE_IRONCLAD");
    await page.getByRole("button", { name: /Apply to my deck and HP/ }).click();
    // 80 max HP, healed to 64 at Neow from Ascension 2, then 16 off
    await expect(page.getByText("After the opening:")).toContainText("HP 48 of 80");

    // correcting the ascension afterwards moves the HP with it
    await page.locator("#adv-asc").selectOption("0");
    await expect(page.getByText("After the opening:")).toContainText("HP 64 of 80");
    await expect(page.getByRole("list", { name: "Deck contents" })).not.toContainText(
      "Ascender's Bane",
    );
  });

  test("a relic is recorded once; resetting to the start of the run clears the log, the HP and the deck together", async ({
    page,
  }) => {
    await startIronclad(page);
    const record = page.getByRole("button", { name: /Record this|Apply to my deck and HP/ });
    await page.locator("#adv-opening").selectOption("NUTRITIOUS_OYSTER");
    await record.click();
    await expect(page.getByText("After the opening:")).toContainText("HP 91 of 91");

    await page.locator("#adv-opening").selectOption("NUTRITIOUS_OYSTER");
    await expect(page.getByText(/already recorded for this run/)).toBeVisible();
    await expect(record).toBeDisabled();
    await page.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Reset to the start of the run" }).click();
    await expect(page.getByRole("list", { name: "Recorded from the opening Ancient" })).toHaveCount(
      0,
    );
    await expect(page.getByText("After the opening:")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "10 cards" })).toBeVisible();
    // and the relic can be recorded again, from 80 and not from 91
    await page.locator("#adv-opening").selectOption("NUTRITIOUS_OYSTER");
    await record.click();
    await expect(page.getByText("After the opening:")).toContainText("HP 91 of 91");
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

test.describe("what did Neow offer?", () => {
  test.skip(
    neowInfo().relics.length === 0,
    "no valid opening-relic measurement is published (the first one was void, ADR-049)",
  );

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  const OFFER = [
    ["First helpful option", "FISHING_ROD", "Fishing Rod"],
    ["Second helpful option", "WINGED_BOOTS", "Winged Boots"],
    ["Costly option", "SILVER_CRUCIBLE", "Silver Crucible"],
  ] as const;

  async function openOffer(page: Page): Promise<void> {
    await page.getByText(/What did Neow offer\? Compare the three/).click();
    await expect(page.getByLabel("First helpful option")).toBeVisible();
  }

  async function chooseOffer(page: Page): Promise<void> {
    for (const [label, id] of OFFER) {
      await page.getByLabel(label).selectOption(id);
    }
  }

  test("sets the three relics beside what simulated runs say, says what the one test found, and hands the choice to the recorder", async ({
    page,
  }) => {
    await startIronclad(page);
    await openOffer(page);
    await expect(page.getByText("Simulated · unverified").first()).toBeVisible();
    await chooseOffer(page);

    const tiles = page
      .getByRole("list", { name: "Measured values of the relics offered" })
      .getByRole("listitem");
    await expect(tiles).toHaveCount(3);
    for (const [, , name] of OFFER) {
      await expect(tiles.filter({ hasText: name })).toHaveCount(1);
    }
    await expect(tiles.filter({ hasText: "Silver Crucible" })).toContainText("costly");
    await expect(tiles.filter({ hasText: "Fishing Rod" })).toContainText("helpful");
    // Ironclad's own starting point is printed beside each value
    await expect(tiles.first()).toContainText(/getting past the Act-1 boss \(95%: \d+% to \d+%\)/);
    await expect(tiles.first()).toContainText(/The average relic: \d+%/);

    // what the page may say follows the registered test, not the other way round
    const { test: held, relics } = neowInfo();
    const betaOf = (label: string): number => relics.find((r) => r.label === label)?.beta ?? 0;
    const best = [...OFFER].sort((a, b) => betaOf(b[2]) - betaOf(a[2]))[0]?.[2] ?? "";
    if (held === null) {
      await expect(page.getByText(/have not been tested against play yet/)).toBeVisible();
      await expect(page.getByText(/would take/)).toHaveCount(0);
    } else if (!held.passed) {
      await expect(page.getByText(/does not say which relic to take/)).toBeVisible();
      await expect(page.getByText(/would take/)).toHaveCount(0);
    } else if (neowAdvisedFor("ironclad")) {
      await expect(page.getByText(/would take/).first()).toContainText(best);
      await expect(page.getByText(/does not say which relic/)).toHaveCount(0);
    } else {
      // the pooled test passed, but Ironclad's own games did not clearly favour the rule: the page says so and names nothing
      await expect(page.getByText(/does not say which relic to take for Ironclad/)).toBeVisible();
      await expect(page.getByText(/would take/)).toHaveCount(0);
    }

    // recording a relic from the comparison opens its form under the select, with the relic named
    await page.getByRole("button", { name: "Record Silver Crucible" }).click();
    await expect(page.locator("#adv-opening")).toHaveValue("SILVER_CRUCIBLE");
    await expect(page.locator("#adv-opening")).toBeFocused();
    await page.getByRole("button", { name: /Record this/ }).click();
    await expect(
      page.getByRole("list", { name: "Recorded from the opening Ancient" }),
    ).toContainText("Silver Crucible");
    // and a relic that is recorded cannot be recorded twice from here
    await expect(page.getByRole("button", { name: "Recorded" })).toBeDisabled();
  });

  test("is accessible and fits the screen with three relics on the table", async ({ page }) => {
    await startIronclad(page);
    await openOffer(page);
    await chooseOffer(page);
    await expect(
      page.getByRole("list", { name: "Measured values of the relics offered" }),
    ).toBeVisible();
    await expectNoSeriousA11yViolations(page, "advisor with the Neow offer compared");
    await expectNoHorizontalOverflow(page);
    await expectNoClippedText(page);
  });

  test("tells a player past Ascension 0 that the runs behind it were Ascension 0", async ({
    page,
  }) => {
    await startIronclad(page);
    await page.locator("#adv-asc").selectOption("5");
    await openOffer(page);
    await expect(page.getByText(/you are at Ascension 5/)).toBeVisible();
  });
});
