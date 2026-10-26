"""Statistics used for honest reporting: Wilson intervals, paired bootstrap, exact McNemar."""

from __future__ import annotations

import math
from statistics import NormalDist

import numpy as np


def wilson_interval(k: int, n: int, confidence: float = 0.95) -> tuple[float, float]:
    """Wilson score interval for a binomial proportion (well behaved at k = 0 and k = n)."""
    if n <= 0:
        raise ValueError("n must be positive")
    if not 0 <= k <= n:
        raise ValueError("k must be in [0, n]")
    z = NormalDist().inv_cdf(1 - (1 - confidence) / 2)
    p = k / n
    denom = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    # At k = 0 / k = n the bound is exactly 0 / 1 mathematically; avoid float noise such as 1e-19.
    lo = 0.0 if k == 0 else max(0.0, centre - half)
    hi = 1.0 if k == n else min(1.0, centre + half)
    return lo, hi


def paired_bootstrap_ci(
    a: list[float] | np.ndarray,
    b: list[float] | np.ndarray,
    *,
    iters: int = 20000,
    confidence: float = 0.95,
    seed: int = 0,
) -> tuple[float, float, float]:
    """Mean paired difference ``mean(a - b)`` with a percentile bootstrap interval over *seeds*.

    ``a[i]`` and ``b[i]`` must come from the same seed (paired comparison).
    """
    x = np.asarray(a, dtype=float)
    y = np.asarray(b, dtype=float)
    if x.shape != y.shape or x.ndim != 1 or x.size == 0:
        raise ValueError("a and b must be equal-length non-empty 1-D sequences")
    d = x - y
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, d.size, size=(iters, d.size))
    means = d[idx].mean(axis=1)
    alpha = (1 - confidence) / 2
    lo, hi = np.quantile(means, [alpha, 1 - alpha])
    return float(d.mean()), float(lo), float(hi)


def clustered_bootstrap_ci(
    d: list[float] | np.ndarray,
    clusters: list[int] | np.ndarray,
    *,
    iters: int = 20000,
    confidence: float = 0.95,
    seed: int = 0,
    chunk: int = 500,
) -> tuple[float, float, float]:
    """Mean of ``d`` with a percentile bootstrap interval that resamples whole *clusters* (rows that share a cluster move together).

    Used where several rows are not independent draws: the five classes' games of one seed share the offer and, under the
    opening-relic rule, the relic on offer (ADR-049). ``mean`` is the plain mean of the rows, the resamples weight each cluster
    by its size, as a resample of the clusters does.
    """
    x = np.asarray(d, dtype=float)
    c = np.asarray(clusters)
    if x.ndim != 1 or x.size == 0 or c.shape != x.shape:
        raise ValueError("d and clusters must be equal-length non-empty 1-D sequences")
    _, inverse = np.unique(c, return_inverse=True)
    sums = np.bincount(inverse, weights=x)
    counts = np.bincount(inverse).astype(float)
    k = sums.size
    rng = np.random.default_rng(seed)
    means = np.empty(iters)
    for start in range(0, iters, chunk):
        m = min(chunk, iters - start)
        idx = rng.integers(0, k, size=(m, k))
        means[start : start + m] = sums[idx].sum(axis=1) / counts[idx].sum(axis=1)
    alpha = (1 - confidence) / 2
    lo, hi = np.quantile(means, [alpha, 1 - alpha])
    return float(x.mean()), float(lo), float(hi)


def mcnemar_exact(a_only: int, b_only: int) -> float:
    """Two-sided exact McNemar p-value from the discordant counts.

    ``a_only``: seeds where policy A won and B did not; ``b_only``: the reverse.
    """
    n = a_only + b_only
    if n == 0:
        return 1.0
    k = min(a_only, b_only)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2**n
    return min(1.0, 2 * tail)


def paired_win_table(a_wins: list[bool], b_wins: list[bool]) -> dict:
    if len(a_wins) != len(b_wins):
        raise ValueError("paired outcome lists must have the same length")
    both = sum(1 for x, y in zip(a_wins, b_wins) if x and y)
    a_only = sum(1 for x, y in zip(a_wins, b_wins) if x and not y)
    b_only = sum(1 for x, y in zip(a_wins, b_wins) if y and not x)
    neither = len(a_wins) - both - a_only - b_only
    return {"both": both, "a_only": a_only, "b_only": b_only, "neither": neither, "mcnemar_p": mcnemar_exact(a_only, b_only)}
