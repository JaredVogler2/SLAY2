"""Immutable seed manifests and batch/environment fingerprints.

Seed generation uses SHA-256 in counter mode so the sequence is stable across Python versions.
Partitions (``train`` / ``val`` / ``test``) are disjoint by construction; ``test`` is sealed - tools
must be told explicitly (``allow_sealed=True``) and the access is recorded in the batch manifest.
"""

from __future__ import annotations

import hashlib
import json
import os
import platform
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SEED_UNIVERSE = 2**31 - 1
# Stream order is the assignment order: a partition appended at the end never moves an earlier one (the v2 manifest keeps
# v1's train / val / test seeds and adds "dev", fresh seeds for development once "train" has been used to fit something;
# the v3 manifest keeps v2's and adds "val2", fresh held-out seeds for a study planned after "val" had been read).
PARTITIONS = ("train", "val", "test", "dev", "val2")
# Only present in a manifest that was asked for them, so that an older manifest's body (and with it its checksum) stays what it was.
OPTIONAL_PARTITIONS = ("dev", "val2")
DEFAULT_SIZES = {"train": 5000, "val": 2000, "test": 4000}
# Seeds a result may be read from: every partition but the ones that are for development and the sealed one.
DEVELOPMENT_PARTITIONS = ("train", "dev")


def canonical_json(obj) -> bytes:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path | str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def _seed_stream(master_seed: int):
    i = 0
    while True:
        digest = hashlib.sha256(f"slay2-seed:{master_seed}:{i}".encode()).digest()
        yield int.from_bytes(digest[:4], "big") % SEED_UNIVERSE
        i += 1


def make_seed_manifest(name: str, master_seed: int, sizes: dict[str, int] | None = None) -> dict:
    sizes = dict(DEFAULT_SIZES if sizes is None else sizes)
    unknown = set(sizes) - set(PARTITIONS)
    if unknown:
        raise ValueError(f"unknown partitions: {sorted(unknown)}")
    seen: set[int] = set()
    stream = _seed_stream(master_seed)
    partitions: dict[str, list[int]] = {}
    for part in PARTITIONS:  # fixed order => stable assignment
        if part in OPTIONAL_PARTITIONS and part not in sizes:
            continue  # a v1-style manifest has no dev partition (a v2-style one no val2): its body (and checksum) must stay what it was
        out: list[int] = []
        while len(out) < sizes.get(part, 0):
            s = next(stream)
            if s not in seen:
                seen.add(s)
                out.append(s)
        partitions[part] = out
    body = {
        "schema": 1,
        "name": name,
        "master_seed": master_seed,
        "universe": SEED_UNIVERSE,
        "generator": "sha256-counter: int(sha256('slay2-seed:{master}:{i}')[:4]) % universe, dedup across partitions",
        "sizes": {k: len(v) for k, v in partitions.items()},
        "partitions": partitions,
    }
    return {**body, "sha256": sha256_hex(canonical_json(body))}


def verify_seed_manifest(manifest: dict) -> None:
    body = {k: v for k, v in manifest.items() if k != "sha256"}
    if sha256_hex(canonical_json(body)) != manifest.get("sha256"):
        raise ValueError("seed manifest checksum mismatch (file was modified)")
    all_seeds = [s for p in PARTITIONS for s in manifest["partitions"].get(p, [])]
    if len(all_seeds) != len(set(all_seeds)):
        raise ValueError("seed manifest partitions are not disjoint / contain duplicates")


def save_json(path: Path | str, obj) -> None:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(obj, fh, indent=2, sort_keys=True)
        fh.write("\n")
    os.replace(tmp, path)  # atomic


def load_seed_manifest(path: Path | str) -> dict:
    with open(path, encoding="utf-8") as fh:
        manifest = json.load(fh)
    verify_seed_manifest(manifest)
    return manifest


def partition_seeds(manifest: dict, partition: str, *, allow_sealed: bool = False, limit: int | None = None) -> list[int]:
    if partition not in PARTITIONS:
        raise ValueError(f"partition must be one of {PARTITIONS}")
    if partition == "test" and not allow_sealed:
        raise PermissionError("the 'test' partition is sealed; pass allow_sealed=True (access is recorded)")
    if partition not in manifest["partitions"]:
        raise ValueError(f"the seed manifest {manifest.get('name', '?')!r} has no {partition!r} partition (it has {sorted(manifest['partitions'])})")
    seeds = list(manifest["partitions"][partition])
    return seeds if limit is None else seeds[:limit]


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _cpu_model() -> str:
    try:
        with open("/proc/cpuinfo", encoding="utf-8") as fh:
            for line in fh:
                if line.lower().startswith("model name"):
                    return line.split(":", 1)[1].strip()
    except OSError:
        pass
    return platform.processor() or "unknown"


def repo_fingerprint(repo_root: Path) -> dict:
    def git(*args: str) -> str:
        try:
            return subprocess.run(["git", "-C", str(repo_root), *args], check=True, capture_output=True, text=True).stdout.strip()
        except Exception:
            return "unknown"

    return {"head": git("rev-parse", "HEAD"), "dirty": bool(git("status", "--porcelain", "--untracked-files=no"))}


def environment_fingerprint(repo_root: Path) -> dict:
    import numpy

    return {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "cpu": _cpu_model(),
        "cores": os.cpu_count(),
        "numpy": numpy.__version__,
        "slay2": repo_fingerprint(repo_root),
    }
