import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  bestMeasuredCardNames,
  expectNoHorizontalOverflow,
  expectNoSeriousA11yViolations,
  measuredSets,
  requireMeasuredSet,
} from "./helpers";

async function addOffered(page: Page, name: string): Promise<void> {
  const box = page.getByRole("combobox", { name: /offered card/i });
  await box.fill(name);
  await box.press("Enter");
}

async function addToDeck(page: Page, name: string): Promise<void> {
  const box = page.getByRole("combobox", { name: "Add a card to your deck" });
  await box.fill(name);
  await box.press("Enter");
}

/** The ranked option for a card, opened (a card that is not on top starts closed; its rank can change when the deck does). */
async function openOption(page: Page, label: string): Promise<Locator> {
  const option = page
    .getByRole("list", { name: "Ranked options" })
    .locator("> li")
    .filter({ hasText: label });
  await option.locator("details").evaluate((d: HTMLDetailsElement) => {
    d.open = true;
  });
  return option;
}

/** The index change shown on an option's summary line ("+2.31", "-0.40" or "0.00"). */
async function indexChange(option: Locator): Promise<number> {
  const line = (await option.locator("summary").innerText()).trim();
  const found = /(-?\+?\d+\.\d\d)\s*[›>]?\s*$/.exec(line.replace(/\s+/g, " "));
  if (!found?.[1]) throw new Error(`no index change in "${line}"`);
  return Number.parseFloat(found[1]);
}

async function startClass(page: Page, name: string): Promise<void> {
  await page.goto("/advisor");
  // the first interaction can race hydration: retry until the radio sticks
  await expect(async () => {
    await page.locator("label").filter({ hasText: name }).first().click({ timeout: 1000 });
    await expect(page.getByRole("heading", { name: "Your run" })).toBeVisible({ timeout: 1000 });
  }).toPass();
}

const startIronclad = (page: Page): Promise<void> => startClass(page, "Ironclad");

