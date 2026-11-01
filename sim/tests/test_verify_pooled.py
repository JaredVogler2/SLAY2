"""`scripts/verify-pooled.py` recomputes a pooled comparison from the episode files with code that shares nothing with `slay2_sim`.

It has to agree with the pooled files the registered studies were read from (ADR-054, ADR-055 and ADR-058: published, with their batches
committed; the four files of ADR-058 were checked with it once, after `pool.sh`, and are checked here again) and has to notice when a
number of such a file is not what the episodes give.
"""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

import pytest

from slay2_sim import external

REPO = external.REPO_ROOT
SPEC = importlib.util.spec_from_file_location("verify_pooled", REPO / "scripts" / "verify-pooled.py")
assert SPEC and SPEC.loader
verify_pooled = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(verify_pooled)

ASCENSION_9 = REPO / "experiments" / "ascension9"
PUBLISHED = [
    REPO / "experiments" / "neow" / "pooled-neow-values-keep-v1-vs-rules_v2-keeprelics-val.json",
    REPO / "experiments" / "synergy" / "keep-val" / "pooled-astar-vs-d0star.json",
    ASCENSION_9 / "pooled-a9-t1-synergy-astar-vs-d0star.json",
    ASCENSION_9 / "pooled-a9-t2-values-shown-vs-rules_v1.json",
    ASCENSION_9 / "pooled-a9-t3-neow-keep-v1-vs-rules_v2.json",
    ASCENSION_9 / "pooled-a0keep-t2-values-shown-vs-rules_v1.json",
]
BATCHES = REPO / "experiments" / "batches"


@pytest.mark.parametrize("path", PUBLISHED, ids=lambda p: p.name)
def test_it_reproduces_the_published_pooled_files_from_their_episodes(path: Path) -> None:
    problems, checked = verify_pooled.verify(path, BATCHES, bootstrap=True)
    assert problems == []
    assert checked > 80


def test_the_exact_p_value_is_the_exact_binomial_tail() -> None:
    assert verify_pooled.mcnemar_exact(0, 0) == 1.0
    assert verify_pooled.mcnemar_exact(5, 5) == 1.0
    # 2 x P(X <= 1) for X ~ Binomial(10, 1/2) = 2 x 11 / 1024
    assert verify_pooled.mcnemar_exact(1, 9) == pytest.approx(22 / 1024, rel=1e-12)
    assert verify_pooled.mcnemar_exact(9, 1) == verify_pooled.mcnemar_exact(1, 9)


def test_it_notices_a_count_the_episodes_do_not_give(tmp_path: Path) -> None:
    body = json.loads(PUBLISHED[0].read_text(encoding="utf-8"))
    # one more pair that only the first arm got past the boss, in the file only
    body["reachedAct2"]["pairedTable"]["a_only"] += 1
    body["members"][0]["reachedAct2"]["pairedTable"]["neither"] -= 1
    altered = tmp_path / "altered.json"
    altered.write_text(json.dumps(body), encoding="utf-8")
    problems, _ = verify_pooled.verify(altered, BATCHES)
    text = "\n".join(problems)
    assert "pooled past the Act-1 boss a_only" in text
    assert "past the Act-1 boss neither" in text


def test_it_notices_a_p_value_that_is_not_the_exact_one(tmp_path: Path) -> None:
    body = json.loads(PUBLISHED[0].read_text(encoding="utf-8"))
    body["reachedAct2"]["pairedTable"]["mcnemar_p"] = 0.5
    altered = tmp_path / "p.json"
    altered.write_text(json.dumps(body), encoding="utf-8")
    problems, _ = verify_pooled.verify(altered, BATCHES)
    assert any("pooled past the Act-1 boss mcnemar_p" in p for p in problems)


def test_it_notices_an_interval_that_an_independent_resample_does_not_give(tmp_path: Path) -> None:
    body = json.loads(PUBLISHED[0].read_text(encoding="utf-8"))
    lo, hi = body["clusteredDifference"]["ci95"]
    body["clusteredDifference"]["ci95"] = [lo + 0.01, hi + 0.01]  # a shifted interval around the same mean
    altered = tmp_path / "shifted.json"
    altered.write_text(json.dumps(body), encoding="utf-8")
    problems, _ = verify_pooled.verify(altered, BATCHES, bootstrap=True)
    assert any("whole-seed 95 % interval" in p for p in problems)


