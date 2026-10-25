"""Closure-aware deep copy for the third-party simulator.

Why: ``copy.deepcopy`` treats Python functions as atomic, so the simulator's per-monster move closures
(``def peck(combat): ... creature ...``) keep pointing at the *original* creature inside a cloned
``RunManager``. Enemy-turn lookahead on such a clone silently uses the wrong state (measured: 38/80
random combat sequences diverged from the live run; see docs/SIMULATOR-CANDIDATE-MATRIX.md).

``clone_manager`` temporarily teaches ``copy.deepcopy`` to copy functions that close over mutable state:
a new function object is created whose closure cells are *new cells* whose contents are deep-copied
through the same memo (so cells shared between sibling closures stay shared, and references to objects
already cloned are re-pointed at their clones).

Not thread-safe (it patches ``copy._deepcopy_dispatch`` for the duration of the call).
"""

from __future__ import annotations

import copy
import types
from contextlib import contextmanager

_FN = types.FunctionType


def _deepcopy_function(fn: types.FunctionType, memo: dict):
    done = memo.get(id(fn))
    if done is not None:
        return done
    if not fn.__closure__ and not fn.__defaults__ and not fn.__kwdefaults__:
        memo[id(fn)] = fn  # nothing to rebind
        return fn

    cells: list[types.CellType] = []
    to_fill: list[tuple[types.CellType, types.CellType]] = []
    for old in fn.__closure__ or ():
        new = memo.get(id(old))
        if new is None:
            new = types.CellType()
            memo[id(old)] = new
            to_fill.append((old, new))
        cells.append(new)

    new_fn = types.FunctionType(fn.__code__, fn.__globals__, fn.__name__, None, tuple(cells) if cells else None)
    new_fn.__qualname__ = fn.__qualname__
    new_fn.__module__ = fn.__module__
    new_fn.__doc__ = fn.__doc__
    new_fn.__annotations__ = fn.__annotations__
    memo[id(fn)] = new_fn  # register before descending: closures may reference themselves

    for old, new in to_fill:
        try:
            value = old.cell_contents
        except ValueError:  # empty cell
            continue
        new.cell_contents = copy.deepcopy(value, memo)
    if fn.__defaults__:
        new_fn.__defaults__ = copy.deepcopy(fn.__defaults__, memo)
    if fn.__kwdefaults__:
        new_fn.__kwdefaults__ = copy.deepcopy(fn.__kwdefaults__, memo)
    return new_fn


@contextmanager
def closure_aware_deepcopy():
    previous = copy._deepcopy_dispatch.get(_FN)
    copy._deepcopy_dispatch[_FN] = _deepcopy_function
    try:
        yield
    finally:
        if previous is None:
            copy._deepcopy_dispatch.pop(_FN, None)
        else:
            copy._deepcopy_dispatch[_FN] = previous


def clone_manager(mgr):
    """Faithful clone of a ``RunManager`` (state, RNG streams, and rebound monster closures)."""
    with closure_aware_deepcopy():
        return copy.deepcopy(mgr)
