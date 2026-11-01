# Which acts carry the effect of a pickier card rule, and does it reach winning? (ADR-061)

Run from a clean checkout of the commit named in ADR-061 (the preflight refuses any other code), with `SLAY2_EXTERNAL_ROOT` pointing at the fetched
simulator and `PY` at the interpreter that has numpy (the scripts set `PYTHONPATH=sim`). Every script is resumable or refuses to run twice; a batch
that has a manifest is checked and never touched. Nothing here plays a `test` seed, and nothing here is played before the registration of ADR-061 is on
the remote.

There is no fit and no development stage: the arms are fixed by the registration (the threshold 0.2 of the lead, in one act or in all three) and the
seeds are the 3,000 `val2` seeds of `experiments/seeds/ironclad-a0-v3.json`, which no earlier study played.

1. `run-val.sh 4` : the held-out arms S, L (the lead), A1, A2, A3 (in that order), five classes, 3,000 `val2` seeds each, Ascension 0, the relics kept,
   `veteran` (75,000 games). It runs `preflight-val.sh` first (HEAD on the remote; the registration commit an ancestor; the code and data the arms read
   and the reading code unchanged since it; the SHA-256 of the five value files and of the seed file quoted in ADR-061; no game on the `val2` seeds
   played under any batch id; no result of the study anywhere in the history), takes a lock, records the commit it started from and checks every
   batch against its own manifest when it ends. `PREFLIGHT_ONLY=1` stops after the checks; `RESUME=1` finishes an interrupted run from the same commit.
2. `audit.sh val2` : every win re-derived, a 40-game sample audit of every batch.
3. `pool.sh` : refuses to run unless every batch is finished and audited; then the identity checks of A2 and A3 against S
   (`experiments/acts/identity/`), each class on its own, the four pooled tests (exact McNemar over the five classes at the endpoint "the run was won",
   with the whole-seed interval at level 1 - 0.05 / 4), the boss-agreement check of the arms that are S in the early acts, and the all-pairs analysis
   (`robustness.py`, a condition of the reading rule, ADR-061 item 4), each run once.
4. `python3 scripts/verify-pooled.py experiments/acts/pooled-acts-*.json --bootstrap` : the pooled files recomputed from the raw episodes.

| Test | Arm | Against |
|---|---|---|
| L, the old lead | `rules_v2`, the shown values, threshold 0.2 in every act | S |
| A1, pickier in Act 1 | `rules_v2_late`, the shown values, threshold 0.2 in the card rewards of Act 1 (act index 0) only | S |
| A2, pickier in Act 2 | the same, act index 1 only | S |
| A3, pickier in Act 3 | the same, act index 2 only | S |

S is `rules_v2` with the shown values and threshold 0. Each test is read at 0.05 / 4 = 0.0125.
