# The opening-relic study (H10b, ADR-049) as commands

These are the commands that produced `experiments/neow/` and the five `rules_v2_neow_values-*` batches, in the order they were
run. The registration (ADR-049) is the authority on what was tested; this directory is only how it was done, so that it can be done
again. Every script runs from any directory, takes its Python from `$PY` (default `python3`; the simulator checkout and its
environment must be in place: `PYTHONPATH=sim python -m slay2_sim doctor`), and writes into `artifacts/h10b/`, which git ignores.

| Step | Script | What it does | Time on four cores |
|---|---|---|---|
| 1 | `explore.sh 3 Ironclad Silent Regent Necrobinder Defect` | 3,000 `train` seeds per class, the relic taken at random among the three offered, **exact class ids** | about 12 minutes per class |
| 2 | `collect.sh` | copies each batch's manifest, episodes and win audit into `experiments/neow/explore-<class>-a0-train-n3000/` | seconds |
| 3 | `fit.sh` | the one fit, by seed: `experiments/neow/neow-values-v2.json`; prints its SHA-256, which is written into ADR-049 and **pushed before step 4** | seconds |
| 4 | `run-val.sh 4` | the five held-out arms, `rules_v2_neow_values` on the 2,000 `val` seeds per class | about 7 minutes per class |
| 5 | `audit-class.sh <class>` | every win re-derived (`audit wins`) and a 40-game sample (`audit sample`) for one class's arm | about 2 minutes |
| 6 | `pool.sh` | the primary test, run once: five pairs against the stored `rules_v2-<class>-a0-veteran-val-n2000` baselines, pooled, exact McNemar | seconds |

Then `scripts/export-site-data-clean.sh` regenerates the site's data from a clean checkout of the commit.

What the scripts cannot do is make the study valid: a batch started with a tracked file modified records `dirty`, a class id that
is not exact is refused by the harness, and the held-out arms must not be started before the values file is on the remote.
