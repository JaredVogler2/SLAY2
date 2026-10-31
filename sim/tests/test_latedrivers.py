"""`slay2_sim.latedrivers` reads the same run at the Act-1 boss and at the Act-2 boss.

The pieces are small and each is checked against a number worked out by hand or against a synthetic run whose answer is known; the
committed file of the insights page is checked against the committed batches it was fitted from (a stale or edited file fails).
"""

from __future__ import annotations

import gzip
import json
import math
from pathlib import Path

import numpy as np
import pytest

from slay2_sim import latedrivers as ld

REPO = Path(__file__).resolve().parents[2]
CATALOG = REPO / "packages" / "game-data" / "data" / "cards.sts2-main-0.107.1.json"
COMMITTED = REPO / "experiments" / "insights" / "late-drivers.json"

TABLE = {
    "STRIKE_IRONCLAD": ("attack", "basic"),
    "DEFEND_IRONCLAD": ("skill", "basic"),
    "BASH": ("attack", "basic"),
    "INFLAME": ("power", "uncommon"),
    "SHRUG_IT_OFF": ("skill", "common"),
    "DAZED": ("status", "status"),
}


def test_a_deck_is_counted_by_type_starters_and_upgrades() -> None:
    deck = {"STRIKE_IRONCLAD": 4, "DEFEND_IRONCLAD": 4, "BASH+": 1, "INFLAME": 1, "SHRUG_IT_OFF+": 2, "DAZED": 1, "NOT_IN_THE_CATALOG": 2}
    f = ld.deck_features(deck, TABLE)
    assert f["attacks"] == 5  # four Strikes and the upgraded Bash
    assert f["skills"] == 6  # four Defends and two Shrug It Off
    assert f["powers"] == 1
    assert f["other"] == 3  # the status and the two cards the catalog does not know
    assert f["starters"] == 9  # Strikes, Defends and Bash are basic
    assert f["upgraded"] == 3


def _episode(seed: int, outcome: str, floor: int, fights: list[dict], character: str = "Ironclad") -> dict:
    return {"seed": seed, "outcome": outcome, "floor": floor, "character": character, "extra": {"boss_fights": fights}}


def _fight(act: int, floor: int, deck: dict | None = None, hp: int = 60, max_hp: int = 80, potions: int = 1, relics: int = 3, gold: int = 100) -> dict:
    return {"act": act, "floor": floor, "deck": deck or {"STRIKE_IRONCLAD": 5}, "hp": hp, "max_hp": max_hp, "potions": potions, "relics": ["R"] * relics, "gold": gold}


def _write(tmp_path: Path, name: str, episodes: list[dict]) -> Path:
    d = tmp_path / name
    d.mkdir()
    with gzip.open(d / "episodes.jsonl.gz", "wt", encoding="utf-8") as fh:
        for e in episodes:
            fh.write(json.dumps(e) + "\n")
    return d


def test_a_boss_fight_is_passed_when_the_run_goes_on_past_its_floor_or_is_won(tmp_path: Path) -> None:
    episodes = [
        _episode(1, "death", 16, [_fight(0, 16)]),  # died in the Act-1 boss fight: not passed
        _episode(2, "death", 22, [_fight(0, 16), _fight(1, 33)]),  # passed the first boss, died before the second boss's floor ends: line 1 not passed
        _episode(3, "death", 34, [_fight(0, 16), _fight(1, 33)]),  # went on past the second boss
        _episode(4, "win", 51, [_fight(0, 16), _fight(1, 33), _fight(2, 50)]),  # a win passes everything; the third boss is not a line here
        _episode(5, "timeout", 40, [_fight(0, 16)]),  # never counted
        _episode(6, "death", 5, []),  # never reached a boss: not in the sample
    ]
    recs = ld.runs([_write(tmp_path, "b", episodes)], TABLE)
    by_seed = {r["seed"]: r for r in recs}
    assert sorted(by_seed) == [1, 2, 3, 4]
    assert by_seed[1]["lines"][0]["passed"] == 0
    assert by_seed[2]["lines"][0]["passed"] == 1 and by_seed[2]["lines"][1]["passed"] == 0
    assert by_seed[3]["lines"][1]["passed"] == 1
    assert by_seed[4]["lines"][0]["passed"] == 1 and by_seed[4]["lines"][1]["passed"] == 1
    assert set(by_seed[4]["lines"]) == {0, 1}


