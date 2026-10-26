"""Paired tuning of a rules policy's thresholds on development seeds.

``DEFAULT_TUNE`` (policies/rules.py) lists every threshold the hand-written rules use. This tool plays the same development
seeds with the baseline and with each candidate (one batch per candidate, resumable like any batch), then reports, for every
candidate against the baseline and on the seeds both completed:

* the change in mean floor reached, with a paired bootstrap interval;
* the share of games that got past the Act-1 boss and past the Act-2 boss, with exact McNemar p-values;
* wins (rare, so only counted).

Only ``dev`` (or ``train``) seeds are accepted: choosing a threshold on held-out seeds would turn them into development seeds.
The winner is then confirmed on seeds the search never saw (``val``), once, against the baseline.

The selection between stages is the rule fixed in ADR-036, written as code so that nobody applies it by hand: :func:`screen`
(stage 1 -> 2), :func:`confirm` (stage 2 -> 3) and :func:`combined_candidate` (the one configuration stage 3 plays), driven by
``slay2_sim tune-select``.

    python -m slay2_sim tune --policy rules_v2 --base '{"threshold":0.0}' --one-at-a-time "heal_below=0.5,0.6,0.8" \\
        --n 500 --out scratch/tune/heal
"""

from __future__ import annotations

import json
from pathlib import Path

from .batch import read_episodes, run_batch
from .manifest import load_seed_manifest, partition_seeds, save_json, sha256_file
from .outcomes import COMPLETED, Outcome
from .runner import RunConfig
from .stats import paired_bootstrap_ci, paired_win_table

DEVELOPMENT = ("dev", "train")


def expand_one_at_a_time(spec: str) -> list[dict]:
    """``"heal_below=0.5,0.6;elite_value=1,3"`` -> one candidate per value: {"name": "heal_below=0.5", "tune": {...}}."""
    out = []
    for group in filter(None, (g.strip() for g in spec.split(";"))):
        key, _, values = group.partition("=")
        for raw in filter(None, (v.strip() for v in values.split(","))):
            value = json.loads(raw)
            out.append({"name": f"{key.strip()}={raw}", "tune": {key.strip(): value}})
    return out


def merge_params(base: dict, candidate: dict) -> dict:
    """The candidate's ``tune`` overrides are merged over the base's own ``tune``; other keys replace the base's."""
    params = {k: v for k, v in base.items() if k != "tune"}
    params.update({k: v for k, v in candidate.items() if k not in ("name", "tune", "params")})
    params.update(candidate.get("params", {}))
    tune = {**base.get("tune", {}), **candidate.get("tune", {})}
    if tune:
        params["tune"] = tune
    return params


def _past(rec, act_index: int) -> bool:
    """The run got past the boss of act ``act_index`` (it ended in a later act, or won)."""
    return rec.outcome == Outcome.WIN.value or int(rec.act) > act_index


def compare_records(base, cand, *, iters: int = 5000, seed: int = 0) -> dict:
    shared = sorted(set(base) & set(cand))
    both = [s for s in shared if Outcome(base[s].outcome) in COMPLETED and Outcome(cand[s].outcome) in COMPLETED]
    if len(both) < 2:
        raise ValueError("fewer than two seeds completed by both sides")
    fb = [float(base[s].floor) for s in both]
    fc = [float(cand[s].floor) for s in both]
    diff, lo, hi = paired_bootstrap_ci(fc, fb, iters=iters, seed=seed)
    out = {"paired": len(both), "excluded": len(shared) - len(both), "meanFloor": sum(fc) / len(fc), "meanFloorBase": sum(fb) / len(fb),
           "floorDiff": diff, "floorDiffCi95": [lo, hi]}
    for label, act in (("pastAct1Boss", 0), ("pastAct2Boss", 1)):
        a = [_past(cand[s], act) for s in both]
        b = [_past(base[s], act) for s in both]
        t = paired_win_table(a, b)
        out[label] = {"rate": sum(a) / len(a), "rateBase": sum(b) / len(b), "onlyCandidate": t["a_only"], "onlyBase": t["b_only"], "mcnemarP": t["mcnemar_p"]}
    out["wins"] = sum(cand[s].outcome == Outcome.WIN.value for s in both)
    out["winsBase"] = sum(base[s].outcome == Outcome.WIN.value for s in both)
    return out


# ADR-036: the levels and sizes are fixed before any candidate is played.
SCREEN_LEVEL = 0.10        # stage 1: exact McNemar p below this, and a higher share past the Act-1 boss than the base's
SCREEN_LIMIT = 8           # stage 1: at most this many candidates advance, best paired mean floor first
CONFIRM_FAMILY_ALPHA = 0.05  # stage 2: divided by the number of candidates that advanced (Bonferroni)
COMBINE_ALPHA = 0.05       # stage 3: the combination against the base


def parameter_of(name: str) -> str:
    """``"heal_below=0.5"`` -> ``"heal_below"`` (candidate names are ``key=value``)."""
    return name.partition("=")[0]


def higher_than_base(row: dict, level: float) -> bool:
    """The primary endpoint: a higher share of games past the Act-1 boss than the base's, exact McNemar p < ``level``."""
    a1 = row["pastAct1Boss"]
    return a1["rate"] > a1["rateBase"] and a1["mcnemarP"] < level


