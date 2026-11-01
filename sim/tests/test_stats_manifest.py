import math

import pytest

from slay2_sim import manifest as mf
from slay2_sim import stats
from slay2_sim.outcomes import COMPLETED, EpisodeRecord, Outcome, summarize


# ---- Wilson ---------------------------------------------------------------------------------

def test_wilson_known_values():
    # classic reference: k=0,n=10 -> [0, 0.2775]; k=10,n=10 -> [0.7225, 1] (95%)
    lo, hi = stats.wilson_interval(0, 10)
    assert lo == 0.0 and hi == pytest.approx(0.2775, abs=1e-3)
    lo, hi = stats.wilson_interval(10, 10)
    assert hi == 1.0 and lo == pytest.approx(0.7225, abs=1e-3)
    lo, hi = stats.wilson_interval(50, 100)
    assert (lo, hi) == pytest.approx((0.4038, 0.5962), abs=2e-4)


@pytest.mark.parametrize("k,n", [(0, 1), (1, 1), (3, 7), (343, 1000), (0, 2000)])
def test_wilson_contains_point_estimate_and_ordered(k, n):
    lo, hi = stats.wilson_interval(k, n)
    assert 0.0 <= lo <= k / n <= hi <= 1.0


def test_wilson_validation():
    with pytest.raises(ValueError):
        stats.wilson_interval(1, 0)
    with pytest.raises(ValueError):
        stats.wilson_interval(5, 4)


# ---- McNemar / bootstrap ----------------------------------------------------------------------

def test_mcnemar_exact_known():
    assert stats.mcnemar_exact(0, 0) == 1.0
    assert stats.mcnemar_exact(5, 5) == 1.0
    # 0 vs 8 discordant: p = 2 * (1/2)^8
    assert stats.mcnemar_exact(0, 8) == pytest.approx(2 / 256)
    assert stats.mcnemar_exact(8, 0) == stats.mcnemar_exact(0, 8)
    assert stats.mcnemar_exact(2, 9) == pytest.approx(2 * sum(math.comb(11, i) for i in range(3)) / 2**11)


def test_paired_win_table():
    t = stats.paired_win_table([True, True, False, False, True], [True, False, False, True, False])
    assert (t["both"], t["a_only"], t["b_only"], t["neither"]) == (1, 2, 1, 1)
    assert 0 < t["mcnemar_p"] <= 1


def test_paired_bootstrap_detects_shift_and_is_deterministic():
    a = [1.0] * 70 + [0.0] * 30
    b = [1.0] * 40 + [0.0] * 60
    m, lo, hi = stats.paired_bootstrap_ci(a, b, iters=4000, seed=1)
    assert m == pytest.approx(0.30)
    assert lo > 0 and hi > m > lo
    assert stats.paired_bootstrap_ci(a, b, iters=4000, seed=1) == (m, lo, hi)
    with pytest.raises(ValueError):
        stats.paired_bootstrap_ci([1.0], [1.0, 0.0])


# ---- seed manifests -----------------------------------------------------------------------------

def test_seed_manifest_deterministic_disjoint_and_verifiable(tmp_path):
    m1 = mf.make_seed_manifest("t", 42, {"train": 50, "val": 20, "test": 30})
    m2 = mf.make_seed_manifest("t", 42, {"train": 50, "val": 20, "test": 30})
    assert m1 == m2
    assert m1["sizes"] == {"train": 50, "val": 20, "test": 30}
    allseeds = [s for part in m1["partitions"].values() for s in part]
    assert len(allseeds) == len(set(allseeds)) == 100
    assert all(0 <= s < mf.SEED_UNIVERSE for s in allseeds)
    path = tmp_path / "seeds.json"
    mf.save_json(path, m1)
    assert mf.load_seed_manifest(path)["sha256"] == m1["sha256"]


def test_seed_manifest_golden_prefix():
    # Guards the generator against silent changes: first seeds for master 20261025 never change.
    m = mf.make_seed_manifest("golden", 20261025, {"train": 3, "val": 0, "test": 0})
    assert m["partitions"]["train"] == [1005923080, 1156437355, 1773265829]
    assert m["sha256"].startswith("7853d53926dc75e5")