def test_the_boss_floors_are_the_ones_the_runs_record(tmp_path: Path) -> None:
    episodes = [
        _episode(1, "death", 16, [_fight(0, 16)]),
        _episode(2, "death", 40, [_fight(0, 16), _fight(1, 31)]),
        _episode(3, "win", 51, [_fight(0, 16), _fight(1, 31), _fight(2, 45)]),
        _episode(4, "timeout", 3, []),  # a run with no boss fight says nothing
    ]
    assert ld.boss_floors([_write(tmp_path, "b", episodes)]) == [16, 31, 45]
    # a second batch adds fights, never a different floor
    more = [_episode(5, "death", 33, [_fight(0, 16), _fight(1, 31)])]
    assert ld.boss_floors([_write(tmp_path, "b1", episodes), _write(tmp_path, "b2", more)]) == [16, 31, 45]


def test_a_boss_floor_that_is_missing_or_ambiguous_is_an_error_not_a_guess(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="act 3"):  # no third-act boss fight in the data
        ld.boss_floors([_write(tmp_path, "a", [_episode(1, "death", 40, [_fight(0, 16), _fight(1, 31)])])])
    with pytest.raises(ValueError, match="act 2"):  # two floors for one act
        ld.boss_floors([_write(tmp_path, "b", [_episode(1, "death", 40, [_fight(0, 16), _fight(1, 31)]), _episode(2, "death", 40, [_fight(0, 16), _fight(1, 32), _fight(2, 45)])])])
    with pytest.raises(ValueError, match="increasing"):
        ld.boss_floors([_write(tmp_path, "c", [_episode(1, "win", 60, [_fight(0, 31), _fight(1, 16), _fight(2, 45)])])])


