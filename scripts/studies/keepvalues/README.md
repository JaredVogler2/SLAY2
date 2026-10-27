# Card values with the relics kept (ADR-053)

Run from a clean checkout of the commit that carries ADR-053, with `SLAY2_EXTERNAL_ROOT` pointing at the fetched simulator and `PY` at the
interpreter that has numpy (the scripts set `PYTHONPATH=sim`). Each script is resumable: a batch with a manifest is never touched.

1. `explore.sh 4` : 5 x 5,000 exploration games (`rules_explore_v3`, the relics kept, `dev[5000:10000]`), batches `experiments/cardvalue/explore4-<class>-a0-keeprelics-dev-o5000-n5000`.
2. `audit.sh explore` : every win re-derived, a 40-game sample of every batch.
3. `fit.sh` : the one fit per class (`experiments/cardvalue/<class>-a0-keep-v1.json`) and the descriptive comparison with the current values; prints the SHA-256 of each file. **Write them into ADR-053 and push before step 4.**
4. `run-val.sh 4` : `rules_v3` with the new and with the current values, the relics kept, the 2,000 `val` seeds of each class (it runs `preflight-val.sh` first and refuses to start unless the hashes are in the decision log on the remote).
5. `audit.sh val`, then `pool.sh` : each class on its own, then the one pooled test.
