#!/usr/bin/env python3
"""What a finished batch of the threshold study has to be (ADR-062 items 3 and 9), read from the batch's own manifest.

The policy and its parameters (exactly, as the run was asked for them), the class, the seeds (partition, number, offset, and the seed file by its path and
SHA-256 when SEEDS_FILE_EXPECTED names it), Ascension 0 with the veteran profile and the relics kept, neither of the harness variants (the Ancients' heal, the
game's own starting HP), the limits of the harness (steps, wall clock, turns in a combat, stall) at their defaults, the class start verified, the harness's
canonical process state, a clean working tree of the commit the stage started from (STUDY_HEAD_EXPECTED, when set), no game ended in an abort, a harness error, a
policy error or an invalid action (simulator errors, step limits and timeouts are excluded and counted, as ADR-062 item 3 says), and at least 90 % of the games
completed.

    verify_batch.py <batch dir> <policy> <params json> <ExactClass> <partition> <n> <offset>        (exit status 1 and the problems on stderr)
    verify_batch.py --many < file     (one batch a line, tab separated, in that order; every problem of every batch is reported)
"""
from __future__ import annotations

import hashlib
import json
import os
import sys
from pathlib import Path

# the limits of the harness as every study played them (RunConfig's defaults, recorded in the manifest)
LIMITS = {"max_steps": 20000, "wall_seconds": 900.0, "max_turns_per_combat": 80, "stall_limit": 200}


def problems(d: str, policy: str, params: str, cls: str, part: str, n: int, off: int, head: str = "", seeds_file: str = "") -> list[str]:
    try:
        m = json.loads((Path(d) / "manifest.json").read_text(encoding="utf-8"))
    except Exception as e:  # noqa: BLE001
        return [f"{d}: no readable manifest ({e})"]
    out: list[str] = []
    try:
        c = m["summary"]["counts"]
        bad = sum(c[k] for k in ("aborted", "harness_error", "policy_error", "invalid_action"))
        env = (m.get("environment") or {}).get("slay2") or {}
        pol = m["policy"]
        if pol["name"] != policy:
            out.append(f"policy {pol['name']}")
        if pol.get("params") != json.loads(params):
            out.append(f"policy parameters {pol.get('params')} are not {params}")
        if m["config"].get("character") != cls:
            out.append(f"class {m['config'].get('character')}")
        if head and env.get("head") != head:
            out.append(f"played from {str(env.get('head'))[:12]}, not from {head[:12]}")
        cfg = m["config"]
        if cfg["ascension"] != 0:
            out.append(f"Ascension {cfg['ascension']}")
        if cfg.get("profile") != "veteran":
            out.append(f"profile {cfg.get('profile')}")
        if cfg.get("keep_relics") is not True:
            out.append("relics not kept")
        if cfg.get("ancient_heal") is True or cfg.get("game_hp") is True:
            out.append("a harness variant (the Ancients' heal or the game's own starting HP) was on")
        for k, v in LIMITS.items():
            if cfg.get(k) != v:
                out.append(f"{k} {cfg.get(k)} is not {v}")
        if cfg.get("start_with_neow") is not True:
            out.append("the opening Ancient was not played")
        s = m["seeds"]
        if s["partition"] != part or s["n"] != n or m["summary"]["episodes"] != n or int(s.get("offset", 0)) != off:
            out.append("seeds")
        if s.get("sealed_partition_used") is not False:
            out.append("the sealed partition was used or the manifest does not say it was not")
        if seeds_file:
            try:
                want = hashlib.sha256(Path(seeds_file).read_bytes()).hexdigest()
            except OSError:
                want = None
            if s.get("file") != seeds_file or s.get("file_sha256") != want:
                out.append(f"the seed file is not {seeds_file} with its SHA-256")
        if bad:
            out.append(f"{bad} games ended in an abort, a harness error, a policy error or an invalid action")
        if m["summary"]["completed"] < 0.9 * n:
            out.append(f"only {m['summary']['completed']} of {n} completed")
        if m.get("class_start_verified") is not True or m.get("canonical_process_state") is not True:
            out.append("class start or canonical process state not recorded")
        if env.get("dirty") is not False:
            out.append("played from a working tree with uncommitted changes")
    except (KeyError, TypeError, ValueError) as e:
        out.append(f"the manifest is not a finished batch's ({type(e).__name__}: {e})")
    return [f"verify_batch: {d}: " + "; ".join(out)] if out else []


def main(argv: list[str]) -> int:
    head = os.environ.get("STUDY_HEAD_EXPECTED", "")
    seeds_file = os.environ.get("SEEDS_FILE_EXPECTED", "")
    found: list[str] = []
    if argv and argv[0] == "--many":
        for line in sys.stdin.read().splitlines():
            if line.strip():
                d, policy, params, cls, part, n, off = line.split("\t")
                found += problems(d, policy, params, cls, part, int(n), int(off), head, seeds_file)
    else:
        d, policy, params, cls, part, n, off = argv
        found = problems(d, policy, params, cls, part, int(n), int(off), head, seeds_file)
    for line in found:
        print(line, file=sys.stderr)
    return 1 if found else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
