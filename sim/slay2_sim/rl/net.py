"""Entity-token policy/value network for single-combat play.

Every thing the player can see is a token (player, hand cards, enemies, three pile summaries, relics, potions, pending
selection choices, a "no target" token). A small transformer lets tokens attend to each other; action logits are read
off the *slot* that an action refers to, with a pairwise term for (card slot, target), so the same weights serve every
hand position and every enemy. Illegal actions are masked.
"""

from __future__ import annotations

import numpy as np
import torch
from torch import nn

from . import features as ft
from . import vocab

# token layout: player | hand | enemies | piles | relics | potions | choices | none
_N_PLAYER, _N_HAND, _N_ENEMY, _N_PILE, _N_RELIC, _N_POTION, _N_CHOICE, _N_NONE = 1, ft.MAX_HAND, ft.MAX_ENEMY, 3, 1, ft.MAX_POTIONS, ft.MAX_CHOICES, 1
_O_HAND = _N_PLAYER
_O_ENEMY = _O_HAND + _N_HAND
_O_PILE = _O_ENEMY + _N_ENEMY
_O_RELIC = _O_PILE + _N_PILE
_O_POTION = _O_RELIC + _N_RELIC
_O_CHOICE = _O_POTION + _N_POTION
_O_NONE = _O_CHOICE + _N_CHOICE
N_TOKENS = _O_NONE + _N_NONE

_INT_KEYS = {"hand_id", "enemy_id", "enemy_pw_id", "player_pw_id", "pile_id", "relic_id", "potion_id", "choice_id", "prompt_id"}


def to_tensors(batch: dict[str, np.ndarray], device: str | torch.device = "cpu") -> dict[str, torch.Tensor]:
    out = {}
    for k, v in batch.items():
        t = torch.from_numpy(np.ascontiguousarray(v))
        if k in _INT_KEYS:
            t = t.long()
        elif t.dtype != torch.bool:
            t = t.float()
        out[k] = t.to(device)
    return out


