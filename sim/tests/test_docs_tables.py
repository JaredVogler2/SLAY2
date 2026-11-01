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


def _docs_tables():
    import importlib.util

    spec = importlib.util.spec_from_file_location("docs_tables", ROOT / "scripts" / "docs-tables.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_a_batch_on_val2_counts_as_held_out_and_the_sealed_partition_is_not_a_row():
    import pytest

    docs = _docs_tables()
    assert docs.seed_use("val") == docs.seed_use("val2") == docs.HELD_OUT
    assert docs.seed_use("train") == docs.seed_use("dev") == docs.DEVELOPMENT
    with pytest.raises(ValueError, match="test"):
        docs.seed_use("test")  # a game on the sealed partition would be a mistake worth stopping the table for
