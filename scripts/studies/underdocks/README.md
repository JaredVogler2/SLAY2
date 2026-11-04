# Do the three Overgrowth results hold in Underdocks? (ADR-064)

Run from a clean checkout of the commit named in ADR-064 or of a later commit that changes none of the paths the preflight compares (`sim`, `scripts/studies/underdocks`,
`packages/game-data/data`, `experiments/cardvalue`, `experiments/neow`, `experiments/seeds`, `external/pins.json`); the preflight refuses anything else, and refuses a
commit that is not on the remote. Nothing here plays a `test` seed, and nothing here is played before the registration is on the remote.

Environment (the scripts set `PYTHONPATH=sim` themselves):

- `PY` : the interpreter that has numpy and pytest (the default `python3` does not on every machine).
- `SLAY2_EXTERNAL_ROOT` : the directory of the fetched simulator checkouts. **Do not link it into the worktree as `external/checkouts`**: the preflight refuses untracked files
  outside `experiments/` and `artifacts/`, and the ignore rule of that path does not match a link.
- `OMP_NUM_THREADS=1`, and `OUT` if the logs and marker files should go elsewhere than `artifacts/underdocks`.

The study: six arms, five classes, the 2,000 `val` seeds of each class, Act 1 in Underdocks, Ascension 0, the relics kept, `veteran` (60,000 games), in three tests, each pooled
over the five classes: T1 the synergy term, T2 the card values the site shows, T3 the opening-relic rule. Each batch has an Overgrowth twin that already exists in
`experiments/batches/` and is read, never played again.

1. `PREFLIGHT_ONLY=1 run-val.sh 4` : the checks alone. The tree is clean; HEAD is on the remote; the code and data the arms read are those of the registration commit (the first
   commit that holds the text of ADR-064; `REG=<sha>` names another one when an addendum of the record has moved it on purpose, and the result then says so); every file an arm
   reads is committed and its SHA-256 is quoted in ADR-064; the card table's content hash; the whole file of the harness's tests passes; the precondition is committed and passed; the twins
   exist; no pooled result, per-class output or all-pairs file exists or is in the history; no `val` batch exists unless an interrupted run is being finished.
2. `run-val.sh 4` : the thirty batches in the order T2, T3, T1 (the order decides nothing), into `experiments/underdocks/batches/`. One run at a time (a lock), from one commit
   (`artifacts/underdocks/run-head.txt`); before each batch no tracked file may have changed; when a batch ends it is read against its own manifest and the run stops at the first
   one that is not what ADR-064 says. `RESUME=1` finishes an interrupted run from the same commit: a finished batch is checked and never touched. After a reset of the machine
   `artifacts/` is gone: check out the commit the first finished batch was played from (its manifest's `environment.slay2.head`) and write it into `artifacts/underdocks/run-head.txt`;
   that is a control against mistakes, not a lock, and the record says that no batch was played by hand. Run it detached (`setsid nohup`), because a foreground command is
   stopped after two hours; it takes about five hours on four cores.
3. `audit.sh` : every win of the thirty batches re-derived (`slay2_sim audit wins`) and a 40-game sample of each audited (`audit sample`), one batch after the other (about an hour). **The marker file
   `artifacts/underdocks/audit-done.txt` lists exit codes only and no count of wins, because it is read while the run waits; the batch logs end with a summary that includes
   the number of wins and are not opened before the pooled tests have run.** A failed audit ends as `AUDIT_FAILED`, never as `AUDIT_DONE`.
4. `pool.sh` : refuses to run unless all thirty batches are what ADR-064 says (read again from their manifests: policy, parameters, class, Act 1, relics kept, seeds, a clean tree,
   one commit for all of them, 90 % completed), finished and audited, and unless nothing of the study's results exists; checks the arms of every pair of every test; then writes each
   class's comparison, the three pooled tests (`slay2_sim pool`, exact McNemar, the whole-seed interval at the level 1 - 0.05 / 3) and the all-pairs analysis
   (`robustness.py`, code of its own), each **once**. If it dies half way, the files it wrote are the only thing to delete before running it again (the inputs are the same
   and the computation is deterministic), and the record gets an addendum that says so.
5. `python3 scripts/verify-pooled.py --bootstrap --batches experiments/underdocks/batches experiments/underdocks/pooled-ud-*.json` : every pooled file recomputed from the
   episodes by code that shares nothing with `slay2_sim` (read-only; it may be run after the pooling), and its outcome is quoted.

Then the result is written into `docs/DECISIONS.md`, whichever way it came out, before anything on the site changes; the exporter's reader (`scripts/lib/underdocks.mjs`) applies the
reading rule of ADR-064 item 5 to the numbers alone. `precondition.sh` and `precondition_report.py` played and read the development games that the record reports (on `dev` seeds,
before the registration); their outputs are committed.
