"""A policy's deliberation must not change the game it is deliberating about.

Search policies deliberate on clones of the live run. Clones and the live run are separate object graphs, but the simulator
hands out card instance ids from one module-level counter (``sts2_env.cards.base._next_instance_id``), so every card a clone
creates while it is stepped advances the counter the *live* game uses next. Measured on seed 81161925 with the rules policy
and search-style clone play in between its decisions: the live game stops matching the clean one at step 187 (a different
card is exhausted), so the recorded action indices no longer replay and, in principle, a policy could steer the live game's
future by burning ids. ``deliberation()`` restores the counter when the policy has decided; clones are discarded by then, so
re-using their ids is harmless. The runner wraps every ``policy.act`` in it.
"""

from __future__ import annotations

from contextlib import contextmanager


@contextmanager
def deliberation():
    """Leave the simulator's global card-id counter exactly as it was found."""
    from sts2_env.cards import base

    saved = base._next_instance_id
    try:
        yield
    finally:
        base._next_instance_id = saved
