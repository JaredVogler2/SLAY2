# Does anything about the card picks change how often a run gets past the second boss? (ADR-060)

Run from a clean checkout of the commit named in ADR-060 (the preflight refuses any other code), with `SLAY2_EXTERNAL_ROOT` pointing at the fetched
simulator and `PY` at the interpreter that has numpy (the scripts set `PYTHONPATH=sim`). Every script is resumable or refuses to run twice; a batch
that has a manifest is checked and never touched. Nothing here plays a `test` seed.

1. `fit.sh` : the Act-2 card values, once (pure numpy, a minute): for each class the shown values are the prior and the randomised-drafting
   batches with the relics kept (`experiments/cardvalue/explore4-*`) decide, by a cross-validated gate, whether a card-specific part is kept.
   Writes `experiments/cardvalue/<class>-a0-act2-v1.json`; commit them before step 2.
2. `dev.sh 4` : the development stage on `dev[1000:1600)`: S, the lead L, the six Act-2 late-threshold candidates and, if some class was fitted, V
   (600 games per class and arm, `veteran`, Ascension 0, the relics kept). Batches `experiments/batches/act2dev-<arm>-<class>-...`.
3. `select-dev.sh` : applies the registered rule once and writes `experiments/act2/dev-selection.json` (which arms go to the held-out test).
4. Write part 2 of ADR-060 (the fit and the screen as they came out, the arms that go forward, the SHA-256 of the ten value files and of the
   selection file) and push it. `preflight-val.sh` refuses to start unless it is on the remote, finds the code and data the arms read unchanged
   since that commit, and finds no result of the study.
5. `run-val.sh 4` : the held-out arms (S replayed, L, and P and V if they went forward; 10,000 games each) on the 2,000 `val` seeds of each class.
   It runs `preflight-val.sh` first, takes a lock, records the commit it started from and checks every batch against its own manifest when it ends.
6. `audit.sh val` : every win re-derived, a 40-game sample audit of every batch.
7. `pool.sh` : refuses to run unless every batch is finished and audited; then each class on its own, the pooled tests (exact McNemar over the five
   classes at the endpoint "got past the Act-2 boss", with the whole-seed interval at level 1 - 0.05 / 3), the identity checks of P and V against S
   (`experiments/act2/identity/`), the determinism record and the observed-endpoint analysis (`robustness.py`, a condition of the reading rule,
   ADR-060 addendum B), each run once.
8. `python3 scripts/verify-pooled.py experiments/act2/pooled-act2-*.json --bootstrap` : the pooled files recomputed from the raw episodes.
9. (`robustness.py` is run by `pool.sh`; nothing to run by hand.)

| Test | Arm | Against |
|---|---|---|
| L, the old lead | `rules_v2`, the shown values, threshold 0.2 in every act | S |
| P, a pickier Act 2 | `rules_v2_late`, the shown values, the Act-2 threshold the screen chose (Acts 1 and 3 as S) | S |
| V, the Act-2 values | `rules_v2_late`, the shown values, the class's Act-2 value file in Act 2 only (Acts 1 and 3 as S) | S |

S is `rules_v2` with the shown values and threshold 0. Each test is read at 0.05 / 3 whether or not P and V are played.
