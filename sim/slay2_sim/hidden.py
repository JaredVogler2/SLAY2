"""Hidden-state utilities: adversarial perturbation (tests) and fair determinization (search).

Fairness contract (docs/INFORMATION-FAIRNESS.md): a policy may depend on the *visible* state and on its
own private RNG only. ``fair_determinize`` replaces everything hidden in a clone (draw-pile order and every
RNG stream) with samples that depend only on (visible multiset, policy seed) - the draw pile is sorted into a
canonical order *before* shuffling, so the result is identical for any two hidden states that look the same.
"""

from __future__ import annotations

import collections
import functools
import random
import types
from typing import Iterator

from .observation import _card_key


def _iter_children(obj) -> Iterator:
    """Yield objects referenced by ``obj`` in a deterministic order, without following module globals."""
    if isinstance(obj, dict):
        for k in sorted(obj, key=repr):
            yield k
            yield obj[k]
    elif isinstance(obj, (list, tuple, collections.deque)):
        yield from obj
    elif isinstance(obj, (set, frozenset)):
        yield from sorted(obj, key=repr)
    elif isinstance(obj, types.FunctionType):
        for cell in obj.__closure__ or ():
            try:
                yield cell.cell_contents
            except ValueError:
                pass
        if obj.__defaults__:
            yield from obj.__defaults__
        if obj.__kwdefaults__:
            yield from (obj.__kwdefaults__[k] for k in sorted(obj.__kwdefaults__))
    elif isinstance(obj, types.MethodType):
        yield obj.__self__
    elif isinstance(obj, functools.partial):
        yield obj.func
        yield from obj.args
        yield from (obj.keywords[k] for k in sorted(obj.keywords))
    else:
        d = getattr(obj, "__dict__", None)
        if isinstance(d, dict):
            for k in sorted(d):
                yield d[k]
        for klass in type(obj).__mro__:
            slots = klass.__dict__.get("__slots__", ())
            for s in ([slots] if isinstance(slots, str) else slots):
                if s in ("__dict__", "__weakref__"):
                    continue
                try:
                    yield getattr(obj, s)
                except AttributeError:
                    pass


def _descend(obj) -> bool:
    if obj is None or isinstance(obj, (str, bytes, int, float, bool, type, types.ModuleType, types.BuiltinFunctionType)):
        return False
    if isinstance(obj, (dict, list, tuple, set, frozenset, collections.deque, types.FunctionType, types.MethodType, functools.partial)):
        return True
    module = type(obj).__module__ or ""
    return module.startswith("sts2_env")


def find_rngs(root) -> list:
    """All simulator ``Rng`` instances reachable from ``root`` (incl. via closures), deterministic order."""
    from sts2_env.core.rng import Rng

    found, seen, stack = [], set(), [root]
    while stack:
        obj = stack.pop()
        if id(obj) in seen or not _descend(obj):
            continue
        seen.add(id(obj))
        if isinstance(obj, Rng):
            found.append(obj)
            continue
        children = list(_iter_children(obj))
        stack.extend(reversed(children))  # keep left-to-right discovery order
    return found


def reinit_rng(rng, seed: int) -> None:
    from sts2_env.core.rng import Rng

    fresh = Rng(seed)
    rng._base_seed, rng._seed, rng._rng, rng._counter = fresh._base_seed, fresh._seed, fresh._rng, 0


def reseed_all(mgr, seed: int) -> int:
    """Re-initialise every reachable RNG stream from ``seed``. Returns how many streams were reseeded."""
    prng = random.Random(seed)
    rngs = find_rngs(mgr)
    for r in rngs:
        reinit_rng(r, prng.getrandbits(31))
    return len(rngs)


def perturb_hidden(mgr, seed: int) -> None:
    """Adversarially change hidden state without changing anything a player can see (used by tests)."""
    prng = random.Random(seed)
    combat = mgr.get_combat_state()
    if combat is not None:
        pile = list(combat.draw_pile)
        before = [id(c) for c in pile]
        prng.shuffle(pile)
        if len(pile) > 1 and [id(c) for c in pile] == before:
            pile.append(pile.pop(0))  # a shuffle can reproduce the order; an adversary must actually change it
        combat.draw_pile = pile
    reseed_all(mgr, seed ^ 0x9E3779B1)


def fair_determinize(mgr, seed: int) -> None:
    """Replace hidden state in a *clone* by a sample depending only on (visible multiset, ``seed``)."""
    combat = mgr.get_combat_state()
    if combat is not None:
        pile = sorted(combat.draw_pile, key=_card_key)  # canonical, order-free starting point
        random.Random(seed ^ 0x5A5A5A5A).shuffle(pile)
        combat.draw_pile = pile
    reseed_all(mgr, seed)
