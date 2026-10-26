"""Parallel, resumable, append-only batch execution with a checksummed manifest."""

from __future__ import annotations

import gzip
import json
import multiprocessing as mp
import shutil
import time
from concurrent.futures import FIRST_COMPLETED, ProcessPoolExecutor, wait
from concurrent.futures.process import BrokenProcessPool
from pathlib import Path

from . import external, gaps
from .manifest import canonical_json, environment_fingerprint, save_json, sha256_file, sha256_hex, utc_now
from .outcomes import EpisodeRecord, Outcome, summarize
from .policies import make_policy
from .runner import RunConfig, run_episode
from .stats import wilson_interval

_POLICY_CACHE: dict = {}


def _init_worker(sim_root: str) -> None:
    external.activate(sim_root)


def _work(args: tuple) -> dict:
    cfg_dict, seed, policy_name, policy_params, batch_id, trace_path = args
    key = (policy_name, json.dumps(policy_params, sort_keys=True))
    policy = _POLICY_CACHE.get(key)
    if policy is None:
        policy = _POLICY_CACHE[key] = make_policy(policy_name, **policy_params)
    rec = run_episode(RunConfig(**cfg_dict), seed, policy, batch_id=batch_id, trace_path=Path(trace_path) if trace_path else None)
    return rec.to_json()


NONDETERMINISTIC_FIELDS = ("wall_seconds", "trace_sha256")


def content_sha256(records: list[EpisodeRecord]) -> str:
    """Hash of the deterministic content of a batch (seed-sorted; timing fields excluded)."""
    rows = []
    for r in sorted(records, key=lambda r: r.seed):
        d = r.to_json()
        for k in NONDETERMINISTIC_FIELDS:
            d.pop(k, None)
        rows.append(d)
    return sha256_hex(canonical_json(rows))


