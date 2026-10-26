# Reproducibility

How each published number can be checked from this repository, what is needed to do it, and what cannot be done from the repository
alone. Written 2026-10-26 against the code of `7379420` and the supported game build **STS2 main v0.107.1** (Steam build 23811903);
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
| Class check | built in since ADR-049; `class_start_verified` in the manifest | each game started with its class's HP and starter deck | the rest of the simulator's fidelity (G1 to G13 in `sim/slay2_sim/gaps.json`) |

The five `rules_v2` held-out baselines were re-derived in full: 9,994 of 10,000 games exactly; the six that differ (five only in the
number of steps) predate the process-state fix and can move at most six pairs of any comparison that uses them.

## Results, the files behind them, and how to check each

| Result | Registration | Files | Check |
|---|---|---|---|
| Card values, five classes (the second opinion, the codex) | ADR-031, ADR-034, ADR-046 | `experiments/cardvalue/*.json` (the list the site shows: `site-sets.json`), `experiments/comparisons/rules_v2-vs-rules_v1-*-val.json` | `python -m slay2_sim.cardvalue --help`; the held-out comparisons recompute with `slay2_sim compare <a> <b>` |
| Tuned pilot `rules_v3` (74.8 % against 65.1 % past the Act-1 boss) | ADR-036, ADR-045 | `experiments/tuning/`, `experiments/batches/rules_v3-*-val-n2000`, `experiments/comparisons/rules_v3-vs-rules_v2-*` | `slay2_sim compare` |
| Search policy `search_v3` (74.3 % against 64.7 %) | ADR-040 | `experiments/batches/search_v3-*`, `experiments/comparisons/search_v3-all-vs-rules_v2-*-val.json` | `slay2_sim compare` |
| G11 (no start-of-act heal) and G13 (Necrobinder at 75 HP) | ADR-039, ADR-049 | `experiments/batches/rules_v2-ironclad-a0-veteran-ancientheal-dev-n500`, `experiments/batches/g13-necrobinder-*-dev-n500`, `experiments/comparisons/g13-gamehp-vs-base-necrobinder-a0-veteran-dev.json` | `slay2_sim compare` |
| **Opening-relic study** (61.05 % against 54.30 % past the Act-1 boss, p = 9.1e-45) | ADR-049 | `experiments/neow/explore-<class>-a0-train-n3000/`, `experiments/neow/neow-values-v2.json` (SHA-256 `b1afa02c47c5bc74df31ed2d8d40ae53dc5b514c34a07e4e5399ed474845877c`), `experiments/batches/rules_v2_neow_values-<class>-a0-veteran-val-n2000/`, `experiments/neow/pooled-neow-values-v2-vs-rules_v2-val.json`, `experiments/neow/per-class/` | below |
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

