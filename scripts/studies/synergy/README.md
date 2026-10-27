# The synergy study (ADR-050) as commands

The registration (ADR-050) is the authority on what was tested and how the configuration `A*` is chosen; this directory is only how it
was done, so that it can be done again. Every script runs from any directory, takes its Python from `$PY` (default `python3`; the
simulator checkout and its environment must be in place: `PYTHONPATH=sim python -m slay2_sim doctor`), and writes logs into
`artifacts/synergy/`, which git ignores. Batches land in `experiments/batches/`.

| Stage | Command | What it does | Time on four cores |
|---|---|---|---|
| B1 | `PYTHONPATH=sim python -m slay2_sim.synergystudy --out experiments/synergy/b1-calibration.json` | the index parts read against 19,717 simulated runs that brought a random deck to the Act-1 boss, and against a model that knows every card; reproduces byte for byte | about 2 minutes |
| B1, per mechanic | `OMP_NUM_THREADS=1 PYTHONPATH=sim python -m slay2_sim.synergymechanics --out experiments/synergy/b1-mechanics.json` | the same runs and model with the unmet-need part split into one column per mechanic (descriptive; it changes no tag); the columns add up to the part B1 reads | about 3 minutes on one thread (with other jobs running, the library's own threads wait on each other and it takes ten times as long) |
| B2-dev, phase 1 | `run-dev.sh 1 4` | `advisor_v1` arms `d0` to `d4` on `dev[4000:5000]`, five classes | about 90 minutes |
| B2-dev, select 1 | `select-dev.sh 1` | `compare-dev.sh d<k> d0` for d1 to d4 (each arm against `d0`, per class and pooled, into `experiments/synergy/dev/`), then the rule of ADR-050 applied by `python -m slay2_sim.synergydev --phase 1` (`selection-phase1.json`); prints the phase-2 command | seconds |
| B2-dev, phase 2 | `CHOSEN="$(python -m slay2_sim.synergydev --fragment d<chosen>)" run-dev.sh 2 4` | the chosen configuration with a skip margin of 1.5 (`m1`) and 3 (`m2`) | about 35 minutes |
| B2-dev, select 2 | `select-dev.sh 2 d<chosen>` | `m1` and `m2` against the chosen arm at margin 0, then the phase-2 rule (`selection-phase2.json`); prints `A*` read back from the two files | seconds |
| B2-val, before | `ASTAR='{...}' MARGIN=<m*> PREFLIGHT_ONLY=1 run-val.sh` | the checks `run-val.sh` makes before its first game (`preflight-val.sh`): a clean checkout of a commit that is on the remote, an addendum D in the decision log that quotes both selection files' hashes, `A*` and the margin equal to what `python -m slay2_sim.synergydev --astar --dir experiments/synergy/dev` reads back from them, the Python port and the page keeping what `A*` keeps, and no val batch of these arms yet (`RESUME=1` finishes an interrupted run: a finished batch is never touched) | seconds |
| B2-val | `ASTAR='{...}' MARGIN=<m*> run-val.sh 3` | after the addendum that records `A*`: `A*`, `d0*` (no synergy term, `A*`'s margin) and, when the margin is not 0, `d0` on the 2,000 `val` seeds of each class, and the reference `rules_v3` with measured values for the four classes without one | about 100 to 130 minutes |
| B2-val, audits | `audit-batches.sh wins experiments/batches/advisor_v1-*-val-n2000 experiments/batches/rules_v3-*-val-n2000`, then `audit-batches.sh sample` on the same | every win re-derived (`audit wins`: the exporter refuses a batch with wins that were not) and a 40-game sample audit of each new arm (the exporter requires one for the two primary arms); the same `wins` command is needed for any dev batch with wins before it is committed | a few minutes |
| B2-val, test | `MARGIN=<m*> pool-val.sh` | the primary test, run once: `A*` against `d0*`, five classes pooled, exact McNemar; and the secondary pooled comparisons | seconds |
| B2-val, profile | `profile-val.sh` | how often `A*` and `d0*` skipped a card reward and the parts of the index their boss decks held (`slay2_sim.synergyreport`), `A*` against `d0*` paired by class and seed | seconds |

Phase 1 of B2-dev was started on 2026-10-26 at 22:08 UTC from commit `91c8a87d4f46` (table `ed6c6952`); the independent re-tagging of the table (ADR-050 addenda A and B) then met its rule, that start was stopped after 19 of 25 batches and its batches were deleted unread, and phase 1 started again at 23:15 UTC from commit `dcdb66eaa6b2` (table `bd0b8a9f`), in a worktree of that commit (a clean tree; the manifests record `dirty: false`).

A batch started with a tracked file modified records `dirty`; start the runs from a clean checkout of the registered commit (a `git
worktree` of it, with `SLAY2_EXTERNAL_ROOT` pointing at the main checkout's `external/checkouts`, keeps the working tree free for other
work while they run).