def read_episodes(path: Path) -> list[EpisodeRecord]:
    """Read ``episodes.jsonl`` (or its committed ``.gz`` twin) from a file or a batch directory."""
    path = Path(path)
    if path.is_dir():
        path = path / "episodes.jsonl" if (path / "episodes.jsonl").exists() else path / "episodes.jsonl.gz"
    if not path.exists() and path.name == "episodes.jsonl" and path.with_name("episodes.jsonl.gz").exists():
        path = path.with_name("episodes.jsonl.gz")
    out = []
    if path.exists():
        opener = gzip.open if path.suffix == ".gz" else open
        with opener(path, "rt", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if line:
                    out.append(EpisodeRecord(**json.loads(line)))
    return out


def _effective(policy_name: str, policy_params: dict) -> dict:
    """What the policy resolved its parameters to (a values file becomes a path and a sha256): the manifest must name the
    measurement or checkpoint a batch used, not only the flags it was started with."""
    try:
        d = make_policy(policy_name, **policy_params).describe()
        return {"version": d["version"], "params": d["params"]}
    except Exception as e:  # noqa: BLE001 - provenance must never make a finished batch unreadable
        return {"error": f"{type(e).__name__}: {str(e)[:200]}"}


def run_batch(
    *,
    out_dir: Path,
    batch_id: str,
    cfg: RunConfig,
    policy_name: str,
    policy_params: dict,
    seeds: list[int],
    workers: int,
    trace_first: int,
    sim: external.ExternalSim,
    seed_info: dict,
    progress_every: int = 25,
    max_pool_restarts: int = 5,
) -> dict:
    out_dir.mkdir(parents=True, exist_ok=True)
    episodes_path = out_dir / "episodes.jsonl"
    config_fingerprint = sha256_hex(canonical_json({"cfg": cfg.describe(), "policy": policy_name, "params": policy_params}))
    meta_path = out_dir / "batch.json"
    if meta_path.exists():
        prior = json.loads(meta_path.read_text())
        if prior.get("config_fingerprint") != config_fingerprint:
            raise RuntimeError(f"{out_dir} already holds a batch with a different configuration; choose a new --out")
    else:
        save_json(meta_path, {"batch_id": batch_id, "config_fingerprint": config_fingerprint, "started": utc_now()})

    done = {r.seed for r in read_episodes(episodes_path)}
    todo = [s for s in seeds if s not in done]
    t_start = time.perf_counter()
    traces_dir = out_dir / "traces"
    # deterministic trace subset: the first ``trace_first`` seeds of the requested list
    trace_set = set(seeds[:trace_first])

    def task(seed: int) -> tuple:
        tp = str(traces_dir / f"{seed}.jsonl.gz") if seed in trace_set else None
        return (cfg.describe(), seed, policy_name, policy_params, batch_id, tp)

    ctx = mp.get_context("spawn")
    pending = list(todo)
    finished = 0
    restarts = 0
    with open(episodes_path, "a", encoding="utf-8") as sink:
        while pending:
            try:
                with ProcessPoolExecutor(max_workers=workers, mp_context=ctx, initializer=_init_worker, initargs=(str(sim.root),)) as pool:
                    inflight: dict = {}
                    it = iter(list(pending))
                    window = max(2, workers * 2)
                    exhausted = False
                    while inflight or not exhausted:
                        while not exhausted and len(inflight) < window:
                            try:
                                s = next(it)
                            except StopIteration:
                                exhausted = True
                                break
                            inflight[pool.submit(_work, task(s))] = s
                        if not inflight:
                            break
                        ready, _ = wait(list(inflight), return_when=FIRST_COMPLETED)
                        for fut in ready:
                            s = inflight.pop(fut)
                            sink.write(json.dumps(fut.result(), sort_keys=True) + "\n")
                            sink.flush()
                            pending.remove(s)
                            finished += 1
                            if progress_every and finished % progress_every == 0:
                                el = time.perf_counter() - t_start
                                print(f"  [{finished}/{len(todo)}] {finished / el:.2f} episodes/s", flush=True)
            except BrokenProcessPool:
                restarts += 1
                print(f"  worker pool died (restart {restarts}/{max_pool_restarts}); pending={len(pending)}", flush=True)
                if restarts > max_pool_restarts:
                    for s in pending:  # account for them explicitly instead of dropping them
                        rec = EpisodeRecord(batch_id=batch_id, seed=s, character=cfg.character, ascension=cfg.ascension,
                                            policy=policy_name, policy_version="?", outcome=Outcome.ABORTED.value,
                                            error="worker pool died repeatedly")
                        sink.write(json.dumps(rec.to_json(), sort_keys=True) + "\n")
                    pending.clear()
        sink.flush()

    records = read_episodes(episodes_path)
    gz_path = out_dir / "episodes.jsonl.gz"
    with open(episodes_path, "rb") as src, open(gz_path, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", mtime=0, compresslevel=9) as dst:
        shutil.copyfileobj(src, dst)  # deterministic bytes (mtime=0) => stable checksum
    wall = time.perf_counter() - t_start
    summary = summarize(records)
    wins = summary["counts"]["win"]
    completed = summary["completed"]
    ci = list(wilson_interval(wins, completed)) if completed else None
    manifest = {
        "schema": 1,
        "batch_id": batch_id,
        "finished": utc_now(),
        "config": cfg.describe(),
        "policy": {"name": policy_name, "params": policy_params, "effective": _effective(policy_name, policy_params)},
        "seeds": seed_info,
        "simulator": {**sim.describe(), "parity_with_live_game": "UNVERIFIED"},
        "known_simulator_gaps": gaps.applicable(cfg.ascension),
        "environment": environment_fingerprint(external.REPO_ROOT),
        "workers": workers,
        "summary": {**summary, "win_rate_95ci_wilson": ci},
        "wall_seconds_this_invocation": round(wall, 1),
        "episodes_file": {"name": episodes_path.name, "sha256": sha256_file(episodes_path), "lines": len(records)},
        "content_sha256": content_sha256(records),
        "episodes_gz": {"name": gz_path.name, "sha256": sha256_file(gz_path), "bytes": gz_path.stat().st_size},
        "traces": {"dir": "traces", "count": len(list(traces_dir.glob("*.jsonl.gz"))) if traces_dir.exists() else 0},
        "notes": "Win rate = wins / (wins + deaths). Timeouts, simulator errors and invalid actions are counted separately.",
    }
    save_json(out_dir / "manifest.json", manifest)
    return manifest
