"""`scripts/studies/thresh/screen_sim.py`: the development screen's rule, applied to drawn counts, advances what the rule says it advances."""

from __future__ import annotations

import importlib.util

import pytest

from slay2_sim import external
from slay2_sim import threshstudy as ts

REPO = external.REPO_ROOT
SPEC = importlib.util.spec_from_file_location("thresh_screen_sim", REPO / "scripts" / "studies" / "thresh" / "screen_sim.py")
assert SPEC and SPEC.loader
sim = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(sim)


def test_the_worlds_name_one_net_for_every_threshold_of_the_grid():
    assert all(len(w) == len(ts.GRID) for w in sim.WORLDS.values()) and sim.D_VS_S == 195 and sim.HEAD_PAIRS == (60, 130, 195)


def test_nothing_is_advanced_where_every_threshold_loses_or_where_0_2_is_far_the_best():
    losing = sim.simulate((-60,) * 6, 130, draws=2000)
    assert losing["advance"] < 0.005                                      # the largest net is below zero: the first condition of the rule fails (a net of 60 is 4.5 standard deviations)
    best_is_02 = sim.simulate((0, 90, 0, 0, 0, 0), 130, draws=2000)
    assert best_is_02["advance"] < 0.01 and best_is_02["chose"]["t020"] == 0.0     # 0.2 is never advanced: it is tested anyway (T1)


def test_a_high_peak_is_found_and_the_nomination_is_generous_where_there_is_no_effect():
    null = sim.simulate((0,) * 6, 130, draws=6000)                        # arms that share the noise of the games they share
    assert 0.15 < null["advance"] < 0.38, null                            # the best of six noisy nets is above zero most of the time and the head-to-head reads the same data
    upper = sim.simulate((0,) * 6, 130, draws=6000, model="independent")
    assert 0.40 < upper["advance"] < 0.65 and upper["advance"] > null["advance"], upper     # independent arms: the upper bound
    high = sim.simulate(sim.WORLDS["a high peak at 0.3: +60 against +22 at 0.2"], 130, draws=6000)
    assert high["advance"] > 0.9 and high["chose"]["t030"] > 0.85, high
    assert abs(sum(null["chose"].values()) - null["advance"]) < 1e-12 and set(null["chose"]) == set(ts.GRID)
    assert null["chose"]["t020"] == 0.0 and upper["chose"]["t020"] == 0.0
    # 0.2 well ahead of its neighbours is rarely displaced
    assert sim.simulate(sim.WORLDS["0.2 is best: +22 at 0.2, less elsewhere"], 130, draws=6000)["advance"] < 0.10


def test_a_draw_is_reproducible_and_the_models_have_the_variance_the_text_says():
    for model in ("shared", "independent"):
        a = sim.simulate((0,) * 6, 130, draws=3000, seed=1, model=model)
        assert a == sim.simulate((0,) * 6, 130, draws=3000, seed=1, model=model)
    # independent arms: fewer discordant pairs between the choice and 0.2 make the head-to-head easier to pass
    few = sim.simulate((0,) * 6, 60, draws=6000, model="independent")["advance"]
    many = sim.simulate((0,) * 6, 195, draws=6000, model="independent")["advance"]
    assert few > many
    # the shared model: the nets have variance D and two of them differ with variance H (the number of pairs in which the two arms differ)
    import numpy as np

    rng = np.random.default_rng(3)
    d, h = sim.D_VS_S, 130
    rho = 1.0 - h / (2.0 * d)
    shared = rng.standard_normal((200_000, 1))
    own = rng.standard_normal((200_000, 6))
    net = np.sqrt(d) * (np.sqrt(rho) * shared + np.sqrt(1.0 - rho) * own)
    assert abs(net[:, 0].var() / d - 1.0) < 0.02 and abs((net[:, 0] - net[:, 1]).var() / h - 1.0) < 0.02
    with pytest.raises(AssertionError):
        sim.simulate((0,) * 6, 130, draws=10, model="other")


def test_the_table_is_printed(capsys):
    assert sim.main() == 0
    text = capsys.readouterr().out
    assert text.count("| world (true net wins against S) | H = 60 | H = 130 | H = 195 |") == 2 and text.count("\n| ") >= 12
    assert "arms that share the noise of the games they share" in text and "arms drawn independently" in text


def test_the_simulated_rate_of_discordant_pairs_is_adr_061_s():
    spec = importlib.util.spec_from_file_location("thresh_power_for_sim", REPO / "scripts" / "studies" / "thresh" / "power.py")
    assert spec and spec.loader
    power = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(power)
    assert power.rates()["d"] == sim.D_VS_S
