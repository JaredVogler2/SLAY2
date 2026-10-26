"""Synchronous PPO for single-combat play with local-inference worker processes.

Workers own their snapshot libraries and environments (simulator objects cannot be shared between processes). Each
iteration the learner broadcasts the weights, every worker collects ``steps`` decisions from ``envs`` parallel
combats with its own copy of the network, computes GAE, and returns flat arrays; the learner then runs a few epochs of
clipped-PPO minibatch updates. Evaluation is greedy and paired: fixed (snapshot, seed) pairs on held-out ``val`` runs.

    python -m slay2_sim.rl.train --out /path/to/run --iterations 200
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


# ---------------------------------------------------------------------------------------------- worker side
def _worker(conn, cfg: dict) -> None:
    from .. import external

    external.activate(cfg["sim_root"])
    import torch
    from torch.distributions import Categorical

    from . import env as E
    from . import features as ft
    from . import net as N

    torch.set_num_threads(1)
    wid = cfg["worker_id"]
    seeds = {"train": cfg["train_seeds"], "val": cfg["val_seeds"]}
    libs = {k: E.collect_snapshots(v, keep_monster=cfg["keep_monster"], rng_seed=wid) if v else [] for k, v in seeds.items()}
    envs = [E.CombatEnv(libs["train"], seed=cfg["env_seed"] + 1000 * wid + i, hp_weight=cfg["hp_weight"],
                        potion_cost=cfg["potion_cost"], max_steps=cfg["max_steps"]) for i in range(cfg["envs"])]
    model = N.CombatNet(**cfg["net"]).eval()
    eval_env = E.CombatEnv(libs["val"], seed=0, hp_weight=cfg["hp_weight"], potion_cost=cfg["potion_cost"], max_steps=cfg["max_steps"]) if libs["val"] else None
    lay = ft.layout()
    n_env = len(envs)
    cur = {k: np.zeros((n_env, *shape), dtype=dt) for k, (shape, dt) in lay.items()}
    for i, e in enumerate(envs):
        for k, v in e.reset().items():
            cur[k][i] = v
    conn.send(("ready", {k: len(v) for k, v in libs.items()}, {k: _count_nodes(v) for k, v in libs.items()}))

    while True:
        msg = conn.recv()
        if msg[0] == "close":
            break
        if msg[0] == "collect":
            _, state, T, gamma, lam = msg
            model.load_state_dict(state)
            buf = {k: np.zeros((T, n_env, *shape), dtype=dt) for k, (shape, dt) in lay.items()}
            act = np.zeros((T, n_env), dtype=np.int64)
            logp = np.zeros((T, n_env), dtype=np.float32)
            val = np.zeros((T, n_env), dtype=np.float32)
            rew = np.zeros((T, n_env), dtype=np.float32)
            done = np.zeros((T, n_env), dtype=np.float32)
            episodes = []
            t0 = time.perf_counter()
            for t in range(T):
                for k in buf:
                    buf[k][t] = cur[k]
                with torch.inference_mode():
                    logits, v = model(N.to_tensors(cur))
                    dist = Categorical(logits=logits)
                    a = dist.sample()
                    lp = dist.log_prob(a)
                act[t], logp[t], val[t] = a.numpy(), lp.numpy(), v.numpy()
                for i, e in enumerate(envs):
                    obs, r, d, info = e.step(int(a[i]))
                    rew[t, i], done[t, i] = r, float(d)
                    if d:
                        episodes.append(_episode_row(info))
                        obs = e.reset()
                    for k, x in obs.items():
                        cur[k][i] = x
            with torch.inference_mode():
                last = model(N.to_tensors(cur))[1].numpy()
            adv = np.zeros_like(rew)
            running = np.zeros(n_env, dtype=np.float32)
            for t in reversed(range(T)):
                nxt = last if t == T - 1 else val[t + 1]
                non_terminal = 1.0 - done[t]
                delta = rew[t] + gamma * nxt * non_terminal - val[t]
                running = delta + gamma * lam * non_terminal * running
                adv[t] = running
            flat = lambda x: x.reshape(T * n_env, *x.shape[2:])  # noqa: E731
            conn.send(("batch", {
                "obs": {k: flat(v) for k, v in buf.items()}, "act": flat(act), "logp": flat(logp),
                "adv": flat(adv), "ret": flat(adv + val), "episodes": episodes, "seconds": time.perf_counter() - t0,
            }))
        elif msg[0] == "eval":
            _, state, repeats, greedy = msg
            model.load_state_dict(state)
            rows = evaluate_network(model, libs["val"], eval_env, repeats=repeats, greedy=greedy, tag=cfg["worker_id"]) if eval_env else []
            conn.send(("eval", rows))


def _count_nodes(lib) -> dict:
    out: dict[str, int] = {}
    for s in lib:
        out[str(s.node)] = out.get(str(s.node), 0) + 1
    return out


def _episode_row(info) -> dict:
    return {
        "won": bool(info.won), "node": info.node, "act": info.act, "hp_start": info.hp_start, "hp_end": info.hp_end,
        "max_hp": info.max_hp, "turns": info.turns, "potions": info.potions_used, "steps": info.steps,
        "truncated": bool(info.truncated),
    }


def evaluate_network(model, library, env, *, repeats: int = 2, greedy: bool = True, tag: int = 0) -> list[dict]:
    """Paired evaluation: every (snapshot, repeat) pair is replayed with the same hidden-stream seed for any policy."""
    import torch

    from . import net as N

    rows = []
    for si, snap in enumerate(library):
        for r in range(repeats):
            env.rng = random.Random((tag * 1_000_003 + si * 131 + r) & 0x7FFFFFFF)
            obs = env.reset(snap)
            done = False
            while not done:
                with torch.inference_mode():
                    logits, _ = model(N.to_tensors({k: v[None] for k, v in obs.items()}))
                    a = int(logits.argmax(-1)) if greedy else int(torch.distributions.Categorical(logits=logits).sample())
                obs, _, done, info = env.step(a)
            rows.append({**_episode_row(info), "snapshot": si, "repeat": r, "tag": tag, "enemies": list(info.enemies)})
    return rows


# ---------------------------------------------------------------------------------------------- learner side
def summarize_episodes(rows: list[dict]) -> dict:
    def block(rs: list[dict]) -> dict:
        if not rs:
            return {"n": 0}
        wins = [r for r in rs if r["won"]]
        return {
            "n": len(rs), "win": round(len(wins) / len(rs), 4),
            "hp_lost_on_win": round(float(np.mean([(r["hp_start"] - r["hp_end"]) / max(1, r["max_hp"]) for r in wins])), 4) if wins else None,
            "potions": round(float(np.mean([r["potions"] for r in rs])), 3),
            "turns": round(float(np.mean([r["turns"] for r in rs])), 2),
        }

    out = {"all": block(rows)}
    for node in ("BOSS", "ELITE", "MONSTER"):
        out[node] = block([r for r in rows if r["node"] == node])
    return out


def ppo_update(model, opt, data: dict, *, epochs: int, minibatch: int, clip: float, ent_coef: float, vf_coef: float,
               max_grad: float, target_kl: float, value_only: bool = False) -> dict:
    import torch
    from torch.distributions import Categorical

    from . import net as N

    n = data["act"].shape[0]
    obs = N.to_tensors(data["obs"])
    act = torch.from_numpy(data["act"])
    old_logp = torch.from_numpy(data["logp"])
    adv = torch.from_numpy(data["adv"])
    adv = (adv - adv.mean()) / (adv.std() + 1e-8)
    ret = torch.from_numpy(data["ret"])
    stats = {"pg": 0.0, "vf": 0.0, "ent": 0.0, "kl": 0.0, "clipfrac": 0.0, "updates": 0}
    stop = False
    model.train()
    for _ in range(epochs):
        perm = torch.randperm(n)
        for start in range(0, n, minibatch):
            idx = perm[start:start + minibatch]
            logits, v = model({k: x[idx] for k, x in obs.items()})
            dist = Categorical(logits=logits)
            lp = dist.log_prob(act[idx])
            ratio = (lp - old_logp[idx]).exp()
            pg = -torch.min(ratio * adv[idx], ratio.clamp(1 - clip, 1 + clip) * adv[idx]).mean()
            vf = 0.5 * (v - ret[idx]).pow(2).mean()
            ent = dist.entropy().mean()
            loss = vf_coef * vf if value_only else pg + vf_coef * vf - ent_coef * ent
            opt.zero_grad(set_to_none=True)
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), max_grad)
            opt.step()
            with torch.no_grad():
                kl = (old_logp[idx] - lp).mean().item()
                stats["pg"] += pg.item()
                stats["vf"] += vf.item()
                stats["ent"] += ent.item()
                stats["kl"] += kl
                stats["clipfrac"] += ((ratio - 1).abs() > clip).float().mean().item()
                stats["updates"] += 1
            if target_kl and kl > 1.5 * target_kl:
                stop = True
                break
        if stop:
            break
    model.eval()
    k = max(1, stats.pop("updates"))
    return {name: round(x / k, 5) for name, x in stats.items()}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", required=True)
    ap.add_argument("--iterations", type=int, default=100)
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--envs", type=int, default=16, help="parallel combats per worker")
    ap.add_argument("--steps", type=int, default=128, help="decisions per env per iteration")
    ap.add_argument("--train-seeds", type=int, default=240, help="train-partition runs used to build the snapshot library")
    ap.add_argument("--val-seeds", type=int, default=80, help="val-partition runs used to build the evaluation library")
    ap.add_argument("--keep-monster", type=float, default=0.35)
    ap.add_argument("--epochs", type=int, default=3)
    ap.add_argument("--minibatch", type=int, default=2048)
    ap.add_argument("--lr", type=float, default=3e-4)
    ap.add_argument("--lr-end", type=float, default=5e-5)
    ap.add_argument("--gamma", type=float, default=0.995)
    ap.add_argument("--lam", type=float, default=0.95)
    ap.add_argument("--clip", type=float, default=0.2)
    ap.add_argument("--ent", type=float, default=0.01)
    ap.add_argument("--ent-end", type=float, default=0.002)
    ap.add_argument("--vf", type=float, default=0.5)
    ap.add_argument("--target-kl", type=float, default=0.02)
    ap.add_argument("--hp-weight", type=float, default=0.5)
    ap.add_argument("--potion-cost", type=float, default=0.1)
    ap.add_argument("--d", type=int, default=48)
    ap.add_argument("--layers", type=int, default=2)
    ap.add_argument("--eval-every", type=int, default=10)
    ap.add_argument("--eval-repeats", type=int, default=2)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--resume", help="checkpoint to continue from")
    ap.add_argument("--value-warmup", type=int, default=0,
                    help="first N iterations train only the value head (policy frozen): a behaviour-cloned critic is calibrated on wins only")
    args = ap.parse_args(argv)

    from .. import external

    sim = external.locate()
    out = Path(args.out).resolve()  # resolve every user path BEFORE activate() changes the working directory
    resume = str(Path(args.resume).resolve()) if args.resume else None
    external.activate(sim.root)
    import torch

    from . import net as N

    torch.manual_seed(args.seed)
    torch.set_num_threads(max(1, os.cpu_count() or 4))
    out.mkdir(parents=True, exist_ok=True)

    seeds = json.loads((external.REPO_ROOT / "experiments" / "seeds" / "ironclad-a0-v1.json").read_text())["partitions"]
    train_seeds, val_seeds = seeds["train"][: args.train_seeds], seeds["val"][: args.val_seeds]
    net_cfg = {"d": args.d, "layers": args.layers, "heads": 4, "d_pw": 16}
    model = N.load(resume) if resume else N.CombatNet(**net_cfg)
    model.eval()
    opt = torch.optim.Adam(model.parameters(), lr=args.lr, eps=1e-5)

    ctx = mp.get_context("spawn")
    procs, conns = [], []
    for w in range(args.workers):
        parent, child = ctx.Pipe()
        cfg = {
            "sim_root": str(sim.root), "worker_id": w, "envs": args.envs, "net": model.config, "keep_monster": args.keep_monster,
            "train_seeds": train_seeds[w::args.workers], "val_seeds": val_seeds[w::args.workers],
            "env_seed": args.seed * 7919 + 17, "hp_weight": args.hp_weight, "potion_cost": args.potion_cost, "max_steps": 300,
        }
        p = ctx.Process(target=_worker, args=(child, cfg), daemon=True)
        p.start()
        procs.append(p)
        conns.append(parent)
    ready = [c.recv() for c in conns]
    sizes = {k: sum(r[1][k] for r in ready) for k in ("train", "val")}
    nodes: dict[str, dict] = {k: {} for k in ("train", "val")}
    for r in ready:
        for split in nodes:
            for node, n in r[2][split].items():
                nodes[split][node] = nodes[split].get(node, 0) + n
    print(f"snapshot libraries: {sizes} nodes: {nodes}", flush=True)
    (out / "config.json").write_text(json.dumps({"args": vars(args), "net": model.config, "libraries": sizes, "nodes": nodes,
                                                  "simulator": sim.describe()}, indent=2) + "\n")
    log = (out / "log.jsonl").open("a", encoding="utf-8")

    def broadcast(msg_builder):
        state = {k: v.detach().clone() for k, v in model.state_dict().items()}
        for c in conns:
            c.send(msg_builder(state))

    total_steps = 0
    best = -1e9
    t_start = time.perf_counter()
    for it in range(1, args.iterations + 1):
        frac = (it - 1) / max(1, args.iterations - 1)
        lr = args.lr + (args.lr_end - args.lr) * frac
        ent_coef = args.ent + (args.ent_end - args.ent) * frac
        for g in opt.param_groups:
            g["lr"] = lr
        warm = it <= args.value_warmup
        for name, prm in model.named_parameters():
            prm.requires_grad_(not warm or name.startswith("value_head"))
        t0 = time.perf_counter()
        broadcast(lambda s: ("collect", s, args.steps, args.gamma, args.lam))
        batches = [c.recv()[1] for c in conns]
        t_collect = time.perf_counter() - t0
        data = {
            "obs": {k: np.concatenate([b["obs"][k] for b in batches]) for k in batches[0]["obs"]},
            **{k: np.concatenate([b[k] for b in batches]) for k in ("act", "logp", "adv", "ret")},
        }
        episodes = [e for b in batches for e in b["episodes"]]
        t1 = time.perf_counter()
        stats = ppo_update(model, opt, data, epochs=args.epochs, minibatch=args.minibatch, clip=args.clip, ent_coef=0.0 if warm else ent_coef,
                           vf_coef=args.vf, max_grad=0.5, target_kl=0.0 if warm else args.target_kl, value_only=warm)
        t_learn = time.perf_counter() - t1
        n = data["act"].shape[0]
        total_steps += n
        row = {"it": it, "steps": total_steps, "samples": n, "lr": round(lr, 7), "ent_coef": round(ent_coef, 5),
               "t_collect": round(t_collect, 1), "t_learn": round(t_learn, 1), "sps": round(total_steps / (time.perf_counter() - t_start)),
               "train": summarize_episodes(episodes), **stats}
        if it % args.eval_every == 0 or it == args.iterations:
            broadcast(lambda s: ("eval", s, args.eval_repeats, True))
            rows = [r for c in conns for r in c.recv()[1]]
            row["val"] = summarize_episodes(rows)
            (out / "val_latest.json").write_text(json.dumps(rows) + "\n")
            score = (row["val"]["all"].get("win") or 0.0) - (row["val"]["all"].get("hp_lost_on_win") or 0.0) * 0.25
            N.save(model, out / "latest.pt", iteration=it, steps=total_steps)
            if score > best:
                best = score
                N.save(model, out / "best.pt", iteration=it, steps=total_steps, val=row["val"]["all"])
        log.write(json.dumps(row) + "\n")
        log.flush()
        tr = row["train"]["all"]
        print(f"it {it:4d} steps {total_steps:>9,} win {tr.get('win')} (n={tr.get('n')}) boss {row['train']['BOSS'].get('win')} "
              f"elite {row['train']['ELITE'].get('win')} ent {stats['ent']:.3f} kl {stats['kl']:.4f} "
              f"collect {t_collect:.0f}s learn {t_learn:.0f}s sps {row['sps']}" + (f" | VAL {row['val']['all']}" if "val" in row else ""), flush=True)
    for c in conns:
        c.send(("close",))
    for p in procs:
        p.join(timeout=10)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
