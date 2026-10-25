"""Locate, verify and activate the pinned external simulator checkout (ADR-011/ADR-015).

The checkout lives in ``$SLAY2_EXTERNAL_ROOT`` (default ``<repo>/external/checkouts``), is git-ignored,
and is pinned by SHA in ``external/pins.json``. We never write into it.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
PINS_PATH = REPO_ROOT / "external" / "pins.json"
SIM_ID = "sts2-rl-agent"


class ExternalError(RuntimeError):
    """The external simulator is missing, unpinned, or modified."""


@dataclass(frozen=True)
class ExternalSim:
    id: str
    root: Path
    head: str
    pinned: str
    dirty: bool

    @property
    def pin_ok(self) -> bool:
        return self.head == self.pinned

    def describe(self) -> dict:
        return {"id": self.id, "head": self.head, "pinned": self.pinned, "pin_ok": self.pin_ok, "dirty": self.dirty}


def load_pins() -> dict:
    with open(PINS_PATH, encoding="utf-8") as fh:
        return json.load(fh)


def pinned_sha(sim_id: str = SIM_ID) -> str:
    for repo in load_pins()["repos"]:
        if repo["id"] == sim_id:
            return repo["sha"]
    raise ExternalError(f"{sim_id!r} is not listed in {PINS_PATH}")


def external_root() -> Path:
    override = os.environ.get("SLAY2_EXTERNAL_ROOT")
    return Path(override) if override else REPO_ROOT / "external" / "checkouts"


def _git(root: Path, *args: str) -> str:
    out = subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, text=True)
    return out.stdout.strip()


def locate(sim_id: str = SIM_ID, *, require_pin: bool = True, require_clean: bool = True) -> ExternalSim:
    root = (external_root() / sim_id).resolve()
    if not (root / ".git").exists():
        raise ExternalError(f"external checkout not found at {root}; run scripts/external-fetch.sh")
    head = _git(root, "rev-parse", "HEAD")
    dirty = bool(_git(root, "status", "--porcelain", "--untracked-files=no"))
    sim = ExternalSim(id=sim_id, root=root, head=head, pinned=pinned_sha(sim_id), dirty=dirty)
    if require_pin and not sim.pin_ok:
        raise ExternalError(f"{sim_id} is at {head} but external/pins.json pins {sim.pinned}")
    if require_clean and dirty:
        raise ExternalError(f"{sim_id} has local modifications; evidence-grade runs need a pristine pinned checkout")
    return sim


def activate(root: Path | str) -> None:
    """Make the simulator importable and satisfy its cwd-relative file reads.

    The simulator's card factory reads ``docs/CARDS_REFERENCE.md`` via a relative path (see
    docs/SIMULATOR-CANDIDATE-MATRIX.md, hazard 3), so the process must run with cwd == checkout root.
    Bytecode writing is disabled so the pristine checkout stays untouched.
    """
    root = Path(root)
    os.environ["PYTHONDONTWRITEBYTECODE"] = "1"
    sys.dont_write_bytecode = True
    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    os.chdir(root)
    # HAZARD (docs/SIMULATOR-CANDIDATE-MATRIX.md #10): the 68 events (incl. Neow and all Ancients) register only when the
    # `sts2_env.events` package is imported, and neither RunManager nor the gym env imports it. Without this line every
    # event room degrades to a lone "Leave" option.
    import sts2_env.events  # noqa: F401  (registration side effect)
