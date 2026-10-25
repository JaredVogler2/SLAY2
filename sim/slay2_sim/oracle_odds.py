"""Independent exact-arithmetic reference ("oracle") for the SLAY2 odds engines.

Written from docs/game/MECHANICS-COVERAGE.md (rules CARD-*, UPG-1, POT-*, UNK-*, SHOP-*, GOLD-1, DRAW-1), NOT from the
TypeScript engine, with deliberately different structure (percent-point integers, dict DP, integer cell arithmetic for
prices). ``python -m slay2_sim oracle`` writes ``packages/odds/test/fixtures/golden-python.json``; the TypeScript test
suite asserts that its engines reproduce every case *exactly*. If the two implementations ever disagree, one of them has
a bug, and the published tables (also asserted in both test suites) arbitrate.

Probabilities are ``fractions.Fraction``; the JSON form is the string ``"n/d"``.
"""

from __future__ import annotations

import itertools
import json
from fractions import Fraction as F
from math import ceil, comb, floor
from pathlib import Path

# ----------------------------------------------------------------------------- rarity (CARD-1..6)
START_PTS, CAP_PTS = F(-5), F(40)  # offset in percentage points


def growth_pts(scarcity: bool) -> F:
    return F(1, 2) if scarcity else F(1)


def max_counter(scarcity: bool) -> int:
    return ceil((CAP_PTS - START_PTS) / growth_pts(scarcity))


def offset_pts(k: int, scarcity: bool) -> F:
    return min(START_PTS + growth_pts(scarcity) * k, CAP_PTS)


def base_pts(table: str, scarcity: bool) -> tuple[F, F]:
    """(listed rare %, listed uncommon %) in percentage points."""
    if table == "regular":
        return (F(149, 100) if scarcity else F(3)), F(37)
    if table == "elite":
        return (F(5) if scarcity else F(10)), F(40)
    if table == "shop":
        return (F(9, 2) if scarcity else F(9)), F(37)
    raise ValueError(table)


def clamp01(x: F) -> F:
    return max(F(0), min(F(1), x))


def card_pmf(source: dict, k: int, scarcity: bool) -> dict[str, F]:
    kind = source["kind"]
    if kind == "encounter" and source["room"] == "boss":
        return {"rare": F(1), "uncommon": F(0), "common": F(0)}
    if kind in ("encounter", "shop"):
        table = "shop" if kind == "shop" else source["room"]
        rare_pts, unc_pts = base_pts(table, scarcity)
        t_rare = (rare_pts + offset_pts(k, scarcity)) / 100
        cum_unc = (unc_pts / 100) + t_rare
        rare = clamp01(t_rare)
        up_to_unc = clamp01(cum_unc)
        return {"rare": rare, "uncommon": up_to_unc - rare, "common": 1 - up_to_unc}
    if kind == "base":
        rare_pts, unc_pts = base_pts(source["table"], scarcity)
        return {"rare": rare_pts / 100, "uncommon": (unc_pts - rare_pts) / 100, "common": 1 - unc_pts / 100}
    raise ValueError(source)


def next_counter(source: dict, k: int, rolled: str, scarcity: bool) -> int:
    cap = max_counter(scarcity)
    k = min(k, cap)
    if source["kind"] != "encounter":
        return k
    return 0 if rolled == "rare" else min(k + 1, cap)


def pack_outcomes(source: dict, k: int, cards: int, scarcity: bool) -> list[tuple[tuple[str, ...], int, F]]:
    """All rarity sequences with probability, via forward DP over (sequence-so-far) states."""
    frontier: list[tuple[tuple[str, ...], int, F]] = [((), min(k, max_counter(scarcity)), F(1))]
    for _ in range(cards):
        nxt = []
        for seq, kk, p in frontier:
            pmf = card_pmf(source, kk, scarcity)
            for r in ("rare", "uncommon", "common"):
                if pmf[r] == 0:
                    continue
                nxt.append((seq + (r,), next_counter(source, kk, r, scarcity), p * pmf[r]))
        frontier = nxt
    return frontier


def pack_summary(source: dict, k: int, cards: int, scarcity: bool) -> dict:
    outs = pack_outcomes(source, k, cards, scarcity)
    count_pmf = [F(0)] * (cards + 1)
    end: dict[int, F] = {}
    for seq, kk, p in outs:
        count_pmf[sum(1 for r in seq if r == "rare")] += p
        end[kk] = end.get(kk, F(0)) + p
    return {
        "atLeastOneRare": 1 - count_pmf[0],
        "expectedRares": sum(F(i) * p for i, p in enumerate(count_pmf)),
        "rareCountPmf": count_pmf,
        "endCounter": end,
    }


