import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import InsightsPage from "@/app/insights/page";
import { INSIGHTS, bossDeaths, count, enemyName, findings, pct, share } from "@/lib/insights";
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
  "later",
  "acts",
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
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "What moves the odds in simulated runs",
    );
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

describe("what the independent audit found unsupported, and the page now says instead", () => {
  it("no longer says what the audit found wrong: an old headline, a best pilot, a lone source for the second half, advice or cause in a headline", () => {
    const { container } = page();
    const text = container.textContent;
    for (const retired of [
      /bosses end most|end most of them/i,
      /best (simulated )?pilot/i,
      /the evidence there is/i,
      /biggest lever you control/i,
      /big lever too/i,
      /What decides a run/,
      /how much each decision is worth/i,
      /matters (less|more) at the second boss/i,
      /about half as often/i,
      /Tune when to fight elites, rest and shop/,
      /tuned route and rest thresholds/i,
    ])
      expect(text, String(retired)).not.toMatch(retired);
  });

  it("says that every performance figure is simulated, and names the three gaps of the simulator that bear on the page", () => {
    const { container } = page();
    const first = container.querySelector("section")?.textContent ?? "";
    const text = container.textContent;
    expect(text).toMatch(/Every performance figure here comes from a third-party simulator/);
    expect(text).not.toMatch(/Every figure here comes from/);
    expect(text).toMatch(/Overgrowth.*\(G12\)/);
    expect(text).toMatch(/start-of-act Ancient.*\(G11\)/);
    expect(text).toMatch(/75\s+HP where the game gives 66 \(G13\)/);
    expect(first.length).toBeGreaterThan(0);
    // the labels are on the findings and the lever rows, which is what the page says
    expect(text).toMatch(/the findings and the lever\s+rows carry a label/);
    expect(text).not.toMatch(/so each carries a label/);
  });

  it("says in the footer which numbers are read from the experiment files and which are written from the register", () => {
    const { container } = page();
    const text = container.textContent;
    expect(text).toMatch(/Every measured figure on this page is read from the experiment files/);
    expect(text).toMatch(/written from the register of rules/);
    expect(text).not.toMatch(/Every number on this page is written by/);
  });

  it("says how many games are in the ledger without saying that all of them feed a figure", () => {
    const { container } = page();
    const total = INSIGHTS.games.completed + INSIGHTS.games.exploration.completed;
    expect(container.textContent).toContain(
      `${count(total)} completed games are in the project’s ledger`,
    );
    expect(container.textContent).toMatch(/Not every game feeds a figure here/);
    expect(container.textContent).not.toMatch(/games are behind the page/);
  });

  it("gives the ends finding the share that ended before act 3 and the pilot it is about, not a share of act 1 under a headline about most runs", () => {
    const a0 = INSIGHTS.runsEnd[0];
    const f = findings().find((x) => x.id === "ends");
    expect(f?.figure).toBe(
      share(((a0?.diedAct1 ?? 0) + (a0?.diedAct2 ?? 0)) / (a0?.completed ?? 1)),
    );
    expect(f?.headline).toMatch(/Most simulated runs end before act 3/);
    expect(f?.body).toMatch(/The pilot that follows the card values shown on the site/);
  });
});

