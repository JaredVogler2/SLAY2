"""Patch diff of archived STS2 snapshots: ids and field names only, never content."""

from __future__ import annotations

import json
from pathlib import Path

from slay2_sim import external
from slay2_sim.patchdiff import (
    CATEGORIES, TEXT_FIELDS, build_patch_diff, diff_category, match_simulator_names, render_markdown,
)

FACTS, FLAGS = CATEGORIES["cards"]


def card(cid, **over):
    base = {
        "id": cid, "name": f"Name of {cid}", "cost": 1, "type": "Attack", "rarity": "Common", "color": "ironclad",
        "target": "AnyEnemy", "keywords": ["exhaust", "retain"], "tags": [], "vars": {"damage": 6}, "upgrade": {"damage": 3},
        "description": f"Deal 6 damage to {cid}.", "description_template": "Deal {damage} damage.",
    }
    base.update(over)
    return base


def test_ids_and_changed_field_names_are_reported_without_content():
    old = [card("A"), card("B"), card("GONE")]
    new = [
        card("A", cost=2, rarity="Uncommon", vars={"damage": 7}, description="Deal 7 damage to A."),
        card("B", keywords=["retain", "exhaust"]),  # same set, different order: not a change
        card("NEW"),
    ]
    d = diff_category(old, new, FACTS, FLAGS)
    assert d["added"] == ["NEW"] and d["removed"] == ["GONE"]
    assert set(d["changed"]) == {"A"}
    a = d["changed"]["A"]
    assert a["facts"] == {"cost": [1, 2], "rarity": ["Common", "Uncommon"]}
    assert a["vars_changed"] == ["damage"]
    assert set(a["changed"]) == {"vars", "text"}
    blob = json.dumps(d)
    for leaked in ("Deal 6", "Deal 7", "Name of", '"damage": 6', '"damage": 7'):
        assert leaked not in blob, leaked


def test_a_field_the_archive_only_extracted_later_is_not_a_game_change():
    old = [card("A", tags=[]), card("B")]
    new = [card("A", tags=["Strike"]), card("B", tags=[])]
    d = diff_category(old, new, FACTS, FLAGS)
    assert d["changed"] == {}
    assert d["extraction_only"] == {"A": {"populated": ["tags"], "depopulated": []}}


def test_fields_that_exist_in_only_one_snapshot_are_schema_changes():
    old = [dict(card("A"), epithet="x")]
    new = [dict(card("A"), move_pattern="y")]
    d = diff_category(old, new, FACTS, FLAGS + ("move_pattern",))
    assert d["schema_only_in_old"] == ["epithet"] and d["schema_only_in_new"] == ["move_pattern"]
    assert d["changed"] == {}


def test_simulator_names_match_across_the_card_and_status_suffix():
    matches, missing, extra = match_simulator_names({"BARRICADE", "STRIKE", "SLOTH", "NEWCARD"}, {"BARRICADE_CARD", "STRIKE", "SLOTH_STATUS", "OLD"})
    assert matches == {"BARRICADE": "BARRICADE_CARD", "STRIKE": "STRIKE", "SLOTH": "SLOTH_STATUS"}
    assert missing == ["NEWCARD"] and extra == ["OLD"]


def test_build_patch_diff_reads_the_snapshots_it_is_given(tmp_path: Path):
    hist = tmp_path / "data" / "sts2" / "history"
    for version, date, cards in (("1.0.0", "2026-01-01", [card("A"), card("B")]), ("1.1.0", "2026-02-01", [card("A", cost=0), card("C")])):
        (hist / version).mkdir(parents=True)
        for cat in CATEGORIES:
            (hist / version / f"{cat}.json").write_text(json.dumps(cards if cat == "cards" else []), encoding="utf-8")
    (hist / "versions.json").write_text(json.dumps([{"version": "1.1.0", "date": "2026-02-01"}, {"version": "1.0.0", "date": "2026-01-01"}]), encoding="utf-8")
    d = build_patch_diff("1.0.0", "1.1.0", root=tmp_path)
    assert d["summary"]["cards"] == {"before": 2, "after": 2, "added": 1, "removed": 1, "changed": 1, "extraction_only": 0}
    assert d["categories"]["cards"]["changed"]["A"]["facts"] == {"cost": [1, 0]}
    assert d["source"]["id"] == "spire-archive" and len(d["source"]["sha"]) == 40
    assert "1.1.0" in render_markdown([d])


def test_committed_patch_diffs_are_internally_consistent_and_free_of_content():
    root = external.REPO_ROOT / "docs" / "patches"
    files = sorted(root.glob("sts2-*-to-*.json"))
    assert files, "expected committed diffs"
    for f in files:
        d = json.loads(f.read_text(encoding="utf-8"))
        assert d["source"]["sha"] == external.pinned_sha("spire-archive")
        for cat, c in d["categories"].items():
            s = d["summary"][cat]
            assert s["after"] - s["before"] == s["added"] - s["removed"], (f.name, cat)
            assert c["added"] == sorted(c["added"]) and c["removed"] == sorted(c["removed"])
            assert not set(c["added"]) & set(c["removed"])
            assert s["changed"] == len(c["changed"]) and s["extraction_only"] == len(c["extraction_only"])
        blob = f.read_text(encoding="utf-8")
        for field in TEXT_FIELDS:
            assert f'"{field}":' not in blob.replace('"text"', ""), (f.name, field)
