"""A batch can draw a fresh slice of a partition (``--offset``): which seeds it takes, what the manifest records, the default id."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pytest

from slay2_sim import cli
from slay2_sim.manifest import make_seed_manifest


@pytest.fixture()
def seed_file(tmp_path: Path) -> tuple[Path, dict]:
    manifest = make_seed_manifest("t-off", 5, {"train": 12, "val": 8, "test": 4, "dev": 30})
    path = tmp_path / "t-off.json"
    path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return path, manifest


def make_args(path: Path, **over) -> argparse.Namespace:
    base = dict(
        seeds=str(path), partition="dev", allow_sealed=False, n=5, offset=0, policy="rules_v3", ancient_heal=False,
        character="Ironclad", ascension=0, profile="veteran",
    )
    base.update(over)
    return argparse.Namespace(**base)


def test_an_offset_takes_a_fresh_slice_and_is_recorded_only_when_used(seed_file):
    path, manifest = seed_file
    dev = manifest["partitions"]["dev"]
    seeds, info = cli._resolve_seeds(make_args(path))
    assert seeds == dev[:5]
    assert "offset" not in info  # the manifests of every batch played without it stay what they were
    seeds, info = cli._resolve_seeds(make_args(path, offset=10))
    assert seeds == dev[10:15] and info["offset"] == 10 and info["n"] == 5
    seeds, info = cli._resolve_seeds(make_args(path, offset=28, n=10))
    assert seeds == dev[28:] and info["n"] == 2  # the slice ends where the partition does
    seeds, info = cli._resolve_seeds(make_args(path, offset=4, n=None))
    assert seeds == dev[4:] and info["n"] == 26
    with pytest.raises(SystemExit):
        cli._resolve_seeds(make_args(path, offset=-1))


def test_the_sealed_partition_stays_sealed_with_an_offset(seed_file):
    path, _ = seed_file
    with pytest.raises(PermissionError):
        cli._resolve_seeds(make_args(path, partition="test", offset=1))


def test_default_batch_ids_do_not_collide_across_slices_and_do_not_change_without_one(seed_file):
    path, _ = seed_file
    assert cli._default_batch_id(make_args(path), 5) == "rules_v3-ironclad-a0-veteran-dev-n5"
    assert cli._default_batch_id(make_args(path, offset=10), 5) == "rules_v3-ironclad-a0-veteran-dev-o10-n5"
    assert cli._default_batch_id(make_args(path, ancient_heal=True), 5) == "rules_v3-ironclad-a0-veteran-ancientheal-dev-n5"
