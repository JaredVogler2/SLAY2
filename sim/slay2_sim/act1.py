"""Act 1 in the game's other version, Underdocks (gap G12, ADR-064): a harness variant, never the simulator's own behaviour.

The first act of the game exists in two versions with the same length, the same opening Ancient and the same map rules, and different
pools of fights, elites, bosses and events (``MegaCrit.Sts2.Core.Models.Acts.Overgrowth`` and ``.Underdocks``, build 0.107.1 ``main``,
read locally under ADR-011: facts only). The pinned simulator builds every run from Overgrowth: its three act configurations are
Overgrowth, the second act and the third. Its Underdocks content (the encounters, the monsters, the events) is there too, but as an
unused "extra act" that no run ever enters, which is why every simulated number made before ADR-064 is an Overgrowth number.

A run needs two things from its first act, and this module gives them to a run without editing the simulator (ADR-011, the checkout is
read-only and pinned):

* the act's configuration: the room count, the number of weak fights and the event pool (``RunState.acts[0]``);
* the pools the act's fights are drawn from (``get_act_encounter_pools(0)``, read while the run builds its rooms).

Nothing else of the run differs: the map rules, the Ancient, the shops, the rewards, the second and third acts and the way a game is won
are those of every earlier batch. A batch played with the variant says so in its manifest (``act1: "underdocks"``), every game checks
that it is the Act 1 that was asked for (``check_act1``), and a batch played without it is byte for byte what it was: the default is
Overgrowth and is left out of ``RunConfig.describe()``.
"""

from __future__ import annotations

from .classes import ClassError

OVERGROWTH = "overgrowth"
UNDERDOCKS = "underdocks"
ACT1_VERSIONS = (OVERGROWTH, UNDERDOCKS)
DEFAULT_ACT1 = OVERGROWTH

# --- the game's facts (Underdocks.cs, build 0.107.1 main) ------------------------------------------------------------------------
ROOMS = 15  # Underdocks.BaseNumberOfRooms (the same as Overgrowth)
WEAK_FIGHTS = 3  # Underdocks.NumberOfWeakEncounters (the same as Overgrowth)

# Underdocks.AllEvents; the game's shared events follow them in a run's pool exactly as they follow every other act's (the simulator's own
# act configurations list them the same way).
EVENTS = (
    "AbyssalBaths", "DrowningBeacon", "EndlessConveyor", "PunchOff", "SpiralingWhirlpool",
    "SunkenStatue", "SunkenTreasury", "DoorsOfLightAndDark", "TrashHeap", "WaterloggedScriptorium",
)

# Underdocks.GenerateAllEncounters (20 entries) split by kind, in the array's own order: the game feeds its grab bags in that order, and the
# simulator keeps it for the other acts (``sts2_env.encounters`` docstring). The names are the C# encounter classes; the setup function of the
# simulator for each is ``setup_`` + the name in snake case (``setup_corpse_slugs_weak``).
ENCOUNTERS = {
    "weak": ("CorpseSlugsWeak", "SeapunkWeak", "SludgeSpinnerWeak", "ToadpolesWeak"),
    "normal": (
        "CorpseSlugsNormal", "CultistsNormal", "FossilStalkerNormal", "GremlinMercNormal", "HauntedShipNormal",
        "LivingFogNormal", "PunchConstructNormal", "SeapunkNormal", "SewerClamNormal", "TwoTailedRatsNormal",
    ),
    "elite": ("PhantasmalGardenersElite", "SkulkingColonyElite", "TerrorEelElite"),
    "boss": ("LagavulinMatriarchBoss", "SoulFyshBoss", "WaterfallGiantBoss"),
}
ENCOUNTER_COUNT = sum(len(v) for v in ENCOUNTERS.values())  # 20, as in Underdocks.GenerateAllEncounters


class Act1Error(ClassError):
    """A run that is not in the Act 1 it was asked for: a wrong experiment, never a game result (the batch stops, as for a wrong class)."""


def setup_name(encounter: str) -> str:
    """``CorpseSlugsWeak`` -> ``setup_corpse_slugs_weak`` (the simulator's name for the encounter's combat setup)."""
    out = []
    for i, ch in enumerate(encounter):
        if ch.isupper() and i:
            out.append("_")
        out.append(ch.lower())
    return "setup_" + "".join(out)


