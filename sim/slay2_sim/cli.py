"""Command line: ``python -m slay2_sim <doctor|seeds|smoke|run|audit|compare|oracle|catalog|patchdiff>``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import external
from .batch import run_batch
from .compare import build_comparison, render_text, write_comparison
from .manifest import (
    DEFAULT_SIZES, load_seed_manifest, make_seed_manifest, partition_seeds, save_json, sha256_file,
)
from .policies import REGISTRY
from .runner import RunConfig, replay_from_trace
from .stats import wilson_interval

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
    comparison = build_comparison(Path(args.a), Path(args.b), iters=args.iters, seed=args.bootstrap_seed)
    print(render_text(comparison))
    if args.out:
        write_comparison(comparison, Path(args.out))
        print(f"  wrote {args.out}  (content sha256 {comparison['contentSha256'][:16]}...)")
    return 0


def cmd_patchdiff(args) -> int:
    from . import patchdiff

    # resolve output paths first: activating the simulator changes the working directory
    out_path = Path(args.out).resolve() if args.out else None
    coverage_path = Path(args.coverage_out).resolve() if args.coverage_out else None
    diff = patchdiff.build_patch_diff(args.old, args.new)
    print(patchdiff.render_markdown([diff]))
    if out_path:
        out = out_path
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(diff, indent=2, sort_keys=True) + "\n", encoding="utf-8")
        print(f"wrote {out}")
    if args.coverage:
        sim = external.locate()
        external.activate(sim.root)
        cov = patchdiff.simulator_coverage(args.new)
        print(json.dumps(cov, indent=2))
        if coverage_path:
            coverage_path.parent.mkdir(parents=True, exist_ok=True)
            coverage_path.write_text(json.dumps(cov, indent=2, sort_keys=True) + "\n", encoding="utf-8")
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

    pd = sub.add_parser("patchdiff", help="diff the factual layer (ids, categories, changed fields) of two archived STS2 versions")
    pd.add_argument("old")
    pd.add_argument("new")
    pd.add_argument("--out", help="write the machine-readable diff, e.g. docs/patches/sts2-0.103.2-to-0.107.1.json")
    pd.add_argument("--coverage", action="store_true", help="also list ids of NEW that the pinned simulator does not implement")
    pd.add_argument("--coverage-out")
    pd.set_defaults(fn=cmd_patchdiff)

    cp = sub.add_parser("compare", help="paired comparison of two batches played on the same seeds (a minus b)")
    cp.add_argument("a")
    cp.add_argument("b")
    cp.add_argument("--out", help="write the comparison as a committed artifact, e.g. experiments/comparisons/a-vs-b.json")
    cp.add_argument("--iters", type=int, default=20000, help="bootstrap resamples")
    cp.add_argument("--bootstrap-seed", type=int, default=0)
    cp.set_defaults(fn=cmd_compare)
    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    if args.cmd in {"run", "smoke"} and args.cmd == "run" and args.n is None:
        pass  # run all seeds of the partition
    return int(args.fn(args) or 0)


if __name__ == "__main__":
    sys.exit(main())