def rarity_posterior(history: list[dict], scarcity: bool) -> tuple[dict[int, F], F]:
    dist: dict[int, F] = {0: F(1)}
    for obs in history:
        cards = obs.get("cards", 3)
        nxt: dict[int, F] = {}
        for k, mass in dist.items():
            for seq, kk, p in pack_outcomes(obs["source"], k, cards, scarcity):
                if "rares" in obs and sum(1 for r in seq if r == "rare") != obs["rares"]:
                    continue
                if "uncommons" in obs and sum(1 for r in seq if r == "uncommon") != obs["uncommons"]:
                    continue
                nxt[kk] = nxt.get(kk, F(0)) + mass * p
        dist = nxt
    total = sum(dist.values(), F(0))
    return ({k: m / total for k, m in dist.items()} if total else {}), total


# ----------------------------------------------------------------------------- upgrades (UPG-1)
def upgrade_chance(rarity: str, act_index: int, scarcity: bool, source: str = "encounter") -> F:
    if source == "shop" or rarity == "rare":
        return F(0)
    return act_index * (F(1, 8) if scarcity else F(1, 4))


# ----------------------------------------------------------------------------- potions (POT-1..3)
def potion_roll_p(tenths: int, room: str) -> F:
    return clamp01(F(tenths, 10) + (F(1, 8) if room == "elite" else F(0)))


def potion_posterior(history: list[dict]) -> tuple[dict[int, F], F]:
    dist: dict[int, F] = {4: F(1)}
    for obs in history:
        nxt: dict[int, F] = {}
        for t, mass in dist.items():
            p = F(1) if obs.get("forced") else potion_roll_p(t, obs["room"])
            dropped = obs.get("dropped")
            if dropped is not False:
                nxt[t - 1] = nxt.get(t - 1, F(0)) + mass * p
            if dropped is not True and not obs.get("forced"):
                nxt[t + 1] = nxt.get(t + 1, F(0)) + mass * (1 - p)
        dist = {k: v for k, v in nxt.items() if v}
    total = sum(dist.values(), F(0))
    return ({k: v / total for k, v in dist.items()} if total else {}), total


def potion_forecast(posterior: dict[int, F], upcoming: list[str]) -> dict:
    state: dict[tuple[int, int], F] = {(t, 0): m for t, m in posterior.items()}
    for room in upcoming:
        nxt: dict[tuple[int, int], F] = {}
        for (t, d), m in state.items():
            p = potion_roll_p(t, room)
            if p:
                nxt[(t - 1, d + 1)] = nxt.get((t - 1, d + 1), F(0)) + m * p
            if p != 1:
                nxt[(t + 1, d)] = nxt.get((t + 1, d), F(0)) + m * (1 - p)
        state = nxt
    pmf = [F(0)] * (len(upcoming) + 1)
    after: dict[int, F] = {}
    for (t, d), m in state.items():
        pmf[d] += m
        after[t] = after.get(t, F(0)) + m
    first = sum((m * potion_roll_p(t, upcoming[0]) for t, m in posterior.items()), F(0))
    return {"nextDropProbability": first, "dropCountPmf": pmf, "expectedDrops": sum(F(i) * p for i, p in enumerate(pmf)), "counterAfter": after}


# ----------------------------------------------------------------------------- "?" rooms (UNK-1, UNK-2)
BASE_Q = {"fight": F(1, 10), "treasure": F(1, 50), "shop": F(3, 100)}


def unknown_pmf(mult: tuple[int, int, int]) -> dict[str, F]:
    f, t, s = (BASE_Q["fight"] * mult[0], BASE_Q["treasure"] * mult[1], BASE_Q["shop"] * mult[2])
    cum_f = clamp01(f)
    cum_t = clamp01(f + t)
    cum_s = clamp01(f + t + s)
    return {"fight": cum_f, "treasure": cum_t - cum_f, "shop": cum_s - cum_t, "event": 1 - cum_s}


