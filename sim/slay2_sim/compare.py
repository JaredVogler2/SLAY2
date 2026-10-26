"""Paired comparison of two evidence batches that were played on the same seeds.

The result is a first-class, committed artifact (``experiments/comparisons/<a>-vs-<b>.json``). The website reads it
instead of hand-typed prose, and the site exporter refuses a comparison whose batches changed after it was written
(``a.contentSha256`` / ``b.contentSha256`` must match the current batch manifests).

Only seeds where *both* episodes reached a true terminal state (win or death) enter the paired statistics; the rest
are counted and reported, never silently dropped or scored as losses.
"""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

from . import external
from .batch import read_episodes
from .manifest import load_seed_manifest, partition_seeds, sha256_file
from .stats import paired_bootstrap_ci, paired_win_table, wilson_interval

SCHEMA = 1


def _manifest(batch_dir: Path) -> dict:
    return json.loads((Path(batch_dir) / "manifest.json").read_text(encoding="utf-8"))


def _canonical(body: dict) -> str:
    return json.dumps(body, indent=2, sort_keys=True) + "\n"


def _partition_list(info: dict) -> list[int] | None:
    """The whole seed list of the partition a batch drew from, read from the committed seed manifest the batch names, and
    only if that file still has the hash the batch recorded. None when that cannot be shown: a file that is missing or has
    changed, or the sealed ``test`` partition (which is never read here)."""
    try:
        path = external.REPO_ROOT / info["file"]
        if sha256_file(path) != info["file_sha256"]:
            return None
        return partition_seeds(load_seed_manifest(path), info["partition"])
    except (KeyError, OSError, ValueError, PermissionError):
        return None


def _same_seeds(sa: dict, sb: dict) -> bool:
    """Both batches were played on the same seeds. The same seed manifest (its hash) and partition say so. A later version of
    a manifest that appends a partition and keeps the others (``ironclad-a0-v2`` keeps v1's ``train``, ``val`` and ``test``
    exactly) has a different file hash, so for two different files the partition's whole seed list must be identical in
    both: then any batch drawn from it, whatever its length or offset, drew the same seeds."""
    if sa["partition"] != sb["partition"]:
        return False
    if sa["file_sha256"] == sb["file_sha256"]:
        return True
    xa, xb = _partition_list(sa), _partition_list(sb)
    return bool(xa) and xa == xb


def _past_act_one(rec) -> bool:
    """Intermediate endpoint while wins are rare: the run got past the Act-1 boss (it ended in a later act, or won)."""
    return rec.outcome == "win" or int(rec.act) >= 1


def _past_act_two(rec) -> bool:
    """The run got past the Act-2 boss (it ended in the third act, or won)."""
    return rec.outcome == "win" or int(rec.act) >= 2


def _rate(flags: list[bool]) -> dict:
    k, n = sum(flags), len(flags)
    lo, hi = wilson_interval(k, n)
    return {"games": k, "rate": k / n, "wilson95": [lo, hi]}


def _sensitivity_by_act(a: dict, b: dict, shared: list[int]) -> dict:
    """Post hoc, labelled as such: the primary comparison drops every pair in which an episode did not reach a win or a death.
    Here a wall-clock timeout counts too, by the act it had reached (act index 1 or more means the Act-1 boss was behind
    it); an episode with any other non-completed outcome (a simulator or harness error carries no information about play)
    still drops the pair."""
    counted = ("win", "death", "timeout")
    pairs = [s for s in shared if a[s].outcome in counted and b[s].outcome in counted]
    fa = [_past_act_one(a[s]) for s in pairs]
    fb = [_past_act_one(b[s]) for s in pairs]
    return {
        "label": "post hoc sensitivity analysis, not the registered endpoint: timeouts counted by the act they reached",
        "pairs": len(pairs),
        "droppedPairs": len(shared) - len(pairs),
        "timeouts": {"a": sum(1 for s in pairs if a[s].outcome == "timeout"), "b": sum(1 for s in pairs if b[s].outcome == "timeout")},
        "a": _rate(fa),
        "b": _rate(fb),
        "pairedTable": paired_win_table(fa, fb),
    }