def test_the_logistic_fit_recovers_known_coefficients() -> None:
    rng = np.random.default_rng(7)
    n = 40000
    x = rng.normal(size=(n, 2))
    true = np.array([-0.4, 0.8, -0.5])
    X = np.column_stack([np.ones(n), x])
    y = (rng.random(n) < 1 / (1 + np.exp(-(X @ true)))).astype(float)
    beta = ld.fit_logistic(X, y, np.ones(n), ridge=1e-9)
    assert beta == pytest.approx(true, abs=0.04)
    # a weight of two is two copies of the row
    w = np.where(np.arange(n) < n // 2, 2.0, 0.0)
    doubled = ld.fit_logistic(X, y, w, ridge=1e-9)
    stacked = ld.fit_logistic(np.vstack([X[: n // 2], X[: n // 2]]), np.concatenate([y[: n // 2]] * 2), np.ones(n), ridge=1e-9)
    assert doubled == pytest.approx(stacked, abs=1e-6)


def _synthetic(n: int, seed: int) -> list[dict]:
    """Runs whose Act-1 odds rise with upgraded cards and whose Act-2 odds do not, and whose HP matters at both lines."""
    rng = np.random.default_rng(seed)
    out = []
    for i in range(n):
        up = int(rng.integers(0, 6))
        hp = float(rng.uniform(0.3, 1.0))
        base = {"attacks": 6.0, "skills": 5.0, "powers": 1.0, "other": 0.0, "starters": 6.0}
        x1 = {**base, "upgraded": float(up), "hp": hp, "max_hp": 80.0, "potions": 1.0, "relics": 3.0, "gold": 100.0}
        p1 = 1 / (1 + np.exp(-(-0.2 + 0.6 * up + 2.0 * (hp - 0.65))))
        passed1 = int(rng.random() < p1)
        rec: dict = {"seed": i, "character": "Ironclad", "lines": {0: {"x": x1, "passed": passed1}}}
        if passed1 or rng.random() < 0.3:
            hp2 = float(rng.uniform(0.3, 1.0))
            x2 = {**x1, "hp": hp2}
            p2 = 1 / (1 + np.exp(-(-1.0 + 0.0 * up + 2.0 * (hp2 - 0.65))))
            rec["lines"][1] = {"x": x2, "passed": int(rng.random() < p2)}
        out.append(rec)
    return out


def test_it_finds_a_feature_that_matters_at_one_line_and_not_the_other() -> None:
    res = ld.analyse(_synthetic(6000, 3), draws=60, seed=11, per_class=False)
    feats = {f["id"]: f for f in res["features"]}
    up = feats["upgraded"]
    assert up["act1"]["oddsRatio"] > 1.5  # about e^0.6
    assert 0.9 < up["act2"]["oddsRatio"] < 1.15
    assert up["difference"]["ci95"][1] < 0  # whole interval below zero: less at the second line
    hp = feats["hp"]
    assert hp["act1"]["oddsRatio"] > 1.0 and hp["act2"]["oddsRatio"] > 1.0  # both lines
    assert res["endpoints"]["act1"]["runs"] == 6000
    assert res["endpoints"]["act2"]["runs"] == sum(1 for r in _synthetic(6000, 3) if 1 in r["lines"])


def test_the_analysis_is_reproducible_from_its_seed() -> None:
    a = ld.analyse(_synthetic(1500, 5), draws=20, seed=3, per_class=False)
    b = ld.analyse(_synthetic(1500, 5), draws=20, seed=3, per_class=False)
    assert a == b


def _assert_same(expected: object, actual: object, path: str = "", rel: float = 1e-9) -> None:
    """Equal in structure, types, ids, counts and hashes; fitted numbers equal to a relative `rel`.

    The last digits of a float fit depend on the machine's BLAS: one numpy rebuilds this file with the AVX-512, AVX2 and SSE kernels of
    OpenBLAS to values that differ by up to 5e-14 (relative) in 185 to 191 of its 234 floats, and the continuous-integration runner's
    numbers differ from the committed ones the same way. 1e-9 is far above that and far below anything a changed batch, seed or line of
    code would move.
    """
    if isinstance(expected, dict):
        assert isinstance(actual, dict), f"{path}: {type(actual).__name__} is not a mapping"
        assert expected.keys() == actual.keys(), f"{path}: keys differ by {sorted(expected.keys() ^ actual.keys())}"
        for key in expected:
            _assert_same(expected[key], actual[key], f"{path}/{key}", rel)
    elif isinstance(expected, list):
        assert isinstance(actual, list) and len(expected) == len(actual), f"{path}: lists of different length"
        for i, (e, a) in enumerate(zip(expected, actual)):
            _assert_same(e, a, f"{path}[{i}]", rel)
    elif isinstance(expected, float):
        assert isinstance(actual, float), f"{path}: {expected!r} is a float and {actual!r} is not"
        assert math.isclose(expected, actual, rel_tol=rel, abs_tol=1e-12), f"{path}: {expected!r} vs {actual!r}"
    else:
        assert type(expected) is type(actual) and expected == actual, f"{path}: {expected!r} != {actual!r}"


def test_the_comparison_of_two_fits_ignores_rounding_and_nothing_else() -> None:
    base = {"n": 3, "id": "a", "xs": [1.0, 2.5], "d": {"beta": 0.123456789012345}, "none": None}
    rounded = {**base, "xs": [1.0 + 1e-13, 2.5], "d": {"beta": 0.123456789012345 * (1 + 5e-14)}}
    _assert_same(base, rounded)
    for bad in (
        {**base, "n": 4},  # a count
        {**base, "n": 3.0},  # a count that became a float
        {**base, "id": "b"},  # an id
        {**base, "xs": [1.0, 2.5, 3.0]},  # a list of another length
        {**base, "xs": [1.0 + 1e-6, 2.5]},  # a fitted number that moved
        {**base, "d": {}},  # a missing key
        {**base, "extra": 1},  # an extra key
        {**base, "none": 0.0},  # None became a number
    ):
        with pytest.raises(AssertionError):
            _assert_same(base, bad)


def test_the_committed_file_is_what_the_committed_batches_give() -> None:
    committed = json.loads(COMMITTED.read_text(encoding="utf-8"))
    assert committed["kind"] == "late-drivers" and committed["role"] == "exploratory"
    batches = [REPO / "experiments" / "cardvalue" / b["batchId"] for b in committed["batches"]]
    assert all(b.exists() for b in batches), "a batch the file was fitted from is missing"
    # the counts are recomputed here without the module's own functions
    reach = [0, 0]
    passed = [0, 0]
    floors: dict[int, set[int]] = {0: set(), 1: set(), 2: set()}
    for b in batches:
        with gzip.open(b / "episodes.jsonl.gz", "rt", encoding="utf-8") as fh:
            for line in fh:
                ep = json.loads(line)
                for f in (ep.get("extra") or {}).get("boss_fights") or []:
                    floors[f["act"]].add(f["floor"])
                if ep["outcome"] not in ("death", "win"):
                    continue
                seen: set[int] = set()
                for f in (ep.get("extra") or {}).get("boss_fights") or []:
                    if f["act"] in (0, 1) and f["act"] not in seen:
                        seen.add(f["act"])
                        reach[f["act"]] += 1
                        passed[f["act"]] += int(ep["outcome"] == "win" or ep["floor"] > f["floor"])
    assert (committed["endpoints"]["act1"]["runs"], committed["endpoints"]["act1"]["passed"]) == (reach[0], passed[0])
    assert (committed["endpoints"]["act2"]["runs"], committed["endpoints"]["act2"]["passed"]) == (reach[1], passed[1])
    assert all(len(s) == 1 for s in floors.values()) and committed["bossFloors"] == [next(iter(floors[a])) for a in (0, 1, 2)]
    # and the whole file is what the module writes now (the same draws, the same seed), up to the rounding of the machine's BLAS
    rebuilt = json.loads(json.dumps(ld.build(batches, CATALOG, committed["bootstrap"]["draws"])))
    _assert_same(committed, rebuilt)