test.describe("advisor journey", () => {
  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("character -> offered cards -> recommendation -> record -> pity tracker -> reload keeps the run", async ({
    page,
  }) => {
    await startIronclad(page);
    await expect(page.getByRole("heading", { name: "10 cards" })).toBeVisible();

    await addOffered(page, "pommel");
    await addOffered(page, "shrug");
    await addOffered(page, "inflame");
    const call = page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ });
    await expect(call).toBeVisible();
    await expect(page.getByText("Heuristic v1").first()).toBeVisible();
    await expect(page.getByText("Not calibrated").first()).toBeVisible();
    // every option, including skip, is listed exactly once
    const options = page.getByRole("list", { name: "Ranked options" }).locator("> li");
    await expect(options).toHaveCount(4);
    await expect(options.filter({ hasText: "Skip (take nothing)" })).toHaveCount(1);

    // record the pick that was actually taken: the deck grows and the pack is logged for the pity tracker
    await page.locator("label").filter({ hasText: "I took Inflame" }).click();
    await page.getByRole("button", { name: /Record & clear offer/ }).click();
    await expect(page.getByRole("heading", { name: "11 cards" })).toBeVisible();
    await expect(page.getByText("Based on 1 recorded pack")).toBeVisible();
    await expect(page.getByRole("list", { name: "Offered cards" })).toHaveCount(0);

    // the saved run survives a reload (local-first persistence)
    await page.reload();
    await expect(page.getByRole("heading", { name: "11 cards" })).toBeVisible();
    await expect(page.getByText("Based on 1 recorded pack")).toBeVisible();
  });

  test("shows exact opening-hand odds for the deck you have and reacts to the hand size", async ({
    page,
  }) => {
    await startIronclad(page);
    const table = page.getByRole("table", { name: /Chance of drawing at least one card/ });
    // starter deck: 4 Defends in 10 cards, 5-card hand -> 1 - C(6,5)/C(10,5) = 41/42
    await expect(table.getByRole("row", { name: /^Block/ })).toContainText("97.6%");
    // Bash is the only Vulnerable source: exactly half of all 5-card hands contain it
    await expect(table.getByRole("row", { name: /^Vulnerable/ })).toContainText("50%");
    // a seven-card hand holds it 70% of the time
    const hand = page.getByRole("textbox", { name: "Cards in your hand" });
    await hand.fill("7");
    await hand.blur();
    await expect(table.getByRole("row", { name: /^Vulnerable/ })).toContainText("70%");
    await expect(page.getByText("What this assumes")).toBeVisible();
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
    await expect(page.getByRole("heading", { name: "11 cards" })).toBeVisible();
    await page.getByRole("button", { name: /Undo/ }).click();
    await expect(page.getByRole("heading", { name: "10 cards" })).toBeVisible();
    await page.getByRole("button", { name: /Redo/ }).click();
    await expect(page.getByRole("heading", { name: "11 cards" })).toBeVisible();
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
    expect(saved).toMatchObject({ v: 2, character: "ironclad" });
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

  test("adds a labelled second opinion from the simulated runs next to the heuristic's call", async ({
    page,
  }) => {
    await startIronclad(page);
    await addOffered(page, "pommel");
    await addOffered(page, "shrug");
    await addOffered(page, "inflame");
    const panel = page.locator("#simulation-opinion");
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("heading", { level: 2 })).toHaveText("What simulated runs say");
    await expect(panel.getByText("Simulated · unverified")).toBeVisible();
    await expect(panel).toContainText(/would take|would skip/);
    await expect(panel).toContainText(/agrees with the heuristic|differs from the heuristic/);
    const cards = panel.getByRole("list", { name: "Measured values of the offered cards" });
    await expect(cards.locator("> li")).toHaveCount(3);
    await expect(cards).toContainText("simulated runs");
    // the heuristic's own call is still the headline and still says what it is
    await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
    await expect(page.getByText("Heuristic v1").first()).toBeVisible();

    // what the disclosure says about the numbers is this class's own, read from the data
    const ironclad = requireMeasuredSet("ironclad");
    expect(ironclad.validation?.passed).toBe(true);
    const test = ironclad.validation;
    await panel.getByText("How to read this, and what it is not").click();
    await expect(panel).toContainText(
      `${ironclad.bossFights.toLocaleString("en-US")} simulated Ironclad runs that reached the Act-1 boss`,
    );
    await expect(panel).toContainText(
      `+${(((test?.passRate ?? 0) - (test?.passRateBase ?? 0)) * 100).toFixed(1)} percentage points past the Act-1 boss on ${(test?.pairedGames ?? 0).toLocaleString("en-US")} held-out seeds`,
    );
  });

  test("synergy: a card that needs what the deck lacks is held back, and builds an engine once the deck has it", async ({
    page,
  }) => {
    await startIronclad(page);
    await addOffered(page, "feel no pain");
    await addOffered(page, "pommel");
    await addOffered(page, "shrug");
    const bare = await openOption(page, "Feel No Pain");
    await expect(bare).toContainText("needs Exhaust (nothing in your deck yet)");
    await expect(bare).toContainText("held back");
    await expect(bare).not.toContainText("Builds your Exhaust engine");
    const heldBack = await indexChange(bare);
    // nothing is being built yet, and the panel says so
    const panel = page.getByRole("region", { name: "Synergy of your deck" });
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText("What your deck is building");
    await expect(panel).toContainText("No engine yet");
    await expect(panel.getByRole("list", { name: "Engines in your deck" })).toHaveCount(0);

    // two cards that exhaust give it what it needs: the same card is now worth more, and the reasons say why
    await addToDeck(page, "burning pact");
    await addToDeck(page, "true grit");
    const supported = await openOption(page, "Feel No Pain");
    await expect(supported).toContainText("Builds your Exhaust engine");
    await expect(supported).toContainText("Burning Pact");
    await expect(supported).not.toContainText("nothing in your deck yet");
    expect(await indexChange(supported)).toBeGreaterThan(heldBack + 0.5);
    // suppliers alone are not an engine: the panel lists one when the deck holds a card that uses what they supply
    await expect(panel.getByRole("list", { name: "Engines in your deck" })).toHaveCount(0);
    await addToDeck(page, "feel no pain");
    const engines = panel.getByRole("list", { name: "Engines in your deck" });
    await expect(engines).toContainText("Exhaust");
    await expect(engines).toContainText("Burning Pact");
    await expect(engines).toContainText("True Grit");
    await expect(engines).toContainText("used by Feel No Pain");
  });

  test("synergy: a payoff the deck cannot feed is listed as waiting for support, a payoff it can feed is not", async ({
    page,
  }) => {
    await startIronclad(page);
    await addToDeck(page, "feel no pain");
    await addOffered(page, "pommel");
    await addOffered(page, "shrug");
    const panel = page.getByRole("region", { name: "Synergy of your deck" });
    const waiting = panel.getByRole("list", { name: "Cards waiting for support" });
    await expect(waiting).toContainText("Feel No Pain");
    await expect(waiting).toContainText("Exhaust (nothing in your deck yet)");
    await expect(waiting).toContainText("% of its rating is held back");

    await addToDeck(page, "burning pact");
    await addToDeck(page, "true grit");
    await expect(panel.getByRole("list", { name: "Cards waiting for support" })).toHaveCount(0);
    await expect(panel.getByRole("list", { name: "Engines in your deck" })).toContainText(
      "Feel No Pain",
    );
  });

  test("synergy: the panel is honest about what it is, and meets layout and accessibility basics", async ({
    page,
  }) => {
    await startIronclad(page);
    for (const name of ["burning pact", "true grit", "feel no pain"]) {
      await addToDeck(page, name);
    }
    await addOffered(page, "pommel");
    await addOffered(page, "inflame");
    const panel = page.getByRole("region", { name: "Synergy of your deck" });
    await expect(panel).toContainText("Judgement, not measured");
    await expect(panel).toContainText("nothing here has been measured in games yet");
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "advisor with the synergy panel");
  });

  // Every other class whose held-out test passed gives the same second opinion as Ironclad, from its own values.
  for (const s of measuredSets()) {
    const v = s.validation;
    if (v?.passed !== true || s.character === "ironclad") {
      continue;
    }
    test(`${s.label}: a class whose values passed their test gets the simulated second opinion`, async ({
      page,
    }) => {
      const names = bestMeasuredCardNames(s.character, 3);
      expect(names).toHaveLength(3);
      await startClass(page, s.label);
      for (const name of names) {
        await addOffered(page, name);
      }
      const panel = page.locator("#simulation-opinion");
      await expect(panel).toBeVisible();
      await expect(panel.getByRole("heading", { level: 2 })).toHaveText("What simulated runs say");
      await expect(panel.getByText("Simulated · unverified")).toBeVisible();
      // the card with the largest measured value is offered, so the pilot takes it
      await expect(panel).toContainText(`would take ${names[0] ?? ""}`);
      const cards = panel.getByRole("list", { name: "Measured values of the offered cards" });
      await expect(cards.locator("> li")).toHaveCount(3);
      await panel.getByText("How to read this, and what it is not").click();
      await expect(panel).toContainText(
        `${s.bossFights.toLocaleString("en-US")} simulated ${s.label} runs that reached the Act-1 boss`,
      );
      await expect(panel).toContainText(
        `+${((v.passRate - v.passRateBase) * 100).toFixed(1)} percentage points past the Act-1 boss on ${v.pairedGames.toLocaleString("en-US")} held-out seeds`,
      );
    });
  }

  // The panel speaks only for a class whose held-out test passed. Which classes those are is a fact about the shipped data
  // (it changes when a class's test finishes), so each class below is checked against what the data says about it.
  const OFFER: Record<string, { label: string; card: string }> = {
    silent: { label: "Silent", card: "backflip" },
    regent: { label: "Regent", card: "astral pulse" },
    necrobinder: { label: "Necrobinder", card: "afterlife" },
    defect: { label: "Defect", card: "ball lightning" },
  };
  const byClass = new Map(measuredSets().map((s) => [s.character, s]));
  for (const [character, { label, card }] of Object.entries(OFFER)) {
    const set = byClass.get(character);
    if (set?.validation?.passed === true) {
      continue; // a validated class gives an opinion; the Ironclad test above covers that path
    }
    const why = !set
      ? /not measured this class/
      : set.validation === null
        ? /not been tested/
        : /did not beat/;
    const note = !set
      ? "No simulated runs of this class have been measured yet"
      : set.validation === null
        ? `The ${label} values have not been tested against play yet`
        : `The ${label} values did not beat the hand-written ratings`;
    test(`${label}: says plainly why the simulated runs give no opinion`, async ({ page }) => {
      await startClass(page, label);
      await addOffered(page, card);
      const panel = page.locator("#simulation-opinion");
      await expect(panel).toBeVisible();
      await expect(panel).toContainText("no measurement for this offer");
      await expect(panel).toContainText(why);
      await expect(panel).not.toContainText(/would take|would skip/);
      await panel.getByText("How to read this, and what it is not").click();
      await expect(panel).toContainText(note);
    });
  }

  test("meets layout and accessibility basics with an offer on screen", async ({ page }) => {
    await startIronclad(page);
    await addOffered(page, "pommel");
    await addOffered(page, "inflame");
    await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoSeriousA11yViolations(page, "advisor");
  });
});