def _load_pair(a_dir: Path, b_dir: Path) -> tuple[dict, dict, dict, dict, list[int], list[int]]:
    """Both manifests, both batches' episodes by seed, the shared seeds and those with both episodes completed. Refuses
    batches that were not played on the same seeds, class, ascension and profile."""
    a_dir, b_dir = Path(a_dir), Path(b_dir)
    ma, mb = _manifest(a_dir), _manifest(b_dir)
    if not _same_seeds(ma["seeds"], mb["seeds"]):
        raise ValueError("batches must be played on the same seed manifest and partition to be paired")
    # older manifests wrote the class capitalised ("Ironclad"), newer ones lower case ("ironclad"): the same class
    if str(ma["config"]["character"]).lower() != str(mb["config"]["character"]).lower() or ma["config"]["ascension"] != mb["config"]["ascension"]:
        raise ValueError("batches must share the character and ascension")
    if ma["config"]["profile"] != mb["config"]["profile"]:
        raise ValueError("batches must share the player profile (veteran / first_run)")
    a = {r.seed: r for r in read_episodes(a_dir)}
    b = {r.seed: r for r in read_episodes(b_dir)}
    shared = sorted(set(a) & set(b))
    both = [s for s in shared if a[s].completed and b[s].completed]
    if not both:
        raise ValueError("no seed has a completed episode in both batches")
    return ma, mb, a, b, shared, both


def build_comparison(a_dir: Path, b_dir: Path, *, iters: int = 20000, seed: int = 0, sensitivity: bool = False) -> dict:
    """Compare batch ``a`` with batch ``b`` seed by seed. Differences are reported as ``a - b``."""
    ma, mb, a, b, shared, both = _load_pair(a_dir, b_dir)
    sa, sb = ma["seeds"], mb["seeds"]

    aw = [a[s].outcome == "win" for s in both]
    bw = [b[s].outcome == "win" for s in both]
    table = paired_win_table(aw, bw)
    a2 = [_past_act_one(a[s]) for s in both]
    b2 = [_past_act_one(b[s]) for s in both]
    a3 = [_past_act_two(a[s]) for s in both]
    b3 = [_past_act_two(b[s]) for s in both]
    fa = [float(a[s].floor) for s in both]
    fb = [float(b[s].floor) for s in both]
    mean_diff, lo, hi = paired_bootstrap_ci(fa, fb, iters=iters, seed=seed)
    wall_a = sum(a[s].wall_seconds for s in both) / len(both)
    wall_b = sum(b[s].wall_seconds for s in both) / len(both)

    def side(manifest: dict, wins: list[bool], floors: list[float], wall: float) -> dict:
        k, n = sum(wins), len(wins)
        w_lo, w_hi = wilson_interval(k, n)
        return {
            "batchId": manifest["batch_id"],
            "policy": manifest["policy"]["name"],
            "params": manifest["policy"]["params"],
            "contentSha256": manifest["content_sha256"],
            "wins": k,
            "winRate": k / n,
            "winRateWilson95": [w_lo, w_hi],
            "meanFloor": sum(floors) / len(floors),
            "meanWallSecondsPerEpisode": round(wall, 4),
        }

    body = {
        "schema": SCHEMA,
        "kind": "paired-comparison",
        "difference": "a minus b",
        "a": side(ma, aw, fa, wall_a),
        "b": side(mb, bw, fb, wall_b),
        "cohort": {
            "character": ma["config"]["character"],
            "ascension": ma["config"]["ascension"],
            "profile": ma["config"]["profile"],
            "partition": sa["partition"],
            "seedManifestSha256": sa["file_sha256"],
            **(
                {
                    "seedManifestSha256B": sb["file_sha256"],
                    "sameSeedsBy": "the seed lists of the partition in the two manifests (verified against the recorded hashes)",
                }
                if sb["file_sha256"] != sa["file_sha256"]
                else {}
            ),
        },
        "pairedSeeds": len(shared),
        "bothCompleted": len(both),
        "excludedNotCompleted": len(shared) - len(both),
        "pairedWinTable": table,
        "reachedAct2": {
            "definition": "the run got past the Act-1 boss (it ended in Act 2 or later, or won)",
            "a": _rate(a2),
            "b": _rate(b2),
            "pairedTable": paired_win_table(a2, b2),
        },
        "reachedAct3": {
            "definition": "the run got past the Act-2 boss (it ended in Act 3, or won)",
            "a": _rate(a3),
            "b": _rate(b3),
            "pairedTable": paired_win_table(a3, b3),
        },
        "floorDifference": {
            "meanAMinusB": mean_diff,
            "ci95": [lo, hi],
            "method": f"paired percentile bootstrap over seeds, {iters} resamples, rng seed {seed}",
        },
        "wallTimeRatioBOverA": round(wall_b / wall_a, 3) if wall_a > 0 else None,
        "role": (
            f"development ({sa['partition']} partition): not a held-out result"
            if sa["partition"] in ("train", "dev")
            else "held-out"
        ),
        "simulator": {
            "id": ma["simulator"]["id"],
            "sha": ma["simulator"]["pinned"],
            "parityWithLiveGame": ma["simulator"]["parity_with_live_game"],
        },
    }
    if sensitivity:
        body["sensitivityByActReached"] = _sensitivity_by_act(a, b, shared)
    body["contentSha256"] = hashlib.sha256(_canonical(body).encode("utf-8")).hexdigest()
    return body