def unknown_step(mult: tuple[int, int, int], outcome: str) -> tuple[int, int, int]:
    f, t, s = mult
    return (1 if outcome == "fight" else f + 1, 1 if outcome == "treasure" else t + 1, 1 if outcome == "shop" else s + 1)


def unknown_posterior(history: list[dict]) -> tuple[dict[tuple[int, int, int], F], F]:
    dist: dict[tuple[int, int, int], F] = {(1, 1, 1): F(1)}
    for obs in history:
        nxt: dict[tuple[int, int, int], F] = {}
        for m, mass in dist.items():
            pmf = unknown_pmf(m)
            for outcome, p in pmf.items():
                if p == 0 or ("outcome" in obs and obs["outcome"] != outcome):
                    continue
                nm = unknown_step(m, outcome)
                nxt[nm] = nxt.get(nm, F(0)) + mass * p
        dist = nxt
    total = sum(dist.values(), F(0))
    return ({k: v / total for k, v in dist.items()} if total else {}), total


def unknown_forecast(posterior: dict[tuple[int, int, int], F]) -> dict[str, F]:
    out = {k: F(0) for k in ("fight", "treasure", "shop", "event")}
    for m, mass in posterior.items():
        for k, p in unknown_pmf(m).items():
            out[k] += mass * p
    return out


# ----------------------------------------------------------------------------- prices (SHOP-2..4), integer cells
def price_pmf(base: int, lo_pct: int, hi_pct: int, on_sale: bool = False) -> dict[int, F]:
    """round(base * U[lo%, hi%]) for a uniform continuous draw: mass of each integer cell [k-1/2, k+1/2)."""
    a, b = F(base * lo_pct, 100), F(base * hi_pct, 100)
    out: dict[int, F] = {}
    k = floor(a - F(1, 2)) + 1
    while F(2 * k - 1, 2) < b:
        left, right = max(F(2 * k - 1, 2), a), min(F(2 * k + 1, 2), b)
        if right > left:
            price = k // 2 if on_sale else k
            out[price] = out.get(price, F(0)) + (right - left) / (b - a)
        k += 1
    return out


def removal_cost(n: int, ascension: int) -> int:
    return (100 + 50 * n) if ascension >= 6 else (75 + 25 * n)


def gold_range(room: str, ascension: int) -> tuple[int, int]:
    lo, hi = {"monster": (10, 20), "elite": (35, 45), "boss": (100, 100)}[room]
    if ascension >= 3:
        lo, hi = (lo * 3) // 4, (hi * 3) // 4
    return lo, hi


# ----------------------------------------------------------------------------- draws (DRAW-1)
def hypergeom_pmf(total: int, successes: int, draws: int) -> list[F]:
    den = comb(total, draws)
    return [F(comb(successes, x) * comb(total - successes, draws - x), den) for x in range(min(successes, draws) + 1)]


def reshuffle_at_least(draw_pile: int, t_draw: int, discard: int, t_discard: int, draws: int, need: int) -> F:
    if draws <= draw_pile:
        return sum(hypergeom_pmf(draw_pile, t_draw, draws)[need:], F(0))
    rest = draws - draw_pile
    still = max(0, need - t_draw)
    return sum(hypergeom_pmf(discard, t_discard, rest)[still:], F(0))


def joint_at_least(pile: int, draws: int, groups: list[tuple[int, int]]) -> F:
    total_groups = sum(c for c, _ in groups)
    rest = pile - total_groups
    fav = 0
    ranges = [range(need, min(count, draws) + 1) for count, need in groups]
    for xs in itertools.product(*ranges):
        used = sum(xs)
        if used > draws or draws - used > rest:
            continue
        ways = 1
        for (count, _), x in zip(groups, xs):
            ways *= comb(count, x)
        fav += ways * comb(rest, draws - used)
    return F(fav, comb(pile, draws))


# ----------------------------------------------------------------------------- golden file
def fs(x: F) -> str:
    return f"{x.numerator}/{x.denominator}" if x.denominator != 1 else str(x.numerator)


def _dist(d: dict) -> dict:
    return {str(k): fs(v) for k, v in sorted(d.items(), key=lambda kv: kv[0])}


