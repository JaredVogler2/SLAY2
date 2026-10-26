"""Shared fixtures. Tests that need the third-party simulator are skipped when the pinned checkout is absent."""

import sys

import pytest

from slay2_sim import external


@pytest.fixture(scope="session")
def sim():
    try:
        s = external.locate()
    except external.ExternalError as e:  # pragma: no cover - environment dependent
        pytest.skip(f"external simulator unavailable: {e}")
    external.activate(s.root)
    import sts2_env  # noqa: F401  (import after activation)

    return s


def drive_to_combat(seed: int, character: str = "Ironclad"):
    from sts2_env.run.run_manager import RunManager

    m = RunManager(seed=seed, character_id=character, ascension_level=0, start_with_neow=True)
    for _ in range(60):
        if m.phase == "COMBAT":
            return m
        acts = m.get_available_actions()
        if not acts:
            break
        m.take_action(acts[0])
    return m if m.phase == "COMBAT" else None
