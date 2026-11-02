# Reproducibility

How each published number can be checked from this repository, what is needed to do it, and what cannot be done from the repository
alone. Written 2026-10-26 against the code of `7379420` (the synergy study and the generated table of every batch were added on 2026-10-27) and the supported game build **STS2 main v0.107.1** (Steam build 23811903);
the beta v0.111.0 is not supported. Every statement of a result here points to a committed file with its hash.

## What can and cannot be reproduced

* **The website and its exact calculators** need only Node and pnpm (below). Their golden cases (739, 16 kinds) are checked against an
  independent Python oracle that is in the repository, so nothing outside the repository is needed.
* **Every simulation result** was produced by a third-party simulator that is **not** in the repository: `sts2-rl-agent` at the pinned
  commit, which has no licence and contains decompiled game source, so it is read-only, local and git-ignored here (ADR-011,
  `docs/IP-COMPLIANCE.md`, `external/pins.json`). To repeat a simulation you must fetch it yourself (`scripts/external-fetch.sh`) and
  accept its terms. The batches' manifests, episodes and audits are committed, so the numbers can be **re-computed from the committed
  games without the simulator** (`compare`, `pool`, the fits), but **re-playing the games needs it**.
* **Parity with the live game is unverified** (no owned copy of the game was available): every simulation result carries that label.
* **Trained networks** (`*.pt`) are not committed. Their evaluation files are; the research networks beat nothing, so no result depends
  on them.

## Environment

| Part | Version used | Where it is pinned |
|---|---|---|
| Node.js | 22 (engines `^22.12.0`) | `package.json`, `.node-version` (CI reads it), CI |
| pnpm | 10.28.0 | `package.json` `packageManager`, `pnpm-lock.yaml` (`--frozen-lockfile`) |
| Next.js / React / TypeScript | 16.4.3 / 19 / 6.0.3 | `package.json`, lockfile |
| Python | 3.13.17 here (the harness requires 3.11 or newer) | `sim/pyproject.toml` |
| numpy / gymnasium | 2.5.4 / 1.4.0 (gymnasium is the simulator's dependency, not the harness's) | `sim/pyproject.toml` |
| torch (research networks only) | 2.14.1, CPU | `sim/pyproject.toml` `train` extra |
| External simulator | `sts2-rl-agent` @ `5d874e855ae1d0550d5c30416fadd7dbb0d133b7`, targets v0.107.1 / build 23811903 | `external/pins.json`; `python -m slay2_sim doctor` refuses another commit or a dirty checkout |

`PYTHONPATH=sim python -m slay2_sim doctor` prints these and fails loudly if any is wrong.

## Seeds

`experiments/seeds/ironclad-a0-v2.json`, SHA-256 `e7b0d1d0d94eb9327e5d7db257d753e20021d8f6f35ea5cbaeef211cd43b9e7e`, master seed
20261025: four disjoint partitions, `dev` 10,000, `train` 5,000, `val` 2,000 and `test` 4,000. The rule for using them (ADR-026): `dev`
and `train` for development and fits, `val` for one registered test per question, **`test` sealed and never read** (every manifest
records `sealed_partition_used: false`). The v1 manifest's partitions are a prefix of v2's, so a comparison across the two files is
checked by comparing the partition lists themselves.

## Determinism and what an audit proves

