#!/usr/bin/env python3
"""Which batches under experiments/batches hold a game of the val2 seeds (ADR-061 item 9).

A batch is one partition, so the seed of its first episode says which. The manifest is written last, so a run that was started by hand under any batch
id and died before it ended is found too (the name of a directory is not what is looked at). Prints one batch id a line; the exit status is 0 whatever it
finds (the preflight reads the list).

    python3 scripts/studies/acts/val2_played.py [--batches experiments/batches] [--seeds experiments/seeds/ironclad-a0-v3.json]
"""
from __future__ import annotations

import argparse
import gzip
import json
from pathlib import Path


def first_seed(batch: Path) -> int | None:
    gz, plain = batch / "episodes.jsonl.gz", batch / "episodes.jsonl"
    for opener, path in ((gzip.open, gz), (open, plain)):
        if not path.exists():
            continue
        try:
            with opener(path, "rt", encoding="utf-8") as fh:  # type: ignore[operator]
                for line in fh:
                    if line.strip():
                        return int(json.loads(line)["seed"])
        except (OSError, ValueError, KeyError, EOFError):
            continue
    return None


def played(batches: Path, seeds_file: Path) -> list[str]:
    val2 = set(json.loads(seeds_file.read_text(encoding="utf-8"))["partitions"]["val2"])
    found = []
    for d in sorted(p for p in batches.iterdir() if p.is_dir()) if batches.is_dir() else []:
        seed = first_seed(d)
        if seed is not None and seed in val2:
            found.append(d.name)
    return found


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--batches", type=Path, default=Path("experiments/batches"))
    ap.add_argument("--seeds", type=Path, default=Path("experiments/seeds/ironclad-a0-v3.json"))
    args = ap.parse_args(argv)
    for name in played(args.batches, args.seeds):
        print(name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