def build_golden() -> dict:
    cases: list[dict] = []

    def add(kind: str, name: str, inp: dict, out: dict) -> None:
        cases.append({"kind": kind, "name": name, "input": inp, "output": out})

    sources = [
        {"kind": "encounter", "room": "regular"},
        {"kind": "encounter", "room": "elite"},
        {"kind": "encounter", "room": "boss"},
        {"kind": "shop"},
        {"kind": "base", "table": "regular"},
        {"kind": "base", "table": "elite"},
        {"kind": "base", "table": "shop"},
    ]
    counters = [0, 1, 2, 3, 4, 5, 10, 15, 20, 30, 44, 45, 46, 60, 89, 90, 91, 120]
    for scarcity in (False, True):
        for src in sources:
            for k in counters:
                pmf = card_pmf(src, k, scarcity)
                add("rarity_pmf", f"{src}/{k}/{'A7' if scarcity else 'A0'}", {"source": src, "counter": k, "scarcity": scarcity}, {r: fs(p) for r, p in pmf.items()})
    for scarcity in (False, True):
        for src in sources[:4]:
            for k in (0, 1, 2, 3, 5, 10, 20, 30, 44, 45, 60, 90):
                for cards in (1, 3, 4):
                    s = pack_summary(src, k, cards, scarcity)
                    add(
                        "pack", f"{src}/{k}/{cards}/{'A7' if scarcity else 'A0'}",
                        {"source": src, "counter": k, "cards": cards, "scarcity": scarcity},
                        {"atLeastOneRare": fs(s["atLeastOneRare"]), "expectedRares": fs(s["expectedRares"]),
                         "rareCountPmf": [fs(p) for p in s["rareCountPmf"]], "endCounter": _dist(s["endCounter"])},
                    )
    reg, eli, shop = sources[0], sources[1], sources[3]
    histories = {
        "fresh": [],
        "three-dry-regular": [{"source": reg, "rares": 0}] * 3,
        "ten-unknown-regular": [{"source": reg}] * 10,
        "mixed": [{"source": reg, "rares": 0}, {"source": eli, "rares": 1}, {"source": reg}, {"source": shop, "cards": 5, "rares": 1}, {"source": reg, "rares": 0, "uncommons": 1}],
        "after-elite-rare": [{"source": reg, "rares": 0}, {"source": reg, "rares": 0}, {"source": reg, "rares": 0}, {"source": eli, "rares": 1}],
        "impossible-first-rare": [{"source": reg, "rares": 1}],
        "long-unknown-elite": [{"source": eli}] * 14,
    }
    for scarcity in (False, True):
        for name, h in histories.items():
            post, ev = rarity_posterior(h, scarcity)
            add("rarity_posterior", f"{name}/{'A7' if scarcity else 'A0'}", {"history": h, "scarcity": scarcity}, {"evidence": fs(ev), "posterior": _dist(post)})
    for scarcity in (False, True):
        for rarity in ("common", "uncommon", "rare"):
            for act in (0, 1, 2):
                for source in ("encounter", "shop"):
                    add("upgrade", f"{rarity}/{act}/{source}/{'A7' if scarcity else 'A0'}", {"rarity": rarity, "act": act, "scarcity": scarcity, "source": source}, {"p": fs(upgrade_chance(rarity, act, scarcity, source))})
    potion_histories = {
        "fresh": [],
        "two-miss": [{"room": "monster", "dropped": False}, {"room": "monster", "dropped": False}],
        "drop-then-elite": [{"room": "monster", "dropped": True}, {"room": "elite", "dropped": True}],
        "unknown-five": [{"room": "monster"}] * 5,
        "forced": [{"room": "monster", "dropped": True, "forced": True}, {"room": "monster"}],
        "boss-and-unknown": [{"room": "boss"}, {"room": "monster"}, {"room": "elite"}],
        "long-misses": [{"room": "monster", "dropped": False}] * 7,
    }
    for name, h in potion_histories.items():
        post, ev = potion_posterior(h)
        add("potion_posterior", name, {"history": h}, {"evidence": fs(ev), "posterior": _dist(post)})
        if post:
            for upcoming in (["monster"], ["elite", "monster", "monster"], ["monster"] * 6):
                fc = potion_forecast(post, upcoming)
                add("potion_forecast", f"{name}/{'-'.join(upcoming)}", {"history": h, "upcoming": upcoming},
                    {"nextDropProbability": fs(fc["nextDropProbability"]), "dropCountPmf": [fs(p) for p in fc["dropCountPmf"]], "expectedDrops": fs(fc["expectedDrops"]), "counterAfter": _dist(fc["counterAfter"])})
    unknown_histories = {
        "fresh": [],
        "event-event": [{"outcome": "event"}, {"outcome": "event"}],
        "fight-then-shop": [{"outcome": "fight"}, {"outcome": "shop"}],
        "unknown-three": [{}, {}, {}],
        "treasure-seen": [{"outcome": "treasure"}, {}, {"outcome": "event"}],
        "long-events": [{"outcome": "event"}] * 11,
        "impossible-after-saturation": [{"outcome": "event"}] * 20,
    }
    for name, h in unknown_histories.items():
        post, ev = unknown_posterior(h)
        add("unknown_posterior", name, {"history": h}, {"evidence": fs(ev), "forecast": ({k: fs(v) for k, v in unknown_forecast(post).items()} if post else None)})
    table = []
    for n in range(1, 9):
        post, _ = unknown_posterior([{}] * (n - 1))
        table.append({k: fs(v) for k, v in unknown_forecast(post).items()})
    add("unknown_marginal", "first-eight", {"rooms": 8}, {"rows": table})
    items = [
        ("card", "common", 50, 95, 105), ("card", "uncommon", 75, 95, 105), ("card", "rare", 150, 95, 105),
        ("card-colorless", "common", 57, 95, 105), ("card-colorless", "uncommon", 86, 95, 105), ("card-colorless", "rare", 173, 95, 105),
        ("relic", "common", 175, 85, 115), ("relic", "uncommon", 225, 85, 115), ("relic", "rare", 275, 85, 115), ("relic", "shop", 200, 85, 115),
        ("potion", "common", 50, 95, 105), ("potion", "uncommon", 75, 95, 105), ("potion", "rare", 100, 95, 105),
    ]
    for kind, rarity, base, lo, hi in items:
        for sale in (False, True) if kind == "card" else (False,):
            add("price", f"{kind}/{rarity}/{'sale' if sale else 'full'}", {"kind": kind, "rarity": rarity, "onSale": sale}, {"pmf": _dist(price_pmf(base, lo, hi, sale))})
    for n in range(0, 12):
        for asc in (0, 5, 6, 10):
            add("removal", f"{n}/A{asc}", {"removals": n, "ascension": asc}, {"cost": removal_cost(n, asc)})
    for room in ("monster", "elite", "boss"):
        for asc in (0, 2, 3, 10):
            lo, hi = gold_range(room, asc)
            add("gold", f"{room}/A{asc}", {"room": room, "ascension": asc}, {"min": lo, "max": hi})
    for total, succ, draws in [(10, 3, 5), (40, 1, 5), (40, 4, 5), (52, 13, 7), (30, 0, 5), (12, 12, 5), (5, 2, 5), (100, 7, 10), (60, 6, 8)]:
        add("hypergeometric", f"{total}/{succ}/{draws}", {"pile": total, "targets": succ, "draws": draws}, {"pmf": [fs(p) for p in hypergeom_pmf(total, succ, draws)]})
    for q in [(3, 1, 20, 2, 5, 1), (3, 0, 20, 2, 5, 1), (3, 3, 20, 2, 5, 2), (0, 0, 15, 1, 5, 1), (4, 2, 11, 3, 5, 3), (5, 1, 10, 1, 5, 1), (2, 2, 18, 4, 7, 4)]:
        add("reshuffle", "-".join(map(str, q)), dict(zip(("drawPile", "targetsInDrawPile", "discardPile", "targetsInDiscard", "draws", "need"), q)), {"p": fs(reshuffle_at_least(*q))})
    for pile, draws, groups in [(40, 5, [(4, 1), (5, 1)]), (30, 6, [(3, 1), (2, 1), (4, 1)]), (20, 5, [(5, 2)]), (25, 7, [(6, 2), (3, 1)]), (12, 5, [(4, 1), (4, 1), (4, 1)])]:
        add("joint", f"{pile}-{draws}-{groups}", {"pile": pile, "draws": draws, "groups": [{"count": c, "need": n} for c, n in groups]}, {"p": fs(joint_at_least(pile, draws, groups))})
    return {"schema": 1, "generator": "sim/slay2_sim/oracle_odds.py", "rules": "STS2 main v0.107.1 (docs/game/MECHANICS-COVERAGE.md)", "cases": cases}


def write_golden(path: Path) -> int:
    data = build_golden()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, sort_keys=True) + "\n", encoding="utf-8")
    return len(data["cases"])