| Batch id | Policy | Class | Partition · n | Completed | Wins | Content sha256 | Tree | Audits | Class check |
|---|---|---|---|---|---|---|---|---|---|
| `g13-necrobinder-base-dev-n500` | rules_v2 | Necrobinder | dev · 500 | 500 | 0 | `e229542e3004…` | clean | sample | yes |
| `g13-necrobinder-gamehp-dev-n500` | rules_v2 | Necrobinder | dev · 500 | 499 | 0 | `8949438fffb7…` | clean | sample | yes |
| `ladder-random_legal-ironclad-a0-first_run-train-n100` | random_legal | Ironclad | train · 100 | 100 | 0 | `570dd90b3617…` | dirty | – | predates |
| `ladder-random_legal-ironclad-a0-veteran-train-n100` | random_legal | Ironclad | train · 100 | 100 | 0 | `77b084b95fbf…` | dirty | – | predates |
| `ladder-random_legal-ironclad-a0-veteran-train-n2000` | random_legal | Ironclad | train · 2000 | 1999 | 0 | `3ab5c4052170…` | dirty | – | predates |
| `random_legal-ironclad-a0-veteran-val-n2000` | random_legal | Ironclad | val · 2000 | 2000 | 0 | `6039113dcdc9…` | dirty | sample | predates |
| `rules_v1-defect-a0-veteran-val-n2000` | rules_v1 | Defect | val · 2000 | 1999 | 0 | `2773566cc727…` | dirty | sample | predates |
| `rules_v1-ironclad-a0-veteran-train-n300` | rules_v1 | Ironclad | train · 300 | 300 | 0 | `f0b6fb7eec8f…` | clean | – | predates |
| `rules_v1-ironclad-a0-veteran-val-n2000` | rules_v1 | Ironclad | val · 2000 | 1997 | 0 | `cb67cffc76eb…` | clean | sample | predates |
| `rules_v1-necrobinder-a0-veteran-val-n2000` | rules_v1 | Necrobinder | val · 2000 | 1997 | 0 | `ef7ce115f737…` | dirty | sample | predates |
| `rules_v1-regent-a0-veteran-val-n2000` | rules_v1 | Regent | val · 2000 | 1987 | 0 | `20345eef47cc…` | dirty | sample | predates |
| `rules_v1-silent-a0-veteran-val-n2000` | rules_v1 | Silent | val · 2000 | 1999 | 0 | `ebf95798bae0…` | clean | sample | predates |
| `rules_v2-defect-a0-veteran-val-n2000` | rules_v2 | Defect | val · 2000 | 1996 | 7 | `b4a6768e1e48…` | clean | wins,sample,rederivation | predates |
| `rules_v2-ironclad-a0-veteran-ancientheal-dev-n500` | rules_v2 | Ironclad | dev · 500 | 499 | 2 | `59e32ae71e40…` | clean | wins,sample | predates |
| `rules_v2-ironclad-a0-veteran-dev-n500-recheck` | rules_v2 | Ironclad | dev · 500 | 499 | 0 | `139ea0a007a8…` | dirty | sample | predates |
| `rules_v2-ironclad-a0-veteran-dev-n500` | rules_v2 | Ironclad | dev · 500 | 499 | 0 | `c6d0120c6c59…` | dirty | – | predates |
| `rules_v2-ironclad-a0-veteran-val-n2000` | rules_v2 | Ironclad | val · 2000 | 1994 | 6 | `70a62f3df49a…` | dirty | wins,sample,rederivation | predates |
| `rules_v2-necrobinder-a0-veteran-val-n2000` | rules_v2 | Necrobinder | val · 2000 | 1999 | 0 | `124099adcf74…` | clean | sample,rederivation | predates |
| `rules_v2-regent-a0-veteran-val-n2000` | rules_v2 | Regent | val · 2000 | 1987 | 1 | `a20b58d12a9f…` | clean | wins,sample,rederivation | predates |
| `rules_v2-silent-a0-veteran-val-n2000` | rules_v2 | Silent | val · 2000 | 2000 | 0 | `b9f4863b1792…` | dirty | sample,rederivation | predates |
| `rules_v2_neow_values-defect-a0-veteran-val-n2000` | rules_v2_neow_values | Defect | val · 2000 | 1990 | 16 | `68376ed1ff32…` | clean | wins,sample | yes |
| `rules_v2_neow_values-ironclad-a0-veteran-val-n2000` | rules_v2_neow_values | Ironclad | val · 2000 | 1984 | 12 | `1723229d909c…` | clean | wins,sample | yes |
| `rules_v2_neow_values-necrobinder-a0-veteran-val-n2000` | rules_v2_neow_values | Necrobinder | val · 2000 | 1992 | 0 | `e6686cfac179…` | clean | sample | yes |
| `rules_v2_neow_values-regent-a0-veteran-val-n2000` | rules_v2_neow_values | Regent | val · 2000 | 1976 | 1 | `d7107d820e90…` | clean | wins,sample | yes |
| `rules_v2_neow_values-silent-a0-veteran-val-n2000` | rules_v2_neow_values | Silent | val · 2000 | 2000 | 0 | `f96a3564038c…` | clean | sample | yes |
| `rules_v3-ironclad-a0-veteran-val-n2000` | rules_v3 | Ironclad | val · 2000 | 1996 | 6 | `6afa85d50be6…` | clean | wins,sample | predates |
| `rules_v3-values2-ironclad-a0-veteran-val-n2000` | rules_v3 | Ironclad | val · 2000 | 1992 | 2 | `92d281e79d7d…` | dirty | wins,sample | predates |
| `search_v1-ironclad-a0-veteran-train-n200` | search_v1 | Ironclad | train · 200 | 200 | 0 | `5edbd6700442…` | dirty | – | predates |
| `search_v3-all-ironclad-a0-veteran-dev-n200` | search_v3 | Ironclad | dev · 200 | 190 | 1 | `9f9eca42fb36…` | dirty | wins,sample | predates |
| `search_v3-all-ironclad-a0-veteran-val-n300` | search_v3 | Ironclad | val · 300 | 300 | 2 | `307658fb33b6…` | clean | wins,sample | predates |
| `search_v3-boss-ironclad-a0-veteran-dev-n500` | search_v3 | Ironclad | dev · 500 | 500 | 0 | `9c6212b8c85c…` | dirty | – | predates |
| `smoke-random_legal-ironclad-a0-veteran-n10` | random_legal | Ironclad | train · 10 | 10 | 0 | `863f8cce3adc…` | dirty | – | predates |
| `neow-explore-defect-a0-train-n3000` | rules_v2_neow | Defect | train · 3000 | 2991 | 18 | `38518f7ff41b…` | clean | wins,sample | yes |
| `neow-explore-ironclad-a0-train-n3000` | rules_v2_neow | Ironclad | train · 3000 | 2984 | 13 | `212359e9bd5f…` | clean | wins,sample | yes |
| `neow-explore-necrobinder-a0-train-n3000` | rules_v2_neow | Necrobinder | train · 3000 | 2995 | 0 | `71bcd527e5ec…` | clean | sample | yes |
| `neow-explore-regent-a0-train-n3000` | rules_v2_neow | Regent | train · 3000 | 2964 | 0 | `c5d25c54549d…` | clean | sample | yes |
| `neow-explore-silent-a0-train-n3000` | rules_v2_neow | Silent | train · 3000 | 2999 | 0 | `4367f6c6b434…` | clean | sample | yes |
