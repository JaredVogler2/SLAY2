"""Behaviour cloning of the ``rules_v1`` policy into the combat network: a warm start for PPO.

Plain PPO from random weights plateaued below the rules baseline on held-out combats (docs/DECISIONS.md, ADR-026), so
the network first learns to *play like the baseline* and PPO then tries to improve on it. The rules policy plays the same
single-combat environment the network will play, from the ``train`` partition only; every decision it makes is an
(allow-listed fair observation, action) example and the value head regresses the discounted return of the demonstration.
By default only decisions from combats the baseline *won* are kept, so the network copies how it plays when it plays well.

    python -m slay2_sim.rl.bc --out experiments/rl/combat-bc-v1 --repeats 6
    python -m slay2_sim.rl.evalcombat --agents rules net:experiments/rl/combat-bc-v1/bc.pt --workers 4 --seeds 80 --repeats 2
    python -m slay2_sim.rl.train --resume experiments/rl/combat-bc-v1/bc.pt --lr 1e-4 --lr-end 3e-5 --out experiments/rl/combat-ppo-v2
"""

from __future__ import annotations

import argparse
import json
import multiprocessing as mp
import os
import random
import time
from pathlib import Path

import numpy as np

# Episodes whose index modulo this value is zero are held out from the cloning loss to report an honest accuracy.
HOLDOUT_EVERY = 20


def discounted_returns(rewards: list[float], gamma: float) -> np.ndarray:
    """``G_t = r_t + gamma * G_{t+1}`` within one episode (episodes end in a terminal state, no bootstrap)."""
    out = np.zeros(len(rewards), dtype=np.float32)
    running = 0.0
    for t in range(len(rewards) - 1, -1, -1):
        running = rewards[t] + gamma * running
        out[t] = running
    return out


def split_by_episode(episode_ids: np.ndarray, every: int = HOLDOUT_EVERY) -> tuple[np.ndarray, np.ndarray]:
    """Boolean masks (train, holdout): whole episodes are held out, never single decisions of a shared episode."""
    holdout = (episode_ids % every) == 0
    return ~holdout, holdout


# ---------------------------------------------------------------------------------------------- demonstrations
def _collect_shard(args: tuple) -> dict:
    from .. import external

    sim_root, seeds, wid, repeats, keep_monster, env_kwargs, gamma, wins_only = args
    external.activate(sim_root)
    from . import env as E
    from . import features as ft
    from .evalcombat import RulesAgent

    lay = ft.layout()
    lib = E.collect_snapshots(seeds, keep_monster=keep_monster, rng_seed=wid)
    env = E.CombatEnv(lib, seed=wid, **env_kwargs)
    agent = RulesAgent()
    obs_rows: dict[str, list[np.ndarray]] = {k: [] for k in lay}
    acts: list[int] = []
    rets: list[float] = []
    ep_ids: list[int] = []
    nodes: list[str] = []
    stats = {"episodes": 0, "won": 0, "kept_episodes": 0, "decisions": 0, "off_layout": 0}
    episode = 0
    for r in range(repeats):
        for si, snap in enumerate(lib):
            key = (wid * 1_000_003 + si * 131 + r + 7_777_777) & 0x7FFFFFFF  # disjoint from the evaluation pair keys
            env.rng = random.Random(key)
            enc = env.reset(snap)
            agent.begin(env, key)
            ep_enc: list[dict[str, np.ndarray]] = []
            ep_act: list[int] = []
            step_rewards: list[float] = []
            recorded_at: list[int] = []
            done = False
            while not done:
                obs = env.obs
                idx = agent.policy.act(obs, env._raw, None)
                aid = ft.action_id(obs["actions"][idx])
                keep = aid is not None and aid in env.table
                if not keep:  # the baseline chose something outside the fixed action layout: play it safe, learn nothing from it
                    stats["off_layout"] += 1
                    aid = next(iter(env.table)) if env.table else 0
                else:
                    recorded_at.append(len(step_rewards))
                    ep_enc.append({k: v.copy() for k, v in enc.items()})
                    ep_act.append(int(aid))
                enc, reward, done, info = env.step(int(aid))
                step_rewards.append(float(reward))
            stats["episodes"] += 1
            stats["won"] += int(info.won)
            if wins_only and not info.won:
                continue
            returns = discounted_returns(step_rewards, gamma)
            for k, e in enumerate(ep_enc):
                for name, v in e.items():
                    obs_rows[name].append(v)
                acts.append(ep_act[k])
                rets.append(float(returns[recorded_at[k]]))
                ep_ids.append(wid * 10_000_000 + episode)
                nodes.append(str(info.node))
            stats["kept_episodes"] += 1
            stats["decisions"] += len(ep_enc)
            episode += 1
    return {
        "obs": {k: np.stack(v) if v else np.zeros((0, *lay[k][0]), dtype=lay[k][1]) for k, v in obs_rows.items()},
        "act": np.asarray(acts, dtype=np.int64), "ret": np.asarray(rets, dtype=np.float32),
        "episode": np.asarray(ep_ids, dtype=np.int64), "nodes": nodes, "stats": stats,
    }


