"""Paired single-combat evaluation of agents on held-out run states.

Every agent plays the *same* (snapshot, repeat) pairs with identical hidden-stream seeds, so differences are paired.
Agents: ``rules`` (the rules_v1 baseline), ``net:<checkpoint>`` greedy, ``netsample:<checkpoint>`` sampled,
``policy:<name>[:key=value,...]`` any registered policy (search policies get a fairly determinized forward model),
e.g. ``policy:search_v1:nodes=200,depth=6``.

    python -m slay2_sim.rl.evalcombat --agents rules net:/path/best.pt --seeds 80 --repeats 3 --partition val
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import random
from pathlib import Path

import numpy as np

from ..stats import mcnemar_exact, paired_bootstrap_ci, wilson_interval


def _make_agent(spec: str):
    if spec == "rules":
        return RulesAgent()
    kind, _, rest = spec.partition(":")
    if kind in ("net", "netsample"):
        return NetAgent(rest, greedy=(kind == "net"))
    if kind == "policy":
        name, _, params = rest.partition(":")
        return PolicyAgent(name, parse_params(params))
    raise ValueError(f"unknown agent {spec!r}")


def parse_params(text: str) -> dict:
    """``nodes=200,depth=6`` -> {"nodes": 200, "depth": 6} (values are JSON when they parse, strings otherwise)."""
    out: dict = {}
    for part in filter(None, (p.strip() for p in text.split(","))):
        key, _, raw = part.partition("=")
        try:
            out[key.strip()] = json.loads(raw)
        except ValueError:
            out[key.strip()] = raw
    return out


def _absolute(spec: str) -> str:
    kind, _, path = spec.partition(":")
    if kind in ("net", "netsample") and path:
        return f"{kind}:{Path(path).resolve()}"
    return spec


class PolicyAgent:
    """A registered policy driving the combat environment; it sees the same fair observation as the network does.

    Search policies receive the same kind of forward model the full-run runner hands them: clones whose hidden state
    is a fair sample (``ManagerForwardModel``), never the live game's future."""

    def __init__(self, name: str = "rules_v1", params: dict | None = None):
        from ..policies import make_policy

        self.policy = make_policy(name, **(params or {}))

    def begin(self, env, seed: int) -> None:
        self.policy.reset(seed)

    def act(self, env, enc) -> int:
        from ..isolation import deliberation
        from ..runner import ManagerForwardModel
        from . import features as ft

        obs = env.obs
        fm = ManagerForwardModel(env.mgr) if self.policy.needs_forward_model else None
        with deliberation():  # search on clones must leave no trace in the game being evaluated
            idx = self.policy.act(obs, env._raw, fm)
        aid = ft.action_id(obs["actions"][idx])
        if aid is None or aid not in env.table:  # outside the fixed layout (rare): fall back to any legal action
            aid = next(iter(env.table))
        return aid


class RulesAgent(PolicyAgent):
    """The rules_v1 baseline."""

    def __init__(self):
        super().__init__("rules_v1")


class NetAgent:
    def __init__(self, path: str, greedy: bool = True):
        import torch

        from . import net as N

        torch.set_num_threads(1)
        self.model = N.load(path)
        self.greedy = greedy

    def begin(self, env, seed: int) -> None:
        pass

    def act(self, env, enc) -> int:
        import torch

        from . import net as N

        with torch.inference_mode():
            logits, _ = self.model(N.to_tensors({k: v[None] for k, v in enc.items()}))
            if self.greedy:
                return int(logits.argmax(-1))
            return int(torch.distributions.Categorical(logits=logits).sample())


def _shard(args: tuple) -> dict:
    from .. import external

    sim_root, seeds, keep_monster, wid, agent_specs, repeats, env_kwargs, loadable = args
    external.activate(sim_root)  # changes the working directory: checkpoint paths arrive absolute in `loadable`
    from . import env as E

    lib = E.collect_snapshots(seeds, keep_monster=keep_monster, rng_seed=wid)
    env = E.CombatEnv(lib, seed=0, **env_kwargs)
    out: dict[str, list[dict]] = {}
    for spec in agent_specs:
        agent = _make_agent(loadable[spec])
        rows = []
        for si, snap in enumerate(lib):
            for r in range(repeats):
                key = (wid * 1_000_003 + si * 131 + r) & 0x7FFFFFFF
                env.rng = random.Random(key)
                enc = env.reset(snap)
                agent.begin(env, key)
                done = False
                while not done:
                    enc, _, done, info = env.step(agent.act(env, enc))
                rows.append({
                    "pair": f"{wid}:{si}:{r}", "won": bool(info.won), "node": info.node, "act": info.act, "enemies": list(info.enemies),
                    "hp_lost": (info.hp_start - info.hp_end) / max(1, info.max_hp), "potions": info.potions_used, "turns": info.turns,
                    "truncated": bool(info.truncated),
                })
        out[spec] = rows
    return out


