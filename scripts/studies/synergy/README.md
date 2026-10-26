# The synergy study (ADR-050) as commands

The registration (ADR-050) is the authority on what was tested and how the configuration `A*` is chosen; this directory is only how it
was done, so that it can be done again. Every script runs from any directory, takes its Python from `$PY` (default `python3`; the
simulator checkout and its environment must be in place: `PYTHONPATH=sim python -m slay2_sim doctor`), and writes logs into
`artifacts/synergy/`, which git ignores. Batches land in `experiments/batches/`.

| Stage | Command | What it does | Time on four cores |
|---|---|---|---|
| B1 | `PYTHONPATH=sim python -m slay2_sim.synergystudy --out experiments/synergy/b1-calibration.json` | the index parts read against 19,717 simulated runs that brought a random deck to the Act-1 boss; reproduces byte for byte | about 2 minutes |
| B2-dev, phase 1 | `run-dev.sh 1 4` | `advisor_v1` arms `d0` to `d4` on `dev[4000:5000]`, five classes | about 90 minutes |
| B2-dev, compare | `compare-dev.sh d1 d0` (and `d2`, `d3`, `d4`) | each arm against `d0`, per class and pooled (`experiments/synergy/dev/`) | seconds |
| B2-dev, phase 2 | `CHOSEN='"needs":0.65,"scalers":0.75,"engines":0' run-dev.sh 2 4`, then `compare-dev.sh m1 d<chosen>` | the chosen configuration with a skip margin of 1.5 and 3 | about 35 minutes |

A batch started with a tracked file modified records `dirty`; start the runs from a clean checkout of the registered commit (a `git
worktree` of it, with `SLAY2_EXTERNAL_ROOT` pointing at the main checkout's `external/checkouts`, keeps the working tree free for other
work while they run).
