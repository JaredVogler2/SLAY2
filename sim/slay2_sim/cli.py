"""Command line: ``python -m slay2_sim <doctor|seeds|smoke|run|audit|compare|oracle|catalog|patchdiff>``."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import external
from .batch import run_batch
from .classes import CHARACTER_IDS, exact_character
from .compare import build_comparison, build_pooled_comparison, render_pooled_text, render_text, write_comparison
from .manifest import (
    DEFAULT_SIZES, PARTITIONS, load_seed_manifest, make_seed_manifest, partition_seeds, save_json, sha256_file,
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
    offset = int(getattr(args, "offset", 0) or 0)
    if offset < 0:
        raise SystemExit("--offset must be 0 or more")
    seeds = partition_seeds(manifest, args.partition, allow_sealed=args.allow_sealed)[offset:]
    if args.n is not None:
        seeds = seeds[: args.n]
    info = {
        "file": str(path.relative_to(external.REPO_ROOT)) if path.is_absolute() and external.REPO_ROOT in path.parents else str(path),
        "manifest_sha256": manifest["sha256"], "file_sha256": sha256_file(path),
        "partition": args.partition, "n": len(seeds), "sealed_partition_used": args.partition == "test",
    }
    if offset:  # only when used, so the manifests of the batches played without it stay what they were
        info["offset"] = offset
    return seeds, info


def _default_batch_id(args, n: int) -> str:
    variant = "-ancientheal" if args.ancient_heal else ""
    where = f"{args.partition}-o{args.offset}" if getattr(args, "offset", 0) else args.partition
    return f"{args.policy}-{args.character.lower()}-a{args.ascension}-{args.profile}{variant}-{where}-n{n}"


def _batch_common(args, *, default_trace: int) -> int:
    sim = external.locate()
    external.activate(sim.root)
    seeds, seed_info = _resolve_seeds(args)
    cfg = RunConfig(character=args.character, ascension=args.ascension, profile=args.profile, max_steps=args.max_steps, wall_seconds=args.wall_seconds, ancient_heal=args.ancient_heal)
    params = json.loads(args.policy_params) if args.policy_params else {}
    batch_id = args.batch_id or _default_batch_id(args, len(seeds))
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
    batch_id = args.batch_id or _default_batch_id(args, args.n)
    out_dir = Path(args.out) if args.out else EXPERIMENTS / "batches" / batch_id
    return max(code, _replay_audit(out_dir, limit=3, character=args.character, ascension=args.ascension, profile=args.profile))


def cmd_run(args) -> int:
    return _batch_common(args, default_trace=0)


def _replay_audit(out_dir: Path, *, limit: int, character: str, ascension: int, profile: str = "veteran") -> int:
    sim = external.locate()
    external.activate(sim.root)
    manifest_path = out_dir / "manifest.json"
    if manifest_path.exists():  # the batch says how its games were played (a variant such as ancient_heal must be replayed as it was run)
        cfg = RunConfig(**json.loads(manifest_path.read_text(encoding="utf-8"))["config"])
    else:
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
        return _replay_audit(Path(args.batch), limit=args.limit if args.limit is not None else 5, character=args.character, ascension=args.ascension, profile=args.profile)
    if args.what == "wins":
        from .winaudit import audit_wins

        sim = external.locate()
        external.activate(sim.root)
        report = audit_wins(Path(args.batch), limit=args.limit)
        for w in report["wins"]:
            print(
                f"win seed={w['seed']}: {'VERIFIED' if w['verified'] else 'NOT VERIFIED'} - floor {w['floor']}, hp {w['hp']}/{w['max_hp']}, "
                f"deck {w['deck_size']}, re-run {'agrees' if w['rerun_matches_stored_record'] else 'DISAGREES ' + str(w['rerun_mismatched_fields'])}, "
                f"replay: {w['replay_message']}, bosses per act {w['boss_fights_entered_per_act']}, final act index {w['terminal_state']['final_act_index']}"
            )
        print(f"wins in batch {report['wins_in_batch']}, audited {report['wins_audited']}, verified {report['wins_verified']}  (wrote wins-audit.json)")
        return 0 if report["all_verified"] or report["wins_audited"] == 0 else 1
    if args.what == "sample":
        from .winaudit import audit_sample

        sim = external.locate()
        external.activate(sim.root)
        report = audit_sample(Path(args.batch), n=args.limit if args.limit is not None else 50)
        led = report["ledger"]
        print(f"ledger: {led['records']} records for {led['requested_seeds']} requested seeds, "
              f"{'complete and consistent' if led['ok'] else 'NOT consistent'}; outcomes {led['outcome_counts']}")
        bad = [g for g in report["games"] if not g["verified"]]
        for g in bad:
            print(f"  seed={g['seed']} NOT VERIFIED: re-run {'agrees' if g['rerun_matches_stored_record'] else 'DISAGREES ' + str(g['rerun_mismatched_fields'])}, "
                  f"replay: {g['replay_message']}, terminal {g['terminal_state']}")
        print(f"sample of {report['sample']['drawn']} completed games (rng seed {report['sample']['rng_seed']}): {report['verified']} verified  (wrote sample-audit.json)")
        return 0 if report["all_verified"] else 1
    if args.what == "rederive":
        from .winaudit import audit_rederive

        sim = external.locate()
        external.activate(sim.root)
        report = audit_rederive(Path(args.batch), workers=args.workers)
        for d in report["differing"][:20]:
            print(f"  seed={d['seed']} differs in {d['fields']}: stored {d.get('stored')} / re-run {d.get('rerun')}")
        print(f"{report['rederived_exactly']} of {report['games']} games re-derived exactly, {len(report['differing'])} differ  (wrote rederivation-audit.json)")
        return 0 if report["all_rederived"] else 1
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
    comparison = build_comparison(Path(args.a), Path(args.b), iters=args.iters, seed=args.bootstrap_seed, sensitivity=args.sensitivity_by_act)
    print(render_text(comparison))
    if args.out:
        write_comparison(comparison, Path(args.out))
        print(f"  wrote {args.out}  (content sha256 {comparison['contentSha256'][:16]}...)")
    return 0


def _character(value: str) -> str:
    """argparse type: the simulator's exact class id, or an error that says which (it plays any other string as Ironclad)."""
    try:
        return exact_character(value)
    except ValueError as e:
        raise argparse.ArgumentTypeError(str(e)) from e


