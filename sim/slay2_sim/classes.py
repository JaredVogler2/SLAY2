"""The five playable classes as the pinned simulator spells them, and what a game of each must start with (ADR-049).

Why this exists. The simulator's ``RunManager`` matches a class id exactly and plays *any other string as Ironclad*: its
configuration lookup falls back to the default and so does its starter-deck builder. On 2026-10-26 four classes of the
opening-relic study were played that way for 25,000 games (``--character silent``), and every audit passed, because an audit
re-runs a game from its manifest and reproduces the same wrong class. So the harness refuses an inexact class id before
anything runs (``exact_character``, called by ``RunConfig`` and the command line), and checks every game's starting state
against the class it was asked for (``check_start``, called wherever a run is built, replays and audits included).
"""

from __future__ import annotations

import json
from collections import Counter
from functools import lru_cache

from . import catalog

CHARACTER_IDS = ("Ironclad", "Silent", "Regent", "Necrobinder", "Defect")

# The pinned simulator's starting maximum HP per class (its ``_CHARACTER_CONFIG``). It equals the game's
# (``CharacterModel.StartingHp`` in the game's source, repeated in ``packages/game-data/data/characters.*.json``) for four
# classes; for Necrobinder the simulator says 75 and the game says 66 (known gap G13). A game is checked against the
# simulator's number, because what has to be true is that the class asked for is the class that was played.
SIM_START_HP = {"Ironclad": 80, "Silent": 70, "Regent": 75, "Necrobinder": 75, "Defect": 75}


class ClassError(ValueError):
    """A class id the simulator does not know exactly, or a game that did not start as the class it was asked for."""


def exact_character(name: object) -> str:
    """The class id itself if it is one of the simulator's five exact ids; anything else is refused, with a hint."""
    if isinstance(name, str) and name in CHARACTER_IDS:
        return name
    hint = ""
    if isinstance(name, str):
        near = next((c for c in CHARACTER_IDS if c.lower() == name.strip().lower()), None)
        if near is not None:
            hint = f" (did you mean {near!r}? the simulator matches the id exactly and silently plays any other string as Ironclad)"
    raise ClassError(f"unknown character {name!r}: the exact ids are {', '.join(CHARACTER_IDS)}{hint}")


@lru_cache(maxsize=1)
def _facts() -> dict[str, dict]:
    data = json.loads(catalog.CHARACTERS_PATH.read_text(encoding="utf-8"))
    return {c["id"].lower(): c for c in data["characters"]}


ASCENDERS_BANE_FROM = 5  # rule ASC-3: the starting deck gains Ascender's Bane from Ascension 5 (the simulator models it)


def game_start_hp(character: str) -> int:
    """The class's starting maximum HP as the game's own source gives it (``CharacterModel.StartingHp``)."""
    exact_character(character)
    return int(_facts()[character.lower()]["startingHp"])


def expected_start(character: str, ascension: int = 0, game_hp: bool = False) -> tuple[int, Counter]:
    """Starting maximum HP and starter deck (card id -> copies) of a class: the simulator's HP (the game's, for the harness
    variant ``game_hp``), the game's own deck."""
    exact_character(character)
    deck = Counter({d["id"]: d["count"] for d in _facts()[character.lower()]["startingDeck"]})
    if ascension >= ASCENDERS_BANE_FROM:
        deck["ASCENDERS_BANE"] += 1
    return (game_start_hp(character) if game_hp else SIM_START_HP[character]), deck


def check_start(manager, character: str, ascension: int = 0, game_hp: bool = False) -> None:
    """Refuse a run that did not start as ``character``: its maximum HP and starter deck are those of that class."""
    hp, deck = expected_start(character, ascension, game_hp)
    player = manager.run_state.player
    got_hp = int(player.max_hp)
    got_deck = Counter(c.card_id.name for c in player.deck)
    if got_hp != hp or got_deck != deck:
        raise ClassError(
            f"the run did not start as {character} at Ascension {ascension}: maximum HP {got_hp} (expected {hp}), "
            f"starter deck {dict(sorted(got_deck.items()))} (expected {dict(sorted(deck.items()))})"
        )