A game is a function of its seed, the configuration and the policy. The harness plays every game in a canonical process state
(ADR-037: the simulator's lazily-cached card lookups would otherwise make the first game of a process differ), isolates a policy's
look-ahead from the live game (ADR-035), and writes a content hash over the records. Four audits, each a command:

| Audit | Command | What it proves | What it does not |
|---|---|---|---|
| Ledger and replay sample | `slay2_sim audit sample --batch <dir> --limit 40` | the ledger holds one record per seed, and a random sample of completed games re-runs to the stored record and replays observation by observation | anything about the games it did not draw |
| Wins | `slay2_sim audit wins --batch <dir>` | every win re-runs to the same record, replays hash for hash, ends in the third act after one boss fight per act | that wins are not rare (they are: about 1 game in 300 at best) |
| Complete re-derivation | `slay2_sim audit rederive --batch <dir>` | every game re-run in fresh workers equals the stored record | that the class asked for is the class played (it reproduces the same wrong class: RT-6-02) |
| Class check | built in since ADR-049; `class_start_verified` in the manifest | each game started with its class's HP and starter deck | the rest of the simulator's fidelity (G1 to G14 in `sim/slay2_sim/gaps.json`) |

The five `rules_v2` held-out baselines were re-derived in full: 9,994 of 10,000 games exactly; the six that differ (five only in the
number of steps) predate the process-state fix and can move at most six pairs of any comparison that uses them.

## Results, the files behind them, and how to check each

| Result | Registration | Files | Check |
|---|---|---|---|
| Card values, five classes (the second opinion, the codex) | ADR-031, ADR-034, ADR-046 | `experiments/cardvalue/*.json` (the list the site shows: `site-sets.json`), `experiments/comparisons/rules_v2-vs-rules_v1-*-val.json` | `python -m slay2_sim.cardvalue --help`; the held-out comparisons recompute with `slay2_sim compare <a> <b>` |
| Tuned pilot `rules_v3` (74.8 % against 65.1 % past the Act-1 boss) | ADR-036, ADR-045 | `experiments/tuning/`, `experiments/batches/rules_v3-*-val-n2000`, `experiments/comparisons/rules_v3-vs-rules_v2-*` | `slay2_sim compare` |
| Search policy `search_v3` (74.3 % against 64.7 %) | ADR-040 | `experiments/batches/search_v3-*`, `experiments/comparisons/search_v3-all-vs-rules_v2-*-val.json` | `slay2_sim compare` |
| G11 (no start-of-act heal) and G13 (Necrobinder at 75 HP) | ADR-039, ADR-049 | `experiments/batches/rules_v2-ironclad-a0-veteran-ancientheal-dev-n500`, `experiments/batches/g13-necrobinder-*-dev-n500`, `experiments/comparisons/g13-gamehp-vs-base-necrobinder-a0-veteran-dev.json` | `slay2_sim compare` |
| G14 (relics gained after the first fight are dropped by the simulator) | ADR-052 | `experiments/batches/g14-<class>-{base,keeprelics}-dev-n500` (10), `experiments/comparisons/g14-keeprelics-vs-base-<class>-a0-veteran-dev.json` (5) | `slay2_sim compare`; `python -m pytest sim/tests/test_keep_relics.py` reproduces the gap on real games |
| **Opening-relic study** (61.05 % against 54.30 % past the Act-1 boss, p = 9.1e-45) | ADR-049 | `experiments/neow/explore-<class>-a0-train-n3000/`, `experiments/neow/neow-values-v2.json` (SHA-256 `b1afa02c47c5bc74df31ed2d8d40ae53dc5b514c34a07e4e5399ed474845877c`), `experiments/batches/rules_v2_neow_values-<class>-a0-veteran-val-n2000/`, `experiments/neow/pooled-neow-values-v2-vs-rules_v2-val.json`, `experiments/neow/per-class/` | below |
| **Synergy study** (33.0 % against 26.0 % past the Act-1 boss, p = 3.8e-60) | ADR-050 and its addenda A to D | `packages/game-data/data/synergy.sts2-main-0.107.1.json` (the tags, SHA-256 `bd0b8a9fd4f96fd974e318c4d1e71efd4dda0e9359f61b73410f24baace7f49a`), `experiments/synergy/b1-calibration.json` and `b1-mechanics.json` (stage B1, exploratory), `experiments/batches/advisor_v1-*-dev-o4000-n1000` (35 development batches) and `experiments/synergy/dev/` (the arms against `d0` and the two selection files, SHA-256 `352cb7a0f273…` and `2235b11af758…`), `experiments/batches/advisor_v1-{astar,d0star}-<class>-a0-veteran-val-n2000` (10) and `experiments/batches/rules_v3-{silent,regent,necrobinder,defect}-a0-veteran-val-n2000` (4, the reference), `experiments/synergy/val/` (the pooled test, the per-class comparisons and the arm profile) | below |
| Combat networks (no improvement) | ADR-026 | `experiments/rl/results/` | evaluation files only; checkpoints are not committed |
| The void first opening-relic study (not evidence) | ADR-049 | `experiments/void/2026-10-26-wrong-class-ids/` | `VOID.md` says why |

### The opening-relic study, command by command

`scripts/studies/h10b/` holds the commands in the order they were run (`README.md` there). Without the simulator, the two outputs
that matter can be re-computed from the committed games, and **both were, on 2026-10-26, and came out byte for byte the committed files**:

```bash
# the one fit, from the five committed exploration batches (writes elsewhere than the frozen file)
PYTHONPATH=sim python -m slay2_sim.neowvalue --batches experiments/neow/explore-{ironclad,silent,regent,necrobinder,defect}-a0-train-n3000 \
  --out /tmp/refit.json --bootstrap 200 --min-taken 30 && sha256sum /tmp/refit.json experiments/neow/neow-values-v2.json   # both b1afa02c47c5…845877c

# the primary test, from the ten committed batches
PYTHONPATH=sim python -m slay2_sim pool $(for c in ironclad silent regent necrobinder defect; do
  echo --pair experiments/batches/rules_v2_neow_values-$c-a0-veteran-val-n2000 experiments/batches/rules_v2-$c-a0-veteran-val-n2000; done) \
  --iters 20000 --out /tmp/repool.json && sha256sum /tmp/repool.json experiments/neow/pooled-neow-values-v2-vs-rules_v2-val.json   # both 56c769bd8594…ddff94
```

Re-playing the 25,000 games takes the simulator and about 1.5 hours on four cores (`explore.sh`, `run-val.sh`).

### The synergy study, command by command

`scripts/studies/synergy/` holds every stage as a command, in the order it was run (`README.md` there). Without the simulator, the
development selection and the held-out test re-compute from the committed games, and **both were, on 2026-10-27, and came out byte
for byte the committed files** (no file under `experiments/` changed, and `A*` printed back as `{"needs":1,"scalers":0.7,"engines":0,"margin":0.0}`):

```bash
# the development selection (phase 1 and 2), from the 35 committed development batches: 46 s, writes experiments/synergy/dev/
PY=python3 bash scripts/studies/synergy/select-dev.sh 1 && PY=python3 bash scripts/studies/synergy/select-dev.sh 2 d1
sha256sum experiments/synergy/dev/selection-phase{1,2}.json                  # 352cb7a0f273…, 2235b11af758…

# the primary test and the secondary pooled comparisons, from the committed held-out batches: 38 s, writes experiments/synergy/val/
MARGIN=0 PY=python3 bash scripts/studies/synergy/pool-val.sh
sha256sum experiments/synergy/val/pooled-astar-vs-d0star.json               # 1401cde3ce48…e65b
```

The ten held-out batches were also re-derived in full on 2026-10-27 (`slay2_sim audit rederive --batch <dir> --workers 3`, about 8 minutes a batch): every one of the 20,000 games reproduced its stored record, and the table of batches below lists the audit.

Re-playing the games takes the simulator: about 90 and 35 minutes on four cores for the two development phases, and about 80
minutes for the held-out arms (`run-dev.sh`, `run-val.sh`, which refuses to start unless `preflight-val.sh` passes). The held-out test
was run once; re-computing it from the committed games changes nothing and is not a second test.

### The Insights page, command by command

The page plays no game; it reads committed files (ADR-059). Its one new analysis needs no simulator. Rebuilt on the machine that wrote it, it comes out byte for byte the committed file; on another machine (another OpenBLAS kernel) every count, id and hash is the same and the fitted numbers differ in their last digits, by up to about 5e-14 relative, so `sim/tests/test_latedrivers.py` requires equality to 1e-9 for those.

```bash
# the exploratory reading of the Act-1 and Act-2 boss fights, from the five committed exploration batches: about 9 s, writes experiments/insights/late-drivers.json
PYTHONPATH=sim python -m slay2_sim.latedrivers --batches experiments/cardvalue/explore4-*-a0-keeprelics-dev-o5000-n5000 --out experiments/insights/late-drivers.json

# the counts of what the game has, from the local pinned copy of the extracted data (git-ignored, ADR-011); --check compares with the committed file
python3 scripts/inventory-game-data.py --check

# the page's data and the other site data; --check fails if the committed files differ from what the inputs give
node scripts/export-site-data.mjs --check
```

### The Act-2 study, command by command

Registered in ADR-060 (part 1, addenda A and B, part 2). Every step below is a script of `scripts/studies/act2/` (frozen from the commit that registers the held-out run, `cc88476`) and refuses to run twice or from the wrong commit. The held-out run is about two hours on four workers; the development stage about two hours; the fit and the audits minutes. The simulator is the pinned local copy (`SLAY2_EXTERNAL_ROOT`, ADR-011).

```bash
export PY=python3 SLAY2_EXTERNAL_ROOT=/path/to/external/checkouts OMP_NUM_THREADS=1
bash scripts/studies/act2/fit.sh                 # the Act-2 fit: ten files in experiments/cardvalue/ (about a minute); commit them
bash scripts/studies/act2/dev.sh 4               # the development stage, 45 batches (resumable; start from a clean worktree of the commit that carries the fit)
bash scripts/studies/act2/select-dev.sh          # the registered rule, once: experiments/act2/dev-selection.json (stops, writing nothing, if an identity check fails)
python3 scripts/studies/act2/part2.py            # the numbers of part 2 of the record; write it, commit it with the batches and the selection, push it
bash scripts/studies/act2/run-val.sh 4           # the held-out run from a clean worktree of the pushed commit (the preflight refuses anything else); RESUME=1 finishes an interrupted run
bash scripts/studies/act2/audit.sh val           # every win re-derived, a 40-game sample of every batch
bash scripts/studies/act2/pool.sh                # the two pooled tests once, the identity, determinism and observed-endpoint records
python3 scripts/verify-pooled.py experiments/act2/pooled-act2-*.json --bootstrap    # an independent recomputation from the episodes (98 checks a file)
node scripts/export-site-data.mjs && python3 scripts/act2-result-numbers.py         # the page's data and the numbers of the result section
```

What a third party can check without the simulator: the committed batches' manifests and compressed episodes (`python3 scripts/verify-pooled.py ... --bootstrap` and `slay2_sim pool` read only those), the hashes quoted in ADR-060 against the ten value files and the selection, and that the registration commit is an ancestor of the commit that holds the result. What needs the simulator: replaying the games, the win audits, and the fit's exploration batches' provenance. The replayed baseline of the held-out run is identical, game for game, to the baseline played at `687db50` for ADR-058 (10,000 of 10,000), which is the determinism record.

### The acts study, command by command

Registered in ADR-061 (one registration, no development stage) and played once: 75,000 games in 5 hours 37 minutes on four workers (3.7 games a second), the audits 32 minutes, the pooling 2 minutes. Every step below is a script of `scripts/studies/acts/` (frozen from the commit that registers the held-out run, `a0c0156`) and refuses to run twice or from the wrong commit.

```bash
export PY=python3 SLAY2_EXTERNAL_ROOT=/path/to/external/checkouts OMP_NUM_THREADS=1
bash scripts/studies/acts/run-val.sh 4           # S, the lead, A1, A2, A3 on the 3,000 val2 seeds of each class, from a clean worktree of the pushed registration commit (the preflight refuses anything else); RESUME=1 finishes an interrupted run
bash scripts/studies/acts/audit.sh val2          # every win re-derived, a 40-game sample of every batch
bash scripts/studies/acts/pool.sh                # the four pooled tests once (--endpoint win), the identity and boss-agreement checks, the all-pairs analysis
python3 scripts/verify-pooled.py experiments/acts/pooled-acts-*.json --bootstrap    # an independent recomputation from the episodes
node scripts/export-site-data.mjs                # the page's data (scripts/lib/acts.mjs reads the files strictly)
python3 scripts/acts-result-numbers.py           # the result section's figures from the exporter's file (--arms: the batch counts from the manifests and audit records)
```

The seed file `experiments/seeds/ironclad-a0-v3.json` is made by `python3 -m slay2_sim seeds --name ironclad-a0-v3 --master 20261025 --sizes train=5000,val=2000,test=4000,dev=10000,val2=3000` (the first four partitions are those of v2, byte for byte; `val2` is appended after `dev` in the same stream). What a third party can check without the simulator is as for the Act-2 study: the committed batches' manifests and compressed episodes, the hashes quoted in ADR-061, and that the registration commit is an ancestor of the commit that holds the result.

## The website's data

`apps/web/src/content/*.generated.json` are generated, never edited: `node scripts/export-site-data.mjs` writes them from the
committed experiments, and **refuses** an exploration batch, audit or comparison that does not belong to the files it names (changed
content hash, wrong class id, a test that is not held-out, a win without its audit). CI runs the exporter on a clean checkout and
fails if the committed files differ (`apps/web/test/content.test.ts`); `scripts/export-site-data-clean.sh` does the same locally in a
temporary worktree of `HEAD`, because a working tree that holds unfinished batches gives different files.

## Every committed batch

Batches carry a content hash over their episodes; `Tree` is the manifest's record of whether tracked files were modified when it was
written (`dirty` batches predate the rule that a batch is started from a clean tree; their results are development results);
`Class check` says whether the per-game class check (ADR-049) existed when the batch was played. All batches from before it used the
exact class ids (every manifest and the final maximum HP of every batch were scanned on 2026-10-26).

The table is written by `python3 scripts/docs-tables.py --write` from the manifests and folders of every batch under
`experiments/batches/`, of the opening-relic exploration (`experiments/neow/explore-*`) and of the card-value exploration
(`experiments/cardvalue/explore*`); the void study is not in it. A test (`sim/tests/test_docs_tables.py`) fails when it is stale.
`Audits` lists the audit files in the batch's folder: `wins` (every win re-derived), `sample` (a 40-game sample re-derived) and
`rederivation` (every game re-derived); the table above says what each proves.

<!-- table:batches:begin -->
| Batch id | Policy | Class | Partition · n | Completed | Wins | Content sha256 | Tree | Audits | Class check |
|---|---|---|---|---|---|---|---|---|---|
| `act2-lead-defect-a0-veteran-keeprelics-val-n2000` | rules_v2 | Defect | val · 2000 | 1940 | 92 | `3c6a2f347882…` | clean | wins,sample | yes |
| `act2-lead-ironclad-a0-veteran-keeprelics-val-n2000` | rules_v2 | Ironclad | val · 2000 | 1932 | 137 | `5a13374e6f63…` | clean | wins,sample | yes |
| `act2-lead-necrobinder-a0-veteran-keeprelics-val-n2000` | rules_v2 | Necrobinder | val · 2000 | 1959 | 0 | `32d7afdc481f…` | clean | sample | yes |
| `act2-lead-regent-a0-veteran-keeprelics-val-n2000` | rules_v2 | Regent | val · 2000 | 1948 | 9 | `2b5d9cc0b38c…` | clean | wins,sample | yes |
| `act2-lead-silent-a0-veteran-keeprelics-val-n2000` | rules_v2 | Silent | val · 2000 | 1985 | 0 | `e3a5c97c39c3…` | clean | sample | yes |
| `act2-p020-defect-a0-veteran-keeprelics-val-n2000` | rules_v2_late | Defect | val · 2000 | 1926 | 81 | `4539e9e2d73e…` | clean | wins,sample | yes |
| `act2-p020-ironclad-a0-veteran-keeprelics-val-n2000` | rules_v2_late | Ironclad | val · 2000 | 1923 | 96 | `225ef9a76a80…` | clean | wins,sample | yes |
| `act2-p020-necrobinder-a0-veteran-keeprelics-val-n2000` | rules_v2_late | Necrobinder | val · 2000 | 1956 | 0 | `3ed03f5cb3a8…` | clean | sample | yes |
| `act2-p020-regent-a0-veteran-keeprelics-val-n2000` | rules_v2_late | Regent | val · 2000 | 1945 | 11 | `a9dbebc6495d…` | clean | wins,sample | yes |
| `act2-p020-silent-a0-veteran-keeprelics-val-n2000` | rules_v2_late | Silent | val · 2000 | 1989 | 0 | `167051d3e711…` | clean | sample | yes |
| `act2-s-defect-a0-veteran-keeprelics-val-n2000` | rules_v2 | Defect | val · 2000 | 1930 | 68 | `a8d8399a64d1…` | clean | wins,sample | yes |
| `act2-s-ironclad-a0-veteran-keeprelics-val-n2000` | rules_v2 | Ironclad | val · 2000 | 1917 | 78 | `5cc6cc714233…` | clean | wins,sample | yes |
| `act2-s-necrobinder-a0-veteran-keeprelics-val-n2000` | rules_v2 | Necrobinder | val · 2000 | 1957 | 0 | `1481dedafe6d…` | clean | sample | yes |
| `act2-s-regent-a0-veteran-keeprelics-val-n2000` | rules_v2 | Regent | val · 2000 | 1945 | 12 | `3090fde6f076…` | clean | wins,sample | yes |
| `act2-s-silent-a0-veteran-keeprelics-val-n2000` | rules_v2 | Silent | val · 2000 | 1989 | 0 | `f1f64a9d8eca…` | clean | sample | yes |
| `act2dev-lead-defect-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2 | Defect | dev · 600 | 577 | 23 | `a025df7ddcab…` | clean | wins | yes |
| `act2dev-lead-ironclad-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2 | Ironclad | dev · 600 | 582 | 47 | `399a6490b675…` | clean | wins | yes |
| `act2dev-lead-necrobinder-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2 | Necrobinder | dev · 600 | 584 | 1 | `efec17eb3ff4…` | clean | wins | yes |
| `act2dev-lead-regent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2 | Regent | dev · 600 | 578 | 3 | `8725ef90234e…` | clean | wins | yes |
| `act2dev-lead-silent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2 | Silent | dev · 600 | 595 | 0 | `3b62c36bb276…` | clean | – | yes |
| `act2dev-p010-defect-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Defect | dev · 600 | 577 | 22 | `4c8f1f3d5d70…` | clean | wins | yes |
| `act2dev-p010-ironclad-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Ironclad | dev · 600 | 575 | 26 | `87eedd78ecc6…` | clean | wins | yes |
| `act2dev-p010-necrobinder-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Necrobinder | dev · 600 | 588 | 0 | `3df605a01afb…` | clean | – | yes |
| `act2dev-p010-regent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Regent | dev · 600 | 577 | 2 | `8963810f74f3…` | clean | wins | yes |
| `act2dev-p010-silent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Silent | dev · 600 | 597 | 0 | `e0bccb51a13a…` | clean | – | yes |
| `act2dev-p020-defect-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Defect | dev · 600 | 577 | 25 | `342c0c1e0bd2…` | clean | wins | yes |
| `act2dev-p020-ironclad-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Ironclad | dev · 600 | 575 | 30 | `4266a8997743…` | clean | wins | yes |
| `act2dev-p020-necrobinder-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Necrobinder | dev · 600 | 589 | 0 | `b85a8ffc7190…` | clean | – | yes |
| `act2dev-p020-regent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Regent | dev · 600 | 576 | 1 | `45b9bf5dd3dc…` | clean | wins | yes |
| `act2dev-p020-silent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Silent | dev · 600 | 596 | 0 | `0972c8cf9480…` | clean | – | yes |
| `act2dev-p035-defect-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Defect | dev · 600 | 578 | 28 | `5b51e2deafe2…` | clean | wins | yes |
| `act2dev-p035-ironclad-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Ironclad | dev · 600 | 576 | 29 | `912f7c774aea…` | clean | wins | yes |
| `act2dev-p035-necrobinder-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Necrobinder | dev · 600 | 590 | 0 | `2922222052f1…` | clean | – | yes |
| `act2dev-p035-regent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Regent | dev · 600 | 577 | 3 | `816e52928e69…` | clean | wins | yes |
| `act2dev-p035-silent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Silent | dev · 600 | 596 | 0 | `7278de051bcc…` | clean | – | yes |
| `act2dev-p050-defect-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Defect | dev · 600 | 580 | 28 | `a1ad45302c64…` | clean | wins | yes |
| `act2dev-p050-ironclad-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Ironclad | dev · 600 | 575 | 27 | `10262e3df5fa…` | clean | wins | yes |
| `act2dev-p050-necrobinder-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Necrobinder | dev · 600 | 588 | 0 | `ba96b7d82cb4…` | clean | – | yes |
| `act2dev-p050-regent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Regent | dev · 600 | 575 | 4 | `9d28fcba1fee…` | clean | wins | yes |
| `act2dev-p050-silent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Silent | dev · 600 | 597 | 0 | `0821be2cfb2f…` | clean | – | yes |
| `act2dev-pall-defect-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Defect | dev · 600 | 577 | 25 | `3e9617ebf633…` | clean | wins | yes |
| `act2dev-pall-ironclad-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Ironclad | dev · 600 | 575 | 20 | `ca5671a476ff…` | clean | wins | yes |
| `act2dev-pall-necrobinder-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Necrobinder | dev · 600 | 589 | 0 | `e50515a35d96…` | clean | – | yes |
| `act2dev-pall-regent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Regent | dev · 600 | 577 | 2 | `0e199081208b…` | clean | wins | yes |
| `act2dev-pall-silent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Silent | dev · 600 | 597 | 0 | `e1204398aad9…` | clean | – | yes |
| `act2dev-pnone-defect-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Defect | dev · 600 | 585 | 16 | `fb21211c18a6…` | clean | wins | yes |
| `act2dev-pnone-ironclad-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Ironclad | dev · 600 | 574 | 24 | `39637849614d…` | clean | wins | yes |
| `act2dev-pnone-necrobinder-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Necrobinder | dev · 600 | 588 | 1 | `46e9dd311d6f…` | clean | wins | yes |
| `act2dev-pnone-regent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Regent | dev · 600 | 575 | 4 | `d33f204c1011…` | clean | wins | yes |
| `act2dev-pnone-silent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Silent | dev · 600 | 597 | 0 | `235a9c6bde58…` | clean | – | yes |
| `act2dev-s-defect-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2 | Defect | dev · 600 | 576 | 25 | `4796c3e8f100…` | clean | wins | yes |
| `act2dev-s-ironclad-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2 | Ironclad | dev · 600 | 573 | 17 | `7e17122b5c59…` | clean | wins | yes |
| `act2dev-s-necrobinder-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2 | Necrobinder | dev · 600 | 589 | 0 | `d9b8ba86cf9f…` | clean | – | yes |
| `act2dev-s-regent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2 | Regent | dev · 600 | 578 | 1 | `4e5ecff245a4…` | clean | wins | yes |
| `act2dev-s-silent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2 | Silent | dev · 600 | 597 | 0 | `aef7711d3019…` | clean | – | yes |
| `act2dev-v-defect-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Defect | dev · 600 | 579 | 19 | `1c440ffdbb2d…` | clean | wins | yes |
| `act2dev-v-ironclad-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Ironclad | dev · 600 | 573 | 22 | `a47f3b64ac67…` | clean | wins | yes |
| `act2dev-v-necrobinder-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Necrobinder | dev · 600 | 589 | 0 | `08e972c80cf8…` | clean | – | yes |
| `act2dev-v-regent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Regent | dev · 600 | 578 | 1 | `c2d33d0feaaf…` | clean | wins | yes |
| `act2dev-v-silent-a0-veteran-keeprelics-dev-o1000-n600` | rules_v2_late | Silent | dev · 600 | 597 | 0 | `d557c64a2b51…` | clean | – | yes |
| `acts-a1-defect-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Defect | val2 · 3000 | 2897 | 115 | `d5e314a688a8…` | clean | wins,sample | yes |
| `acts-a1-ironclad-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Ironclad | val2 · 3000 | 2900 | 172 | `a892d5b1805f…` | clean | wins,sample | yes |
| `acts-a1-necrobinder-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Necrobinder | val2 · 3000 | 2935 | 1 | `746242d231bb…` | clean | wins,sample | yes |
| `acts-a1-regent-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Regent | val2 · 3000 | 2900 | 14 | `445a163bf4c2…` | clean | wins,sample | yes |
| `acts-a1-silent-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Silent | val2 · 3000 | 2983 | 0 | `51d6c0807059…` | clean | sample | yes |
| `acts-a2-defect-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Defect | val2 · 3000 | 2910 | 107 | `42ef9b1be4fa…` | clean | wins,sample | yes |
| `acts-a2-ironclad-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Ironclad | val2 · 3000 | 2868 | 171 | `e8c9ca322570…` | clean | wins,sample | yes |
| `acts-a2-necrobinder-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Necrobinder | val2 · 3000 | 2933 | 1 | `ba80c55dd909…` | clean | wins,sample | yes |
| `acts-a2-regent-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Regent | val2 · 3000 | 2898 | 13 | `87779d0a4c97…` | clean | wins,sample | yes |
| `acts-a2-silent-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Silent | val2 · 3000 | 2979 | 0 | `10bcec7640cd…` | clean | sample | yes |
| `acts-a3-defect-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Defect | val2 · 3000 | 2908 | 108 | `ac2d7e9620ea…` | clean | wins,sample | yes |
| `acts-a3-ironclad-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Ironclad | val2 · 3000 | 2874 | 133 | `3412a50b9f7d…` | clean | wins,sample | yes |
| `acts-a3-necrobinder-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Necrobinder | val2 · 3000 | 2934 | 3 | `cac6aa74d680…` | clean | wins,sample | yes |
| `acts-a3-regent-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Regent | val2 · 3000 | 2894 | 11 | `30cdf87fd921…` | clean | wins,sample | yes |
| `acts-a3-silent-a0-veteran-keeprelics-val2-n3000` | rules_v2_late | Silent | val2 · 3000 | 2977 | 0 | `620020e9ff11…` | clean | sample | yes |
| `acts-lead-defect-a0-veteran-keeprelics-val2-n3000` | rules_v2 | Defect | val2 · 3000 | 2902 | 117 | `0abb34900932…` | clean | wins,sample | yes |
| `acts-lead-ironclad-a0-veteran-keeprelics-val2-n3000` | rules_v2 | Ironclad | val2 · 3000 | 2903 | 230 | `71a5a839343f…` | clean | wins,sample | yes |
| `acts-lead-necrobinder-a0-veteran-keeprelics-val2-n3000` | rules_v2 | Necrobinder | val2 · 3000 | 2933 | 0 | `7fcda966a731…` | clean | sample | yes |
| `acts-lead-regent-a0-veteran-keeprelics-val2-n3000` | rules_v2 | Regent | val2 · 3000 | 2903 | 23 | `c1be9a8c0d8a…` | clean | wins,sample | yes |
| `acts-lead-silent-a0-veteran-keeprelics-val2-n3000` | rules_v2 | Silent | val2 · 3000 | 2983 | 0 | `b18bae38eb4a…` | clean | sample | yes |
| `acts-s-defect-a0-veteran-keeprelics-val2-n3000` | rules_v2 | Defect | val2 · 3000 | 2908 | 97 | `1527952fda5e…` | clean | wins,sample | yes |
| `acts-s-ironclad-a0-veteran-keeprelics-val2-n3000` | rules_v2 | Ironclad | val2 · 3000 | 2875 | 134 | `89a4101ba7f5…` | clean | wins,sample | yes |
| `acts-s-necrobinder-a0-veteran-keeprelics-val2-n3000` | rules_v2 | Necrobinder | val2 · 3000 | 2933 | 3 | `a22a3d6f36c3…` | clean | wins,sample | yes |
| `acts-s-regent-a0-veteran-keeprelics-val2-n3000` | rules_v2 | Regent | val2 · 3000 | 2894 | 12 | `528d15e61587…` | clean | wins,sample | yes |
| `acts-s-silent-a0-veteran-keeprelics-val2-n3000` | rules_v2 | Silent | val2 · 3000 | 2977 | 0 | `25f9c00190a4…` | clean | sample | yes |
| `advisor_v1-astar-defect-a0-veteran-keeprelics-val-n2000` | advisor_v1 | Defect | val · 2000 | 1983 | 0 | `308707bef7f7…` | clean | sample | yes |
| `advisor_v1-astar-defect-a0-veteran-val-n2000` | advisor_v1 | Defect | val · 2000 | 2000 | 0 | `7145541305bc…` | clean | sample,rederivation | yes |
| `advisor_v1-astar-defect-a9-veteran-keeprelics-val-n2000` | advisor_v1 | Defect | val · 2000 | 1999 | 0 | `9dc88b4c0562…` | clean | sample | yes |
| `advisor_v1-astar-ironclad-a0-veteran-keeprelics-val-n2000` | advisor_v1 | Ironclad | val · 2000 | 1959 | 13 | `e57e46b7f4ed…` | clean | wins,sample | yes |
| `advisor_v1-astar-ironclad-a0-veteran-val-n2000` | advisor_v1 | Ironclad | val · 2000 | 1997 | 2 | `57051e5df185…` | clean | wins,sample,rederivation | yes |
| `advisor_v1-astar-ironclad-a9-veteran-keeprelics-val-n2000` | advisor_v1 | Ironclad | val · 2000 | 1989 | 0 | `25f61ac9dafd…` | clean | sample | yes |
| `advisor_v1-astar-necrobinder-a0-veteran-keeprelics-val-n2000` | advisor_v1 | Necrobinder | val · 2000 | 1978 | 0 | `50ffcd6ef4a8…` | clean | sample | yes |
| `advisor_v1-astar-necrobinder-a0-veteran-val-n2000` | advisor_v1 | Necrobinder | val · 2000 | 1997 | 0 | `af9e8efb162c…` | clean | sample,rederivation | yes |
| `advisor_v1-astar-necrobinder-a9-veteran-keeprelics-val-n2000` | advisor_v1 | Necrobinder | val · 2000 | 1999 | 0 | `632fa84c9f17…` | clean | sample | yes |
| `advisor_v1-astar-regent-a0-veteran-keeprelics-val-n2000` | advisor_v1 | Regent | val · 2000 | 1982 | 0 | `653160649e8d…` | clean | sample | yes |
| `advisor_v1-astar-regent-a0-veteran-val-n2000` | advisor_v1 | Regent | val · 2000 | 1990 | 0 | `eb199bc6d2a3…` | clean | sample,rederivation | yes |
| `advisor_v1-astar-regent-a9-veteran-keeprelics-val-n2000` | advisor_v1 | Regent | val · 2000 | 1988 | 0 | `0d0c5b6da473…` | clean | sample | yes |
| `advisor_v1-astar-silent-a0-veteran-keeprelics-val-n2000` | advisor_v1 | Silent | val · 2000 | 1994 | 0 | `95ac0e0bc767…` | clean | sample | yes |
| `advisor_v1-astar-silent-a0-veteran-val-n2000` | advisor_v1 | Silent | val · 2000 | 2000 | 0 | `c46e319bff5a…` | clean | sample,rederivation | yes |
| `advisor_v1-astar-silent-a9-veteran-keeprelics-val-n2000` | advisor_v1 | Silent | val · 2000 | 1998 | 0 | `2b689c0f5fdd…` | clean | sample | yes |
| `advisor_v1-d0-defect-a0-veteran-dev-o4000-n1000` | advisor_v1 | Defect | dev · 1000 | 1000 | 0 | `5f28f56c474d…` | clean | – | yes |
| `advisor_v1-d0-ironclad-a0-veteran-dev-o4000-n1000` | advisor_v1 | Ironclad | dev · 1000 | 999 | 0 | `1e80771827ca…` | clean | – | yes |
| `advisor_v1-d0-necrobinder-a0-veteran-dev-o4000-n1000` | advisor_v1 | Necrobinder | dev · 1000 | 1000 | 0 | `5723808d69b9…` | clean | – | yes |
| `advisor_v1-d0-regent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Regent | dev · 1000 | 998 | 0 | `3a98dbe91d01…` | clean | – | yes |
| `advisor_v1-d0-silent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Silent | dev · 1000 | 1000 | 0 | `165d8631ec0d…` | clean | – | yes |
| `advisor_v1-d0star-defect-a0-veteran-keeprelics-val-n2000` | advisor_v1 | Defect | val · 2000 | 1986 | 0 | `214a9e3ffa05…` | clean | sample | yes |
| `advisor_v1-d0star-defect-a0-veteran-val-n2000` | advisor_v1 | Defect | val · 2000 | 1998 | 0 | `bb1d5364903c…` | clean | sample,rederivation | yes |
| `advisor_v1-d0star-defect-a9-veteran-keeprelics-val-n2000` | advisor_v1 | Defect | val · 2000 | 2000 | 0 | `df0b2702250c…` | clean | sample | yes |
| `advisor_v1-d0star-ironclad-a0-veteran-keeprelics-val-n2000` | advisor_v1 | Ironclad | val · 2000 | 1969 | 12 | `3f435096ba5a…` | clean | wins,sample | yes |
| `advisor_v1-d0star-ironclad-a0-veteran-val-n2000` | advisor_v1 | Ironclad | val · 2000 | 1998 | 0 | `8eba6d4b503c…` | clean | sample,rederivation | yes |
| `advisor_v1-d0star-ironclad-a9-veteran-keeprelics-val-n2000` | advisor_v1 | Ironclad | val · 2000 | 1994 | 2 | `f6b303caf7c1…` | clean | wins,sample | yes |
| `advisor_v1-d0star-necrobinder-a0-veteran-keeprelics-val-n2000` | advisor_v1 | Necrobinder | val · 2000 | 1983 | 1 | `744b02ae27e2…` | clean | wins,sample | yes |
| `advisor_v1-d0star-necrobinder-a0-veteran-val-n2000` | advisor_v1 | Necrobinder | val · 2000 | 1998 | 0 | `9d29eae7897c…` | clean | sample,rederivation | yes |
| `advisor_v1-d0star-necrobinder-a9-veteran-keeprelics-val-n2000` | advisor_v1 | Necrobinder | val · 2000 | 1997 | 0 | `6969fd9e38d5…` | clean | sample | yes |
| `advisor_v1-d0star-regent-a0-veteran-keeprelics-val-n2000` | advisor_v1 | Regent | val · 2000 | 1988 | 0 | `7ee3393139c4…` | clean | sample | yes |
| `advisor_v1-d0star-regent-a0-veteran-val-n2000` | advisor_v1 | Regent | val · 2000 | 1988 | 0 | `a294345df0cf…` | clean | sample,rederivation | yes |
| `advisor_v1-d0star-regent-a9-veteran-keeprelics-val-n2000` | advisor_v1 | Regent | val · 2000 | 1989 | 0 | `270db7f9c707…` | clean | sample | yes |
| `advisor_v1-d0star-silent-a0-veteran-keeprelics-val-n2000` | advisor_v1 | Silent | val · 2000 | 1995 | 0 | `631825f4af5a…` | clean | sample | yes |
| `advisor_v1-d0star-silent-a0-veteran-val-n2000` | advisor_v1 | Silent | val · 2000 | 2000 | 0 | `47a8504bbda1…` | clean | sample,rederivation | yes |
| `advisor_v1-d0star-silent-a9-veteran-keeprelics-val-n2000` | advisor_v1 | Silent | val · 2000 | 1999 | 0 | `397cc8bf6a32…` | clean | sample | yes |
| `advisor_v1-d1-defect-a0-veteran-dev-o4000-n1000` | advisor_v1 | Defect | dev · 1000 | 1000 | 0 | `c8bd5abc57f7…` | clean | – | yes |
| `advisor_v1-d1-ironclad-a0-veteran-dev-o4000-n1000` | advisor_v1 | Ironclad | dev · 1000 | 1000 | 0 | `913967cb9d65…` | clean | – | yes |
| `advisor_v1-d1-necrobinder-a0-veteran-dev-o4000-n1000` | advisor_v1 | Necrobinder | dev · 1000 | 1000 | 0 | `e75a16dc7d69…` | clean | – | yes |
| `advisor_v1-d1-regent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Regent | dev · 1000 | 994 | 0 | `316dc3545c5d…` | clean | – | yes |
| `advisor_v1-d1-silent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Silent | dev · 1000 | 1000 | 0 | `575627368adc…` | clean | – | yes |
| `advisor_v1-d2-defect-a0-veteran-dev-o4000-n1000` | advisor_v1 | Defect | dev · 1000 | 1000 | 0 | `23d4abc982fc…` | clean | – | yes |
| `advisor_v1-d2-ironclad-a0-veteran-dev-o4000-n1000` | advisor_v1 | Ironclad | dev · 1000 | 1000 | 0 | `cefc89ef2433…` | clean | – | yes |
| `advisor_v1-d2-necrobinder-a0-veteran-dev-o4000-n1000` | advisor_v1 | Necrobinder | dev · 1000 | 1000 | 0 | `2018a3a35caf…` | clean | – | yes |
| `advisor_v1-d2-regent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Regent | dev · 1000 | 997 | 0 | `f907859e574d…` | clean | – | yes |
| `advisor_v1-d2-silent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Silent | dev · 1000 | 1000 | 0 | `cab50f3f702e…` | clean | – | yes |
| `advisor_v1-d3-defect-a0-veteran-dev-o4000-n1000` | advisor_v1 | Defect | dev · 1000 | 1000 | 0 | `4175c609d402…` | clean | – | yes |
| `advisor_v1-d3-ironclad-a0-veteran-dev-o4000-n1000` | advisor_v1 | Ironclad | dev · 1000 | 1000 | 0 | `d100fd5f42ba…` | clean | – | yes |
| `advisor_v1-d3-necrobinder-a0-veteran-dev-o4000-n1000` | advisor_v1 | Necrobinder | dev · 1000 | 1000 | 0 | `0ad147d050d2…` | clean | – | yes |
| `advisor_v1-d3-regent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Regent | dev · 1000 | 997 | 0 | `1e8738b91c59…` | clean | – | yes |
| `advisor_v1-d3-silent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Silent | dev · 1000 | 1000 | 0 | `238c6dc184a7…` | clean | – | yes |
| `advisor_v1-d4-defect-a0-veteran-dev-o4000-n1000` | advisor_v1 | Defect | dev · 1000 | 1000 | 0 | `bcbc55e4c56c…` | clean | – | yes |
| `advisor_v1-d4-ironclad-a0-veteran-dev-o4000-n1000` | advisor_v1 | Ironclad | dev · 1000 | 1000 | 0 | `d0f237c1292b…` | clean | – | yes |
| `advisor_v1-d4-necrobinder-a0-veteran-dev-o4000-n1000` | advisor_v1 | Necrobinder | dev · 1000 | 1000 | 0 | `d85ac84b3e6c…` | clean | – | yes |
| `advisor_v1-d4-regent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Regent | dev · 1000 | 998 | 0 | `a8706cfdebb2…` | clean | – | yes |
| `advisor_v1-d4-silent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Silent | dev · 1000 | 1000 | 0 | `3e803f61d067…` | clean | – | yes |
| `advisor_v1-m1-defect-a0-veteran-dev-o4000-n1000` | advisor_v1 | Defect | dev · 1000 | 1000 | 0 | `9cdd4b0cf61d…` | clean | – | yes |
| `advisor_v1-m1-ironclad-a0-veteran-dev-o4000-n1000` | advisor_v1 | Ironclad | dev · 1000 | 1000 | 0 | `f559f006e189…` | clean | – | yes |
| `advisor_v1-m1-necrobinder-a0-veteran-dev-o4000-n1000` | advisor_v1 | Necrobinder | dev · 1000 | 1000 | 0 | `bdea570cf169…` | clean | – | yes |
| `advisor_v1-m1-regent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Regent | dev · 1000 | 994 | 0 | `a58f0b142f00…` | clean | – | yes |
| `advisor_v1-m1-silent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Silent | dev · 1000 | 1000 | 0 | `744d7b2eb54e…` | clean | – | yes |
| `advisor_v1-m2-defect-a0-veteran-dev-o4000-n1000` | advisor_v1 | Defect | dev · 1000 | 1000 | 0 | `d01b205c5e0d…` | clean | – | yes |
| `advisor_v1-m2-ironclad-a0-veteran-dev-o4000-n1000` | advisor_v1 | Ironclad | dev · 1000 | 1000 | 2 | `49f8cf39d1ab…` | clean | wins | yes |
| `advisor_v1-m2-necrobinder-a0-veteran-dev-o4000-n1000` | advisor_v1 | Necrobinder | dev · 1000 | 1000 | 0 | `c0903f12fb93…` | clean | – | yes |
| `advisor_v1-m2-regent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Regent | dev · 1000 | 997 | 0 | `67109e933bab…` | clean | – | yes |
| `advisor_v1-m2-silent-a0-veteran-dev-o4000-n1000` | advisor_v1 | Silent | dev · 1000 | 999 | 0 | `e9c687c6f97f…` | clean | – | yes |
| `explore-defect-a0-train-rep0` | rules_explore | Defect | train · 5000 | 4998 | 0 | `90714d2eacf5…` | dirty | – | predates |
| `explore-ironclad-a0-train-rep0` | rules_explore | Ironclad | train · 5000 | 4995 | 1 | `02655d2f95c3…` | clean | wins | predates |
| `explore-necrobinder-a0-train-rep0` | rules_explore | Necrobinder | train · 5000 | 4999 | 0 | `46f1a3fc302f…` | clean | – | predates |
| `explore-regent-a0-train-rep0` | rules_explore | Regent | train · 5000 | 4967 | 0 | `6da7f793a28c…` | dirty | – | predates |
| `explore-silent-a0-train-rep0` | rules_explore | Silent | train · 5000 | 5000 | 0 | `41a417aab74a…` | dirty | – | predates |
| `explore3-ironclad-a0-dev-o5000-n5000` | rules_explore_v3 | Ironclad | dev · 5000 | 4998 | 4 | `d8e0c898e170…` | dirty | wins | predates |
| `explore4-defect-a0-keeprelics-dev-o5000-n5000` | rules_explore_v3 | Defect | dev · 5000 | 4946 | 25 | `cd8a8780bcc5…` | clean | wins,sample | yes |
| `explore4-ironclad-a0-keeprelics-dev-o5000-n5000` | rules_explore_v3 | Ironclad | dev · 5000 | 4921 | 50 | `183ab8e5994b…` | clean | wins,sample | yes |
| `explore4-necrobinder-a0-keeprelics-dev-o5000-n5000` | rules_explore_v3 | Necrobinder | dev · 5000 | 4932 | 0 | `71a19ccf1ac9…` | clean | sample | yes |
| `explore4-regent-a0-keeprelics-dev-o5000-n5000` | rules_explore_v3 | Regent | dev · 5000 | 4917 | 1 | `31df060a2315…` | clean | wins,sample | yes |
| `explore4-silent-a0-keeprelics-dev-o5000-n5000` | rules_explore_v3 | Silent | dev · 5000 | 4992 | 0 | `2f4d0763173e…` | clean | sample | yes |
| `g13-necrobinder-base-dev-n500` | rules_v2 | Necrobinder | dev · 500 | 500 | 0 | `e229542e3004…` | clean | sample | yes |
| `g13-necrobinder-gamehp-dev-n500` | rules_v2 | Necrobinder | dev · 500 | 499 | 0 | `8949438fffb7…` | clean | sample | yes |
| `g14-defect-base-dev-n500` | rules_v2 | Defect | dev · 500 | 499 | 2 | `9640980bfab7…` | clean | wins,sample | yes |
| `g14-defect-keeprelics-dev-n500` | rules_v2 | Defect | dev · 500 | 488 | 9 | `0b51dde512c1…` | clean | wins,sample | yes |
| `g14-ironclad-base-dev-n500` | rules_v2 | Ironclad | dev · 500 | 499 | 0 | `87754afaf599…` | clean | sample | yes |
| `g14-ironclad-keeprelics-dev-n500` | rules_v2 | Ironclad | dev · 500 | 482 | 25 | `2510774e39bb…` | clean | wins,sample | yes |
| `g14-necrobinder-base-dev-n500` | rules_v2 | Necrobinder | dev · 500 | 500 | 0 | `47892c75935d…` | clean | sample | yes |
| `g14-necrobinder-keeprelics-dev-n500` | rules_v2 | Necrobinder | dev · 500 | 492 | 0 | `7bddd07110d6…` | clean | sample | yes |
| `g14-regent-base-dev-n500` | rules_v2 | Regent | dev · 500 | 492 | 0 | `7f86ddb1ebd2…` | clean | sample | yes |
| `g14-regent-keeprelics-dev-n500` | rules_v2 | Regent | dev · 500 | 486 | 0 | `98014e133ab6…` | clean | sample | yes |
| `g14-silent-base-dev-n500` | rules_v2 | Silent | dev · 500 | 500 | 0 | `7de19dc78a62…` | clean | sample | yes |
| `g14-silent-keeprelics-dev-n500` | rules_v2 | Silent | dev · 500 | 499 | 0 | `eb2eb8416b56…` | clean | sample | yes |
| `ladder-random_legal-ironclad-a0-first_run-train-n100` | random_legal | Ironclad | train · 100 | 100 | 0 | `570dd90b3617…` | dirty | – | predates |
| `ladder-random_legal-ironclad-a0-veteran-train-n100` | random_legal | Ironclad | train · 100 | 100 | 0 | `77b084b95fbf…` | dirty | – | predates |
| `ladder-random_legal-ironclad-a0-veteran-train-n2000` | random_legal | Ironclad | train · 2000 | 1999 | 0 | `3ab5c4052170…` | dirty | – | predates |
| `neow-explore-defect-a0-keeprelics-train-n3000` | rules_v2_neow | Defect | train · 3000 | 2913 | 106 | `ee3e02278d4d…` | clean | wins,sample | yes |
| `neow-explore-defect-a0-train-n3000` | rules_v2_neow | Defect | train · 3000 | 2991 | 18 | `38518f7ff41b…` | clean | wins,sample | yes |
| `neow-explore-ironclad-a0-keeprelics-train-n3000` | rules_v2_neow | Ironclad | train · 3000 | 2879 | 173 | `b68f67487356…` | clean | wins,sample | yes |
| `neow-explore-ironclad-a0-train-n3000` | rules_v2_neow | Ironclad | train · 3000 | 2984 | 13 | `212359e9bd5f…` | clean | wins,sample | yes |
| `neow-explore-necrobinder-a0-keeprelics-train-n3000` | rules_v2_neow | Necrobinder | train · 3000 | 2931 | 0 | `933b49fb8296…` | clean | sample | yes |
| `neow-explore-necrobinder-a0-train-n3000` | rules_v2_neow | Necrobinder | train · 3000 | 2995 | 0 | `71bcd527e5ec…` | clean | sample | yes |
| `neow-explore-regent-a0-keeprelics-train-n3000` | rules_v2_neow | Regent | train · 3000 | 2907 | 10 | `2d1000bac89a…` | clean | wins,sample | yes |
| `neow-explore-regent-a0-train-n3000` | rules_v2_neow | Regent | train · 3000 | 2964 | 0 | `c5d25c54549d…` | clean | sample | yes |
| `neow-explore-silent-a0-keeprelics-train-n3000` | rules_v2_neow | Silent | train · 3000 | 2981 | 0 | `80dc39cb3013…` | clean | sample | yes |
| `neow-explore-silent-a0-train-n3000` | rules_v2_neow | Silent | train · 3000 | 2999 | 0 | `4367f6c6b434…` | clean | sample | yes |
| `r4dev-defect-norelics-keeprelics-dev-o500-n500` | advisor_v1 | Defect | dev · 500 | 495 | 0 | `60fa2da8fc3c…` | clean | sample | yes |
| `r4dev-defect-relics-keeprelics-dev-o500-n500` | advisor_v1 | Defect | dev · 500 | 495 | 0 | `d0cc2525c1eb…` | clean | sample | yes |
| `r4dev-ironclad-norelics-keeprelics-dev-o500-n500` | advisor_v1 | Ironclad | dev · 500 | 497 | 6 | `dc80c23a7c03…` | clean | wins,sample | yes |
| `r4dev-ironclad-relics-keeprelics-dev-o500-n500` | advisor_v1 | Ironclad | dev · 500 | 497 | 5 | `0c50d5ec1979…` | clean | wins,sample | yes |
| `r4dev-necrobinder-norelics-keeprelics-dev-o500-n500` | advisor_v1 | Necrobinder | dev · 500 | 496 | 0 | `4f5ff34af550…` | clean | sample | yes |
| `r4dev-necrobinder-relics-keeprelics-dev-o500-n500` | advisor_v1 | Necrobinder | dev · 500 | 496 | 0 | `4e89a04c0e07…` | clean | sample | yes |
| `r4dev-regent-norelics-keeprelics-dev-o500-n500` | advisor_v1 | Regent | dev · 500 | 490 | 0 | `d3ad86375c0e…` | clean | sample | yes |
| `r4dev-regent-relics-keeprelics-dev-o500-n500` | advisor_v1 | Regent | dev · 500 | 490 | 0 | `911deefeda96…` | clean | sample | yes |
| `r4dev-silent-norelics-keeprelics-dev-o500-n500` | advisor_v1 | Silent | dev · 500 | 500 | 0 | `c8fcc144a1ff…` | clean | sample | yes |
| `r4dev-silent-relics-keeprelics-dev-o500-n500` | advisor_v1 | Silent | dev · 500 | 500 | 0 | `b9945e86a517…` | clean | sample | yes |
| `random_legal-ironclad-a0-veteran-val-n2000` | random_legal | Ironclad | val · 2000 | 2000 | 0 | `6039113dcdc9…` | dirty | sample | predates |
| `rules_v1-defect-a0-veteran-keeprelics-val-n2000` | rules_v1 | Defect | val · 2000 | 1985 | 0 | `88df9c778d32…` | clean | sample | yes |
| `rules_v1-defect-a0-veteran-val-n2000` | rules_v1 | Defect | val · 2000 | 1999 | 0 | `2773566cc727…` | dirty | sample | predates |
| `rules_v1-defect-a9-veteran-keeprelics-val-n2000` | rules_v1 | Defect | val · 2000 | 1999 | 0 | `0648c5789156…` | clean | sample | yes |
| `rules_v1-ironclad-a0-veteran-keeprelics-val-n2000` | rules_v1 | Ironclad | val · 2000 | 1959 | 22 | `f07e411ceee9…` | clean | wins,sample | yes |
| `rules_v1-ironclad-a0-veteran-train-n300` | rules_v1 | Ironclad | train · 300 | 300 | 0 | `f0b6fb7eec8f…` | clean | – | predates |
| `rules_v1-ironclad-a0-veteran-val-n2000` | rules_v1 | Ironclad | val · 2000 | 1997 | 0 | `cb67cffc76eb…` | clean | sample | predates |
| `rules_v1-ironclad-a9-veteran-keeprelics-val-n2000` | rules_v1 | Ironclad | val · 2000 | 1982 | 5 | `172d653d1b0d…` | clean | wins,sample | yes |
| `rules_v1-necrobinder-a0-veteran-keeprelics-val-n2000` | rules_v1 | Necrobinder | val · 2000 | 1972 | 1 | `5b4069a1352c…` | clean | wins,sample | yes |
| `rules_v1-necrobinder-a0-veteran-val-n2000` | rules_v1 | Necrobinder | val · 2000 | 1997 | 0 | `ef7ce115f737…` | dirty | sample | predates |
| `rules_v1-necrobinder-a9-veteran-keeprelics-val-n2000` | rules_v1 | Necrobinder | val · 2000 | 1994 | 0 | `8e448f88545d…` | clean | sample | yes |
| `rules_v1-regent-a0-veteran-keeprelics-val-n2000` | rules_v1 | Regent | val · 2000 | 1981 | 0 | `3ba9aa59c9b3…` | clean | sample | yes |
| `rules_v1-regent-a0-veteran-val-n2000` | rules_v1 | Regent | val · 2000 | 1987 | 0 | `20345eef47cc…` | dirty | sample | predates |
| `rules_v1-regent-a9-veteran-keeprelics-val-n2000` | rules_v1 | Regent | val · 2000 | 1988 | 0 | `26f46493f017…` | clean | sample | yes |
| `rules_v1-silent-a0-veteran-keeprelics-val-n2000` | rules_v1 | Silent | val · 2000 | 1993 | 0 | `2895df0e9120…` | clean | sample | yes |
| `rules_v1-silent-a0-veteran-val-n2000` | rules_v1 | Silent | val · 2000 | 1999 | 0 | `ebf95798bae0…` | clean | sample | predates |
| `rules_v1-silent-a9-veteran-keeprelics-val-n2000` | rules_v1 | Silent | val · 2000 | 1997 | 0 | `d5da350c4616…` | clean | sample | yes |
| `rules_v2-defect-a0-veteran-keeprelics-val-n2000` | rules_v2 | Defect | val · 2000 | 1934 | 62 | `3103c0697cb4…` | clean | wins,sample | yes |
| `rules_v2-defect-a0-veteran-val-n2000` | rules_v2 | Defect | val · 2000 | 1996 | 7 | `b4a6768e1e48…` | clean | wins,sample,rederivation | predates |
| `rules_v2-defect-a9-veteran-keeprelics-val-n2000` | rules_v2 | Defect | val · 2000 | 1986 | 15 | `825d6a0bce7a…` | clean | wins,sample | yes |
| `rules_v2-ironclad-a0-veteran-ancientheal-dev-n500` | rules_v2 | Ironclad | dev · 500 | 499 | 2 | `59e32ae71e40…` | clean | wins,sample | predates |
| `rules_v2-ironclad-a0-veteran-dev-n500` | rules_v2 | Ironclad | dev · 500 | 499 | 0 | `c6d0120c6c59…` | dirty | – | predates |
| `rules_v2-ironclad-a0-veteran-dev-n500-recheck` | rules_v2 | Ironclad | dev · 500 | 499 | 0 | `139ea0a007a8…` | dirty | sample | predates |
| `rules_v2-ironclad-a0-veteran-keeprelics-val-n2000` | rules_v2 | Ironclad | val · 2000 | 1936 | 91 | `ca240165b837…` | clean | wins,sample | yes |
| `rules_v2-ironclad-a0-veteran-val-n2000` | rules_v2 | Ironclad | val · 2000 | 1994 | 6 | `70a62f3df49a…` | dirty | wins,sample,rederivation | predates |
| `rules_v2-ironclad-a9-veteran-keeprelics-val-n2000` | rules_v2 | Ironclad | val · 2000 | 1985 | 12 | `5ecf7562f616…` | clean | wins,sample | yes |
| `rules_v2-necrobinder-a0-veteran-keeprelics-val-n2000` | rules_v2 | Necrobinder | val · 2000 | 1961 | 2 | `211b6b655da2…` | clean | wins,sample | yes |
| `rules_v2-necrobinder-a0-veteran-val-n2000` | rules_v2 | Necrobinder | val · 2000 | 1999 | 0 | `124099adcf74…` | clean | sample,rederivation | predates |
| `rules_v2-necrobinder-a9-veteran-keeprelics-val-n2000` | rules_v2 | Necrobinder | val · 2000 | 1992 | 0 | `27ea1afc94df…` | clean | sample | yes |
| `rules_v2-regent-a0-veteran-keeprelics-val-n2000` | rules_v2 | Regent | val · 2000 | 1956 | 6 | `99d036acead3…` | clean | wins,sample | yes |
| `rules_v2-regent-a0-veteran-val-n2000` | rules_v2 | Regent | val · 2000 | 1987 | 1 | `a20b58d12a9f…` | clean | wins,sample,rederivation | predates |
| `rules_v2-regent-a9-veteran-keeprelics-val-n2000` | rules_v2 | Regent | val · 2000 | 1981 | 1 | `ad9e7345389f…` | clean | wins,sample | yes |
| `rules_v2-shownvals-defect-a0-veteran-keeprelics-val-n2000` | rules_v2 | Defect | val · 2000 | 1930 | 68 | `6cd2aae1a725…` | clean | wins,sample | yes |
| `rules_v2-shownvals-defect-a9-veteran-keeprelics-val-n2000` | rules_v2 | Defect | val · 2000 | 1987 | 18 | `fb0583cb31e6…` | clean | wins,sample | yes |
| `rules_v2-shownvals-ironclad-a0-veteran-keeprelics-val-n2000` | rules_v2 | Ironclad | val · 2000 | 1917 | 78 | `915f7190e03b…` | clean | wins,sample | yes |
| `rules_v2-shownvals-ironclad-a9-veteran-keeprelics-val-n2000` | rules_v2 | Ironclad | val · 2000 | 1980 | 17 | `9093bd22142f…` | clean | wins,sample | yes |
| `rules_v2-shownvals-necrobinder-a0-veteran-keeprelics-val-n2000` | rules_v2 | Necrobinder | val · 2000 | 1957 | 0 | `d45e0ac08126…` | clean | sample | yes |
| `rules_v2-shownvals-necrobinder-a9-veteran-keeprelics-val-n2000` | rules_v2 | Necrobinder | val · 2000 | 1988 | 1 | `7b3c4ad4a609…` | clean | wins,sample | yes |
| `rules_v2-shownvals-regent-a0-veteran-keeprelics-val-n2000` | rules_v2 | Regent | val · 2000 | 1945 | 12 | `c4269866bd82…` | clean | wins,sample | yes |
| `rules_v2-shownvals-regent-a9-veteran-keeprelics-val-n2000` | rules_v2 | Regent | val · 2000 | 1979 | 2 | `c7c7dc6830c6…` | clean | wins,sample | yes |
| `rules_v2-shownvals-silent-a0-veteran-keeprelics-val-n2000` | rules_v2 | Silent | val · 2000 | 1989 | 0 | `9864d195018b…` | clean | sample | yes |
| `rules_v2-shownvals-silent-a9-veteran-keeprelics-val-n2000` | rules_v2 | Silent | val · 2000 | 2000 | 0 | `be14852fa4a1…` | clean | sample | yes |
| `rules_v2-silent-a0-veteran-keeprelics-val-n2000` | rules_v2 | Silent | val · 2000 | 1987 | 0 | `00c20e28af57…` | clean | sample | yes |
| `rules_v2-silent-a0-veteran-val-n2000` | rules_v2 | Silent | val · 2000 | 2000 | 0 | `b9f4863b1792…` | dirty | sample,rederivation | predates |
| `rules_v2-silent-a9-veteran-keeprelics-val-n2000` | rules_v2 | Silent | val · 2000 | 2000 | 0 | `9a88397cc955…` | clean | sample | yes |
| `rules_v2_neow_values-defect-a0-veteran-val-n2000` | rules_v2_neow_values | Defect | val · 2000 | 1990 | 16 | `68376ed1ff32…` | clean | wins,sample | yes |
| `rules_v2_neow_values-ironclad-a0-veteran-val-n2000` | rules_v2_neow_values | Ironclad | val · 2000 | 1984 | 12 | `1723229d909c…` | clean | wins,sample | yes |
| `rules_v2_neow_values-keepvals-defect-a0-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Defect | val · 2000 | 1936 | 65 | `5c03852d460a…` | clean | wins,sample | yes |
| `rules_v2_neow_values-keepvals-defect-a9-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Defect | val · 2000 | 1979 | 19 | `e8d8226dd026…` | clean | wins,sample | yes |
| `rules_v2_neow_values-keepvals-ironclad-a0-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Ironclad | val · 2000 | 1924 | 106 | `a51386cd0d1b…` | clean | wins,sample | yes |
| `rules_v2_neow_values-keepvals-ironclad-a9-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Ironclad | val · 2000 | 1977 | 21 | `d674cf74608b…` | clean | wins,sample | yes |
| `rules_v2_neow_values-keepvals-necrobinder-a0-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Necrobinder | val · 2000 | 1951 | 0 | `93cd151e377b…` | clean | sample | yes |
| `rules_v2_neow_values-keepvals-necrobinder-a9-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Necrobinder | val · 2000 | 1982 | 0 | `286f78196a6d…` | clean | sample | yes |
| `rules_v2_neow_values-keepvals-regent-a0-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Regent | val · 2000 | 1937 | 5 | `987b6b3cdbe6…` | clean | wins,sample | yes |
| `rules_v2_neow_values-keepvals-regent-a9-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Regent | val · 2000 | 1969 | 0 | `a6b7fb17ef0b…` | clean | sample | yes |
| `rules_v2_neow_values-keepvals-silent-a0-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Silent | val · 2000 | 1984 | 0 | `c1f1a7be3476…` | clean | sample | yes |
| `rules_v2_neow_values-keepvals-silent-a9-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Silent | val · 2000 | 2000 | 0 | `754b0352aa78…` | clean | sample | yes |
| `rules_v2_neow_values-necrobinder-a0-veteran-val-n2000` | rules_v2_neow_values | Necrobinder | val · 2000 | 1992 | 0 | `e6686cfac179…` | clean | sample | yes |
| `rules_v2_neow_values-oldvals-defect-a0-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Defect | val · 2000 | 1941 | 61 | `792a9662b18e…` | clean | wins,sample | yes |
| `rules_v2_neow_values-oldvals-ironclad-a0-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Ironclad | val · 2000 | 1930 | 115 | `f2debf21883d…` | clean | wins,sample | yes |
| `rules_v2_neow_values-oldvals-necrobinder-a0-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Necrobinder | val · 2000 | 1956 | 1 | `57dc89b1e00d…` | clean | wins,sample | yes |
| `rules_v2_neow_values-oldvals-regent-a0-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Regent | val · 2000 | 1948 | 6 | `b3ab5798be3f…` | clean | wins,sample | yes |
| `rules_v2_neow_values-oldvals-silent-a0-veteran-keeprelics-val-n2000` | rules_v2_neow_values | Silent | val · 2000 | 1988 | 0 | `78d9a26745d6…` | clean | sample | yes |
| `rules_v2_neow_values-regent-a0-veteran-val-n2000` | rules_v2_neow_values | Regent | val · 2000 | 1976 | 1 | `d7107d820e90…` | clean | wins,sample | yes |
| `rules_v2_neow_values-silent-a0-veteran-val-n2000` | rules_v2_neow_values | Silent | val · 2000 | 2000 | 0 | `f96a3564038c…` | clean | sample | yes |
| `rules_v3-curvals-defect-a0-veteran-keeprelics-val-n2000` | rules_v3 | Defect | val · 2000 | 1945 | 46 | `eca59a07eb88…` | clean | wins,sample | yes |
| `rules_v3-curvals-ironclad-a0-veteran-keeprelics-val-n2000` | rules_v3 | Ironclad | val · 2000 | 1928 | 40 | `a598271c547c…` | clean | wins,sample | yes |
| `rules_v3-curvals-necrobinder-a0-veteran-keeprelics-val-n2000` | rules_v3 | Necrobinder | val · 2000 | 1962 | 1 | `6871bb6a91d6…` | clean | wins,sample | yes |
| `rules_v3-curvals-regent-a0-veteran-keeprelics-val-n2000` | rules_v3 | Regent | val · 2000 | 1964 | 3 | `5ba62231d1c1…` | clean | wins,sample | yes |
| `rules_v3-curvals-silent-a0-veteran-keeprelics-val-n2000` | rules_v3 | Silent | val · 2000 | 1991 | 0 | `84b3d153b037…` | clean | sample | yes |
| `rules_v3-defect-a0-veteran-val-n2000` | rules_v3 | Defect | val · 2000 | 1998 | 10 | `fa969034c3eb…` | clean | wins,sample | yes |
| `rules_v3-ironclad-a0-veteran-val-n2000` | rules_v3 | Ironclad | val · 2000 | 1996 | 6 | `6afa85d50be6…` | clean | wins,sample | predates |
| `rules_v3-keepvals-defect-a0-veteran-keeprelics-val-n2000` | rules_v3 | Defect | val · 2000 | 1935 | 46 | `f8f3ab5120cd…` | clean | wins,sample | yes |
| `rules_v3-keepvals-ironclad-a0-veteran-keeprelics-val-n2000` | rules_v3 | Ironclad | val · 2000 | 1930 | 37 | `0c90943b1e9d…` | clean | wins,sample | yes |
| `rules_v3-keepvals-necrobinder-a0-veteran-keeprelics-val-n2000` | rules_v3 | Necrobinder | val · 2000 | 1962 | 0 | `132c4e7ea50f…` | clean | sample | yes |
| `rules_v3-keepvals-regent-a0-veteran-keeprelics-val-n2000` | rules_v3 | Regent | val · 2000 | 1954 | 6 | `341c9b98b72a…` | clean | wins,sample | yes |
| `rules_v3-keepvals-silent-a0-veteran-keeprelics-val-n2000` | rules_v3 | Silent | val · 2000 | 1990 | 0 | `91e667fc8584…` | clean | sample | yes |
| `rules_v3-necrobinder-a0-veteran-val-n2000` | rules_v3 | Necrobinder | val · 2000 | 1997 | 0 | `9e3aca7a950f…` | clean | sample | yes |
| `rules_v3-regent-a0-veteran-val-n2000` | rules_v3 | Regent | val · 2000 | 1990 | 0 | `e5a38e8ec26b…` | clean | sample | yes |
| `rules_v3-silent-a0-veteran-val-n2000` | rules_v3 | Silent | val · 2000 | 2000 | 0 | `4f36d2eedcb3…` | clean | sample | yes |
| `rules_v3-values2-ironclad-a0-veteran-val-n2000` | rules_v3 | Ironclad | val · 2000 | 1992 | 2 | `92d281e79d7d…` | dirty | wins,sample | predates |
| `search_v1-ironclad-a0-veteran-train-n200` | search_v1 | Ironclad | train · 200 | 200 | 0 | `5edbd6700442…` | dirty | – | predates |
| `search_v3-all-ironclad-a0-veteran-dev-n200` | search_v3 | Ironclad | dev · 200 | 190 | 1 | `9f9eca42fb36…` | dirty | wins,sample | predates |
| `search_v3-all-ironclad-a0-veteran-val-n300` | search_v3 | Ironclad | val · 300 | 300 | 2 | `307658fb33b6…` | clean | wins,sample | predates |
| `search_v3-boss-ironclad-a0-veteran-dev-n500` | search_v3 | Ironclad | dev · 500 | 500 | 0 | `9c6212b8c85c…` | dirty | – | predates |
| `smoke-random_legal-ironclad-a0-veteran-n10` | random_legal | Ironclad | train · 10 | 10 | 0 | `863f8cce3adc…` | dirty | – | predates |
<!-- table:batches:end -->
