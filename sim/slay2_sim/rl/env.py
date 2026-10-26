"""Single-combat training environment built from real run states.

A *snapshot* is a live ``RunManager`` cloned right **before** the action that enters a combat (a map move or an event
choice), taken while a baseline policy played a real run. ``reset`` clones one, re-randomises every hidden stream
(``reseed_all``: draw order, monster AI, damage rolls) and enters the fight, so the agent meets realistic decks, relics,
potions and HP, with a fresh opening hand every time. The episode ends at the first non-combat observation (won) or when
the run is over (died). Observations are the fair ones from ``slay2_sim.observation``.

Reward (per decision): ``-hp_weight * (HP lost / max HP)``, ``-potion_cost`` for each potion used, ``+1`` for winning the
fight, ``-1`` for dying or hitting the step cap. HP matters because it is the currency carried into every later fight.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

import numpy as np

from ..clone import clone_manager
from ..hidden import reseed_all
from ..observation import observe
from ..runner import RunConfig, new_run, policy_seed_for
from . import features

NODE_WEIGHTS = {"BOSS": 3.0, "ELITE": 2.0}


@dataclass
class Snapshot:
    mgr: object
    action_index: int
    node: str | None
    act: int
    floor: int
    enemies: tuple[str, ...]
    seed: int


def _entered_node(obs: dict, action: dict) -> str | None:
    """Type of the map node a ``move`` action walks into."""
    m = obs.get("map")
    coord = action.get("coord")
    if m and coord:
        for col, row, kind in m["nodes"]:
            if [col, row] == list(coord):
                return kind
    return None


def collect_snapshots(
    seeds: list[int],
    *,
    policy_name: str = "rules_v1",
    cfg: RunConfig | None = None,
    keep_monster: float = 0.35,
    rng_seed: int = 0,
    max_steps: int = 6000,
) -> list[Snapshot]:
    """Play ``policy_name`` on each seed and keep the pre-combat state of (a sample of) its fights."""
    from ..policies import make_policy

    cfg = cfg or RunConfig()
    rng = random.Random(rng_seed)
    out: list[Snapshot] = []
    for seed in seeds:
        mgr = new_run(cfg, seed)
        policy = make_policy(policy_name)
        policy.reset(policy_seed_for(policy.name, seed))
        steps = 0
        while not mgr.is_over and steps < max_steps:
            acts = mgr.get_available_actions()
            if not acts:
                break
            obs = observe(mgr, acts)
            phase = obs["phase"]
            candidate = clone_manager(mgr) if phase in ("MAP_CHOICE", "EVENT") else None
            idx = policy.act(obs, acts, None)
            mgr.take_action(acts[idx])
            steps += 1
            if candidate is not None and mgr.phase == "COMBAT":
                after = observe(mgr)
                node = _entered_node(obs, obs["actions"][idx]) if phase == "MAP_CHOICE" else "EVENT"
                if node in ("MONSTER", "UNKNOWN", "EVENT") and rng.random() > keep_monster:
                    continue
                out.append(
                    Snapshot(
                        mgr=candidate,
                        action_index=idx,
                        node=node,
                        act=after["run"]["act"],
                        floor=after["run"]["total_floor"],
                        enemies=tuple(e["id"] for e in after["combat"]["enemies"]),
                        seed=seed,
                    )
                )
    return out


@dataclass
class EpisodeInfo:
    won: bool = False
    node: str | None = None
    act: int = 0
    enemies: tuple[str, ...] = ()
    hp_start: int = 0
    hp_end: int = 0
    max_hp: int = 1
    turns: int = 0
    potions_used: int = 0
    steps: int = 0
    truncated: bool = False


@dataclass
class CombatEnv:
    library: list[Snapshot]
    seed: int = 0
    hp_weight: float = 0.5
    potion_cost: float = 0.1
    max_steps: int = 300
    node_weights: dict = field(default_factory=lambda: dict(NODE_WEIGHTS))

    def __post_init__(self) -> None:
        self.rng = random.Random(self.seed)
        self._weights = [self.node_weights.get(s.node or "", 1.0) for s in self.library]
        self.mgr = None
        self._raw: list = []
        self.obs: dict | None = None
        self.table: dict[int, int] = {}
        self.info = EpisodeInfo()
        self._hp = 0

    # ------------------------------------------------------------------ api
    def reset(self, snapshot: Snapshot | None = None) -> dict[str, np.ndarray]:
        for _ in range(20):
            snap = snapshot or self.rng.choices(self.library, weights=self._weights, k=1)[0]
            mgr = clone_manager(snap.mgr)
            reseed_all(mgr, self.rng.getrandbits(31))
            acts = mgr.get_available_actions()
            if snap.action_index < len(acts):
                mgr.take_action(acts[snap.action_index])
            if mgr.phase == "COMBAT" and not mgr.is_over:
                self.mgr = mgr
                self._begin(snap)
                return self._encode()
            if snapshot is not None:
                break
        raise RuntimeError("could not enter a combat from the snapshot library")

    def step(self, action_id: int) -> tuple[dict[str, np.ndarray], float, bool, EpisodeInfo]:
        assert self.mgr is not None and self.obs is not None
        idx = self.table.get(int(action_id))
        if idx is None:  # the mask makes this unreachable for a correct agent; punish and end rather than guess
            self.info.truncated = True
            self.info.hp_end = self._hp
            return self._encode(), -1.0, True, self.info
        action = self.obs["actions"][idx]
        self.mgr.take_action(self._raw[idx])
        self.info.steps += 1
        reward = 0.0
        if action["action"] == "use_potion":
            self.info.potions_used += 1
            reward -= self.potion_cost
        if action["action"] == "end_turn":
            self.info.turns += 1
        p = self.mgr.run_state.player
        hp = int(p.current_hp)
        reward -= self.hp_weight * (self._hp - hp) / max(1, self.info.max_hp)
        self._hp = hp
        done = False
        if self.mgr.is_over and not self.mgr.player_won:
            reward -= 1.0
            done = True
        elif self.mgr.phase != "COMBAT":
            reward += 1.0
            self.info.won = True
            done = True
        elif self.info.steps >= self.max_steps:
            reward -= 1.0
            self.info.truncated = True
            done = True
        self.info.hp_end = hp
        if done:
            return self._terminal_obs(), reward, True, self.info
        return self._encode(), reward, False, self.info

    # ------------------------------------------------------------------ helpers
    def _begin(self, snap: Snapshot) -> None:
        p = self.mgr.run_state.player
        self._hp = int(p.current_hp)
        self.info = EpisodeInfo(
            node=snap.node, act=snap.act, enemies=snap.enemies, hp_start=self._hp, hp_end=self._hp,
            max_hp=int(p.max_hp),
        )

    def _encode(self) -> dict[str, np.ndarray]:
        self._raw = self.mgr.get_available_actions()
        self.obs = observe(self.mgr, self._raw)
        self.table = features.action_table(self.obs["actions"])
        enc = features.encode(self.obs)
        if not self.table:  # nothing in the fixed layout is legal: let the caller see an all-masked state and stop
            self.info.truncated = True
        return enc

    def _terminal_obs(self) -> dict[str, np.ndarray]:
        """The observation returned with ``done`` is never acted on; give a well-formed all-zero one."""
        self.obs = None
        return features.empty()
