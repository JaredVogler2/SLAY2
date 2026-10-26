# Void experiments

Files in this directory are **not evidence**. They are kept so that a reader can see what was done, what went wrong and why a
result that once existed is no longer quoted. Nothing on the website, in `docs/STATUS.md` or in any comparison reads this
directory (the exporter reads `experiments/batches`, `experiments/comparisons`, `experiments/cardvalue` and `experiments/neow`
only), and a number computed from these files must not be repeated anywhere as a result.

An experiment is moved here when its inputs were wrong in a way that cannot be repaired after the fact (a wrong class, a wrong
seed set, a stale value file). The reason is written in a `VOID.md` beside the files, together with how it was found and what
was changed so that it cannot happen again. The experiment, if it still matters, is registered again from the start.

| Directory | What | Why it is void |
|---|---|---|
| [`2026-10-26-wrong-class-ids/`](2026-10-26-wrong-class-ids/VOID.md) | the first opening-relic (Neow) study: 15,000 exploration games, the fitted values, 10,000 held-out games and the pooled test | four of the five classes were played as Ironclad |
