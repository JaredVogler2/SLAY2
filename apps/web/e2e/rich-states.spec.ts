import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { expectNoClippedText, expectNoHorizontalOverflow } from "./helpers";

/**
 * The states that put the most on a screen, at a phone, a tablet and a laptop width, and with the text enlarged: a 40-card
 * deck with forty recorded packs, the three longest card names of each class on offer, a long "?" history, a long search
 * result, every section of /methods open. The default state of a page is not where layouts break: a card name that does not
 * fit, a list that grows, an input that is longer than the box, a minimum width written in rem. Each of these checks is a
 * state that was probed by hand first.
 *
 * Enlarged text is the root font size (what Android's and iOS's text-size settings change; every rem-based size follows).
 * 150 % is checked on a 360 and a 390 px phone and 200 % on a 390 px phone; 200 % on a 360 px phone still cuts one small
 * label off and is 1 px too wide on /methods (ADR-043).
 */
const catalog = JSON.parse(
  readFileSync(
    join(
      __dirname,
      "..",
      "..",
      "..",
      "packages",
      "game-data",
      "data",
      "cards.sts2-main-0.107.1.json",
    ),
    "utf8",
  ),
) as { cards: { id: string; name: string; class: string; rewardEligible: boolean }[] };

const CLASSES = ["ironclad", "silent", "regent", "necrobinder", "defect"] as const;

function poolOf(character: string): { id: string; name: string }[] {
  return catalog.cards.filter((c) => c.class === character && c.rewardEligible);
}

async function enlarge(page: Page, percent: number): Promise<void> {
  if (percent !== 100) {
    await page.evaluate((pct) => {
      document.documentElement.style.fontSize = `${String(pct)}%`;
    }, percent);
  }
}

async function documentFits(page: Page, percent = 100): Promise<void> {
  await enlarge(page, percent);
  const over = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(over).toBeLessThanOrEqual(0);
  await expectNoHorizontalOverflow(page);
  await expectNoClippedText(page);
}

/** The advisor with a chosen class, a 40-card deck, forty recorded packs and the three longest card names on offer. */
async function richAdvisor(page: Page, character: string, percent: number): Promise<void> {
  const pool = poolOf(character);
  const ids = pool.map((c) => c.id);
  const longest = [...pool].sort((a, b) => b.name.length - a.name.length).slice(0, 3);
  await page.goto("/advisor", { waitUntil: "networkidle" });
  await page
    .locator("label")
    .filter({ hasText: new RegExp(character, "i") })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Your run" })).toBeVisible();
  await page.evaluate((cards) => {
    const raw = window.localStorage.getItem("slay2.run.v1");
    const run = JSON.parse(raw ?? "{}") as Record<string, unknown>;
    run.deck = cards.slice(0, 40).map((id, i) => ({ id, count: 1 + (i % 3) }));
    run.packs = Array.from({ length: 40 }, (_, i) => ({
      at: "2026-10-26T10:00:00Z",
      source: ["regular", "elite", "boss", "shop", "event"][i % 5],
      actIndex: i % 3,
      offered: [
        cards[i % cards.length],
        cards[(i + 1) % cards.length],
        cards[(i + 2) % cards.length],
      ],
      picked: i % 4 === 0 ? "skip" : cards[i % cards.length],
    }));
    run.unknownRooms = Array.from({ length: 12 }, (_, i) => ({
      outcome: ["fight", "treasure", "shop", "event"][i % 4],
    }));
    window.localStorage.setItem("slay2.run.v1", JSON.stringify(run));
  }, ids);
  await page.reload({ waitUntil: "networkidle" });
  await expect(page.getByRole("list", { name: "Recorded packs" })).toBeVisible();
  await documentFits(page, percent);
  const box = page.getByRole("combobox", { name: /offered card/i });
  for (const card of longest) {
    await box.fill(card.name);
    await box.press("Enter");
  }
  await expect(page.getByRole("heading", { level: 2, name: /^(Take|Skip)/ })).toBeVisible();
  await documentFits(page, percent);
}

async function richRoutes(page: Page, percent: number): Promise<void> {
  await page.goto(
    "/routes?a=M%3FMERM%3F%3FSM%3FERM%3FT&b=%3F%3F%3F%3F%3F%3F%3F%3F%3F%3F&c=EEEEEEEEEE&u=efstfsfsxefs",
    { waitUntil: "networkidle" },
  );
  await expect(page.getByRole("heading", { name: "Route A" })).toBeVisible();
  await documentFits(page, percent);
  await page.goto("/routes?a=M%3FMER&b=M%3F%3FRE&c=ESRT&u=eeeeeeeeeee", {
    waitUntil: "networkidle",
  });
  await documentFits(page, percent);
}

async function richOddsHistory(page: Page, percent: number): Promise<void> {
  await page.goto("/odds?mode=history", { waitUntil: "networkidle" });
  const add = page.getByRole("button", { name: "Add pack" });
  for (let i = 0; i < 8; i++) {
    await add.click();
  }
  await expect(page.getByRole("list", { name: "Packs listed" })).toBeVisible();
  await documentFits(page, percent);
}

test.describe("rich states", () => {
  test.skip(({ isMobile }) => !isMobile, "the widths are set here: one project is enough");

  for (const width of [360, 768, 1280]) {
    test.describe(`${String(width)} px`, () => {
      test.use({ viewport: { width, height: 900 } });

      for (const character of CLASSES) {
        test(`advisor, ${character}: a big deck, a long history and the longest card names on offer`, async ({
          page,
        }) => {
          await richAdvisor(page, character, 100);
        });
      }

      test("odds: the card-reward history with eight packs", async ({ page }) => {
        await richOddsHistory(page, 100);
      });

      test("routes: three long routes, a long '?' history and an impossible one", async ({
        page,
      }) => {
        await richRoutes(page, 100);
      });

      test("codex: a search with no result and one with the longest name", async ({ page }) => {
        await page.goto("/codex", { waitUntil: "networkidle" });
        const search = page.getByRole("searchbox").first();
        await search.fill("zzzz");
        await documentFits(page);
        const longest = [...catalog.cards].sort((a, b) => b.name.length - a.name.length)[0];
        await search.fill(longest?.name ?? "");
        await documentFits(page);
      });

      test("methods: every section open", async ({ page }) => {
        await page.goto("/methods", { waitUntil: "networkidle" });
        await page.evaluate(() => {
          document.querySelectorAll("details").forEach((d) => {
            d.open = true;
          });
        });
        await documentFits(page);
      });
    });
  }
});

test.describe("enlarged text on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "the widths are set here: one project is enough");

  for (const [width, percent] of [
    [360, 150],
    [390, 150],
    [390, 200],
  ] as const) {
    test.describe(`${String(width)} px, text at ${String(percent)} %`, () => {
      test.use({ viewport: { width, height: 900 } });

      for (const character of ["ironclad", "necrobinder"] as const) {
        test(`advisor, ${character}: a big deck and the longest card names on offer`, async ({
          page,
        }) => {
          await richAdvisor(page, character, percent);
        });
      }

      test("odds: history, and the shop and gold calculator", async ({ page }) => {
        await richOddsHistory(page, percent);
        await page.goto("/odds?tab=shop", { waitUntil: "networkidle" });
        await documentFits(page, percent);
      });

      test("routes: long routes and an impossible history", async ({ page }) => {
        await richRoutes(page, percent);
      });

      test("the landing page, the codex and about", async ({ page }) => {
        for (const route of ["/", "/codex", "/about"]) {
          await page.goto(route, { waitUntil: "networkidle" });
          await documentFits(page, percent);
        }
      });
    });
  }
});