class CombatNet(nn.Module):
    def __init__(self, d: int = 48, layers: int = 2, heads: int = 4, d_pw: int = 16):
        super().__init__()
        self.config = {"d": d, "layers": layers, "heads": heads, "d_pw": d_pw}
        sz = vocab.sizes()
        self.card = nn.Embedding(sz["card"], d, padding_idx=0)
        self.upgraded = nn.Parameter(torch.zeros(d))
        self.monster = nn.Embedding(sz["monster"], d, padding_idx=0)
        self.relic = nn.Embedding(sz["relic"], d, padding_idx=0)
        self.potion = nn.Embedding(sz["potion"], d, padding_idx=0)
        self.prompt = nn.Embedding(sz["prompt"], d, padding_idx=0)
        self.power = nn.Embedding(sz["power"], d_pw, padding_idx=0)

        self.player_in = nn.Linear(ft.F_PLAYER + d_pw + d, d)
        self.hand_in = nn.Linear(ft.F_HAND + d, d)
        self.enemy_in = nn.Linear(ft.F_ENEMY + d + d_pw, d)
        self.pile_in = nn.ModuleList([nn.Linear(d, d) for _ in range(3)])
        self.relic_in = nn.Linear(d, d)
        self.potion_in = nn.Linear(ft.F_POTION + d, d)
        self.choice_in = nn.Linear(ft.F_CHOICE + d, d)
        self.none_token = nn.Parameter(torch.zeros(d))
        self.kind = nn.Embedding(8, d)
        self.register_buffer("kind_ids", torch.tensor(
            [0] * _N_PLAYER + [1] * _N_HAND + [2] * _N_ENEMY + [3] * _N_PILE + [4] * _N_RELIC + [5] * _N_POTION + [6] * _N_CHOICE + [7] * _N_NONE
        ), persistent=False)

        layer = nn.TransformerEncoderLayer(d, heads, dim_feedforward=2 * d, dropout=0.0, batch_first=True, norm_first=True)
        self.encoder = nn.TransformerEncoder(layer, layers, enable_nested_tensor=False)
        self.norm = nn.LayerNorm(d)

        self.play_a, self.play_b, self.play_out, self.play_self = nn.Linear(d, d), nn.Linear(d, d), nn.Linear(d, 1), nn.Linear(d, 1)
        self.pot_a, self.pot_b, self.pot_out, self.pot_self = nn.Linear(d, d), nn.Linear(d, d), nn.Linear(d, 1), nn.Linear(d, 1)
        self.end_head = nn.Linear(d, 1)
        self.choice_head = nn.Linear(d, 1)
        self.confirm_head = nn.Linear(d, 1)
        self.value_head = nn.Sequential(nn.Linear(2 * d, d), nn.ReLU(), nn.Linear(d, 1))
        self._init()

    def _init(self) -> None:
        for emb in (self.card, self.monster, self.relic, self.potion, self.prompt, self.power):
            nn.init.normal_(emb.weight, std=0.1)
            with torch.no_grad():
                emb.weight[0].zero_()
        for head in (self.play_out, self.play_self, self.pot_out, self.pot_self, self.end_head, self.choice_head, self.confirm_head):
            nn.init.orthogonal_(head.weight, gain=0.01)
            nn.init.zeros_(head.bias)
        nn.init.orthogonal_(self.value_head[-1].weight, gain=1.0)
        nn.init.zeros_(self.value_head[-1].bias)

    # ------------------------------------------------------------------ pieces
    def _powers(self, ids: torch.Tensor, amts: torch.Tensor) -> torch.Tensor:
        return (self.power(ids) * amts.unsqueeze(-1)).sum(-2)

    def tokens(self, b: dict[str, torch.Tensor]) -> tuple[torch.Tensor, torch.Tensor]:
        B = b["hand_id"].shape[0]
        player = self.player_in(torch.cat([b["player_f"], self._powers(b["player_pw_id"], b["player_pw_amt"]), self.prompt(b["prompt_id"])], -1)).unsqueeze(1)
        hand = self.hand_in(torch.cat([b["hand_f"], self.card(b["hand_id"])], -1))
        enemy = self.enemy_in(torch.cat([b["enemy_f"], self.monster(b["enemy_id"]), self._powers(b["enemy_pw_id"], b["enemy_pw_amt"])], -1))
        pile_emb = self.card(b["pile_id"]) + b["pile_up"].unsqueeze(-1) * self.upgraded
        cnt = b["pile_cnt"]
        pooled = (pile_emb * cnt.unsqueeze(-1)).sum(-2) / (1.0 + cnt.sum(-1, keepdim=True)).sqrt()
        piles = torch.stack([self.pile_in[i](pooled[:, i]) for i in range(3)], 1)
        rel_mask = (b["relic_id"] > 0).float().unsqueeze(-1)
        relic = self.relic_in((self.relic(b["relic_id"]) * rel_mask).sum(1) / rel_mask.sum(1).clamp(min=1.0)).unsqueeze(1)
        potion = self.potion_in(torch.cat([b["potion_f"], self.potion(b["potion_id"])], -1))
        choice = self.choice_in(torch.cat([b["choice_f"], self.card(b["choice_id"])], -1))
        none = self.none_token.expand(B, 1, -1)
        x = torch.cat([player, hand, enemy, piles, relic, potion, choice, none], 1) + self.kind(self.kind_ids)
        ones = lambda n: torch.ones(B, n, dtype=torch.bool, device=x.device)  # noqa: E731 - tiny local helper
        keep = torch.cat([ones(_N_PLAYER), b["hand_m"], b["enemy_m"], ones(_N_PILE), ones(_N_RELIC), b["potion_m"], b["choice_m"], ones(_N_NONE)], 1)
        return x, ~keep  # second value: key_padding_mask (True = ignore)

    def forward(self, b: dict[str, torch.Tensor]) -> tuple[torch.Tensor, torch.Tensor]:
        x, pad = self.tokens(b)
        h = self.norm(self.encoder(x, src_key_padding_mask=pad))
        B = h.shape[0]
        g = h[:, 0]
        h_hand = h[:, _O_HAND:_O_ENEMY]
        h_enemy = h[:, _O_ENEMY:_O_PILE]
        h_potion = h[:, _O_POTION:_O_CHOICE]
        h_choice = h[:, _O_CHOICE:_O_NONE]
        targets = torch.cat([h_enemy, h[:, _O_NONE:_O_NONE + 1]], 1)  # enemies then "no target"

        def pairwise(a, bb, out, self_head, slots):
            pair = out(torch.relu(a(slots).unsqueeze(2) + bb(targets).unsqueeze(1))).squeeze(-1)
            return (pair + self_head(slots)).reshape(B, -1)

        play = pairwise(self.play_a, self.play_b, self.play_out, self.play_self, h_hand)
        pot = pairwise(self.pot_a, self.pot_b, self.pot_out, self.pot_self, h_potion)
        logits = torch.cat([play, pot, self.end_head(g), self.choice_head(h_choice).squeeze(-1), self.confirm_head(g)], 1)
        logits = logits.masked_fill(~b["mask"], -1e9)
        keep = (~pad).float().unsqueeze(-1)
        mean = (h * keep).sum(1) / keep.sum(1)
        value = self.value_head(torch.cat([g, mean], -1)).squeeze(-1)
        return logits, value


def save(net: CombatNet, path, **extra) -> None:
    torch.save({"state": net.state_dict(), "config": net.config, "vocab": vocab.sizes(), **extra}, path)


def load(path, device: str = "cpu") -> CombatNet:
    blob = torch.load(path, map_location=device, weights_only=True)
    if blob["vocab"] != vocab.sizes():
        raise ValueError("checkpoint vocabulary does not match the pinned simulator")
    net = CombatNet(**blob["config"])
    net.load_state_dict(blob["state"])
    net.eval()
    return net
