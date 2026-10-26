"""Does a small neural network predict "gets past the Act-1 boss" better than the additive card-value model? (ADR-031)

Same data, same features, same grouped folds as ``cardvalue``; the network is a ReLU MLP trained with AdamW, dropout and early
stopping on an inner group-wise validation split, averaged over three initialisations. If interactions between cards mattered
at this sample size, its held-out log loss would beat the ridge-logistic's; if it does not, the additive values stay.

    python -m slay2_sim.cardvalue_nn --batches experiments/cardvalue/explore-ironclad-a0-train-rep0 \\
        --out experiments/cardvalue/mlp-vs-ridge-ironclad-a0-v1.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from . import cardvalue as cv

FOLDS = cv.FOLDS
CONFIGS = (
    {"hidden": (64, 32), "weight_decay": 1e-2, "dropout": 0.3},
    {"hidden": (32,), "weight_decay": 1e-2, "dropout": 0.2},
    {"hidden": (128, 64), "weight_decay": 3e-2, "dropout": 0.5},
)


def _standardise(X: np.ndarray, penalised: np.ndarray) -> np.ndarray:
    mu, sd = X.mean(0), X.std(0)
    sd[sd == 0] = 1.0
    mu[penalised] = 0.0
    sd[penalised] = 1.0  # card counts stay counts
    mu[0], sd[0] = 0.0, 1.0  # the intercept column stays 1
    return ((X - mu) / sd).astype(np.float32)


def mlp_predict(Z, y, g, train, test, *, hidden, weight_decay, dropout, seed, epochs=200, lr=3e-3, patience=25):
    import torch

    torch.set_num_threads(1)
    torch.manual_seed(seed)
    Xt, yt = torch.tensor(Z[train]), torch.tensor(y[train], dtype=torch.float32)
    inner = torch.tensor((g[train] // 7) % 5 == 0)  # early stopping on whole games the fit never sees
    Xa, ya, Xv, yv = Xt[~inner], yt[~inner], Xt[inner], yt[inner]
    layers, d = [], Z.shape[1]
    for h in hidden:
        layers += [torch.nn.Linear(d, h), torch.nn.ReLU(), torch.nn.Dropout(dropout)]
        d = h
    net = torch.nn.Sequential(*layers, torch.nn.Linear(d, 1))
    opt = torch.optim.AdamW(net.parameters(), lr=lr, weight_decay=weight_decay)
    loss_fn = torch.nn.BCEWithLogitsLoss()
    best, best_state, bad = float("inf"), None, 0
    for _ in range(epochs):
        net.train()
        perm = torch.randperm(len(Xa))
        for i in range(0, len(Xa), 128):
            idx = perm[i:i + 128]
            opt.zero_grad()
            loss_fn(net(Xa[idx]).squeeze(-1), ya[idx]).backward()
            opt.step()
        net.eval()
        with torch.no_grad():
            v = loss_fn(net(Xv).squeeze(-1), yv).item()
        if v < best - 1e-4:
            best, bad, best_state = v, 0, {k: t.clone() for k, t in net.state_dict().items()}
        else:
            bad += 1
            if bad >= patience:
                break
    net.load_state_dict(best_state)
    net.eval()
    with torch.no_grad():
        return torch.sigmoid(net(torch.tensor(Z[test])).squeeze(-1)).numpy()


def compare(records: list[dict], *, l2: float | None = None, inits: int = 3) -> dict:
    vocab = cv.vocabulary(records)
    X, y, g, names, penalised = cv.design(records, vocab)
    fold = g % FOLDS
    Z = _standardise(X, penalised)
    l2 = l2 if l2 is not None else cv.cross_validate(X, y, g, penalised)["best_l2"]

    def score(predictor) -> dict:
        total, n, scores, labels = 0.0, 0, [], []
        for k in range(FOLDS):
            tr, te = fold != k, fold == k
            p = predictor(tr, te)
            total += cv.log_loss(y[te], p) * int(te.sum())
            n += int(te.sum())
            scores.append(p)
            labels.append(y[te])
        return {"log_loss": total / n, "auc": cv.auc(np.concatenate(labels), np.concatenate(scores))}

    ridge = score(lambda tr, te: cv.predict(X[te], cv.fit_logistic(X[tr], y[tr], l2, penalised)))
    nets = []
    for conf in CONFIGS:
        res = score(lambda tr, te, conf=conf: np.mean([mlp_predict(Z, y, g, tr, te, seed=s, **conf) for s in range(inits)], axis=0))
        nets.append({"config": {**conf, "hidden": list(conf["hidden"])}, **res})
    best = min(nets, key=lambda r: r["log_loss"])
    return {
        "schema": 1, "kind": "card-value-model-comparison", "rows": int(len(y)), "features": int(X.shape[1]), "folds": FOLDS,
        "ridge": {"l2": l2, **ridge}, "mlp": nets,
        "verdict": "the network is better than the additive model" if best["log_loss"] < ridge["log_loss"] - 0.005
        else "no network beat the additive ridge-logistic on held-out games (interactions are not recoverable at this sample size)",
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--batches", nargs="+", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args(argv)
    out = Path(args.out).resolve()
    records = [r for d in args.batches for r in cv.extract(cv.read_episodes(Path(d).resolve()))]
    result = compare(records)
    out.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"ridge": result["ridge"], "mlp": [(m["config"]["hidden"], round(m["log_loss"], 4), round(m["auc"], 4)) for m in result["mlp"]], "verdict": result["verdict"]}, indent=1))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
