"""Patch-to-patch diff of the *factual layer* of the pinned spire-archive version snapshots.

Only identifiers, categorical facts (class, rarity, cost, type, target ...) and **which fields changed** are recorded.
Names, descriptions and numeric values are compared but never copied: a changed description or a changed number is
reported as ``changed: ["text"]`` / ``changed: ["vars"]`` with the ids affected, never with the before/after content
(docs/IP-COMPLIANCE.md section 2). The output tells the project *what to re-verify* after a patch, not what the patch says.

    python -m slay2_sim patchdiff 0.103.2 0.107.1 --out docs/patches/sts2-0.103.2-to-0.107.1.json
"""

from __future__ import annotations

import json
from pathlib import Path

from . import external

ARCHIVE_ID = "spire-archive"

# category -> (categorical fields recorded with old/new values, fields recorded only as "changed")
CATEGORIES: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {
    "cards": (("cost", "type", "rarity", "color", "target"), ("keywords", "tags", "vars", "upgrade")),
    "relics": (("tier", "color"), ()),
    "potions": (("rarity", "color", "target"), ()),
    "monsters": (("type", "act"), ("min_hp", "max_hp", "moves", "move_pattern", "start_move", "powers", "acts")),
    "events": (("act",), ("choices", "pages", "flavor_sequences")),
    "powers": (("type", "stackable"), ()),
    "enchantments": (("rarity",), ()),
}
TEXT_FIELDS = ("name", "description", "description_template")
SCHEMA = 1


def archive_root() -> Path:
    return external.external_root() / ARCHIVE_ID


def pinned_archive_sha() -> str:
    return external.pinned_sha(ARCHIVE_ID)


def available_versions(root: Path | None = None) -> list[dict]:
    root = root or archive_root()
    return json.loads((root / "data" / "sts2" / "history" / "versions.json").read_text(encoding="utf-8"))


def load_snapshot(version: str, category: str, root: Path | None = None) -> list[dict]:
    root = root or archive_root()
    path = root / "data" / "sts2" / "history" / version / f"{category}.json"
    return json.loads(path.read_text(encoding="utf-8"))


def _norm(value):
    """Order-insensitive normal form for list-valued fields; everything else compares as is."""
    if isinstance(value, list):
        try:
            return sorted(value)
        except TypeError:
            return sorted(value, key=lambda x: json.dumps(x, sort_keys=True))
    return value


def _empty(value) -> bool:
    return value is None or value == [] or value == {} or value == ""


def _field_names(records: list[dict]) -> set[str]:
    return {k for r in records for k in r}


def diff_category(old: list[dict], new: list[dict], facts: tuple[str, ...], flags: tuple[str, ...]) -> dict:
    """Diff two snapshots of one category by ``id``. Never copies names, descriptions or numeric values.

    A field that exists in only one of the two snapshots is an archive *schema* change, not a game change: it is listed
    under ``schema_only_in_old`` / ``schema_only_in_new`` and excluded from the per-id comparison.
    """
    a = {r["id"]: r for r in old}
    b = {r["id"]: r for r in new}
    old_fields, new_fields = _field_names(old), _field_names(new)
    comparable = old_fields & new_fields
    facts = tuple(f for f in facts if f in comparable)
    flags = tuple(f for f in flags if f in comparable)
    changed: dict[str, dict] = {}
    extraction_only: dict[str, dict] = {}
    for key in sorted(set(a) & set(b)):
        x, y = a[key], b[key]
        entry: dict = {}
        facts_changed = {f: [x.get(f), y.get(f)] for f in facts if _norm(x.get(f)) != _norm(y.get(f))}
        if facts_changed:
            entry["facts"] = facts_changed
        names_changed, populated, depopulated = [], [], []
        for f in flags:
            xv, yv = x.get(f), y.get(f)
            if _norm(xv) == _norm(yv):
                continue
            if _empty(xv) and not _empty(yv):
                populated.append(f)  # the archive extracted it later: not evidence that the game changed
            elif _empty(yv) and not _empty(xv):
                depopulated.append(f)
            else:
                names_changed.append(f)
        if populated or depopulated:
            extraction_only[key] = {"populated": populated, "depopulated": depopulated}
        if "vars" in names_changed:
            xv, yv = x.get("vars") or {}, y.get("vars") or {}
            entry["vars_changed"] = sorted(k for k in set(xv) | set(yv) if xv.get(k) != yv.get(k))
        if names_changed:
            entry["changed"] = names_changed
        if any(x.get(f) != y.get(f) for f in TEXT_FIELDS):
            entry.setdefault("changed", []).append("text")
        if entry:
            changed[key] = entry
    return {
        "before": len(a),
        "after": len(b),
        "added": sorted(set(b) - set(a)),
        "removed": sorted(set(a) - set(b)),
        "changed": changed,
        "extraction_only": extraction_only,
        "schema_only_in_old": sorted(old_fields - new_fields),
        "schema_only_in_new": sorted(new_fields - old_fields),
    }