def screen(rows: list[dict], *, level: float = SCREEN_LEVEL, limit: int = SCREEN_LIMIT) -> list[dict]:
    """ADR-036 stage 1: the candidates that advance to confirmation (generous on purpose; this stage is not evidence)."""
    passing = [r for r in rows if higher_than_base(r, level)]
    return sorted(passing, key=lambda r: (-r["floorDiff"], r["name"]))[:limit]


def confirm(rows: list[dict], *, family_alpha: float = CONFIRM_FAMILY_ALPHA) -> dict:
    """ADR-036 stage 2: ``rows`` are the advanced candidates replayed on fresh seeds.

    Each is held to ``family_alpha / len(rows)``. Of several confirmed values of one threshold the one with the larger mean-floor
    gain is kept. Returns the level used, every confirmed name and the kept rows."""
    if not rows:
        return {"alpha": family_alpha, "confirmed": [], "kept": []}
    alpha = family_alpha / len(rows)
    confirmed = [r for r in rows if higher_than_base(r, alpha)]
    best: dict[str, dict] = {}
    for r in confirmed:
        key = parameter_of(r["name"])
        if key not in best or (r["floorDiff"], r["name"]) > (best[key]["floorDiff"], best[key]["name"]):
            best[key] = r
    return {"alpha": alpha, "confirmed": [r["name"] for r in confirmed], "kept": [best[k] for k in sorted(best)]}


def candidate_spec(base: dict, row: dict) -> dict:
    """The candidate a summary row came from: its own overrides (what differs from ``base``), usable as ``--candidates`` input."""
    base_tune = base.get("tune", {})
    spec: dict = {"name": row["name"]}
    tune = {k: v for k, v in row["params"].get("tune", {}).items() if base_tune.get(k) != v}
    params = {k: v for k, v in row["params"].items() if k != "tune" and base.get(k) != v}
    if tune:
        spec["tune"] = tune
    if params:
        spec["params"] = params
    return spec


def combined_candidate(base: dict, kept: list[dict], name: str = "combined") -> dict:
    """One candidate holding every kept change at once (stage 3)."""
    tune: dict = {}
    params: dict = {}
    for row in kept:
        spec = candidate_spec(base, row)
        tune.update(spec.get("tune", {}))
        params.update(spec.get("params", {}))
    out: dict = {"name": name}
    if tune:
        out["tune"] = tune
    if params:
        out["params"] = params
    return out


def run_candidates(*, policy: str, base_params: dict, candidates: list[dict], seeds_file: Path, partition: str, offset: int, n: int,
                   workers: int, out_dir: Path, sim, cfg: RunConfig | None = None) -> dict:
    if partition not in DEVELOPMENT:
        raise PermissionError(f"tuning is allowed on {DEVELOPMENT} seeds only, not {partition!r}: held-out seeds must stay held out")
    cfg = cfg or RunConfig()
    manifest = load_seed_manifest(seeds_file)
    seeds = partition_seeds(manifest, partition)[offset:offset + n]
    info = {"file": str(seeds_file), "manifest_sha256": manifest["sha256"], "file_sha256": sha256_file(seeds_file),
            "partition": partition, "n": len(seeds), "offset": offset, "sealed_partition_used": False}

    def play(name: str, params: dict) -> dict[int, object]:
        d = out_dir / name.replace("/", "_").replace(" ", "")
        run_batch(out_dir=d, batch_id=f"tune-{policy}-{name}", cfg=cfg, policy_name=policy, policy_params=params, seeds=seeds,
                  workers=workers, trace_first=0, sim=sim, seed_info=info)
        return {r.seed: r for r in read_episodes(d)}

    base = play("baseline", base_params)
    rows = []
    for cand in candidates:
        params = merge_params(base_params, cand)
        rows.append({"name": cand["name"], "params": params, **compare_records(base, play(cand["name"], params))})
    summary = {"schema": 1, "policy": policy, "base": base_params, "seeds": info, "baselineMeanFloor": rows[0]["meanFloorBase"] if rows else None,
               "candidates": rows}
    out_dir.mkdir(parents=True, exist_ok=True)
    save_json(out_dir / "summary.json", summary)
    return summary


def render(summary: dict) -> str:
    lines = [f"tuning {summary['policy']} on {summary['seeds']['partition']}[{summary['seeds']['offset']}:+{summary['seeds']['n']}] "
             f"(baseline mean floor {summary['baselineMeanFloor']:.2f})",
             f"{'candidate':34s} {'paired':>6s} {'dFloor':>7s} {'95% CI':>16s} {'act1 boss':>10s} {'p':>9s} {'act2 boss':>10s} {'p':>9s} {'wins':>5s}"]
    for r in sorted(summary["candidates"], key=lambda r: -r["floorDiff"]):
        a1, a2 = r["pastAct1Boss"], r["pastAct2Boss"]
        lines.append(f"{r['name']:34s} {r['paired']:6d} {r['floorDiff']:+7.2f} [{r['floorDiffCi95'][0]:+6.2f},{r['floorDiffCi95'][1]:+6.2f}] "
                     f"{a1['rate'] - a1['rateBase']:+10.1%} {a1['mcnemarP']:9.2g} {a2['rate'] - a2['rateBase']:+10.1%} {a2['mcnemarP']:9.2g} {r['wins']:5d}")
    return "\n".join(lines)
