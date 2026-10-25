"""The Python oracle must reproduce the published tables on its own (it is the independent arbiter for packages/odds)."""

import json
from fractions import Fraction as F
from pathlib import Path

import pytest

from slay2_sim import oracle_odds as o

PUBLISHED = json.loads((Path(__file__).resolve().parents[2] / "packages" / "odds" / "test" / "fixtures" / "published.json").read_text())


def pct(s: str) -> F:
    return F(s) / 100


@pytest.mark.parametrize(
    "key,room,scarcity",
    [("regularRarePercent", "regular", False), ("eliteRarePercent", "elite", False), ("regularA7RarePercent", "regular", True), ("eliteA7RarePercent", "elite", True)],
)
def test_published_offset_table(key, room, scarcity):
    t = PUBLISHED["offsetTable"]
    for k, want in zip(t["counters"], t[key]):
        assert o.card_pmf({"kind": "encounter", "room": room}, k, scarcity)["rare"] == pct(want)


def test_shifted_boundary_and_other_sources():
    pmf = o.card_pmf({"kind": "encounter", "room": "regular"}, 0, False)
    assert (pmf["rare"], pmf["uncommon"], pmf["common"]) == (F(0), F(35, 100), F(65, 100))
    other = o.card_pmf({"kind": "base", "table": "regular"}, 0, False)
    assert (other["rare"], other["uncommon"], other["common"]) == (F(3, 100), F(34, 100), F(63, 100))
    boss = o.card_pmf({"kind": "encounter", "room": "boss"}, 7, False)
    assert boss["rare"] == 1


def test_after_rare_and_boss_reset():
    elite = o.pack_summary({"kind": "encounter", "room": "elite"}, 0, 3, False)
    assert f"{float(elite['atLeastOneRare']) * 100:.2f}" == "16.95"
    regular = o.pack_summary({"kind": "encounter", "room": "regular"}, 0, 3, False)
    assert regular["atLeastOneRare"] == 0
    boss = o.pack_summary({"kind": "encounter", "room": "boss"}, 30, 3, False)
    assert boss["endCounter"] == {0: F(1)}


def test_published_unknown_room_rows():
    rows = PUBLISHED["unknownRoomTablePercent"]["rows"]
    for n, row in enumerate(rows):
        post, _ = o.unknown_posterior([{}] * n)
        got = o.unknown_forecast(post)
        for k, want in row.items():
            decimals = len(str(want).split(".")[1]) if "." in str(want) else 0
            assert abs(float(got[k]) * 100 - float(want)) <= 0.5 * 10 ** -decimals + 1e-9, (n, k)


def test_published_economy():
    rem = PUBLISHED["cardRemoval"]
    for n, c in enumerate(rem["a0"]):
        assert o.removal_cost(n, 0) == c
    for n, c in enumerate(rem["a6"]):
        assert o.removal_cost(n, 6) == c
    for room, (lo, hi) in PUBLISHED["gold"]["a3"].items():
        assert o.gold_range(room, 3) == (lo, hi)
    for room, (lo, hi) in PUBLISHED["gold"]["a0"].items():
        assert o.gold_range(room, 0) == (lo, hi)


def test_published_price_ranges():
    ranges = PUBLISHED["shopPriceRanges"]
    for rarity, base in (("common", 50), ("uncommon", 75), ("rare", 150)):
        pmf = o.price_pmf(base, 95, 105)
        lo, hi = ranges["card"][rarity]
        assert min(pmf) == lo and hi - 1 <= max(pmf) <= hi
        assert sum(pmf.values()) == 1
    for rarity, base in (("common", 175), ("uncommon", 225), ("rare", 275), ("shop", 200)):
        pmf = o.price_pmf(base, 85, 115)
        assert (min(pmf), max(pmf)) == tuple(ranges["relic"][rarity])


def test_golden_file_is_reproducible(tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    assert o.write_golden(a) == o.write_golden(b) > 700
    assert a.read_bytes() == b.read_bytes()
    committed = Path(__file__).resolve().parents[2] / "packages" / "odds" / "test" / "fixtures" / "golden-python.json"
    assert committed.read_bytes() == a.read_bytes(), "regenerate with: python -m slay2_sim oracle"
