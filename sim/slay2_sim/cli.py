"""Command line: ``python -m slay2_sim <doctor|seeds|smoke|run|audit|compare|oracle|catalog>``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import external
from .batch import read_episodes, run_batch
from .manifest import (
    DEFAULT_SIZES, load_seed_manifest, make_seed_manifest, partition_seeds, save_json, sha256_file,
)
from .outcomes import Outcome, summarize
from .policies import REGISTRY
from .runner import RunConfig, replay_from_trace
from .stats import mcnemar_exact, paired_bootstrap_ci, paired_win_table, wilson_interval

EXPERIMENTS = external.REPO_ROOT / "experiments"
DEFAULT_SEEDS = EXPERIMENTS / "seeds" / "ironclad-a0-v1.json"


def _fmt_ci(k: int, n: int) -> str:
    if n == 0:
        return "n/a (no completed games)"
    lo, hi = wilson_interval(k, n)
    return f"{k}/{n} = {k / n:.2%}  (95% Wilson CI {lo:.2%} - {hi:.2%})"


def print_summary(manifest: dict) -> None:
    s = manifest["summary"]
    c = s["counts"]
    print(f"\n== {manifest['batch_id']} ==")
    print(f"policy={manifest['policy']['name']} character={manifest['config']['character']} ascension={manifest['config']['ascension']} profile={manifest['config']['profile']}")
    print(f"episodes={s['episodes']}  completed={s['completed']}  " + "  ".join(f"{k}={v}" for k, v in c.items()))
    print("win rate of completed games:", _fmt_ci(c["win"], s["completed"]))
    print(f"simulator parity with live game: {manifest['simulator']['parity_with_live_game']}  (pin_ok={manifest['simulator']['pin_ok']})")
    for g in manifest.get("known_simulator_gaps", []):
        if g["affects"] == "results":
            print(f"  known gap {g['id']}: {g['summary']}")
    print(f"wall={manifest['wall_seconds_this_invocation']}s  episodes.jsonl sha256={manifest['episodes_file']['sha256'][:16]}...")


# ---------------------------------------------------------------- commands
def cmd_doctor(args) -> int:
    ok = True

    def check(name: str, good: bool, detail: str = "") -> None:
        nonlocal ok
        ok &= good
        print(f"[{'ok' if good else 'FAIL'}] {name}{(': ' + detail) if detail else ''}")

    print(f"python {sys.version.split()[0]}")
    for mod in ("numpy", "gymnasium"):
        try:
            m = __import__(mod)
            check(f"import {mod}", True, getattr(m, "__version__", ""))
        except Exception as e:  # noqa: BLE001
            check(f"import {mod}", False, repr(e))
    try:
        sim = external.locate()
        check("external simulator pinned+clean", True, f"{sim.id} @ {sim.head[:12]}")
    except external.ExternalError as e:
        check("external simulator pinned+clean", False, str(e))
        return 1
    external.activate(sim.root)
    try:
        from sts2_env.run.run_manager import RunManager

        m = RunManager(seed=1, character_id="Ironclad", ascension_level=0, start_with_neow=True)
        check("RunManager boots (start_with_neow=True)", m.phase in {"EVENT", "MAP_CHOICE"}, m.phase)
        acts = m.get_available_actions()
        m.take_action(acts[0])
        check("one legal action executes", True)
    except Exception as e:  # noqa: BLE001
        check("RunManager boots", False, repr(e))
    games = (sim.root / "GAME_VERSIONS.md").read_text(encoding="utf-8") if (sim.root / "GAME_VERSIONS.md").exists() else ""
    check("simulator targets v0.107.1 / build 23811903", "v0.107.1" in games and "23811903" in games)
    print("parity with the live game: UNVERIFIED (no owned game in this environment)")
    return 0 if ok else 1


def cmd_seeds(args) -> int:
    sizes = dict(DEFAULT_SIZES)
    if args.sizes:
        sizes = {kv.split("=")[0]: int(kv.split("=")[1]) for kv in args.sizes.split(",")}
    manifest = make_seed_manifest(args.name, args.master, sizes)
    out = Path(args.out) if args.out else EXPERIMENTS / "seeds" / f"{args.name}.json"
    save_json(out, manifest)
    print(f"wrote {out}  sha256={manifest['sha256'][:16]}...  sizes={manifest['sizes']}")
    return 0


def _resolve_seeds(args) -> tuple[list[int], dict]:
    path = Path(args.seeds)
    manifest = load_seed_manifest(path)
    seeds = partition_seeds(manifest, args.partition, allow_sealed=args.allow_sealed, limit=args.n)
    info = {
        "file": str(path.relative_to(external.REPO_ROOT)) if path.is_absolute() and external.REPO_ROOT in path.parents else str(path),
        "manifest_sha256": manifest["sha256"], "file_sha256": sha256_file(path),
        "partition": args.partition, "n": len(seeds), "sealed_partition_used": args.partition == "test",
    }
    return seeds, info


def _batch_common(args, *, default_trace: int) -> int:
    sim = external.locate()
    external.activate(sim.root)
    seeds, seed_info = _resolve_seeds(args)
    cfg = RunConfig(character=args.character, ascension=args.ascension, profile=args.profile, max_steps=args.max_steps, wall_seconds=args.wall_seconds)
    params = json.loads(args.policy_params) if args.policy_params else {}
    batch_id = args.batch_id or f"{args.policy}-{args.character.lower()}-a{args.ascension}-{args.profile}-{args.partition}-n{len(seeds)}"
    out_dir = Path(args.out) if args.out else EXPERIMENTS / "batches" / batch_id
    trace_first = default_trace if args.trace is None else args.trace
    manifest = run_batch(
        out_dir=out_dir, batch_id=batch_id, cfg=cfg, policy_name=args.policy, policy_params=params, seeds=seeds,
        workers=args.workers, trace_first=trace_first, sim=sim, seed_info=seed_info,
    )
    print_summary(manifest)
    return 0 if manifest["summary"]["counts"]["simulator_error"] == 0 else 2


def cmd_smoke(args) -> int:
    code = _batch_common(args, default_trace=args.n)
    # replay-verify the traces we just wrote (determinism of simulator + adapter)
    batch_id = args.batch_id or f"{args.policy}-{args.character.lower()}-a{args.ascension}-{args.profile}-{args.partition}-n{args.n}"
    out_dir = Path(args.out) if args.out else EXPERIMENTS / "batches" / batch_id
    return max(code, _replay_audit(out_dir, limit=3, character=args.character, ascension=args.ascension, profile=args.profile))


def cmd_run(args) -> int:
    return _batch_common(args, default_trace=0)


def _replay_audit(out_dir: Path, *, limit: int, character: str, ascension: int, profile: str = "veteran") -> int:
    sim = external.locate()
    external.activate(sim.root)
    cfg = RunConfig(character=character, ascension=ascension, profile=profile)
    bad = 0
    traces = sorted((out_dir / "traces").glob("*.jsonl.gz"))[:limit]
    for t in traces:
        seed = int(t.name.split(".")[0])
        ok, msg = replay_from_trace(cfg, seed, t)
        print(f"replay seed={seed}: {'OK' if ok else 'MISMATCH'} - {msg}")
        bad += 0 if ok else 1
    if not traces:
        print("replay: no traces to verify")
    return 1 if bad else 0


def cmd_audit(args) -> int:
    if args.what == "replay":
        return _replay_audit(Path(args.batch), limit=args.limit, character=args.character, ascension=args.ascension, profile=args.profile)
    print(f"audit {args.what!r} is implemented in a later milestone", file=sys.stderr)
    return 2


def cmd_oracle(args) -> int:
    from .oracle_odds import write_golden

    out = Path(args.out)
    n = write_golden(out)
    print(f"wrote {n} exact golden cases to {out} (independent Python reference for packages/odds)")
    return 0


def cmd_catalog(args) -> int:
    from .catalog import CHARACTERS_PATH, OUT_PATH, build_catalog, build_characters, pool_sizes

    chars = build_characters(write=not args.dry_run)
    print(f"{'(dry run) ' if args.dry_run else 'wrote '}{CHARACTERS_PATH}  characters={len(chars['characters'])}")
    body = build_catalog(write=not args.dry_run)
    print(f"{'(dry run) ' if args.dry_run else 'wrote '}{OUT_PATH}  cards={len(body['cards'])}  sha256={body['sha256'][:16]}...")
    for cls, row in pool_sizes(body).items():
        print(f"  {cls:12s} " + "  ".join(f"{r}: {v['allUnlocked']} (no epochs: {v['noEpochs']})" for r, v in row.items()))
    return 0


def cmd_compare(args) -> int:
    a = {r.seed: r for r in read_episodes(Path(args.a) / "episodes.jsonl")}
    b = {r.seed: r for r in read_episodes(Path(args.b) / "episodes.jsonl")}
    seeds = sorted(set(a) & set(b))
    # only seeds where BOTH episodes completed enter the paired win comparison; the rest are reported
    both = [s for s in seeds if a[s].completed and b[s].completed]
    print(f"paired seeds={len(seeds)}  both completed={len(both)}  (excluded: {len(seeds) - len(both)} with a non-completed episode)")
    for name, d in (("A", a), ("B", b)):
        print(f"  {name}: {summarize(list(d.values()))['counts']}")
    if not both:
        return 0
    aw = [a[s].outcome == Outcome.WIN.value for s in both]
    bw = [b[s].outcome == Outcome.WIN.value for s in both]
    print("  A win rate:", _fmt_ci(sum(aw), len(aw)))
    print("  B win rate:", _fmt_ci(sum(bw), len(bw)))
    t = paired_win_table(aw, bw)
    print(f"  paired table: both={t['both']} A-only={t['a_only']} B-only={t['b_only']} neither={t['neither']}  McNemar exact p={t['mcnemar_p']:.4g}")
    fa = [float(a[s].floor) for s in both]
    fb = [float(b[s].floor) for s in both]
    m, lo, hi = paired_bootstrap_ci(fa, fb)
    print(f"  floors reached, mean(A-B) = {m:+.2f}  (95% bootstrap CI {lo:+.2f} .. {hi:+.2f})")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="slay2_sim", description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("doctor", help="check the environment and the pinned simulator").set_defaults(fn=cmd_doctor)

    s = sub.add_parser("seeds", help="create an immutable seed manifest")
    s.add_argument("--name", required=True)
    s.add_argument("--master", type=int, required=True)
    s.add_argument("--sizes", help="e.g. train=5000,val=2000,test=4000")
    s.add_argument("--out")
    s.set_defaults(fn=cmd_seeds)

    def add_run_args(sp, *, n_default=None):
        sp.add_argument("--policy", default="random_legal", choices=sorted(REGISTRY) or None)
        sp.add_argument("--policy-params", help="JSON object of policy parameters")
        sp.add_argument("--character", default="Ironclad")
        sp.add_argument("--ascension", type=int, default=0)
        sp.add_argument("--profile", default="veteran", choices=["veteran", "first_run"],
                        help="veteran: no tutorial scripting (default); first_run: simulator default with scripted early content")
        sp.add_argument("--seeds", default=str(DEFAULT_SEEDS))
        sp.add_argument("--partition", default="train", choices=["train", "val", "test"])
        sp.add_argument("--allow-sealed", action="store_true", help="required for the sealed test partition (recorded)")
        sp.add_argument("--n", type=int, default=n_default)
        sp.add_argument("--workers", type=int, default=4)
        sp.add_argument("--max-steps", type=int, default=20000)
        sp.add_argument("--wall-seconds", type=float, default=900.0)
        sp.add_argument("--trace", type=int, default=None, help="write traces for the first K seeds")
        sp.add_argument("--batch-id")
        sp.add_argument("--out")

    sm = sub.add_parser("smoke", help="small batch + trace replay verification")
    add_run_args(sm, n_default=10)
    sm.set_defaults(fn=cmd_smoke)
    rn = sub.add_parser("run", help="evidence batch (resumable)")
    add_run_args(rn)
    rn.set_defaults(fn=cmd_run)

    au = sub.add_parser("audit", help="audits: replay | rewards | monster-hp | fairness")
    au.add_argument("what", choices=["replay", "rewards", "monster-hp", "fairness"])
    au.add_argument("--batch")
    au.add_argument("--limit", type=int, default=5)
    au.add_argument("--character", default="Ironclad")
    au.add_argument("--ascension", type=int, default=0)
    au.add_argument("--profile", default="veteran", choices=["veteran", "first_run"])
    au.set_defaults(fn=cmd_audit)

    orc = sub.add_parser("oracle", help="write the independent exact golden fixtures for packages/odds")
    orc.add_argument("--out", default=str(external.REPO_ROOT / "packages" / "odds" / "test" / "fixtures" / "golden-python.json"))
    orc.set_defaults(fn=cmd_oracle)

    cat = sub.add_parser("catalog", help="derive the facts-only card catalog from the pinned local references")
    cat.add_argument("--dry-run", action="store_true")
    cat.set_defaults(fn=cmd_catalog)

    cp = sub.add_parser("compare", help="paired comparison of two batches by seed")
    cp.add_argument("a")
    cp.add_argument("b")
    cp.set_defaults(fn=cmd_compare)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.cmd in {"run", "smoke"} and args.cmd == "run" and args.n is None:
        pass  # run all seeds of the partition
    return int(args.fn(args) or 0)


if __name__ == "__main__":
    sys.exit(main())