def build_pooled_comparison(pairs: list[tuple[Path, Path]], *, iters: int = 20000, seed: int = 0) -> dict:
    """The paired comparisons of several cohorts that differ in the class only (ADR-041), pooled into one test: the
    discordant pairs of every cohort are added and the exact McNemar test runs once on the total. Each member keeps its own
    counts so that a reader can see which class carries the result. Seeds are paired within a member, never across."""
    if len(pairs) < 2:
        raise ValueError("a pooled comparison needs at least two cohorts")
    members, flags = [], {k: ([], []) for k in ("win", "act1", "act2")}
    floors_a: list[float] = []
    floors_b: list[float] = []
    cohort_keys, policies, partitions = set(), set(), set()
    total_pairs = 0
    for a_dir, b_dir in pairs:
        ma, mb, a, b, shared, both = _load_pair(a_dir, b_dir)
        cohort_keys.add((ma["config"]["ascension"], ma["config"]["profile"]))
        policies.add((ma["policy"]["name"], mb["policy"]["name"]))
        partitions.add(ma["seeds"]["partition"])
        total_pairs += len(shared)
        mine = {
            "win": ([a[s].outcome == "win" for s in both], [b[s].outcome == "win" for s in both]),
            "act1": ([_past_act_one(a[s]) for s in both], [_past_act_one(b[s]) for s in both]),
            "act2": ([_past_act_two(a[s]) for s in both], [_past_act_two(b[s]) for s in both]),
        }
        for k, (x, y) in mine.items():
            flags[k][0].extend(x)
            flags[k][1].extend(y)
        fa, fb = [float(a[s].floor) for s in both], [float(b[s].floor) for s in both]
        floors_a.extend(fa)
        floors_b.extend(fb)
        t1 = paired_win_table(*mine["act1"])
        members.append({
            "character": ma["config"]["character"],
            "a": {"batchId": ma["batch_id"], "contentSha256": ma["content_sha256"], "wins": sum(mine["win"][0])},
            "b": {"batchId": mb["batch_id"], "contentSha256": mb["content_sha256"], "wins": sum(mine["win"][1])},
            "pairedSeeds": len(shared),
            "bothCompleted": len(both),
            "reachedAct2": {"a": sum(mine["act1"][0]) / len(both), "b": sum(mine["act1"][1]) / len(both), "pairedTable": t1},
            "meanFloorDifference": (sum(fa) - sum(fb)) / len(both),
        })
    if len(cohort_keys) != 1 or len(policies) != 1 or len(partitions) != 1:
        raise ValueError("pooled cohorts must share the ascension, profile, partition and the two policies")
    ascension, profile = next(iter(cohort_keys))
    partition = next(iter(partitions))
    n = len(floors_a)
    mean_diff, lo, hi = paired_bootstrap_ci(floors_a, floors_b, iters=iters, seed=seed)
    body = {
        "schema": SCHEMA,
        "kind": "pooled-paired-comparison",
        "difference": "a minus b",
        "policies": {"a": next(iter(policies))[0], "b": next(iter(policies))[1]},
        "cohort": {"ascension": ascension, "profile": profile, "partition": partition, "characters": [m["character"] for m in members]},
        "members": members,
        "pairedSeeds": total_pairs,
        "bothCompleted": n,
        "excludedNotCompleted": total_pairs - n,
        "wins": {"a": sum(flags["win"][0]), "b": sum(flags["win"][1]), "pairedTable": paired_win_table(*flags["win"])},
        "reachedAct2": {
            "definition": "the run got past the Act-1 boss (it ended in Act 2 or later, or won)",
            "a": _rate(flags["act1"][0]),
            "b": _rate(flags["act1"][1]),
            "pairedTable": paired_win_table(*flags["act1"]),
        },
        "reachedAct3": {
            "definition": "the run got past the Act-2 boss (it ended in Act 3, or won)",
            "a": _rate(flags["act2"][0]),
            "b": _rate(flags["act2"][1]),
            "pairedTable": paired_win_table(*flags["act2"]),
        },
        "floorDifference": {
            "meanAMinusB": mean_diff,
            "ci95": [lo, hi],
            "method": f"paired percentile bootstrap over all pooled pairs, {iters} resamples, rng seed {seed}",
        },
        "role": (
            f"development ({partition} partition): not a held-out result" if partition in ("train", "dev") else "held-out"
        ),
    }
    body["contentSha256"] = hashlib.sha256(_canonical(body).encode("utf-8")).hexdigest()
    return body


