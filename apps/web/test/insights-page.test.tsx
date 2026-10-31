import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import InsightsPage from "@/app/insights/page";
import { INSIGHTS, bossDeaths, count, enemyName, share } from "@/lib/insights";
import { atlasData } from "@/lib/insights-server";

afterEach(cleanup);

/**
 * The insights page as a visitor gets it (ADR-059): every section is there with its anchor, every chart has a name and a figure beside it
 * in text, every table has a caption, nothing is a placeholder, and the atlas answers the class and the mechanic it is asked about.
 */
const SECTIONS = [
  "findings",
  "levers",
  "runs-end",
  "second-boss",
  "cards",
  "synergy",
  "ascension",
  "coverage",
  "open",
];

function page() {
  return render(<InsightsPage />);
}

describe("the page", () => {
  it("has one heading of the first level, a panel for each section with the anchor the contents list points at", () => {
    const { container } = page();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("What decides a run");
    for (const id of SECTIONS) expect(container.querySelector(`section#${id}`), id).not.toBeNull();
    const nav = screen.getByRole("navigation", { name: "On this page" });
    const hrefs = within(nav)
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(SECTIONS.map((id) => `#${id}`));
  });

  it("says first that the figures are simulated and unverified, and quotes the games behind them from the data", () => {
    const { container } = page();
    expect(container).toHaveTextContent("Simulated · unverified");
    expect(container).toHaveTextContent("never been compared with the live game");
    const total = INSIGHTS.games.completed + INSIGHTS.games.exploration.completed;
    expect(container).toHaveTextContent(count(total));
    expect(container).toHaveTextContent(count(INSIGHTS.games.completed));
    expect(container).toHaveTextContent(count(INSIGHTS.games.exploration.completed));
  });

  it("explains each kind of evidence it labels a number with", () => {
    const { container } = page();
    for (const label of [
      "Registered test",
      "Descriptive",
      "Development result",
      "Exploratory reading",
      "Judgement",
    ]) {
      expect(container.textContent).toContain(label);
    }
    const legend = container.querySelector("dl");
    expect(legend?.querySelectorAll("dt")).toHaveLength(5);
  });

  it("shows no placeholder, no unformatted number and no object where a sentence should be", () => {
    const { container } = page();
    expect(container.textContent).not.toMatch(/undefined|NaN|\[object|null %|Infinity/);
  });

  it("names every chart, gives every table a caption, and makes every scrollable region reachable by keyboard", () => {
    const { container } = page();
    for (const img of container.querySelectorAll('[role="img"]')) {
      expect(
        img.getAttribute("aria-label")?.length ?? 0,
        img.outerHTML.slice(0, 80),
      ).toBeGreaterThan(10);
    }
    for (const table of container.querySelectorAll("table"))
      expect(table.querySelector("caption"), table.className).not.toBeNull();
    for (const region of container.querySelectorAll('[role="region"]')) {
      expect(region.getAttribute("tabindex")).toBe("0");
      expect(region.getAttribute("aria-label")?.length ?? 0).toBeGreaterThan(5);
    }
  });
});

describe("the findings and the levers", () => {
  it("shows the six findings, each with its kind of evidence and a link to the figures behind it", () => {
    const { container } = page();
    const items = container.querySelectorAll("#findings li");
    expect(items).toHaveLength(6);
    for (const li of items) {
      expect(li.querySelector("a")?.getAttribute("href")).toMatch(/^#/);
      expect(li.textContent).toMatch(
        /Registered test|Descriptive|Development result|Exploratory reading/,
      );
    }
  });

  it("ranks the levers with the largest first, and gives each bar its figure and its interval in words and in text", () => {
    const { container } = page();
    const levers = [...container.querySelectorAll("#levers ol > li")];
    expect(levers).toHaveLength(INSIGHTS.levers.length);
    expect(levers[0]?.id).toBe("lever-card-values");
    for (const li of levers) {
      const bars = li.querySelectorAll('[role="img"]');
      expect(bars.length).toBeGreaterThan(0);
      for (const bar of bars)
        expect(bar.getAttribute("aria-label")).toMatch(/points past the Act-1 boss, 95 % interval/);
      expect(li.textContent).toMatch(/\d+\.\d% against \d+\.\d% past the Act-1 boss/);
    }
    // each lever says whether the advisor already helps with it
    expect(container.querySelector("#levers")?.textContent).toMatch(/In the advisor/);
    expect(container.querySelector("#levers")?.textContent).toMatch(/Not in the advisor yet/);
  });

  it("labels the bars of a registered test and a development result differently, and says so in words", () => {
    const { container } = page();
    const relics = container.querySelector("#lever-relics-along-the-way");
    expect(relics?.textContent).toContain("Development result");
    expect(relics?.textContent).not.toContain("Registered test");
    const synergy = container.querySelector("#lever-synergy");
    expect(synergy?.textContent).toContain("Registered test");
  });
});

describe("where runs end", () => {
  it("draws the games of every class at both levels as four parts, and writes the shares in the name of each bar", () => {
    const { container } = page();
    const bars = [...container.querySelectorAll('#runs-end [role="img"]')];
    expect(bars).toHaveLength(12); // five classes and all of them, at Ascension 0 and 9
    for (const b of bars) {
      expect(b.getAttribute("aria-label")).toMatch(
        /died in act 1.*died in act 2.*died in act 3.*won/,
      );
      expect(b.children).toHaveLength(4);
    }
    const first = INSIGHTS.runsEnd[0];
    expect(bars[0]?.getAttribute("aria-label")).toContain(
      share(first ? first.diedAct1 / first.completed : 0),
    );
  });

  it("says how much of the dying happened in a boss fight, with the figures of the games, and no longer claims that bosses end most runs", () => {
    const { container } = page();
    const text = container.querySelector("#runs-end")?.textContent ?? "";
    for (const v of INSIGHTS.runsEnd) {
      const b = bossDeaths(v);
      expect(text).toContain(
        `${share(b.all)} of the runs that died at Ascension ${String(v.ascension)}`,
      );
    }
    expect(text).not.toMatch(/bosses end most|end most of them/i);
    expect(container.querySelector("#runs-end h2")?.textContent ?? "").toBe(
      "Most runs end before the third act",
    );
  });

  it("tags the boss fights in the lists of what ended the runs, and only those", () => {
    const { container } = page();
    const items = [...container.querySelectorAll("#runs-end ol li")];
    const named = (id: string): Element | undefined =>
      items.find((li) => li.textContent.startsWith(enemyName(id)));
    expect(named("VANTOM")?.textContent).toContain("boss");
    expect(named("FOGMOG")?.textContent ?? "").not.toContain("boss");
    const a0 = INSIGHTS.runsEnd[0];
    const tagged = items.filter((li) => li.textContent.includes("boss")).length;
    const expected = [a0, INSIGHTS.runsEnd[1]]
      .flatMap((v) => v?.killersByAct.flatMap((k) => k.top.slice(0, 5)) ?? [])
      .filter((t) => t.atBoss === t.deaths).length;
    expect(tagged).toBe(expected);
  });

  it("lists what ended the runs by act and says how many had no killer recorded", () => {
    const { container } = page();
    const a0 = INSIGHTS.runsEnd[0];
    const top = a0?.killersByAct[0]?.top[0];
    expect(container.querySelector("#runs-end")?.textContent).toContain(
      enemyName(top?.enemy ?? "?"),
    );
    expect(container.querySelector("#runs-end")?.textContent).toMatch(/with no killer recorded/);
    expect(container.querySelector("#runs-end")?.textContent).toMatch(/Gold left at death/);
  });
});

describe("the second boss", () => {
  it("plots all eleven features at both bosses in three groups, each with its change in the odds written out", () => {
    const { container } = page();
    const section = container.querySelector("#second-boss");
    const plots = [...(section?.querySelectorAll('[role="img"]') ?? [])].filter((e) =>
      (e.getAttribute("aria-label") ?? "").includes("odds of getting past the Act-1 boss"),
    );
    expect(plots).toHaveLength(INSIGHTS.lateDrivers.features.length);
    expect(section?.querySelectorAll("section[aria-label]")).toHaveLength(3);
    expect(section?.textContent).toMatch(/matters less at the second boss/);
    expect(section?.textContent).toContain("How far to trust it");
    // the runs that reach the second boss are survivors of two acts, so a weaker pull there is not read as a card mattering less
    expect(section?.textContent).toMatch(/already got through\s+two acts/);
  });

  it("says that a starting card's pull is weaker at the second boss, not stronger", () => {
    const { container } = page();
    const row = [...container.querySelectorAll("#second-boss li")].find((li) =>
      li.textContent.includes("Starting cards still in the deck"),
    );
    expect(row?.textContent).toMatch(/matters less at the second boss/);
    expect(row?.textContent).not.toMatch(/matters more at the second boss/);
  });

  it("holds the same figures as a table with a caption", () => {
    const { container } = page();
    const table = container.querySelector("#second-boss table");
    expect(table?.querySelector("caption")?.textContent).toMatch(/Odds ratios/);
    expect(table?.querySelectorAll("tbody tr")).toHaveLength(INSIGHTS.lateDrivers.features.length);
  });
});

describe("the cards and the atlas", () => {
  it("opens the first class of the card surprises and lists the others closed", () => {
    const { container } = page();
    const details = [...container.querySelectorAll("#cards details")];
    expect(details).toHaveLength(5);
    expect(details.map((d) => d.hasAttribute("open"))).toEqual([true, false, false, false, false]);
    expect(details[0]?.textContent).toMatch(/Worth more than their rating/);
    expect(details[0]?.textContent).toMatch(/Worth less than their rating/);
    // a rank is written as an ordinal
    expect(container.querySelector("#cards")?.textContent).toMatch(
      /rated \d+(st|nd|rd|th) by hand, \d+(st|nd|rd|th) measured/,
    );
    expect(container.querySelector("#cards")?.textContent).not.toMatch(/\b(1|2|3)th\b/);
  });

  it("answers the class and the mechanic it is asked about", () => {
    const { container } = page();
    const atlas = atlasData();
    const poison = atlas.find((m) => m.id === "poison");
    expect(poison).toBeDefined();
    const silentSupplier = poison?.suppliers.find((c) => c.cls === "silent");
    const ironcladOnly = atlas
      .flatMap((m) => m.suppliers)
      .find(
        (c) =>
          c.cls === "ironclad" &&
          !poison?.suppliers.some((p) => p.id === c.id) &&
          !poison?.payoffs.some((p) => p.id === c.id),
      );
    expect(silentSupplier).toBeDefined();
    expect(ironcladOnly).toBeDefined();

    const section = container.querySelector<HTMLElement>("#synergy");
    if (!section) throw new Error("no synergy section");
    fireEvent.click(within(section).getByLabelText("Silent"));
    fireEvent.change(within(section).getByLabelText("Mechanic"), { target: { value: "poison" } });
    expect(section.querySelector("h3")?.textContent).toBe(poison?.label);
    expect(section.textContent).toContain(silentSupplier?.name ?? "?");
    expect(section.textContent).not.toContain(ironcladOnly?.name ?? "?");
    // the lists are regions that can be scrolled from the keyboard
    const regions = section.querySelectorAll('[role="region"]');
    expect(regions).toHaveLength(2);
    for (const r of regions) expect(r.getAttribute("tabindex")).toBe("0");
  });
});

describe("the Ascension ladder, the coverage and what is not known", () => {
  it("lists levels 1 to 10 with a rule that links to the register and says what was tested", () => {
    const { container } = page();
    const rows = container.querySelectorAll("#ascension tbody tr");
    expect(rows).toHaveLength(10);
    for (const row of rows)
      expect(row.querySelector("a")?.getAttribute("href")).toMatch(/^\/methods#[A-Z]+-\d+$/);
    expect(container.querySelector("#ascension")?.textContent).toMatch(/Levels are cumulative/);
    expect(container.querySelector("#ascension")?.textContent).toMatch(/second boss never played/);
    // class by class at both levels
    expect(container.querySelectorAll('#ascension [role="img"]')).toHaveLength(6);
  });

  it("gives every part of the game its row and every cell a spoken status as well as a mark", () => {
    const { container } = page();
    const rows = container.querySelectorAll("#coverage tbody tr");
    expect(rows.length).toBeGreaterThanOrEqual(12);
    const cells = [...container.querySelectorAll("#coverage tbody td")].filter((td) =>
      td.querySelector(".sr-only"),
    );
    expect(cells.length).toBeGreaterThan(40);
    for (const td of cells)
      expect(td.querySelector(".sr-only")?.textContent).toMatch(
        /Covered|Partly covered|Not covered|Not applicable/,
      );
  });

  it("lists seven things the figures do not reach, each with a first step", () => {
    const { container } = page();
    const items = container.querySelectorAll("#open li");
    expect(items).toHaveLength(7);
    for (const li of items) expect(li.textContent).toMatch(/First step:/);
  });
});
