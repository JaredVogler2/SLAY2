"""The tables of docs/MODEL-AND-DATA-CARDS.md and docs/RELEASE-AUDIT.md are written from the committed experiment files.

Numbers typed into prose go stale (a paused run described at the wrong iteration, a rule count that a parser had inflated); a
table that `scripts/docs-tables.py` writes from `experiments/` cannot disagree with it. This test is the reminder to regenerate
(`python3 scripts/docs-tables.py --write`) after any change to the experiments, the gaps registry or the site data. It reads
only committed files, so it runs in CI without the third-party simulator.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def test_the_tables_of_the_cards_and_the_audit_are_current():
    run = subprocess.run([sys.executable, str(ROOT / "scripts" / "docs-tables.py"), "--check"], capture_output=True, text=True, cwd=ROOT)
    assert run.returncode == 0, run.stdout + run.stderr
