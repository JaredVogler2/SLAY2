"""MAP-1 to MAP-5 (docs/game/MECHANICS-COVERAGE.md, section 11): the simulator's act maps against the rules read from the game's source.

The rules were read from the decompiled generator (E1) and the pinned simulator ports that generator. Agreement checks both
readings, and it checks that the maps the simulated games walk obey what the route tools assume. The check function is
exercised on a corrupted map as well: a test that cannot fail proves nothing.
"""

from __future__ import annotations

import collections

import pytest

SEEDS = range(4)
ASCENSIONS = (0, 1)
ACTS = (0, 1, 2)
ROOMS = {0: 15, 1: 14, 2: 13}  # MAP-1: Overgrowth, Hive, Glory (solo)
UNKNOWN_RANGE = {0: (10, 14), 1: (9, 13), 2: (9, 13)}  # MAP-4
REST_TARGET_MAX = {0: 7, 1: 7, 2: 6}


def violations(act_map, rooms: int, ascension: int, act: int) -> list[str]:
    from sts2_env.core.enums import MapPointType as T

    found: list[str] = []
    points = act_map.all_points()
    nodes = [p for p in points if p.point_type not in (T.ANCIENT, T.BOSS)]
    rows: dict[int, list] = collections.defaultdict(list)
    for p in nodes:
        rows[p.row].append(p)
    boss = act_map.boss_point
    last = rooms
    if max(rows) != last or min(rows) != 1:
        found.append(f"MAP-1 rooms span rows {min(rows)}..{max(rows)}, expected 1..{last}")
    if boss.row != last + 1 or boss.col != 3:
        found.append(f"MAP-1 boss at ({boss.col},{boss.row})")
    if {c.row for c in act_map.start_point.children} != {1}:
        found.append("MAP-1 the Ancient node must lead to row 1 only")
    if set(boss.parents) != set(rows[last]):
        found.append("MAP-1 the boss's parents must be exactly the last room row")
    if any(p.point_type != T.MONSTER for p in rows[1]):
        found.append("MAP-3 row 1 must be monster fights")
    if any(p.point_type != T.REST_SITE for p in rows[last]):
        found.append("MAP-3 the last room row must be rest sites")
    treasure_row = last - 6
    if any(p.point_type != T.TREASURE for p in rows[treasure_row]):
        found.append(f"MAP-3 row {treasure_row} must be treasure rooms")
    if any(p.point_type == T.TREASURE and p.row != treasure_row for p in nodes):
        found.append("MAP-3 treasure rooms exist only on the treasure row")
    if any(p.point_type in (T.REST_SITE, T.ELITE) and p.row < 6 for p in nodes):
        found.append("MAP-5 rest site or elite among the first five rooms")
    if any(p.point_type == T.REST_SITE and p.row in (last - 2, last - 1) for p in nodes):
        found.append("MAP-5 rest site on row R-2 or R-1")
    for p in nodes:
        for c in p.children:
            if c is not boss and (c.row != p.row + 1 or abs(c.col - p.col) > 1):
                found.append(f"MAP-2 edge ({p.col},{p.row}) -> ({c.col},{c.row})")
            if c.point_type == p.point_type and p.point_type in (T.ELITE, T.REST_SITE, T.TREASURE, T.SHOP):
                found.append(f"MAP-5 {p.point_type.name} next to {c.point_type.name} at row {p.row}")
        siblings = {s.point_type for s in p.siblings()}
        if p.point_type in (T.REST_SITE, T.UNKNOWN, T.ELITE, T.SHOP) and p.point_type in siblings:
            found.append(f"MAP-5 two {p.point_type.name} siblings at row {p.row}")
    count = collections.Counter(p.point_type for p in nodes)
    if count[T.SHOP] != 3:
        found.append(f"MAP-4 {count[T.SHOP]} shops")
    if count[T.ELITE] > (8 if ascension >= 1 else 5):
        found.append(f"MAP-4 {count[T.ELITE]} elites")
    hi = UNKNOWN_RANGE[act][1]  # pruning can leave a map below the target, never above it
    if not 1 <= count[T.UNKNOWN] <= hi:
        found.append(f"MAP-4 {count[T.UNKNOWN]} unknown rooms")
    extra_rests = sum(1 for p in nodes if p.point_type == T.REST_SITE and p.row != last)
    if extra_rests > REST_TARGET_MAX[act]:
        found.append(f"MAP-4 {extra_rests} rest sites besides the last row")
    return found


def make(act: int, ascension: int, seed: int):
    from sts2_env.core.rng import Rng
    from sts2_env.map.generator import generate_act_map

    return generate_act_map(ROOMS[act], Rng(1000003 * seed + 17 * act + ascension), ascension_level=ascension, act_index=act)


@pytest.mark.parametrize("act", ACTS)
@pytest.mark.parametrize("ascension", ASCENSIONS)
def test_simulator_maps_obey_the_rules_read_from_the_source(sim, act, ascension):
    for seed in SEEDS:
        assert violations(make(act, ascension, seed), ROOMS[act], ascension, act) == [], f"act {act} A{ascension} seed {seed}"


def test_the_checker_catches_a_corrupted_map(sim):
    from sts2_env.core.enums import MapPointType as T

    m = make(0, 0, 0)
    assert violations(m, 15, 0, 0) == []
    row3 = next(p for p in m.all_points() if p.row == 3 and p.point_type not in (T.ANCIENT, T.BOSS))
    row3.point_type = T.ELITE
    assert any("MAP-5 rest site or elite among the first five rooms" in v for v in violations(m, 15, 0, 0))
    row1 = next(p for p in m.all_points() if p.row == 1)
    row1.point_type = T.SHOP
    assert any("MAP-3 row 1" in v for v in violations(m, 15, 0, 0))
