# Which Act-2 card-pick threshold wins the most games, and does the effect replicate? (ADR-062)

Run from a clean checkout of the commit named in ADR-062 (the preflights refuse any other code), with `SLAY2_EXTERNAL_ROOT` pointing at the fetched
simulator and `PY` at the interpreter that has numpy (the scripts set `PYTHONPATH=sim`). Every script is resumable or refuses to run twice; a batch that
has a manifest is checked and never touched. Nothing here plays a `test` seed, and nothing here is played before the registration is on the remote.

The study has two stages and two registrations. The arms are S (`rules_v2` with the card values the site shows, threshold 0) and the same pilot with
a threshold on the card reward of **Act 2 only** (`rules_v2_late`, `late_acts` [1]): a card is taken only if the best one offered is worth more than
the threshold, otherwise the reward is skipped. Two classes (Ironclad, Defect), Ascension 0, the relics kept, `veteran`.

0. `python3 scripts/studies/thresh/power.py` : the power tables of the record, computed from the committed result of ADR-061 (nothing typed by hand).
1. `dev.sh 4` : the development stage (part 1 of the record must be pushed and registered first; `preflight-dev.sh` refuses otherwise). S and the six
   thresholds `t010 t020 t030 t045 t060 tnone` (0.1, 0.2, 0.3, 0.45, 0.6 and never take a card in Act 2) on the 3,000 `dev2` seeds of each class
   (6,000 games an arm, 42,000 in all). `PREFLIGHT_ONLY=1` stops after the checks; `RESUME=1` finishes an interrupted stage from the same commit.
2. `audit.sh dev` : every win re-derived, a 40-game sample of every batch (`AUDIT_JOBS=4` four at a time); `select-dev.sh` refuses to run until it ended as `AUDIT_DONE`.
3. `select-dev.sh` : the selection rule of ADR-062 item 3, applied once: writes `experiments/thresh/dev-selection.json` (and refuses to run twice).
4. `python3 scripts/studies/thresh/part2.py` : the numbers of part 2 of the record (the frozen choices), which names the arms that go forward
   (`ARM_<tag>`), quotes the hash of the selection and the commit the development stage was played from (`DEV_HEAD=<sha>`) and is pushed before the first
   held-out game.
5. `run-val.sh 4` : the held-out arms S, `t020` and, if the screen advanced one, its threshold, on the 15,000 `val3` seeds of each class (30,000 games an
   arm). It runs `preflight-val.sh` first (HEAD on the remote; part 2 in the record and its commit an ancestor; the code and data the arms read unchanged since
   it, and the arms defined alike at `DEV_HEAD`; the SHA-256 of every value file, of the seed file and of the selection quoted in the record; the development
   batches present and played from `DEV_HEAD`; no game on the `val3` seeds under any batch id; no held-out result anywhere in the history).
6. `audit.sh val` then `pool.sh` : the identity checks of every arm against S, each class on its own, the pooled tests T1 (0.2 against S, the replication of
   ADR-061's Act-2 test), T2 (the screen's choice against S) and T3 (the choice against 0.2) at the endpoint "the run was won" with the whole-seed interval at the
   level 1 - 0.05 / (the number of tests played), the all-pairs analysis (`robustness.py`, a condition of the reading rule) and the independent recomputation
   (`verify_all.py` runs `scripts/verify-pooled.py --bootstrap` on every pooled file), each run once.
