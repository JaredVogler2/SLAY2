"""Pure helpers of the behaviour-cloning warm start. Needs neither the simulator nor torch, so it also runs in CI."""

from __future__ import annotations

import numpy as np

from slay2_sim.rl import bc


def test_discounted_returns_match_the_definition():
    r = [1.0, 0.0, -2.0, 3.0]
    g = 0.5
    expected = [1.0 + g * (0.0 + g * (-2.0 + g * 3.0)), 0.0 + g * (-2.0 + g * 3.0), -2.0 + g * 3.0, 3.0]
    assert np.allclose(bc.discounted_returns(r, g), expected)


def test_discounted_returns_of_an_empty_episode_is_empty():
    assert bc.discounted_returns([], 0.99).shape == (0,)


def test_undiscounted_return_is_the_suffix_sum():
    r = [0.1, -0.2, 0.3, 1.0]
    assert np.allclose(bc.discounted_returns(r, 1.0), np.cumsum(r[::-1])[::-1])


def test_holdout_never_splits_an_episode():
    # three decisions per episode, episode ids repeat: every decision of one episode lands on the same side
    ids = np.repeat(np.arange(100), 3)
    train, hold = bc.split_by_episode(ids)
    assert (train ^ hold).all()
    for e in range(100):
        sides = {bool(hold[i]) for i in np.flatnonzero(ids == e)}
        assert len(sides) == 1
    assert hold.sum() == 3 * len(range(0, 100, bc.HOLDOUT_EVERY))
