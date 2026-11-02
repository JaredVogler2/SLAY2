# Which Act-2 card-pick threshold wins the most games, and does the effect replicate? (ADR-062)

Run from a clean checkout of the commit named in ADR-062 (the preflights refuse any other code), with `SLAY2_EXTERNAL_ROOT` pointing at the fetched
simulator and `PY` at the interpreter that has numpy (the scripts set `PYTHONPATH=sim`). Every script is resumable or refuses to run twice; a batch that
has a manifest is checked and never touched. Nothing here plays a `test` seed, and nothing here is played before the registration is on the remote.

The study has two stages and two registrations. The arms are S (`rules_v2` with the card values the site shows, threshold 0) and the same pilot with
a threshold on the card reward of **Act 2 only** (`rules_v2_late`, `late_acts` [1]): a card is taken only if the best one offered is worth more than
the threshold, otherwise the reward is skipped. Two classes (Ironclad, Defect), Ascension 0, the relics kept, `veteran`.

0. `python3 scripts/studies/thresh/power.py` : the power tables of the record, computed from the committed result of ADR-061 (nothing typed by hand); `PYTHONPATH=sim python3 scripts/studies/thresh/screen_sim.py` : what the development screen does in stylized worlds (how often it advances a threshold).
1. `dev.sh 4` : the development stage (part 1 of the record must be pushed and registered first; `preflight-dev.sh` refuses otherwise). S and the six
   thresholds `t010 t020 t030 t045 t060 tnone` (0.1, 0.2, 0.3, 0.45, 0.6 and never take a card in Act 2) on the 3,000 `dev2` seeds of each class
   (6,000 games an arm, 42,000 in all). `PREFLIGHT_ONLY=1` stops after the checks; `RESUME=1` finishes an interrupted stage from the same commit.
2. `audit.sh dev` : every win re-derived, a 40-game sample of every batch (`AUDIT_JOBS=4` four at a time); `select-dev.sh` refuses to run unless each development batch's own audit files pass (a sample audit of at least 40 games made from the batch's content, every win re-derived: `audits_ok.py`).
3. `select-dev.sh` : the selection rule of ADR-062 item 3, applied once: writes `experiments/thresh/dev-selection.json` (and refuses to run twice, and to run unless each development batch's own audit files pass: `audits_ok.py`). `python -m slay2_sim.threshstudy verify` recomputes the selection from the batches; the preflight of the held-out run and `pool.sh` require the committed file to be what it gives.
4. `python3 scripts/studies/thresh/part2.py` and `scripts/studies/thresh/pinned-diff.sh` : the numbers of part 2 of the record (the frozen choices) and, if anything the registration froze has changed since, the line `PINNED_DIFF=<sha>` that part 2 has to quote (commit any change of the frozen paths first: the hash is of commits; the preflight and `pool.sh` refuse otherwise; the design text of the record must also be the registration's byte for byte, and the reading code is among the frozen paths). Part 2 names the arms that go forward
   (`ARM_<tag>`), quotes the hash of the selection and the commit the development stage was played from (`DEV_HEAD=<sha>`) and is pushed before the first
   held-out game. The commit that carries it also commits the 14 development batches (`experiments/batches/thresh-dev-*`) and the selection: the preflight, `pool.sh` and `threshstudy verify` read them from
   the worktree that plays the held-out run, so a fresh `git worktree add` of that commit has what they need.
5. `run-val.sh 4` : the held-out arms S, `t020` and, if the screen advanced one, its threshold, on the 15,000 `val3` seeds of each class (30,000 games an
   arm). It runs `preflight-val.sh` first (HEAD on the remote; part 2 in the record and its commit an ancestor; what the registration froze, the reading code included, unchanged since
   it or quoted by part 2 as `PINNED_DIFF=`, and the arms defined alike at `DEV_HEAD`; `DEV_HEAD` a descendant of the registration commit; the SHA-256 of every value file, of the seed file and of the selection quoted in the record; the development
   batches present and played from `DEV_HEAD`; no game on the `val3` seeds under any batch id; no held-out result anywhere in the history).
6. `audit.sh val` then `pool.sh` : the identity checks of every arm against S, each class on its own, the pooled tests T1 (0.2 against S, the replication of
   ADR-061's Act-2 test), T2 (the screen's choice against S) and T3 (the choice against 0.2) at the endpoint "the run was won" with the whole-seed interval at the
   level 1 - 0.05 / (the number of tests played), the all-pairs analysis (`robustness.py`, a condition of the reading rule) and the independent recomputation
   (`verify_all.py` runs `scripts/verify-pooled.py --bootstrap` on every pooled file), each run once.

After a reset of the machine: `artifacts/` is not committed, and `RESUME=1` needs the record of the stage that was started here, `artifacts/thresh/dev-head.txt` (`run-head.txt` for the held-out
run), which holds the commit the stage started from. Check out that commit (the `environment.slay2.head` of the first finished batch's manifest names it) and write it again:
`jq -r .environment.slay2.head experiments/batches/<first finished batch>/manifest.json > artifacts/thresh/dev-head.txt`. This is a control against mistakes (a batch played by hand taken for an
interrupted run), not a lock: a record written by hand defeats it, and the record of the study says that none was played by hand.