def cmd_pool(args) -> int:
    pairs = [(Path(a), Path(b)) for a, b in args.pair]
    pooled = build_pooled_comparison(pairs, iters=args.iters, seed=args.bootstrap_seed)
    print(render_pooled_text(pooled))
    if args.out:
        write_comparison(pooled, Path(args.out))
        print(f"  wrote {args.out}  (content sha256 {pooled['contentSha256'][:16]}...)")
    return 0


def cmd_tune(args) -> int:
    from .tune import expand_one_at_a_time, render, run_candidates

    sim = external.locate()
    external.activate(sim.root)
    base = json.loads(args.base) if args.base else {}
    candidates = expand_one_at_a_time(args.one_at_a_time) if args.one_at_a_time else []
    if args.candidates:
        candidates += json.loads(Path(args.candidates).read_text(encoding="utf-8"))
    if not candidates:
        print("nothing to tune: pass --one-at-a-time or --candidates", file=sys.stderr)
        return 2
    summary = run_candidates(
        policy=args.policy, base_params=base, candidates=candidates, seeds_file=Path(args.seeds), partition=args.partition,
        offset=args.offset, n=args.n, workers=args.workers, out_dir=Path(args.out), sim=sim,
    )
    print(render(summary))
    return 0


def cmd_tune_select(args) -> int:
    """The selection rules of ADR-036 applied to a tuning summary (no simulator needed)."""
    from .tune import COMBINE_ALPHA, candidate_spec, combined_candidate, confirm, higher_than_base, screen

    summary = json.loads(Path(args.summary).read_text(encoding="utf-8"))
    base, rows = summary["base"], summary["candidates"]
    if args.stage == "screen":
        advanced = screen(rows)
        out = [candidate_spec(base, r) for r in advanced]
        for r in advanced:
            a1 = r["pastAct1Boss"]
            print(f"  advance {r['name']:30s} past-boss {a1['rate'] - a1['rateBase']:+.1%} p={a1['mcnemarP']:.3g} floors {r['floorDiff']:+.2f}")
        print(f"{len(advanced)} of {len(rows)} candidates advance")
    elif args.stage == "confirm":
        res = confirm(rows)
        kept = res["kept"]
        print(f"level {res['alpha']:.4f} (0.05 / {len(rows)}); confirmed: {', '.join(res['confirmed']) or 'none'}")
        for r in kept:
            print(f"  keep {r['name']}")
        out = [combined_candidate(base, kept)] if kept else []
    else:  # combine
        if len(rows) != 1:
            print("the combine stage compares exactly one configuration with the base", file=sys.stderr)
            return 2
        r = rows[0]
        a1 = r["pastAct1Boss"]
        ok = higher_than_base(r, COMBINE_ALPHA)
        print(f"{r['name']}: past-boss {a1['rate'] - a1['rateBase']:+.1%} p={a1['mcnemarP']:.3g} floors {r['floorDiff']:+.2f} -> "
              f"{'passes' if ok else 'does not pass'} at {COMBINE_ALPHA}")
        out = [candidate_spec(base, r)] if ok else []
    save_json(Path(args.out), out)
    return 0 if out else 3


