# The synergy test repeated with the relics kept (ADR-054)

Run from a clean checkout of the commit that carries ADR-054, with `SLAY2_EXTERNAL_ROOT` pointing at the fetched simulator and `PY` at the
interpreter that has numpy. Resumable: a batch with a manifest is never touched.

1. `run-val.sh 4` : A* and d0* with the relics kept on the 2,000 `val` seeds of each class (it runs `preflight-val.sh` first).
2. `audit.sh` : every win re-derived, a 40-game sample of every batch.
3. `pool.sh` : each class on its own, then the one pooled test.