def build_patch_diff(old_version: str, new_version: str, root: Path | None = None) -> dict:
    root = root or archive_root()
    versions = {v["version"]: v["date"] for v in available_versions(root)}
    for v in (old_version, new_version):
        if v not in versions:
            raise ValueError(f"version {v} is not in the archive snapshots: {sorted(versions)}")
    categories = {}
    for cat, (facts, flags) in CATEGORIES.items():
        categories[cat] = diff_category(load_snapshot(old_version, cat, root), load_snapshot(new_version, cat, root), facts, flags)
    summary = {
        cat: {
            "before": d["before"], "after": d["after"], "added": len(d["added"]), "removed": len(d["removed"]),
            "changed": len(d["changed"]), "extraction_only": len(d["extraction_only"]),
        }
        for cat, d in categories.items()
    }
    return {
        "schema": SCHEMA,
        "kind": "sts2-patch-diff",
        "game": "STS2",
        "from": {"version": old_version, "date": versions[old_version]},
        "to": {"version": new_version, "date": versions[new_version]},
        "source": {
            "id": ARCHIVE_ID, "sha": pinned_archive_sha(),
            "note": "ids, categorical facts and field names only; no names, descriptions or numeric values are copied",
        },
        "summary": summary,
        "categories": categories,
    }


# ---------------------------------------------------------------------------------------------- simulator coverage
SIM_SUFFIXES = ("", "_CARD", "_STATUS")


def match_simulator_names(archive_ids: set[str], sim_names: set[str]) -> tuple[dict[str, str], list[str], list[str]]:
    """Map archive ids to simulator enum names (the simulator appends ``_CARD`` / ``_STATUS`` when a card shares its
    name with a power). Returns (matches, archive ids with no counterpart, simulator names with no counterpart)."""
    matches: dict[str, str] = {}
    for cid in sorted(archive_ids):
        for suffix in SIM_SUFFIXES:
            if cid + suffix in sim_names:
                matches[cid] = cid + suffix
                break
    return matches, sorted(archive_ids - set(matches)), sorted(sim_names - set(matches.values()))


def simulator_coverage(version: str, root: Path | None = None) -> dict:
    """Which ids of a game version the pinned simulator does not implement (needs the simulator to be importable)."""
    from sts2_env.core.enums import CardId
    from sts2_env.relics.base import RelicId

    from .knowledge import card_info

    cards = {r["id"] for r in load_snapshot(version, "cards", root)}
    relics = {r["id"] for r in load_snapshot(version, "relics", root)}
    c_match, c_missing, c_extra = match_simulator_names(cards, {m.name for m in CardId})
    r_match, r_missing, r_extra = match_simulator_names(relics, {m.name for m in RelicId})
    without_impl = sorted(a for a, s in c_match.items() if not card_info(s, False).get("known", True))
    return {
        "version": version,
        "note": "ids only; the simulator appends _CARD / _STATUS to a card that shares its name with a power",
        "cards": {
            "archive": len(cards), "matched": len(c_match), "renamed_with_suffix": sum(1 for a, s in c_match.items() if a != s),
            "missing_from_simulator": c_missing, "only_in_simulator": c_extra, "enum_without_implementation": without_impl,
        },
        "relics": {
            "archive": len(relics), "matched": len(r_match), "renamed_with_suffix": sum(1 for a, s in r_match.items() if a != s),
            "missing_from_simulator": r_missing, "only_in_simulator": r_extra,
        },
    }


def render_markdown(diffs: list[dict]) -> str:
    """Human summary of one or more diffs (counts only; the JSON files are the machine-readable record)."""
    lines = []
    for d in diffs:
        lines.append(f"### {d['from']['version']} ({d['from']['date']}) -> {d['to']['version']} ({d['to']['date']})\n")
        lines.append("| Category | Before | After | Added | Removed | Changed | Newly extracted only |")
        lines.append("|---|---:|---:|---:|---:|---:|---:|")
        for cat, s in d["summary"].items():
            lines.append(
                f"| {cat} | {s['before']} | {s['after']} | {s['added']} | {s['removed']} | {s['changed']} | {s['extraction_only']} |"
            )
        notes = [
            f"{cat}: fields only in the {side} snapshot ({', '.join(c['schema_only_in_' + side])})"
            for cat, c in d["categories"].items() for side in ("old", "new") if c["schema_only_in_" + side]
        ]
        if notes:
            lines.append("")
            lines.append("Archive schema differences (not game changes): " + "; ".join(notes) + ".")
        lines.append("")
    return "\n".join(lines) + ("\n" if lines else "")
