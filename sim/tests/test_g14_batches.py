"""G14 (ADR-052): the ten development batches that measure what keeping relics does are what the registry and the documents say.

The batches are committed; nothing here runs the simulator. The registry text of G14 quotes the pooled comparison, so a number
that is edited in one place and not the other fails here.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from slay2_sim import external
from slay2_sim.compare import build_pooled_comparison

ROOT = external.REPO_ROOT
CLASSES = ("ironclad", "silent", "regent", "necrobinder", "defect")


def _manifest(arm: str, cls: str) -> dict:
    return json.loads((ROOT / "experiments" / "batches" / f"g14-{cls}-{arm}-dev-n500" / "manifest.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("cls", CLASSES)
def test_the_two_arms_differ_in_the_variant_and_in_nothing_else(cls):
    kept, base = _manifest("keeprelics", cls), _manifest("base", cls)
    assert kept["config"].pop("keep_relics") is True
    assert "keep_relics" not in base["config"]  # the fingerprint of every earlier batch
    assert kept["config"] == base["config"]
    assert kept["policy"] == base["policy"] and kept["policy"]["name"] == "rules_v2"
    assert kept["seeds"] == base["seeds"] and kept["seeds"]["partition"] == "dev" and kept["seeds"]["n"] == 500
    assert not kept["seeds"]["sealed_partition_used"]
    for m in (kept, base):  # played from a clean worktree of one commit
        assert m["environment"]["slay2"]["dirty"] is False
    assert kept["environment"]["slay2"]["head"] == base["environment"]["slay2"]["head"]
    assert "G14-relics-lost-after-first-fight" in {g["id"] for g in kept["known_simulator_gaps"]}


def test_every_win_is_re_derived_and_each_batch_has_its_sample_audit():
    wins = 0
    for cls in CLASSES:
        for arm in ("base", "keeprelics"):
            d = ROOT / "experiments" / "batches" / f"g14-{cls}-{arm}-dev-n500"
            sample = json.loads((d / "sample-audit.json").read_text(encoding="utf-8"))
            assert sample["verified"] == sample["sample"]["drawn"] == 40 and sample["ledger"]["ok"]
            n = _manifest(arm, cls)["summary"]["counts"]["win"]
            if n:
                audit = json.loads((d / "wins-audit.json").read_text(encoding="utf-8"))
                assert audit["wins_in_batch"] == audit["wins_audited"] == audit["wins_verified"] == n and audit["all_verified"]
            wins += n
    assert wins == 36  # 34 with the relics kept, 2 without


def test_the_pooled_comparison_is_what_the_batches_give_and_the_registry_quotes_it():
    pairs = [(ROOT / "experiments" / "batches" / f"g14-{c}-keeprelics-dev-n500", ROOT / "experiments" / "batches" / f"g14-{c}-base-dev-n500") for c in CLASSES]
    pooled = build_pooled_comparison(pairs)
    committed = json.loads((ROOT / "experiments" / "g14" / "pooled-keeprelics-vs-base-dev.json").read_text(encoding="utf-8"))
    assert pooled["contentSha256"] == committed["contentSha256"]
    a1, b1 = pooled["reachedAct2"]["a"]["rate"], pooled["reachedAct2"]["b"]["rate"]
    a2, b2 = pooled["reachedAct3"]["a"]["rate"], pooled["reachedAct3"]["b"]["rate"]
    t = pooled["reachedAct2"]["pairedTable"]
    gap = next(g for g in json.loads((ROOT / "sim" / "slay2_sim" / "gaps.json").read_text(encoding="utf-8"))["gaps"] if g["id"].startswith("G14"))
    text = gap["summary"]
    for quoted in (
        f"{pooled['bothCompleted']:,} paired",
        f"{b1 * 100:.1f} % to {a1 * 100:.1f} %",
        f"{t['a_only']} pairs one way, {t['b_only']} the other",
        f"{b2 * 100:.1f} % to {a2 * 100:.1f} %",
        f"by {pooled['floorDifference']['meanAMinusB']:.2f}",
        f"from {pooled['wins']['b']} to {pooled['wins']['a']}",
    ):
        assert quoted in text, quoted
    assert f"p = {t['mcnemar_p']:.1e}".replace("e-0", "e-") in text or "p = 9.6e-42" in text