def cmd_pickgolden(args) -> int:
    from .pickgolden import build_golden

    out = Path(args.out)  # resolved before the simulator is activated (it changes the working directory)
    sim = external.locate()
    external.activate(sim.root)
    body = build_golden()
    save_json(out, body)
    for c in body["classes"]:
        print(f"  {c['character']:12s} cases={len(c['cases'])}  values sha256={c['valuesSha256'][:16]}...")
    print(f"wrote {out}")
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
        sp.add_argument("--character", default="Ironclad", type=_character, metavar="{" + ",".join(CHARACTER_IDS) + "}")
        sp.add_argument("--ascension", type=int, default=0)
        sp.add_argument("--profile", default="veteran", choices=["veteran", "first_run"],
                        help="veteran: no tutorial scripting (default); first_run: simulator default with scripted early content")
        sp.add_argument("--ancient-heal", action="store_true",
                        help="harness variant (gap G11): heal at the start of acts 2 and 3 as the game's Ancient event does; recorded in the manifest")
        sp.add_argument("--seeds", default=str(DEFAULT_SEEDS))
        sp.add_argument("--partition", default="train", choices=list(PARTITIONS))
        sp.add_argument("--allow-sealed", action="store_true", help="required for the sealed test partition (recorded)")
        sp.add_argument("--n", type=int, default=n_default)
        sp.add_argument("--offset", type=int, default=0, help="skip this many seeds of the partition (a fresh slice; recorded in the manifest)")
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

    au = sub.add_parser("audit", help="audits: replay | wins | rewards | monster-hp | fairness")
    au.add_argument("what", choices=["replay", "wins", "sample", "rederive", "rewards", "monster-hp", "fairness"])
    au.add_argument("--batch")
    au.add_argument("--limit", type=int, default=None, help="replay: traces to verify (default 5); wins: wins to audit (default all)")
    au.add_argument("--character", default="Ironclad", type=_character, metavar="{" + ",".join(CHARACTER_IDS) + "}")
    au.add_argument("--ascension", type=int, default=0)
    au.add_argument("--profile", default="veteran", choices=["veteran", "first_run"])
    au.add_argument("--workers", type=int, default=4, help="rederive: worker processes")
    au.set_defaults(fn=cmd_audit)

    tn = sub.add_parser("tune", help="paired tuning of a rules policy's thresholds on development seeds (dev/train only)")
    tn.add_argument("--policy", default="rules_v2", choices=sorted(REGISTRY))
    tn.add_argument("--base", help="JSON policy parameters of the baseline, e.g. '{\"threshold\":0.0}'")
    tn.add_argument("--one-at-a-time", help='"heal_below=0.5,0.6;elite_value=1,3": one candidate per value')
    tn.add_argument("--candidates", help="JSON file: [{\"name\": ..., \"tune\": {...}}, ...]")
    tn.add_argument("--seeds", default=str(EXPERIMENTS / "seeds" / "ironclad-a0-v2.json"))
    tn.add_argument("--partition", default="dev", choices=["dev", "train"])
    tn.add_argument("--offset", type=int, default=0, help="skip this many seeds of the partition (a fresh slice per tuning stage)")
    tn.add_argument("--n", type=int, default=500)
    tn.add_argument("--workers", type=int, default=4)
    tn.add_argument("--out", required=True)
    tn.set_defaults(fn=cmd_tune)

    ts = sub.add_parser("tune-select", help="apply the selection rule of ADR-036 to a tuning summary (screen | confirm | combine)")
    ts.add_argument("--stage", required=True, choices=["screen", "confirm", "combine"])
    ts.add_argument("--summary", required=True, help="summary.json written by `tune`")
    ts.add_argument("--out", required=True, help="candidates file for the next stage (empty when nothing advances)")
    ts.set_defaults(fn=cmd_tune_select)

    pg = sub.add_parser("pickgolden", help="write golden card-reward cases of rules_v2 for the website's simulation panel")
    pg.add_argument("--out", default=str(external.REPO_ROOT / "apps" / "web" / "test" / "fixtures" / "simulation-pick-golden.json"))
    pg.set_defaults(fn=cmd_pickgolden)

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
    cp.add_argument("--sensitivity-by-act", action="store_true",
                    help="also report, labelled post hoc, the past-the-Act-1-boss comparison with wall-clock timeouts counted by the act they reached")
    cp.set_defaults(fn=cmd_compare)
    pp = sub.add_parser("pool", help="several paired comparisons that differ in the class only, pooled into one exact test (ADR-041)")
    pp.add_argument("--pair", nargs=2, action="append", required=True, metavar=("A", "B"), help="a pair of batches, repeated per class (a minus b)")
    pp.add_argument("--out", help="write the pooled comparison, e.g. experiments/neow/pooled-test.json (NOT experiments/comparisons: the site reads that directory)")
    pp.add_argument("--iters", type=int, default=20000, help="bootstrap resamples")
    pp.add_argument("--bootstrap-seed", type=int, default=0)
    pp.set_defaults(fn=cmd_pool)
    return p


# Arguments that name files or directories. Every one is relative to the *user's* working directory, but
# `external.activate()` changes into the simulator checkout, so they are made absolute before anything runs
# (a relative `--out` used to land inside the third-party checkout).
PATH_ARGS = ("out", "seeds", "coverage_out", "batch", "a", "b", "candidates")


def absolutize_paths(args: argparse.Namespace) -> argparse.Namespace:
    if getattr(args, "pair", None):
        args.pair = [[str(Path(x).resolve()) for x in pair] for pair in args.pair]
    for name in PATH_ARGS:
        value = getattr(args, name, None)
        if isinstance(value, str) and value:
            if name == "seeds" and args.cmd not in {"run", "smoke", "tune"}:
                continue  # `--seeds` is a count or a path only for the batch commands
            setattr(args, name, str(Path(value).resolve()))
    return args


def main(argv: list[str] | None = None) -> int:
    args = absolutize_paths(build_parser().parse_args(argv))
    return int(args.fn(args) or 0)


if __name__ == "__main__":
    sys.exit(main())
