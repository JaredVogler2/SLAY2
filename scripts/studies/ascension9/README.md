# Do the three Ascension 0 results hold at Ascension 9? (ADR-058)

Run from a clean checkout of the commit that registered ADR-058 (the preflight refuses any other code), with `SLAY2_EXTERNAL_ROOT` pointing at
the fetched simulator and `PY` at the interpreter that has numpy (the scripts set `PYTHONPATH=sim`). Nothing is fitted: the study changes the
Ascension and nothing else. Each script is resumable: a batch with a manifest is checked and never touched.

1. `ascension_check.py experiments/ascension9/ascension-check.json` : what the pinned simulator changes at each Ascension (potion slots,
   Ascender's Bane, elites on the map, removal price, rarity odds), read against the rule register. No fight is played.
2. `precondition.sh 4` : the six arms on 100 development seeds per class at Ascension 9, and the shown-values pilot at Ascension 0 on the same
   seeds; writes `experiments/ascension9/precondition.json` (it must say `passed`).
3. Write the registration (ADR-058) and push it. `preflight-val.sh` refuses to start unless it is on the remote, quotes in the record itself the
   hash of every file an arm reads, recomputes the card table's hash, finds the code and data the arms read unchanged since the registration
   commit, the precondition passed and no result of the study exists.
4. `run-val.sh 4` : the held-out arms, 60,000 games (three tests, six arms, five classes, the 2,000 `val` seeds of each class) with
   `--keep-relics`, Ascension 9, `veteran`, then the twin of T2 (20,000 games, Ascension 0). It runs `preflight-val.sh` first, takes a lock,
   records the commit it started from and checks every batch against its own manifest when it ends. Batches are
   `experiments/batches/<arm>-<class>-a9-veteran-keeprelics-val-n2000` (the twin's `-a0-`).
5. `audit.sh val` : every win re-derived, a 40-game sample audit of every one of the forty batches.
6. `pool.sh` : refuses to run unless the forty batches are finished and audited; then each class on its own and the pooled tests (exact McNemar
   over the five classes, with the whole-seed interval at level 1 - 0.05 / 3), each run once.

The three tests (arm a against arm b, pooled over the five classes, each read at 0.05 / 3):

| Test | Arm a | Arm b |
|---|---|---|
| T1, the synergy term | `advisor_v1` `A*` (`{"engines":0,"margin":0.0,"needs":1,"scalers":0.7}`) | `advisor_v1` `d0*` (`{"synergy":0,"margin":0}`) |
| T2, the measured card values | `rules_v2` following the value files the site shows, threshold 0 | `rules_v1` |
| T3, the opening-relic rule | `rules_v2_neow_values` following `experiments/neow/neow-values-keep-v1.json` | `rules_v2` taking the first helpful relic |

The twin of T2 (descriptive): the same two arms at Ascension 0 with the relics kept.
