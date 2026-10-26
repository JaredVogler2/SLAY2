"""The committed record of a network run: no local paths, checkpoint hashes, paired evaluation. Pure (no simulator, no torch)."""

from __future__ import annotations

import gzip
import hashlib
import json

from slay2_sim.rl import summary


def _run(tmp_path):
    run = tmp_path / "combat-x"
    run.mkdir()
    cfg = {
        "args": {"out": "/home/someone/secret/path/combat-x", "iterations": 300, "lr": 0.0003},
        "net": {"d": 48}, "libraries": {"train": 3, "val": 2}, "nodes": {"train": {"BOSS": 1}, "val": {"BOSS": 1}},
        "simulator": {"id": "sim", "head": "abc", "pinned": "abc", "dirty": False, "root": "/home/someone/secret/sim"},
    }
    (run / "config.json").write_text(json.dumps(cfg))
    rows = [{"it": 1, "steps": 10}, {"it": 2, "steps": 20, "val": {"all": {"n": 8, "win": 0.5, "hp_lost_on_win": 0.2, "extra": 1}}}]
    (run / "log.jsonl").write_text("\n".join(json.dumps(r) for r in rows) + "\n")
    (run / "best.pt").write_bytes(b"weights-1")
    (run / "latest.pt").write_bytes(b"weights-2")
    return run


def test_record_has_no_local_paths_and_hashes_the_checkpoints(tmp_path):
    rec = summary.summarize(_run(tmp_path), None, "stopped early")
    text = json.dumps(rec)
    assert "/home/someone" not in text
    assert rec["config"] == {"iterations": 300, "lr": 0.0003}
    assert rec["simulator"] == {"id": "sim", "head": "abc", "pinned": "abc", "dirty": False}
    assert rec["checkpoints"]["best.pt"]["sha256"] == hashlib.sha256(b"weights-1").hexdigest()
    assert rec["checkpoints"]["latest.pt"]["bytes"] == len(b"weights-2")
    assert rec["note"] == "stopped early" and rec["iterations_logged"] == 2 and rec["steps"] == 20
    assert rec["validation"] == [{"iteration": 2, "steps": 20, "n": 8, "win": 0.5, "hp_lost_on_win": 0.2}]


def test_paired_evaluation_is_copied_from_a_gzip_file(tmp_path):
    run = _run(tmp_path)
    ev = {"agents": ["rules", "net:x"], "partition": "val", "seeds": 80, "repeats": 2, "workers": 4,
          "summaries": {"rules": {"ALL": {"n": 4, "win": 0.5}}}, "paired": {"rules vs net:x": {"pairs": 4}}, "rows": {"rules": [{"pair": "0:0:0"}]}}
    path = tmp_path / "eval.json.gz"
    with gzip.open(path, "wt", encoding="utf-8") as fh:
        json.dump(ev, fh)
    rec = summary.summarize(run, path, "n")
    assert rec["paired_evaluation"]["paired"] == {"rules vs net:x": {"pairs": 4}}
    assert "rows" not in rec["paired_evaluation"]  # per-pair rows stay in the evaluation artifact, not in the summary


def test_a_behaviour_cloning_directory_has_its_own_record_without_local_paths(tmp_path):
    run = tmp_path / "combat-bc"
    run.mkdir()
    (run / "bc.json").write_text(json.dumps({
        "args": {"out": "/home/someone/secret/combat-bc", "repeats": 6, "epochs": 8}, "net": {"d": 48},
        "simulator": {"id": "sim", "head": "abc", "pinned": "abc", "root": "/home/someone/secret/sim"},
        "demonstrations": {"episodes": 10, "won": 8}, "decisions_by_node": {"BOSS": 3}, "train_decisions": 90, "holdout_decisions": 5,
        "history": [{"epoch": 1}, {"epoch": 2, "holdout": {"top1": 0.9}}],
    }))
    (run / "bc.pt").write_bytes(b"w")
    rec = summary.summarize(run, None, "cloned")
    assert rec["kind"] == "combat-network-bc" and "/home/someone" not in json.dumps(rec)
    assert rec["config"] == {"repeats": 6, "epochs": 8}
    assert rec["behaviour_cloning"]["final_epoch"] == {"epoch": 2, "holdout": {"top1": 0.9}}
    assert rec["checkpoints"]["bc.pt"]["sha256"] == hashlib.sha256(b"w").hexdigest()
