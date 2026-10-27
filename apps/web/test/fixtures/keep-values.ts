import {
  keepValuesVerdict,
  type KeepValuesClass,
  type KeepValuesTest,
} from "../../src/lib/cardvalues";

import { CLASSES, fixturePooled, mcnemarP } from "./synergy-test";

/**
 * A made-up result of the registered test of the card values measured again with the relics kept (ADR-053), for the tests of what the
 * page says for each way the rule of item 5 can read it. The numbers are consistent with each other; none of them is a simulation.
 * `own` gives a class's own comparison (pairs only the new values / only the current ones got past the boss) where it is not 1:1.
 */
export function fixtureKeepValues(
  aOnly: number,
  bOnly: number,
  own: Partial<Record<(typeof CLASSES)[number], readonly [number, number]>> = {},
): KeepValuesTest {
  const primary = fixturePooled("pooled-keepvals-vs-curvals-val", aOnly, bOnly);
  const pooledGain = primary.reachedAct2.pairedTable.mcnemar_p < 0.05 && aOnly > bOnly;
  const classes: Record<string, KeepValuesClass> = {};
  for (const cls of CLASSES) {
    const [a, b] = own[cls] ?? [Math.round(aOnly / 5), Math.round(bOnly / 5)];
    const p = mcnemarP(a, b);
    const ahead = b > a && p < 0.05;
    classes[cls] = {
      new: {
        file: `experiments/cardvalue/${cls}-a0-keep-v1.json`,
        sha256: "ef".repeat(32),
        games: 5000,
        bossFights: 4000,
        passRate: 0.5,
      },
      current: { file: `experiments/cardvalue/${cls}-a0-v1.json`, sha256: "01".repeat(32) },
      own: { aOnly: a, bOnly: b, p },
      currentSignificantlyAhead: ahead,
      adopted: pooledGain && !ahead,
    };
  }
  const test: KeepValuesTest = {
    adr: "ADR-053",
    alpha: 0.05,
    primary,
    verdict: "x",
    adopted: CLASSES.filter((c) => classes[c]?.adopted),
    classes,
  };
  return { ...test, verdict: keepValuesVerdict(test) };
}