def test_v2_manifest_keeps_every_v1_seed_where_it_was_and_adds_disjoint_development_seeds():
    """The dev partition exists so that tuning never reuses the seeds a value was fitted on (train) or confirmed on (val, test)."""
    v1 = mf.load_seed_manifest(mf.Path(__file__).resolve().parents[2] / "experiments" / "seeds" / "ironclad-a0-v1.json")
    v2 = mf.load_seed_manifest(mf.Path(__file__).resolve().parents[2] / "experiments" / "seeds" / "ironclad-a0-v2.json")
    for part in ("train", "val", "test"):
        assert v2["partitions"][part] == v1["partitions"][part], part
    assert v2["sizes"]["dev"] == 10000 and "dev" not in v1["partitions"]
    everything = [s for part in v2["partitions"].values() for s in part]
    assert len(everything) == len(set(everything)) == 21000
    regenerated = mf.make_seed_manifest("ironclad-a0-v2", 20261025, {"train": 5000, "val": 2000, "test": 4000, "dev": 10000})
    assert regenerated["sha256"] == v2["sha256"]
    assert mf.partition_seeds(v2, "dev", limit=3) == v2["partitions"]["dev"][:3]  # development seeds are not sealed


def test_v3_manifest_keeps_every_v2_seed_where_it_was_and_adds_disjoint_held_out_seeds():
    """val2 exists so that a study planned after val had been read is played on seeds nobody has played: the sealed test partition stays sealed."""
    root = mf.Path(__file__).resolve().parents[2] / "experiments" / "seeds"
    v2 = mf.load_seed_manifest(root / "ironclad-a0-v2.json")
    v3 = mf.load_seed_manifest(root / "ironclad-a0-v3.json")
    for part in ("train", "val", "test", "dev"):
        assert v3["partitions"][part] == v2["partitions"][part], part
    assert "val2" not in v2["partitions"] and v3["sizes"]["val2"] == 3000
    everything = [s for part in v3["partitions"].values() for s in part]
    assert len(everything) == len(set(everything)) == 24000
    regenerated = mf.make_seed_manifest("ironclad-a0-v3", 20261025, {"train": 5000, "val": 2000, "test": 4000, "dev": 10000, "val2": 3000})
    assert regenerated["sha256"] == v3["sha256"]
    # asking for no val2 leaves a v2-style manifest exactly as it was, so v2's checksum is still what the committed file says
    assert mf.make_seed_manifest("ironclad-a0-v2", 20261025, {"train": 5000, "val": 2000, "test": 4000, "dev": 10000})["sha256"] == v2["sha256"]
    assert mf.partition_seeds(v3, "val2", limit=3) == v3["partitions"]["val2"][:3]  # held-out, but not sealed
    with pytest.raises(PermissionError):
        mf.partition_seeds(v3, "test")
    with pytest.raises(ValueError, match="no 'val2' partition"):
        mf.partition_seeds(v2, "val2")  # an older manifest says so instead of a bare KeyError
    assert "val2" not in mf.DEVELOPMENT_PARTITIONS and set(mf.DEVELOPMENT_PARTITIONS) == {"train", "dev"}


def test_seed_manifest_tamper_detected(tmp_path):
    m = mf.make_seed_manifest("t", 7, {"train": 5, "val": 5, "test": 5})
    m["partitions"]["train"][0] += 1
    with pytest.raises(ValueError):
        mf.verify_seed_manifest(m)


def test_test_partition_is_sealed():
    m = mf.make_seed_manifest("t", 7, {"train": 5, "val": 5, "test": 5})
    with pytest.raises(PermissionError):
        mf.partition_seeds(m, "test")
    assert len(mf.partition_seeds(m, "test", allow_sealed=True)) == 5
    assert len(mf.partition_seeds(m, "train", limit=2)) == 2


# ---- outcomes ---------------------------------------------------------------------------------------

def _rec(outcome):
    return EpisodeRecord(batch_id="b", seed=1, character="Ironclad", ascension=0, policy="p", policy_version="1", outcome=outcome.value)


def test_only_win_and_death_are_completed():
    assert COMPLETED == {Outcome.WIN, Outcome.DEATH}
    assert _rec(Outcome.WIN).completed and _rec(Outcome.DEATH).completed
    for o in (Outcome.TIMEOUT, Outcome.SIMULATOR_ERROR, Outcome.INVALID_ACTION, Outcome.ABORTED):
        assert not _rec(o).completed


def test_summary_never_counts_errors_as_losses():
    recs = [_rec(Outcome.WIN), _rec(Outcome.DEATH), _rec(Outcome.DEATH), _rec(Outcome.SIMULATOR_ERROR), _rec(Outcome.TIMEOUT)]
    s = summarize(recs)
    assert s["episodes"] == 5 and s["completed"] == 3
    assert s["win_rate_of_completed"] == pytest.approx(1 / 3)
    assert s["counts"]["simulator_error"] == 1 and s["counts"]["timeout"] == 1
    assert summarize([_rec(Outcome.SIMULATOR_ERROR)])["win_rate_of_completed"] is None
