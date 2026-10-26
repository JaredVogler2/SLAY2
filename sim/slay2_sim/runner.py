"""Evidence-grade episode runner (ADR-012).

Drives ``RunManager`` directly (never the gym wrapper, which converts exceptions and timeouts into
losses). Every episode ends in exactly one :class:`Outcome`. Policies get only the fair observation.
"""

from __future__ import annotations

import gzip
import hashlib
import json
import signal
import time
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from .isolation import deliberation
from .observation import obs_hash, observe
from .outcomes import EpisodeRecord, Outcome


@dataclass(frozen=True)
class RunConfig:
    character: str = "Ironclad"
    ascension: int = 0
    max_steps: int = 20000          # decisions per episode
    max_turns_per_combat: int = 80  # end_turn actions inside one combat
    stall_limit: int = 200          # identical consecutive observations => stall
    wall_seconds: float = 900.0     # hard wall-clock cap per episode (SIGALRM)
    start_with_neow: bool = True    # the real game always opens with the Ancient event (hazard 4)
    profile: str = "veteran"        # "veteran" (no tutorial scripting) | "first_run" (simulator default: scripted early content)

    def describe(self) -> dict:
        return dict(self.__dict__)


# A veteran profile = "not the profile's first-ever run" and "some epochs unlocked". In the simulator this only
# switches off the tutorial scripting (fixed early card packs/potions, scripted first '?' rooms); everything else
# is already unlocked by default (docs/SIMULATOR-CANDIDATE-MATRIX.md, hazard 6).
VETERAN_UNLOCKS = {"number_of_runs": 10, "epoch_unlock_count": 20}
PROFILES = ("veteran", "first_run")
_VET_CLS = None


def _veteran_run_state_cls():
    global _VET_CLS
    if _VET_CLS is None:
        from sts2_env.run.run_state import RunState

        class VeteranRunState(RunState):
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.player.unlock_state.update(VETERAN_UNLOCKS)

        _VET_CLS = VeteranRunState
    return _VET_CLS


def new_run(cfg: "RunConfig", seed: int):
    """Construct a run for ``cfg`` (profile applied before the opening Ancient event)."""
    if cfg.profile not in PROFILES:
        raise ValueError(f"profile must be one of {PROFILES}")
    import sts2_env.run.run_manager as rm

    from .warmup import warm_simulator

    warm_simulator()  # once per process: a game must not depend on how many games the process played before it (warmup.py)
    previous = rm.RunState
    if cfg.profile == "veteran":
        rm.RunState = _veteran_run_state_cls()
    try:
        return rm.RunManager(seed=seed, character_id=cfg.character, ascension_level=cfg.ascension, start_with_neow=cfg.start_with_neow)
    finally:
        rm.RunState = previous


class EpisodeWallTimeout(Exception):
    pass


@contextmanager
def wall_timer(seconds: float):
    if not seconds or not hasattr(signal, "setitimer"):
        yield
        return

    def handler(signum, frame):
        raise EpisodeWallTimeout(f"episode exceeded {seconds:.0f}s wall clock")

    previous = signal.signal(signal.SIGALRM, handler)
    signal.setitimer(signal.ITIMER_REAL, seconds)
    try:
        yield
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


def policy_seed_for(policy_name: str, run_seed: int) -> int:
    """Policy-private RNG seed: a hash, never the run seed itself, and never visible to the policy."""
    digest = hashlib.sha256(f"slay2-policy:{policy_name}:{run_seed}".encode()).digest()
    return int.from_bytes(digest[:8], "big")


class ManagerForwardModel:
    """Hands search policies fairly determinized clones of the live run (and nothing else)."""

    def __init__(self, mgr):
        self._mgr = mgr

    def clone(self, seed: int):
        from .clone import clone_manager
        from .hidden import fair_determinize

        c = clone_manager(self._mgr)
        fair_determinize(c, seed)
        return c


class TraceWriter:
    """Compact gz-JSONL trace: one line per decision with the observation hash and the chosen index."""

    def __init__(self, path: Path):
        path.parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        self._fh = gzip.open(path, "wt", encoding="utf-8", compresslevel=6)

    def write(self, step: int, phase: str, h: str, n: int, idx: int) -> None:
        self._fh.write(json.dumps({"t": step, "ph": phase, "h": h, "n": n, "a": idx}, separators=(",", ":")) + "\n")

    def close(self) -> str:
        self._fh.close()
        digest = hashlib.sha256(self.path.read_bytes()).hexdigest()
        return digest


def _fill_final_state(rec: EpisodeRecord, mgr) -> None:
    rs = mgr.run_state
    p = rs.player
    rec.act = int(rs.current_act_index)
    rec.floor = int(rs.total_floor)
    rec.hp = int(p.current_hp)
    rec.max_hp = int(p.max_hp)
    rec.gold = int(p.gold)
    rec.deck_size = len(p.deck)
    rec.relics = len(p.relics)