describe("the pages' parts that the audit found misleading or incomplete", () => {
  it("says in the lever rows which class went the other way, what the search costs, what was tuned, and that the relics lever is a simulator fix", () => {
    const { container } = page();
    const lever = (id: string): string =>
      container.querySelector(`#lever-${id}`)?.textContent ?? "";
    expect(lever("values-remeasured")).toMatch(
      /Ironclad went the other way \(81\.7% against 85\.2% in 1,901 pairs\)/,
    );
    expect(lever("values-remeasured")).toMatch(/In the advisor for four classes/);
    expect(lever("values-remeasured")).toMatch(/not due to the relics alone/);
    expect(lever("search")).toMatch(
      /A game takes about 105 times as long as one of the rules pilot/,
    );
    expect(lever("search")).not.toMatch(/300 games/);
    expect(lever("thresholds")).toMatch(/Avoid more elite fights/);
    expect(lever("thresholds")).toMatch(/three tuned elite-fight thresholds/);
    expect(lever("thresholds")).toMatch(
      /heal, rest and shop thresholds were screened too and none was adopted/,
    );
    expect(lever("relics-along-the-way")).toMatch(
      /Simulator fix: keep the relics a run gains \(G14\)/,
    );
    expect(lever("relics-along-the-way")).toMatch(/relics kept against relics dropped/);
    // a lever with every class ahead says nothing of the kind
    expect(lever("opening-relic")).not.toMatch(/went the other way/);
  });

  it("makes one row of a boss fight whatever enemies were alive at the end, tags it, and says what a row below the bosses is", () => {
    const { container } = page();
    const rows = [...container.querySelectorAll("#runs-end ol li")].map((li) => li.textContent);
    expect(rows.some((t) => t.startsWith("Kin Follower & Kin Priest") && t.includes("boss"))).toBe(
      true,
    );
    expect(rows.some((t) => t.startsWith("Crusher & Rocket") && t.includes("boss"))).toBe(true);
    // the parts of a fight are not rows of their own
    expect(rows.some((t) => /^(Kin Priest|Rocket|Crusher)\d/.test(t))).toBe(false);
    const text = container.querySelector("#runs-end")?.textContent ?? "";
    expect(text).toMatch(/one ordinary fight can fill more than one row/);
    expect(text).toMatch(/A boss fight is one row and is tagged/);
  });

  it("names the pilot of the endings, gives the seeds from the data, and puts the Necrobinder's start HP beside the figures that include it", () => {
    const { container } = page();
    const text = container.querySelector("#runs-end")?.textContent ?? "";
    const a0 = INSIGHTS.runsEnd[0];
    expect(text).toContain(
      `the same ${count(a0?.seedsPerClass ?? 0)} seeds of each class. It won ${share((a0?.won ?? 0) / (a0?.completed ?? 1))} of its games at Ascension 0, so act 3 and winning are thinly observed`,
    );
    expect(text).toMatch(
      /The simulator starts a Necrobinder with more HP than the game gives it \(gap G13\)/,
    );
    const cards = container.querySelector("#cards")?.textContent ?? "";
    expect(cards).toMatch(
      /The simulator starts a Necrobinder with more HP than the game gives it \(gap G13\)/,
    );
  });

  it("compares only reward cards, says so, names the gap that mis-values a card, and gives the correlations as a range from the data", () => {
    const { container } = page();
    const cards = container.querySelector("#cards")?.textContent ?? "";
    expect(cards).toMatch(/Only cards that a reward can offer are compared/);
    expect(cards).toMatch(/cards with the same rating\s+share their places/);
    expect(cards).toMatch(/known gap G9/);
    expect(cards).toMatch(/reward cards ranked/);
    expect(cards).toMatch(/Among the\s+cards a reward can offer/);
    expect(cards).toMatch(/rank\s+correlations of 0\.\d\d to 0\.\d\d across the classes/);
  });

  it("gives the atlas's measured readings their provenance: random drafts in the simulator as it was, and intervals not corrected for each other", () => {
    const { container } = page();
    const atlas = container.querySelector("#synergy")?.textContent ?? "";
    expect(atlas).toMatch(
      /randomly drafted simulated decks, in the simulator as it was when they were played \(it dropped the relics a run gains\)/,
    );
    expect(atlas).toMatch(
      /\d+ such intervals were read together and are not corrected for each other/,
    );
  });

  it("states what the simulator was read back for at each level, and does not say the level 9 tests include levels it was not read back for", () => {
    const { container } = page();
    const text = container.querySelector("#ascension")?.textContent ?? "";
    expect(text).toMatch(/read back against the register of rules for levels 1 and 4\s+to 7/);
    expect(text).toMatch(
      /the gold of level 3, level 2.s heal after the first act and the\s+enemy numbers of levels 8 and 9 were not/,
    );
    expect(text).not.toMatch(/so the level 9 tests\s+include them all/);
    expect(text).toMatch(/The same\s+2,000 seeds of each class/);
    expect(text).toMatch(/built to hold eight elite rooms instead of five/);
    expect(text).toMatch(/base chance of a rare card in a reward is halved/);
  });

  it("asks of the second half of a run only what the games can say, and does not call the exploration games the only evidence", () => {
    const { container } = page();
    const open = container.querySelector("#open")?.textContent ?? "";
    expect(open).toMatch(/the endings of the pilot.s own games above are another reading/);
    expect(open).toMatch(/Tune the elite thresholds again with the relics kept/);
    expect(open).toMatch(/elites are one place relics come from/);
    expect(open).toMatch(/event records \(they include the Ancients that open the acts/);
    expect(open).toMatch(/could show where the simulator departs from the game/);
    expect(open).toMatch(/rank correlation of 0\.59 for Ironclad/);
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
      "Most simulated runs end before the third act",
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
    expect(section?.textContent).toMatch(/a weaker association at the second boss/);
    expect(section?.textContent).not.toMatch(/matters (less|more) at the second boss/);
    expect(section?.textContent).toContain("How far to trust it");
    // the share of random picks, the Ascension and the relics are said, and the Necrobinder's start HP is named (G13)
    expect(section?.textContent).toContain(
      `in which ${pct(INSIGHTS.lateDrivers.exploreShare, 0)} of the card picks were random`,
    );
    expect(section?.textContent).toMatch(/Ascension 0 games, the relics kept/);
    expect(section?.textContent).toMatch(/75 HP, the game gives 66 \(gap G13\)/);
    // the runs that reach the second boss are survivors of two acts, so a weaker pull there is not read as a card mattering less
    expect(section?.textContent).toMatch(/already got through\s+two acts/);
  });

  it("says that a starting card's pull is weaker at the second boss, not stronger", () => {
    const { container } = page();
    const row = [...container.querySelectorAll("#second-boss li")].find((li) =>
      li.textContent.includes("Starting cards still in the deck"),
    );
    expect(row?.textContent).toMatch(/a weaker association at the second boss/);
    expect(row?.textContent).not.toMatch(/a stronger association at the second boss/);
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
