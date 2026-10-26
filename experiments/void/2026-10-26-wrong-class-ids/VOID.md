# Void: the first opening-relic study (ADR-041), four classes were played as Ironclad

**Status: void. Nothing in this directory is evidence about Silent, Regent, Necrobinder or Defect, and nothing computed from it may
be quoted.** Recorded on 2026-10-26, a few hours after the study's held-out run finished.

## What happened

The study measured what each of the opening Ancient's relics is worth (`neow_explore` exploration, a logistic fit, then one pooled
held-out test; ADR-041). Its runs were started with `--character ironclad|silent|regent|necrobinder|defect` in lower case. The
pinned third-party simulator matches the class id **exactly** and silently plays any other string as Ironclad
(`RunManager`: `_CHARACTER_CONFIG.get(character_id, <Ironclad>)`, and the starter deck's "Fallback to Ironclad"). The existing
`rules_v2-<class>` baselines had been played with the exact ids (`Silent`, `Regent`, `Necrobinder`, `Defect`).

Consequences, by file:

| Files | What they are | Valid? |
|---|---|---|
| `neow/explore-ironclad-a0-train-n3000/` | 3,000 exploration games, Ironclad | the games are valid Ironclad games, but they are an input of a void fit |
| `neow/explore-{silent,regent,necrobinder,defect}-a0-train-n3000/` | 12,000 exploration games | **void**: played with Ironclad's 80 HP and starter deck (the most common final maximum HP is 80 in every one of them; a real run gives 70, 75, 75 and 75) |
| `neow/neow-values-v1.json` | the fitted relic values (SHA-256 `a0fc7103121ac4e181910468861528402e1189ff90f57b243dde72ed84572565`) | **void**: fitted on those 15,000 games |
| `batches/rules_v2_neow_values-ironclad-a0-veteran-val-n2000/` | held-out arm, Ironclad | a valid Ironclad game played by a rule built from void values: not evidence |
| `batches/rules_v2_neow_values-{silent,regent,necrobinder,defect}-a0-veteran-val-n2000/` | held-out arms | **void**: the wrong class again |
| `neow/pooled-neow-values-vs-rules_v2-val.json` | the pooled comparison with the existing baselines | **void**: it compares an Ironclad-played arm with properly played baselines |

The pooled comparison that was computed from them is recorded here only so that no one wonders whether a result was hidden: it
said the rule got past the Act-1 boss in 60.7 % of the pooled pairs against 54.2 % for the first helpful relic, with Silent,
Regent, Defect and Ironclad ahead and Necrobinder behind (41.0 % against 62.1 %). **None of that describes the game.** The
baselines it was compared with are fine; the treatment arms were not the classes they were labelled as.

## How it was found

1. A drift check I started on development seeds to understand why the Necrobinder arm looked so different from its baseline used
   the same lower-case ids and "found" that today's code no longer reproduced the stored baseline (Silent 33.7 % against 15.0 % on
   300 seeds). That was the bug reproducing itself, not code drift. A probe of `RunManager` with `silent` and `Silent` showed
   80 HP and the Ironclad deck against 70 HP and the Silent deck.
2. An independent review of the site code (a subagent that was given the code and no conclusions) reached the same cause from the
   other side: the final maximum HP of the arms, and the fact that the baselines' pass rates lay outside the range of every
   single relic's exploration rate.

## Why it was not caught earlier

* The audits (`audit wins`, `audit sample`, `audit rederive`) re-run a game from its manifest and compare it with the stored
  record. A game played as the wrong class is reproduced as the wrong class, so every audit passed. An audit establishes that a
  result is reproducible, not that the configuration is right.
* The pairing guard of `slay2_sim compare` / `pool` did refuse the pairing ("batches must share the character": `ironclad` against
  `Ironclad`). I treated the refusal as a formatting nuisance and made the guard case-insensitive instead of asking why the two
  strings differed. That change (commit `b8effb9`) removed the only check that was in the way and is reverted.
* The one-class-at-a-time design of the earlier multi-class work used the capitalised ids, so the habit did not carry over.

## What was checked and what was not affected

Every committed `manifest.json` under `experiments/` was scanned for the class id it was run with and for the final maximum HP
of its games. The eight batches listed above are the only ones with a lower-case id of a class other than Ironclad; all others
(the five `cardvalue/explore-<class>-a0-train-rep0` batches behind the published card values, the baselines, the held-out tests
of ADR-031, ADR-034, ADR-036, ADR-040, ADR-045 and ADR-046, the search and tuning batches) used exact ids and show 70, 75, 75 and
75 for the four classes. The published card values and their tests stand.

## What changes so that it cannot happen again

ADR-049 records the decisions. They are made in the commits that follow this one, and each commit says which: the harness refuses
any class id the simulator does not know exactly, checks the starting HP and starter deck of every game against the class it was
asked for, `audit` and the pairing guard refuse a class string that is not exact, and the study is registered again, in full,
before any game of it is played.

## A second finding from the same check

Comparing the simulator's starting state with the repository's own class facts (read from the game's source) showed that the
simulator starts a **Necrobinder with 75 HP; the game's `Necrobinder.StartingHp` is 66**. That is a simulator gap (G13), recorded in
`sim/slay2_sim/gaps.json`; it affects every simulated Necrobinder result (card values, tests) in the direction of making the class
look sturdier than it is, by an amount that has not been measured.
