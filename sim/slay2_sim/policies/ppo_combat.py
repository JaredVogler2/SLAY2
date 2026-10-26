"""ppo_combat_v1 - a trained combat network inside the rules_v1 run policy.

Every non-combat decision (map, rewards, shop, rest sites, events) is rules_v1; only the decisions taken while a combat is
active come from the network. The network sees the same fair observation as every other policy (``rl.features.encode`` is a
pure function of it). The checkpoint's SHA-256 must be supplied in a batch so the result names the exact weights.
"""

from __future__ import annotations

import hashlib
from pathlib import Path

from . import register
from .rules import RulesV1


def file_sha256(path: Path) -> str:
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


@register
class PPOCombatV1(RulesV1):
    name = "ppo_combat_v1"
    version = "1"

    def __init__(self, checkpoint: str, checkpoint_sha256: str | None = None, greedy: bool = True, **params):
        super().__init__(checkpoint=checkpoint, checkpoint_sha256=checkpoint_sha256, greedy=greedy, **params)
        import torch

        from ..rl import net as N

        path = Path(checkpoint)
        digest = file_sha256(path)
        if checkpoint_sha256 and digest != checkpoint_sha256:
            raise ValueError(f"checkpoint {path.name} has sha256 {digest}, expected {checkpoint_sha256}")
        self.digest = digest
        torch.set_num_threads(1)
        self.model = N.load(path)
        self.greedy = greedy
        self.stat_combat_decisions = 0

    def reset(self, rng_seed: int) -> None:
        super().reset(rng_seed)
        self.stat_combat_decisions = 0

    def episode_stats(self) -> dict:
        return {"combat_decisions": self.stat_combat_decisions}

    def _decide(self, obs, actions, fm=None):
        if obs["phase"] != "COMBAT" or "combat" not in obs:
            return super()._decide(obs, actions, fm)
        import torch

        from ..rl import features as ft
        from ..rl import net as N

        table = ft.action_table(obs["actions"])
        if not table:  # nothing fits the fixed layout: let the rules policy decide
            return super()._decide(obs, actions, fm)
        enc = ft.encode(obs)
        with torch.inference_mode():
            logits, _ = self.model(N.to_tensors({k: v[None] for k, v in enc.items()}))
            if self.greedy:
                aid = int(logits.argmax(-1))
            else:
                probs = torch.softmax(logits[0], -1).tolist()
                aid = self.rng.choices(range(len(probs)), weights=probs, k=1)[0]
        self.stat_combat_decisions += 1
        return table[aid]