def pools() -> dict[str, list]:
    """The four pools of Underdocks as the simulator's setup functions, in the game's order (a fresh list each call)."""
    from sts2_env.encounters import act4

    out: dict[str, list] = {}
    for kind, names in ENCOUNTERS.items():
        out[kind] = [getattr(act4, setup_name(n)) for n in names]
    return out


def act_config():
    """The first act's configuration for a run in Underdocks (fresh lists: a run shuffles its event pool in place)."""
    from sts2_env.map import acts

    return acts.ActConfig(
        act_index=0,
        num_rooms=ROOMS,
        num_weak_encounters=WEAK_FIGHTS,
        boss_ids=list(ENCOUNTERS["boss"]),
        elite_ids=list(ENCOUNTERS["elite"]),
        weak_encounter_ids=list(ENCOUNTERS["weak"]),
        strong_encounter_ids=list(ENCOUNTERS["normal"]),
        event_ids=[*EVENTS, *acts._SHARED_EVENT_IDS],
    )


_UNDERDOCKS_CLS: dict[type, type] = {}


def run_state_cls(base: type) -> type:
    """``base`` (the simulator's ``RunState``, or the veteran subclass of it) with Underdocks as its first act.

    Two overrides, nothing else: the first act's configuration is replaced after the run state is built, and the room generation (which
    imports ``get_act_encounter_pools`` when it runs) is given the Underdocks pools for the first act while it runs and the simulator's own
    for the other two. A method and not a closure: ``clone_manager`` keeps the class, and a clone never builds rooms again."""
    if base not in _UNDERDOCKS_CLS:

        class UnderdocksRunState(base):  # type: ignore[misc, valid-type]
            def __init__(self, *args, **kwargs):
                super().__init__(*args, **kwargs)
                self.acts[0] = act_config()

            def _generate_encounter_rooms(self) -> None:
                import sts2_env.encounters as encounters

                original = encounters.get_act_encounter_pools

                def get_pools(act_index: int):
                    return pools() if act_index == 0 else original(act_index)

                encounters.get_act_encounter_pools = get_pools
                try:
                    super()._generate_encounter_rooms()
                finally:
                    encounters.get_act_encounter_pools = original

        _UNDERDOCKS_CLS[base] = UnderdocksRunState
    return _UNDERDOCKS_CLS[base]


def check_act1(manager, version: str) -> None:
    """Refuse a run that is not in ``version`` for its first act. Only Underdocks is checked (the default path stays untouched).

    The run's first act has to hold the Underdocks event pool and rooms drawn from the Underdocks pools only: its first fights from the weak
    pool, the rest from the regular pool, its elites from the elite pool and its boss from the boss pool; the second and third acts keep the
    simulator's own."""
    if version == OVERGROWTH:
        return
    if version != UNDERDOCKS:
        raise Act1Error(f"unknown Act 1 {version!r}")
    rs = manager.run_state
    if len(rs.acts) != 3 or rs.current_act_index != 0:
        raise Act1Error(f"the run has {len(rs.acts)} acts and is in act index {rs.current_act_index}, not the three acts of the game from the first")
    first = rs.acts[0]
    expected_events = sorted([*EVENTS, *_shared_events()])
    if sorted(first.event_ids) != expected_events or first.num_rooms != ROOMS or first.num_weak_encounters != WEAK_FIGHTS:
        raise Act1Error("the run's first act is not Underdocks: its rooms, weak fights or event pool differ from the game's")
    rooms = rs.get_act_room_set(0)
    want = pools()
    weak, normal = rooms.normal_encounters[:WEAK_FIGHTS], rooms.normal_encounters[WEAK_FIGHTS:]
    if (
        len(rooms.normal_encounters) != ROOMS
        or any(e not in want["weak"] for e in weak)
        or any(e not in want["normal"] for e in normal)
        or any(e not in want["elite"] for e in rooms.elite_encounters)
        or rooms.boss not in want["boss"]
    ):
        raise Act1Error("the run's first act draws a fight that is not in Underdocks")


def _shared_events() -> list[str]:
    from sts2_env.map import acts

    return list(acts._SHARED_EVENT_IDS)


def boss_name(manager) -> str | None:
    """The C# name of the Act-1 boss the run was dealt (``SoulFyshBoss``), for the record of a game in Underdocks."""
    boss = manager.run_state.get_act_room_set(0).boss
    if boss is None:
        return None
    wanted = getattr(boss, "__name__", "")
    for name in ENCOUNTERS["boss"]:
        if setup_name(name) == wanted:
            return name
    return wanted or None