def test_it_refuses_a_pooled_file_whose_batch_is_missing(tmp_path: Path) -> None:
    with pytest.raises(FileNotFoundError):
        verify_pooled.verify(PUBLISHED[0], tmp_path)


def synthetic_pooled(root: Path, endpoint: str) -> tuple[Path, Path]:
    """A pooled file written by `slay2_sim pool` for two classes of synthetic batches whose arms differ only at the Act-2 boss (and, for the
    endpoint `win`, in the games they win: the games that got past the Act-2 boss win), and the batches' directory."""
    from slay2_sim.compare import build_pooled_comparison, write_comparison

    from test_compare import make_batch

    batches = root / "batches"
    batches.mkdir(parents=True)
    rows_a = [(s, "death", 40, 1.0, 2 if s % 4 == 0 else 1 if s % 4 in (1, 2) else 0) for s in range(400)]
    rows_b = [(s, "death", 40, 1.0, 2 if s % 8 == 0 else 1 if s % 4 in (0, 1, 2) else 0) for s in range(400)]
    if endpoint == "win":
        rows_a = [(s, "win" if act == 2 else outcome, floor, wall, act) for s, outcome, floor, wall, act in rows_a]
        rows_b = [(s, "win" if act == 2 else outcome, floor, wall, act) for s, outcome, floor, wall, act in rows_b]
    pairs = [(make_batch(batches, f"alpha-v{k}", rows_a, character=c), make_batch(batches, f"beta-v{k}", rows_b, character=c)) for k, c in enumerate(("Ironclad", "Silent"))]
    out = root / f"pooled-{endpoint}.json"
    write_comparison(build_pooled_comparison(pairs, iters=2000, confidence=0.975, endpoint=endpoint), out)
    return out, batches


def test_it_follows_the_endpoint_a_pooled_file_names_and_notices_a_difference_of_the_wrong_one(tmp_path: Path) -> None:
    for endpoint in ("act1", "act2"):
        path, batches = synthetic_pooled(tmp_path / endpoint, endpoint)
        problems, checked = verify_pooled.verify(path, batches, bootstrap=True)
        assert problems == [] and checked > 40, (endpoint, problems)
    path, batches = synthetic_pooled(tmp_path / "again", "act2")
    body = json.loads(path.read_text(encoding="utf-8"))
    assert body["clusteredDifference"]["endpoint"] == "act2"
    body["clusteredDifference"]["meanAMinusB"] = 0.0  # the Act-1 difference of these arms, under a file that says Act-2
    wrong = tmp_path / "wrong-endpoint.json"
    wrong.write_text(json.dumps(body), encoding="utf-8")
    problems, _ = verify_pooled.verify(wrong, batches)
    assert any("pooled difference of the shares" in p for p in problems)
    body["clusteredDifference"]["endpoint"] = "act3"
    wrong.write_text(json.dumps(body), encoding="utf-8")
    problems, _ = verify_pooled.verify(wrong, batches)
    assert any("endpoint of the whole-seed interval" in p for p in problems)


def test_it_follows_the_wins_endpoint_of_adr_061_and_notices_a_difference_of_another_one(tmp_path: Path) -> None:
    path, batches = synthetic_pooled(tmp_path / "win", "win")
    problems, checked = verify_pooled.verify(path, batches, bootstrap=True)
    assert problems == [] and checked > 40, problems
    body = json.loads(path.read_text(encoding="utf-8"))
    assert body["clusteredDifference"]["endpoint"] == "win" and body["wins"]["a"] > body["wins"]["b"] > 0
    body["clusteredDifference"]["meanAMinusB"] = 0.0  # the Act-1 difference of these arms (none), under a file that says wins
    wrong = tmp_path / "wrong-win.json"
    wrong.write_text(json.dumps(body), encoding="utf-8")
    problems, _ = verify_pooled.verify(wrong, batches)
    assert any("pooled difference of the shares" in p for p in problems)