def evaluate(agent_specs: list[str], *, partition: str = "val", seeds: int = 80, repeats: int = 2, workers: int = 4,
             keep_monster: float = 0.35, env_kwargs: dict | None = None, seed_offset: int = 0) -> dict[str, list[dict]]:
    from .. import external

    sim = external.locate()
    # v2 keeps v1's train / val / test seeds and adds the `dev` partition (ADR-032); `test` is never read here
    manifest = json.loads((external.REPO_ROOT / "experiments" / "seeds" / "ironclad-a0-v2.json").read_text())
    all_seeds = manifest["partitions"][partition][seed_offset:seed_offset + seeds]
    ctx = mp.get_context("spawn")
    loadable = {spec: _absolute(spec) for spec in agent_specs}  # results stay keyed by the spec as typed (no local paths in artifacts)
    jobs = [(str(sim.root), all_seeds[w::workers], keep_monster, w, agent_specs, repeats, env_kwargs or {}, loadable) for w in range(workers)]
    with ctx.Pool(workers) as pool:
        parts = pool.map(_shard, jobs)
    merged: dict[str, list[dict]] = {s: [] for s in agent_specs}
    for part in parts:
        for spec, rows in part.items():
            merged[spec].extend(rows)
    return merged


def summarize(rows: list[dict]) -> dict:
    out = {}
    for name, sel in (("ALL", lambda r: True), ("BOSS", lambda r: r["node"] == "BOSS"), ("ELITE", lambda r: r["node"] == "ELITE"),
                      ("MONSTER", lambda r: r["node"] in ("MONSTER", "UNKNOWN", "EVENT"))):
        rs = [r for r in rows if sel(r)]
        if not rs:
            continue
        wins = sum(r["won"] for r in rs)
        lo, hi = wilson_interval(wins, len(rs))
        out[name] = {
            "n": len(rs), "win": round(wins / len(rs), 4), "win_ci95": [round(lo, 4), round(hi, 4)],
            "hp_lost_mean": round(float(np.mean([r["hp_lost"] for r in rs])), 4),
            "potions": round(float(np.mean([r["potions"] for r in rs])), 3),
        }
    return out


def paired(a: list[dict], b: list[dict]) -> dict:
    ia, ib = {r["pair"]: r for r in a}, {r["pair"]: r for r in b}
    keys = sorted(set(ia) & set(ib))
    aw = [ia[k]["won"] for k in keys]
    bw = [ib[k]["won"] for k in keys]
    a_only = sum(1 for x, y in zip(aw, bw) if x and not y)
    b_only = sum(1 for x, y in zip(aw, bw) if y and not x)
    dl = [ia[k]["hp_lost"] - ib[k]["hp_lost"] for k in keys]
    m, lo, hi = paired_bootstrap_ci([ia[k]["hp_lost"] for k in keys], [ib[k]["hp_lost"] for k in keys], iters=5000)
    return {"pairs": len(keys), "a_only_wins": a_only, "b_only_wins": b_only, "mcnemar_p": round(mcnemar_exact(a_only, b_only), 6),
            "hp_lost_a_minus_b": round(m, 4), "hp_lost_ci95": [round(lo, 4), round(hi, 4)], "mean_dl": round(float(np.mean(dl)), 4)}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--agents", nargs="+", required=True)
    ap.add_argument("--partition", default="val", choices=["train", "val", "dev"], help="the sealed test partition is never read here; tune on dev")
    ap.add_argument("--seeds", type=int, default=80)
    ap.add_argument("--seed-offset", type=int, default=0, help="skip this many seeds of the partition (the PPO monitor uses the first 80 val seeds: use 80 for a fresh, unselected set)")
    ap.add_argument("--repeats", type=int, default=2)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--out")
    args = ap.parse_args(argv)
    res = evaluate(args.agents, partition=args.partition, seeds=args.seeds, repeats=args.repeats, workers=args.workers, seed_offset=args.seed_offset)
    summaries = {s: summarize(r) for s, r in res.items()}
    for spec, summ in summaries.items():
        print(f"\n== {spec}")
        for node, v in summ.items():
            print(f"  {node:8s} n={v['n']:4d} win={v['win']:.3f} (95% {v['win_ci95'][0]:.3f}-{v['win_ci95'][1]:.3f}) hp_lost={v['hp_lost_mean']:.3f} potions={v['potions']:.2f}")
    specs = list(res)
    if len(specs) >= 2:
        print()
        for other in specs[1:]:
            print(f"paired {specs[0]} vs {other}: {paired(res[specs[0]], res[other])}")
    pairs = {f"{specs[0]} vs {o}": paired(res[specs[0]], res[o]) for o in specs[1:]} if len(specs) >= 2 else {}
    if args.out:
        import gzip

        blob = json.dumps({"agents": specs, "partition": args.partition, "seeds": args.seeds, "repeats": args.repeats,
                           "workers": args.workers, "seed_offset": args.seed_offset, "summaries": summaries, "paired": pairs, "rows": res}, separators=(",", ":"))
        out = Path(args.out)
        if out.suffix == ".gz":
            with gzip.open(out, "wt", encoding="utf-8") as fh:
                fh.write(blob)
        else:
            out.write_text(blob + "\n", encoding="utf-8")
        print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
