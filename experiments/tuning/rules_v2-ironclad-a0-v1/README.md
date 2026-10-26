# Threshold tuning of `rules_v2` (Ironclad, A0, `veteran` profile): the record of the registered procedure

Procedure: ADR-036 in `docs/DECISIONS.md`, fixed before any tuning game. Development seeds only (`dev` partition of
`experiments/seeds/ironclad-a0-v2.json`); `slay2_sim tune` refuses `val` and `test` in code. Base policy: `rules_v2` with
`{"threshold": 0.0, "values": "experiments/cardvalue/ironclad-a0-v1.json"}` (the policy ADR-031 validated).

| Stage | Seeds | Games | What | Files |
|---|---|---|---|---|
| 1 screen | `dev[1000:1500]` | 500 paired per candidate, 39 candidates + base | one threshold changed at a time (`stage1.sh`; the two card-pick thresholds are `stage1-threshold-candidates.json`); a candidate advances if it is higher on "got past the Act-1 boss" with exact McNemar p < 0.10, at most the best eight by paired mean floor | `stage1-summary.json`, then `slay2_sim tune-select --stage screen` -> `stage2-candidates.json` |
| 2 confirm | `dev[2000:3000]` | 1,000 paired per advanced candidate | each against the base, level 0.05 / (number advanced); of several confirmed values of one threshold the larger mean-floor gain is kept | `stage2.sh`, `stage2-summary.json`, then `tune-select --stage confirm` -> `stage3-candidates.json` |
| 3 combine | `dev[3000:4000]` | 1,000 paired | the kept changes at once against the base, level 0.05 | `stage3.sh`, `stage3-summary.json` (when it exists) |
| 4 test | held-out `val` | 2,000 paired | once, registered in ADR-045 before its first game | `experiments/batches/` |

The per-candidate episode files of the development stages are not committed: they are deterministic functions of the seed
manifest and the candidate's parameters (re-run the stage scripts; the stage output directory is the `--out` argument), and
every number the site or the docs quote is in the `*-summary.json` files, which carry each candidate's paired differences,
intervals and p-values and the seeds they used.

These are development results. Nothing here is evidence about held-out play, the live game or other classes.