def render_pooled_text(c: dict) -> str:
    r1, r2, w, f = c["reachedAct2"], c["reachedAct3"], c["wins"], c["floorDifference"]
    t1 = r1["pairedTable"]
    lines = [
        f"POOLED A = {c['policies']['a']}  B = {c['policies']['b']}  over {', '.join(c['cohort']['characters'])}  "
        f"(A{c['cohort']['ascension']}, {c['cohort']['profile']}, {c['cohort']['partition']})",
        f"paired seeds={c['pairedSeeds']}  both completed={c['bothCompleted']}  (excluded: {c['excludedNotCompleted']})",
        f"  past the Act-1 boss: A={r1['a']['rate']:.1%}  B={r1['b']['rate']:.1%}  "
        f"(A-only={t1['a_only']} B-only={t1['b_only']}, McNemar exact p={t1['mcnemar_p']:.4g})",
        f"  past the Act-2 boss: A={r2['a']['rate']:.1%}  B={r2['b']['rate']:.1%}  "
        f"(A-only={r2['pairedTable']['a_only']} B-only={r2['pairedTable']['b_only']}, McNemar exact p={r2['pairedTable']['mcnemar_p']:.4g})",
        f"  wins: A={w['a']}  B={w['b']}  (A-only={w['pairedTable']['a_only']} B-only={w['pairedTable']['b_only']}, McNemar exact p={w['pairedTable']['mcnemar_p']:.4g})",
        f"  floors, mean(A-B) = {f['meanAMinusB']:+.2f}  (95% bootstrap CI {f['ci95'][0]:+.2f} .. {f['ci95'][1]:+.2f})",
    ]
    for m in c["members"]:
        t = m["reachedAct2"]["pairedTable"]
        lines.append(
            f"    {m['character']:12s} {m['bothCompleted']:5d} pairs  past the Act-1 boss A={m['reachedAct2']['a']:.1%} B={m['reachedAct2']['b']:.1%} "
            f"(A-only={t['a_only']} B-only={t['b_only']})  wins {m['a']['wins']}/{m['b']['wins']}  floors {m['meanFloorDifference']:+.2f}"
        )
    lines.append(f"  role: {c['role']}")
    return "\n".join(lines)