def run_episode(
    cfg: RunConfig,
    seed: int,
    policy,
    *,
    batch_id: str,
    trace_path: Path | None = None,
) -> EpisodeRecord:
    rec = EpisodeRecord(
        batch_id=batch_id, seed=seed, character=cfg.character, ascension=cfg.ascension,
        policy=policy.name, policy_version=policy.version, outcome=Outcome.ABORTED.value,
        extra={"profile": cfg.profile},
    )
    t0 = time.perf_counter()
    trace = TraceWriter(trace_path) if trace_path else None
    mgr = None
    last_enemies: list[str] = []
    stage = "sim"  # which component an exception belongs to: sim | adapter | policy
    try:
        with wall_timer(cfg.wall_seconds):
            mgr = new_run(cfg, seed)
            policy.reset(policy_seed_for(policy.name, seed))
            fm = ManagerForwardModel(mgr) if policy.needs_forward_model else None
            steps = turns_in_combat = same = combats_won = 0
            last_hash, last_phase = None, mgr.phase
            outcome: Outcome | None = None
            while True:
                if mgr.is_over:
                    break
                if steps >= cfg.max_steps:
                    outcome = Outcome.TIMEOUT
                    rec.error = f"max_steps={cfg.max_steps}"
                    break
                stage = "sim"
                actions = mgr.get_available_actions()
                if not actions:
                    outcome, rec.error = Outcome.SIMULATOR_ERROR, "no legal actions but run not over"
                    break
                stage = "adapter"
                obs = observe(mgr, actions)
                h = obs_hash(obs)
                same = same + 1 if h == last_hash else 0
                last_hash = h
                if same >= cfg.stall_limit:
                    outcome, rec.error = Outcome.TIMEOUT, f"stall: {cfg.stall_limit} identical observations"
                    break
                if "combat" in obs:
                    last_enemies = [e["id"] for e in obs["combat"]["enemies"] if e["alive"]]
                stage = "policy"
                with deliberation():  # search on clones must leave no trace in the live game (isolation.py)
                    idx = policy.act(obs, actions, fm)
                stage = "sim"
                if not isinstance(idx, int) or not 0 <= idx < len(actions):
                    outcome, rec.error = Outcome.INVALID_ACTION, f"policy returned {idx!r} for {len(actions)} legal actions"
                    break
                if trace:
                    trace.write(steps, obs["phase"], h, len(actions), idx)
                action = actions[idx]
                result = mgr.take_action(action)
                steps += 1
                rec.steps = steps
                desc = str(result.get("description", ""))
                if desc.startswith("Invalid action"):
                    outcome, rec.error = Outcome.INVALID_ACTION, desc
                    break
                if action.get("action") == "end_turn":
                    turns_in_combat += 1
                    if turns_in_combat > cfg.max_turns_per_combat:
                        outcome, rec.error = Outcome.TIMEOUT, f"combat exceeded {cfg.max_turns_per_combat} turns"
                        break
                if last_phase == "COMBAT" and mgr.phase != "COMBAT":
                    turns_in_combat = 0
                    if not mgr.is_over:
                        combats_won += 1
                last_phase = mgr.phase
            rec.steps = steps
            rec.combats_won = combats_won
            if hasattr(policy, "episode_stats"):
                rec.extra.update(policy.episode_stats())
            if outcome is None:
                outcome = Outcome.WIN if mgr.player_won else Outcome.DEATH
                if outcome is Outcome.DEATH:
                    rec.killed_by = ",".join(last_enemies) or None
            rec.outcome = outcome.value
    except EpisodeWallTimeout as e:
        rec.outcome, rec.error = Outcome.TIMEOUT.value, str(e)
    except Exception as e:  # noqa: BLE001 - classification point; attribute the exception to its component
        rec.outcome = {"sim": Outcome.SIMULATOR_ERROR, "adapter": Outcome.HARNESS_ERROR, "policy": Outcome.POLICY_ERROR}[stage].value
        rec.error = f"{type(e).__name__}: {str(e)[:300]}"
    finally:
        if mgr is not None:
            try:
                _fill_final_state(rec, mgr)
            except Exception:  # noqa: BLE001
                pass
        if trace:
            rec.trace_sha256 = trace.close()
        rec.wall_seconds = round(time.perf_counter() - t0, 4)
    return rec


def replay_manager(cfg: RunConfig, seed: int, trace_path: Path, on_step=None) -> tuple[bool, str, object]:
    """Re-drive a fresh run with the recorded action indices and verify every observation hash.

    Returns ``(ok, message, manager)``; the manager is left in whatever state the replay reached. ``on_step(manager)`` is
    called after every replayed action (used to count boss fights).
    """
    mgr = new_run(cfg, seed)
    n = 0
    with gzip.open(trace_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            row = json.loads(line)
            actions = mgr.get_available_actions()
            obs = observe(mgr, actions)
            if obs_hash(obs) != row["h"]:
                return False, f"observation hash mismatch at step {row['t']} (phase {row['ph']})", mgr
            if len(actions) != row["n"]:
                return False, f"legal-action count mismatch at step {row['t']}", mgr
            mgr.take_action(actions[row["a"]])
            n += 1
            if on_step is not None:
                on_step(mgr)
    return True, f"{n} steps replayed bit-for-bit (observation hashes identical)", mgr


def replay_from_trace(cfg: RunConfig, seed: int, trace_path: Path) -> tuple[bool, str]:
    """Re-drive a fresh run with the recorded action indices and verify every observation hash."""
    ok, message, _ = replay_manager(cfg, seed, trace_path)
    return ok, message
