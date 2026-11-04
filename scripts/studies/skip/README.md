# Does the advisor's price of a slot do harm where a simulation can see it? (ADR-065)

Run from a clean checkout of the commit named in ADR-065 or of a later commit that changes none of the paths the preflight compares (`sim`, `scripts/studies/skip`,
`packages/decision`, `packages/game-data/data`, `experiments/seeds`, `external/pins.json`); the preflight refuses anything else, and refuses a commit that is not on the
remote. Nothing here plays a `test` seed, and nothing here is played before the registration is on the remote. **No file of this directory is edited between the legs**
(the preflight of the second leg compares the directory with the registration commit): what is learned goes into the record and into `docs/`.

Environment (the scripts set `PYTHONPATH=sim` themselves):

- `PY` : the interpreter that has numpy and pytest.
- `SLAY2_EXTERNAL_ROOT` : the directory of the fetched simulator checkouts. **Do not link it into the worktree as `external/checkouts`**: the preflight refuses untracked files
  outside `experiments/` and `artifacts/`.
- `OMP_NUM_THREADS=1`, and `OUT` if the logs and marker files should go elsewhere than `artifacts/skip`.

The check: the pilot that charges for a slot (S1: `advisor_v1` `A*` with `"size":1.0,"size_from":20`) against the pilot that charges version 1's price (S0: the same pilot
with `A*` alone), five classes, the 2,000 `val` seeds of each class, Ascension 0, the relics kept, `veteran`, in **one Act 1 at a time** (a leg: `og` for Overgrowth, `ud` for
Underdocks; 10,000 S1 games a leg). S0 is never played here: it is ADR-054's `A*` batches for `og` (`experiments/batches/`) and the T1 arm `A*` of ADR-064 for `ud`
(`experiments/underdocks/batches/`), **which is not read until ADR-064's three tests and its all-pairs analysis have been pooled** (the preflight and `pool.sh` of the `ud` leg
refuse until those files exist). The check asks only whether the price does gross harm; it cannot show a benefit (the pilot wins about one game in 800) and does not try.

For each leg:

1. `PREFLIGHT_ONLY=1 run-val.sh <leg> 4` : the checks alone: the tree is clean; HEAD is on the remote; what the arms read is that of the registration commit (`REG=<sha>` names another
   when an addendum has moved it on purpose, and the result then says so); the price on the page and in the pilot's port are the same (20, 1.0); the baseline of every class is the batch
   named, finished, audited and **replayed by the code of this commit** (40 games, by `audit sample` into a temporary copy), so that a pair never compares two different games; the
   precondition is committed and passed; no result of the leg exists or is in the history.
2. `run-val.sh <leg> 4` : the five S1 batches into `experiments/skip/batches/`, one run at a time (a lock), from one commit per leg (`artifacts/skip/run-head-<leg>.txt`); each batch is read
   against its own manifest when it ends. `RESUME=1` finishes an interrupted leg from the same commit; after a reset of the machine write the commit the first finished batch was played from
   (its manifest's `environment.slay2.head`) into that file. Run it detached (`setsid nohup`): a foreground command is stopped after two hours.
3. `audit.sh <leg>` : every win re-derived and a 40-game sample of each of the five batches, one after the other (the marker file `artifacts/skip/audit-done-<leg>.txt` lists exit codes only, no count of wins).
4. `pool.sh <leg>` : refuses to run unless the ten batches of the leg (the five S1 and the five baselines) are what ADR-065 says, read again from their own manifests, all audited, the five
   pairs are the arm that charges for a slot first and the baseline second, and nothing of the leg's results exists; then writes each class's comparison and the pooled check
   (`experiments/skip/pooled-slot-<leg>.json`), once. A leg can be pooled without the other.
5. After both legs: `python3 scripts/studies/skip/reading.py --dir experiments/skip --legs og ud --out experiments/skip/reading.json` applies the rule of ADR-065 item 4 to the numbers
   alone (it refuses a pooled file whose sides are not the pairing above) and adds each class on its own and the shares of card rewards each arm skipped.

`precondition.sh`, `precondition_report.py` and `fingerprint.py` produced the development-seed checks and the behaviour figures that the record reports; their outputs are committed.
