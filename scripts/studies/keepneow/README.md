# The opening-relic study repeated with the relics kept (ADR-055)

Run from a clean checkout of the commit that carries ADR-055, with `SLAY2_EXTERNAL_ROOT` pointing at the fetched simulator and `PY` at the
interpreter that has numpy (the scripts set `PYTHONPATH=sim`). Each script is resumable: a batch with a manifest is never touched.

1. `explore.sh 4` : 5 x 3,000 exploration games (`rules_v2_neow`, the relic taken at random among the three offered, the relics kept, the first 3,000 `train` seeds), batches `neow-explore-<class>-a0-keeprelics-train-n3000` in `experiments/neow/explore-<class>-a0-keeprelics-train-n3000`.
2. `audit.sh explore` : every win re-derived, a 40-game sample of every batch.
3. `fit.sh` : the one fit (`experiments/neow/neow-values-keep-v1.json`) and the descriptive comparison with the values of ADR-049; prints the SHA-256 of the new file. **Write it into ADR-055 and push before step 4.**
4. `run-val.sh 4` : the held-out arms: the new values and the baseline `rules_v2` for every class (the primary test), then the values of ADR-049 (the secondary arm); it runs `preflight-val.sh` first and refuses to start unless the hash is in the decision log on the remote.
5. `audit.sh val`, then `pool.sh` : each class on its own, then the pooled tests.
