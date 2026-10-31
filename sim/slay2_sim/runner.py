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

from .classes import ClassError, check_start, exact_character, game_start_hp
from .isolation import deliberation
from .observation import obs_hash, observe
from .outcomes import EpisodeRecord, Outcome


MAX_ASCENSION = 10  # STS2's highest Ascension (rule ASC-1); there is no A11 to A20


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
    # A harness variant, never the simulator's own behaviour and off in every batch written before G11 was recorded: the
    # game opens each act with an Ancient event that first heals the player (the simulator starts acts 2 and 3 on the map).
    ancient_heal: bool = False
    # A harness variant for gap G13, never the simulator's own behaviour and off in every other batch: start the class with the
    # maximum HP the game's source gives it (Necrobinder 66, the simulator says 75; the other four classes are equal).
    game_hp: bool = False
    # A harness variant for gap G14, never the simulator's own behaviour and off in every other batch: keep the relics a run gains
    # after its first fight (the pinned simulator drops them when the next fight starts; see ``_keep_relics_manager_cls``).
    keep_relics: bool = False

    def __post_init__(self) -> None:
        # the simulator silently plays any class id it does not know exactly as Ironclad (classes.py, ADR-049)
        exact_character(self.character)
        # STS2 has Ascension 0 to 10 and nothing above (rule ASC-1); a higher number would be played as something else without a word
        if not isinstance(self.ascension, int) or isinstance(self.ascension, bool) or not 0 <= self.ascension <= MAX_ASCENSION:
            raise ValueError(f"ascension must be an integer from 0 to {MAX_ASCENSION}, got {self.ascension!r}")

    def describe(self) -> dict:
        d = dict(self.__dict__)
        for variant in ("ancient_heal", "game_hp", "keep_relics"):
            if not d[variant]:
                del d[variant]  # the fingerprint of every earlier batch stays what it was
        return d


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


def ancient_heal_amount(missing_hp: int, ascension: int) -> int:
    """Hit points the Ancient event restores before it offers anything (E1 ``AncientEventModel.BeforeEventStarted``).

    All the missing hit points, and 80 % of them from Ascension 2 (Weary Traveler). The game adds the decimal product to
    the current HP and truncates, so the amount is the integer part of ``0.8 * missing``.
    """
    if missing_hp <= 0:
        return 0
    return missing_hp if ascension < 2 else (missing_hp * 4) // 5


_HEAL_MANAGER_CLS = None


def _ancient_heal_manager_cls():
    """A manager that heals as the Ancient event does when an act begins (a method, not a closure: ``clone_manager`` keeps the class)."""
    global _HEAL_MANAGER_CLS
    if _HEAL_MANAGER_CLS is None:
        import sts2_env.run.run_manager as rm

        class AncientHealRunManager(rm.RunManager):
            def _transition_next_act(self) -> None:
                super()._transition_next_act()
                if not self.is_over:  # the transition after the last act is the victory, not a new act
                    player = self.run_state.player
                    player.heal(ancient_heal_amount(player.max_hp - player.current_hp, self.run_state.ascension_level))

        _HEAL_MANAGER_CLS = AncientHealRunManager
    return _HEAL_MANAGER_CLS


_KEEP_RELICS_CLS: dict[type, type] = {}


def _keep_relics_manager_cls(base: type) -> type:
    """``base`` with gap G14 repaired (a harness variant, never the simulator's own behaviour).

    ``RunState.relics`` is an alias of the player's relic list. The setup of a run's first fight (``CombatState`` building the
    player's state) gives the player a new list, so from then on the alias is stale: a relic gained afterwards (a chest, a shop,
    an elite, a boss, an event) is appended to the new list, and the next fight's setup rebuilds the player's relics from the
    stale alias and drops it. Pointing the alias back at the player's list after every action keeps one list. A method, not a
    closure: ``clone_manager`` keeps the class."""
    if base not in _KEEP_RELICS_CLS:

        class KeepRelicsRunManager(base):  # type: ignore[misc, valid-type]
            def take_action(self, action):
                result = super().take_action(action)
                self.run_state.relics = self.run_state.player.relics
                return result

        _KEEP_RELICS_CLS[base] = KeepRelicsRunManager
    return _KEEP_RELICS_CLS[base]


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
    manager_cls = _ancient_heal_manager_cls() if cfg.ancient_heal else rm.RunManager
    if cfg.keep_relics:
        manager_cls = _keep_relics_manager_cls(manager_cls)
    try:
        mgr = manager_cls(seed=seed, character_id=cfg.character, ascension_level=cfg.ascension, start_with_neow=cfg.start_with_neow)
    finally:
        rm.RunState = previous
    if cfg.game_hp:
        player = mgr.run_state.player
        player.max_hp = player.current_hp = game_start_hp(cfg.character)
    check_start(mgr, cfg.character, cfg.ascension, cfg.game_hp)  # the class that was asked for is the class that was played
    return mgr


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


# A policy that is the *same pilot* as another with one rule varied draws its private randomness from the other's stream, so that two arms
# that differ in that rule alone play the same game until the rule first matters (ADR-060: rules_v2_late is rules_v2 with another card rule in
# Act 2; without this the anti-stall fallback of rules_v1, the only use of the private stream in either, could send the two arms different
# ways in Act 1). Every other name is hashed as itself, so no earlier batch is touched.
SAME_PILOT_AS = {"rules_v2_late": "rules_v2"}


def policy_seed_for(policy_name: str, run_seed: int) -> int:
    """Policy-private RNG seed: a hash, never the run seed itself, and never visible to the policy."""
    stream = SAME_PILOT_AS.get(policy_name, policy_name)
    digest = hashlib.sha256(f"slay2-policy:{stream}:{run_seed}".encode()).digest()
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
    except ClassError:
        raise  # a run that is not the class it claims to be is a wrong experiment, not a game result: stop, never record it
    except Exception as e:  # noqa: BLE001 - classification point; attribute the exception to its component
        rec.outcome = {"sim": Outcome.SIMULATOR_ERROR, "adapter": Outcome.HARNESS_ERROR, "policy": Outcome.POLICY_ERROR}[stage].value
        rec.error = f"{type(e).__name__}: {str(e)[:300]}"
    finally:
        if getattr(policy, "stats_on_failure", False):
            # a policy that measures something about the run (the Neow study: which relic it took) says so for a run that
            # ended in an error or a wall-clock timeout too, so those games can be counted against what they took
            try:
                rec.extra.update(policy.episode_stats())
            except Exception:  # noqa: BLE001 - the record of a failed run is still written
                pass
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
