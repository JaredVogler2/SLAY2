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

from .batch import read_episodes
from .stats import paired_bootstrap_ci, paired_win_table, wilson_interval

SCHEMA = 1


def _manifest(batch_dir: Path) -> dict:
    return json.loads((Path(batch_dir) / "manifest.json").read_text(encoding="utf-8"))


def _canonical(body: dict) -> str:
    return json.dumps(body, indent=2, sort_keys=True) + "\n"


def _past_act_one(rec) -> bool:
    """Intermediate endpoint while wins are rare: the run got past the Act-1 boss (it ended in a later act, or won)."""
    return rec.outcome == "win" or int(rec.act) >= 1


def _rate(flags: list[bool]) -> dict:
    k, n = sum(flags), len(flags)
    lo, hi = wilson_interval(k, n)
    return {"games": k, "rate": k / n, "wilson95": [lo, hi]}


def build_comparison(a_dir: Path, b_dir: Path, *, iters: int = 20000, seed: int = 0) -> dict:
    """Compare batch ``a`` with batch ``b`` seed by seed. Differences are reported as ``a - b``."""
    a_dir, b_dir = Path(a_dir), Path(b_dir)
    ma, mb = _manifest(a_dir), _manifest(b_dir)
    sa, sb = ma["seeds"], mb["seeds"]
    if sa["file_sha256"] != sb["file_sha256"] or sa["partition"] != sb["partition"]:
        raise ValueError("batches must be played on the same seed manifest and partition to be paired")
    if ma["config"]["character"] != mb["config"]["character"] or ma["config"]["ascension"] != mb["config"]["ascension"]:
        raise ValueError("batches must share the character and ascension")
    if ma["config"]["profile"] != mb["config"]["profile"]:
        raise ValueError("batches must share the player profile (veteran / first_run)")

    a = {r.seed: r for r in read_episodes(a_dir)}
    b = {r.seed: r for r in read_episodes(b_dir)}
    shared = sorted(set(a) & set(b))
    both = [s for s in shared if a[s].completed and b[s].completed]
    if not both:
        raise ValueError("no seed has a completed episode in both batches")

    aw = [a[s].outcome == "win" for s in both]
    bw = [b[s].outcome == "win" for s in both]
    table = paired_win_table(aw, bw)
    a2 = [_past_act_one(a[s]) for s in both]
    b2 = [_past_act_one(b[s]) for s in both]
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
    body["contentSha256"] = hashlib.sha256(_canonical(body).encode("utf-8")).hexdigest()
    return body


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
        f"  mean floor: A={a['meanFloor']:.2f}  B={b['meanFloor']:.2f}",
        f"  floors reached, mean(A-B) = {f['meanAMinusB']:+.2f}  (95% bootstrap CI {f['ci95'][0]:+.2f} .. {f['ci95'][1]:+.2f})",
    ]
    if c["wallTimeRatioBOverA"] is not None:
        lines.append(
            f"  wall time per episode: A={a['meanWallSecondsPerEpisode']:.2f}s  "
            f"B={b['meanWallSecondsPerEpisode']:.2f}s  (B is {c['wallTimeRatioBOverA']:.1f}x A)"
        )
    lines.append(f"  role: {c['role']}")
    return "\n".join(lines)


def write_comparison(c: dict, path: Path) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(_canonical(c), encoding="utf-8")
