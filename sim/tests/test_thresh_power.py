"""`scripts/studies/thresh/power.py`: the power tables of ADR-062 are computed from the committed result of ADR-061, and the arithmetic is the project's."""

from __future__ import annotations

import importlib.util
import random

import pytest

from slay2_sim import external
from slay2_sim.stats import mcnemar_exact

REPO = external.REPO_ROOT
SPEC = importlib.util.spec_from_file_location("thresh_power", REPO / "scripts" / "studies" / "thresh" / "power.py")
assert SPEC and SPEC.loader
pw = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pw)


@pytest.mark.parametrize("a,b", [(0, 0), (1, 0), (5, 5), (9, 2), (2, 9), (60, 40), (119, 76), (300, 250)])
def test_the_exact_p_is_the_projects(a, b):
    assert abs(pw.exact_p(a, b) - mcnemar_exact(a, b)) < 1e-12


@pytest.mark.parametrize("n,alpha", [(20, 0.05), (60, 0.05 / 3), (100, 0.0125), (195, 0.05 / 3), (400, 0.05)])
def test_the_critical_count_is_the_smallest_that_passes(n, alpha):
    c = pw.critical(n, alpha)
    assert c is not None and c > n / 2
    assert mcnemar_exact(c, n - c) < alpha <= mcnemar_exact(c - 1, n - c + 1)


def test_a_test_with_too_few_discordant_pairs_cannot_pass():
    assert pw.critical(5, 0.05 / 3) is None and pw.power_exact(5, 0.99, 0.05 / 3) == 0.0


def test_the_power_is_the_size_without_an_effect_and_near_one_with_a_large_one():
    assert pw.power_exact(195, 0.5, 0.05 / 3) < 0.05 / 3 / 2 + 1e-9        # an arm ahead: half of the two-sided size
    assert pw.power_exact(195, 0.9, 0.05 / 3) > 0.999
    assert pw.power_interval(195, 0.5, 5744, 0.05 / 3) < 0.02 and pw.power_interval(195, 0.9, 5744, 0.05 / 3) > 0.99
    assert pw.power_exact(195, 0.6, 0.05) > pw.power_exact(195, 0.6, 0.05 / 3)     # a looser level is never less powerful


def test_the_binomial_enumeration_agrees_with_a_simulation():
    rng = random.Random(20261102)
    d, theta, alpha, draws = 80, 0.68, 0.05 / 3, 40_000
    passed = sum(1 for _ in range(draws) if (lambda a: a > d - a and mcnemar_exact(a, d - a) < alpha)(sum(rng.random() < theta for _ in range(d))))
    assert abs(passed / draws - pw.power_exact(d, theta, alpha)) < 0.01


def test_the_rates_are_those_of_the_committed_result_of_adr_061():
    r = pw.rates()
    assert (r["pairs"], r["aOnly"], r["bOnly"], r["d"], r["net"]) == (5744, 119, 76, 195, 43)
    assert abs(r["dPerPair"] - 195 / 5744) < 1e-15 and abs(r["netPerPair"] - 43 / 5744) < 1e-15 and abs(r["lost"] - 256 / 6000) < 1e-15


def test_the_tables_are_the_ones_the_record_quotes(capsys):
    assert pw.main() == 0
    text = capsys.readouterr().out
    assert "5744 pairs, 119 won only by the arm, 76 only by S: D = 195 (0.0339 a pair), net +43 (0.749 points" in text and "28720 held-out" in text
    assert "| 0.50 | 108 | 0.555 | 0.93 | 0.85 |" in text                      # level 0.05
    assert "| 0.50 | 108 | 0.555 | 0.84 | 0.73 |" in text                      # level 0.05 / 3
    assert "| 0.33 | 71 | 0.536 | 0.44 | 0.34 |" in text
    assert "| 200 | 0.14 / 0.12 | 0.64 / 0.53 | 0.97 / 0.90 | 1.00 / 0.99 |" in text
    assert "| net wins | 38 | 53 | 65 | 75 |" in text and "| points of the win share | 0.13 | 0.18 | 0.23 | 0.26 |" in text
    assert "117 net wins (0.41 points; 54 % of ADR-061's) at α = 0.05 / 3, 101 (0.35 points; 47 % of ADR-061's) at α = 0.05" in text
    assert "standard deviation of about 14.0" in text


def test_the_scale_of_the_thresholds_is_read_from_the_value_files_the_site_shows():
    sc = pw.scale()
    assert sorted(sc) == ["Defect", "Ironclad"] and (sc["Ironclad"]["cards"], sc["Defect"]["cards"]) == (95, 97)
    iron = sc["Ironclad"]
    assert [round(iron["quantiles"][q], 2) for q in (0.05, 0.5, 0.95)] == [-0.53, 0.07, 0.82]
    assert round(iron["shareAbove"]["t020"], 3) == 0.274 and round(iron["crudeSkip"]["t020"], 2) == 0.38 and iron["shareAbove"]["tnone"] == 0 and iron["crudeSkip"]["tnone"] == 1
    assert all(sc[c]["shareAbove"][a] >= sc[c]["shareAbove"][b] for c in sc for a, b in zip(pw.THRESHOLDS, list(pw.THRESHOLDS)[1:], strict=False))   # a higher threshold keeps fewer cards
    assert round(iron["shareAbove"]["s"], 3) == 0.558 and round(iron["crudeSkip"]["s"], 3) == 0.086          # S skips a reward whose best card is worth 0 or less: about one in eleven
    assert round(sc["Defect"]["shareAbove"]["s"], 3) == 0.495 and round(sc["Defect"]["crudeSkip"]["s"], 3) == 0.129
    assert round(sc["Defect"]["crudeSkip"]["t020"], 2) == 0.43 and round(sc["Defect"]["crudeSkip"]["t045"], 2) == 0.77
    # the shown files are the ones the arms read (common.sh) and the grid is the study's
    from slay2_sim import threshstudy as ts

    assert pw.GRID == ts.GRID and set(pw.SHOWN) == set(ts.CLASSES)