def render_text(c: dict) -> str:
    """Human summary printed by the CLI."""
    a, b, f, t = c["a"], c["b"], c["floorDifference"], c["pairedWinTable"]
    lines = [
        f"A = {a['batchId']}",
        f"B = {b['batchId']}",
        f"paired seeds={c['pairedSeeds']}  both completed={c['bothCompleted']}  "
        f"(excluded: {c['excludedNotCompleted']} with a non-completed episode)",
        f"  A win rate: {a['wins']}/{c['bothCompleted']} = {a['winRate']:.2%}  "
        f"(95% Wilson CI {a['winRateWilson95'][0]:.2%} - {a['winRateWilson95'][1]:.2%})",
        f"  B win rate: {b['wins']}/{c['bothCompleted']} = {b['winRate']:.2%}  "
        f"(95% Wilson CI {b['winRateWilson95'][0]:.2%} - {b['winRateWilson95'][1]:.2%})",
        f"  paired table: both={t['both']} A-only={t['a_only']} B-only={t['b_only']} neither={t['neither']}  "
        f"McNemar exact p={t['mcnemar_p']:.4g}",
        f"  past the Act-1 boss: A={c['reachedAct2']['a']['rate']:.1%}  B={c['reachedAct2']['b']['rate']:.1%}  "
        f"(paired: A-only={c['reachedAct2']['pairedTable']['a_only']} B-only={c['reachedAct2']['pairedTable']['b_only']}, "
        f"McNemar exact p={c['reachedAct2']['pairedTable']['mcnemar_p']:.4g})",
        *(
            [
                f"  past the Act-2 boss: A={c['reachedAct3']['a']['rate']:.1%}  B={c['reachedAct3']['b']['rate']:.1%}  "
                f"(paired: A-only={c['reachedAct3']['pairedTable']['a_only']} B-only={c['reachedAct3']['pairedTable']['b_only']}, "
                f"McNemar exact p={c['reachedAct3']['pairedTable']['mcnemar_p']:.4g})"
            ]
            if "reachedAct3" in c
            else []
        ),
        f"  mean floor: A={a['meanFloor']:.2f}  B={b['meanFloor']:.2f}",
        f"  floors reached, mean(A-B) = {f['meanAMinusB']:+.2f}  (95% bootstrap CI {f['ci95'][0]:+.2f} .. {f['ci95'][1]:+.2f})",
    ]
    if c["wallTimeRatioBOverA"] is not None:
        lines.append(
            f"  wall time per episode: A={a['meanWallSecondsPerEpisode']:.2f}s  "
            f"B={b['meanWallSecondsPerEpisode']:.2f}s  (B is {c['wallTimeRatioBOverA']:.1f}x A)"
        )
    if "sensitivityByActReached" in c:
        x = c["sensitivityByActReached"]
        t = x["pairedTable"]
        lines.append(
            f"  [post hoc] timeouts counted by the act reached ({x['pairs']} pairs, {x['timeouts']['a']} / {x['timeouts']['b']} timeouts): "
            f"past the Act-1 boss A={x['a']['rate']:.1%} B={x['b']['rate']:.1%} "
            f"(A-only={t['a_only']} B-only={t['b_only']}, McNemar exact p={t['mcnemar_p']:.4g})"
        )
    lines.append(f"  role: {c['role']}")
    return "\n".join(lines)


def write_comparison(c: dict, path: Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_canonical(c), encoding="utf-8")