def collect(*, sim_root: str, seeds: list[int], workers: int, repeats: int, keep_monster: float, env_kwargs: dict, gamma: float,
            wins_only: bool) -> dict:
    ctx = mp.get_context("spawn")
    jobs = [(sim_root, seeds[w::workers], w, repeats, keep_monster, env_kwargs, gamma, wins_only) for w in range(workers)]
    with ctx.Pool(workers) as pool:
        parts = pool.map(_collect_shard, jobs)
    data = {
        "obs": {k: np.concatenate([p["obs"][k] for p in parts]) for k in parts[0]["obs"]},
        "act": np.concatenate([p["act"] for p in parts]), "ret": np.concatenate([p["ret"] for p in parts]),
        "episode": np.concatenate([p["episode"] for p in parts]), "nodes": [n for p in parts for n in p["nodes"]],
    }
    totals = {k: sum(p["stats"][k] for p in parts) for k in parts[0]["stats"]}
    return {"data": data, "stats": totals}


# ---------------------------------------------------------------------------------------------- cloning
def clone(model, data: dict, *, epochs: int, batch: int, lr: float, lr_end: float, vf_coef: float, seed: int, log=print) -> dict:
    import torch
    import torch.nn.functional as F

    from . import net as N

    torch.manual_seed(seed)
    rng = np.random.default_rng(seed)
    train_mask, hold_mask = split_by_episode(data["episode"])
    train_idx = np.flatnonzero(train_mask)
    hold_idx = np.flatnonzero(hold_mask)
    obs = N.to_tensors(data["obs"])
    act = torch.from_numpy(data["act"])
    ret = torch.from_numpy(data["ret"])
    opt = torch.optim.Adam(model.parameters(), lr=lr, eps=1e-5)
    history = []

    def evaluate(idx: np.ndarray) -> dict:
        model.eval()
        correct = 0
        nll = 0.0
        vf = 0.0
        with torch.inference_mode():
            for s in range(0, len(idx), 2048):
                b = torch.from_numpy(idx[s:s + 2048])
                logits, v = model({k: x[b] for k, x in obs.items()})
                correct += int((logits.argmax(-1) == act[b]).sum())
                nll += float(F.cross_entropy(logits, act[b], reduction="sum"))
                vf += float(((v - ret[b]) ** 2).sum())
        n = max(1, len(idx))
        return {"n": len(idx), "top1": round(correct / n, 4), "nll": round(nll / n, 4), "value_mse": round(vf / n, 4)}

    t0 = time.perf_counter()
    for epoch in range(1, epochs + 1):
        frac = (epoch - 1) / max(1, epochs - 1)
        for g in opt.param_groups:
            g["lr"] = lr + (lr_end - lr) * frac
        model.train()
        order = rng.permutation(train_idx)
        total = 0.0
        batches = 0
        for s in range(0, len(order), batch):
            b = torch.from_numpy(order[s:s + batch])
            logits, v = model({k: x[b] for k, x in obs.items()})
            loss = F.cross_entropy(logits, act[b]) + vf_coef * F.mse_loss(v, ret[b])
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step()
            total += loss.item()
            batches += 1
        row = {"epoch": epoch, "loss": round(total / max(1, batches), 4), "train": evaluate(train_idx[:20000]), "holdout": evaluate(hold_idx),
               "seconds": round(time.perf_counter() - t0)}
        history.append(row)
        log(f"epoch {epoch:2d} loss {row['loss']:.4f} train top1 {row['train']['top1']:.3f} | holdout top1 {row['holdout']['top1']:.3f} "
            f"nll {row['holdout']['nll']:.3f} value mse {row['holdout']['value_mse']:.3f} ({row['seconds']} s)")
    model.eval()
    return {"history": history, "train_decisions": int(train_mask.sum()), "holdout_decisions": int(hold_mask.sum())}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", required=True)
    ap.add_argument("--train-seeds", type=int, default=240, help="train-partition runs used to build the snapshot library")
    ap.add_argument("--keep-monster", type=float, default=0.35)
    ap.add_argument("--repeats", type=int, default=6, help="demonstration passes over the library, each with fresh hidden streams")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--all-episodes", action="store_true", help="also clone decisions from combats the baseline lost")
    ap.add_argument("--epochs", type=int, default=8)
    ap.add_argument("--batch", type=int, default=512)
    ap.add_argument("--lr", type=float, default=1e-3)
    ap.add_argument("--lr-end", type=float, default=1e-4)
    ap.add_argument("--vf", type=float, default=0.5)
    ap.add_argument("--gamma", type=float, default=0.995)
    ap.add_argument("--hp-weight", type=float, default=0.5)
    ap.add_argument("--potion-cost", type=float, default=0.1)
    ap.add_argument("--d", type=int, default=48)
    ap.add_argument("--layers", type=int, default=2)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args(argv)

    from .. import external

    sim = external.locate()
    out = Path(args.out).resolve()  # resolve before activate() changes the working directory
    external.activate(sim.root)
    import torch

    from . import net as N

    out.mkdir(parents=True, exist_ok=True)
    torch.set_num_threads(max(1, os.cpu_count() or 4))
    seeds = json.loads((external.REPO_ROOT / "experiments" / "seeds" / "ironclad-a0-v1.json").read_text())["partitions"]["train"][: args.train_seeds]
    env_kwargs = {"hp_weight": args.hp_weight, "potion_cost": args.potion_cost, "max_steps": 300}

    t0 = time.perf_counter()
    got = collect(sim_root=str(sim.root), seeds=seeds, workers=args.workers, repeats=args.repeats, keep_monster=args.keep_monster,
                  env_kwargs=env_kwargs, gamma=args.gamma, wins_only=not args.all_episodes)
    data, stats = got["data"], got["stats"]
    t_collect = time.perf_counter() - t0
    by_node: dict[str, int] = {}
    for n in data["nodes"]:
        by_node[n] = by_node.get(n, 0) + 1
    print(f"demonstrations: {stats} in {t_collect:.0f} s; decisions by node of the combat: {by_node}", flush=True)
    if stats["decisions"] == 0:
        raise SystemExit("no demonstrations collected")

    net_cfg = {"d": args.d, "layers": args.layers, "heads": 4, "d_pw": 16}
    model = N.CombatNet(**net_cfg)
    report = clone(model, data, epochs=args.epochs, batch=args.batch, lr=args.lr, lr_end=args.lr_end, vf_coef=args.vf, seed=args.seed,
                   log=lambda s: print(s, flush=True))
    N.save(model, out / "bc.pt", bc=report["history"][-1])
    (out / "bc.json").write_text(json.dumps({
        "args": vars(args), "net": model.config, "demonstrations": stats, "decisions_by_node": by_node,
        "collect_seconds": round(t_collect), **report, "simulator": sim.describe(),
    }, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {out / 'bc.pt'}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
