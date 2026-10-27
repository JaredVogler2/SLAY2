#!/usr/bin/env python3
"""Regenerates the tables of docs/MODEL-AND-DATA-CARDS.md, docs/RELEASE-AUDIT.md and docs/STATUS.md from the committed experiment
files and the findings table (standard library only).

    python3 scripts/docs-tables.py --write    rewrite every block between <!-- table:NAME:begin --> and <!-- table:NAME:end -->
    python3 scripts/docs-tables.py --check    exit 1 and name the stale blocks (sim/tests/test_docs_tables.py runs this in CI)

Why it exists: numbers typed into prose go stale and are wrong in ways nobody notices (a paused run described at the wrong
iteration, a rule count that a parser had inflated). A table that a script writes from `experiments/` cannot disagree with it.
The prose around the tables is hand-written and says what the numbers do and do not mean.
"""

from __future__ import annotations

import glob
import gzip
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "docs" / "MODEL-AND-DATA-CARDS.md"
AUDIT = ROOT / "docs" / "RELEASE-AUDIT.md"
STATUS = ROOT / "docs" / "STATUS.md"
FINDINGS = ROOT / "docs" / "ADVERSARIAL-AUDIT.md"

# Which registration (docs/DECISIONS.md) a comparison belongs to. A comparison that is not listed here is development evidence
# or a baseline, and the table says so.
REGISTERED = {
    "rules_v2-vs-rules_v1-ironclad-a0-veteran-val": "ADR-031",
    "rules_v2-vs-rules_v1-silent-a0-veteran-val": "ADR-034",
    "rules_v2-vs-rules_v1-regent-a0-veteran-val": "ADR-034",
    "rules_v2-vs-rules_v1-necrobinder-a0-veteran-val": "ADR-034",
    "rules_v2-vs-rules_v1-defect-a0-veteran-val": "ADR-034",
    "rules_v3-vs-rules_v2-ironclad-a0-veteran-val": "ADR-045",
    "search_v3-all-vs-rules_v2-ironclad-a0-veteran-val": "ADR-040",
    "rules_v3-values2-vs-rules_v3-ironclad-a0-veteran-val": "ADR-046",
    "rules_v1-vs-random_legal-ironclad-a0-veteran-val": "baseline, not a registered test",
}
NEOW_REGISTRATION = "ADR-049 (descriptive; the registered test is pooled)"


def load(path: str | Path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def pval(p: float) -> str:
    return f"{p:.1e}" if p < 1e-3 else f"{p:.2g}"


def episodes(batch: str):
    with gzip.open(ROOT / "experiments" / "batches" / batch / "episodes.jsonl.gz", "rt", encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                yield json.loads(line)


def variant(batch_id: str, policy: str) -> str:
    """The policy's name with what distinguishes the batch (a variant of the game, a values file, a search scope)."""
    if "values2" in batch_id:
        return f"{policy} + Ironclad values v2"
    if "ancientheal" in batch_id:
        return f"{policy} [acts 2 and 3 start healed]"
    if "gamehp" in batch_id:
        return f"{policy} [the game's start HP]"
    if batch_id.startswith("search_v3-all"):
        return "search_v3 (every fight)"
    if batch_id.startswith("search_v3-boss"):
        return "search_v3 (bosses only)"
    return policy


# ---------------------------------------------------------------------------------------------------------------- policies
def table_policies() -> str:
    order = ["random_legal", "rules_v1", "rules_v2", "rules_v3", "rules_v2_neow_values", "search_v3"]
    rows = []
    for p in sorted(glob.glob(str(ROOT / "experiments" / "batches" / "*" / "manifest.json"))):
        m = load(p)
        if m["seeds"]["partition"] != "val":
            continue
        pol = m["policy"]["name"]
        c = m["summary"]["counts"]
        floors = [e["floor"] for e in episodes(m["batch_id"]) if e["outcome"] in ("death", "win")]
        lo, hi = m["summary"]["win_rate_95ci_wilson"]
        rows.append(
            (
                order.index(pol) if pol in order else 99,
                m["config"]["character"],
                variant(m["batch_id"], pol),
                f"| {variant(m['batch_id'], pol)} | {m['config']['character']} | {m['seeds']['n']} | {m['summary']['completed']} | {c['win']} | "
                f"{100 * lo:.2f} to {100 * hi:.2f} % | {sum(floors) / len(floors):.2f} | {c['simulator_error']} · {c['timeout']} |",
            )
        )
    rows.sort(key=lambda r: (r[0], r[1], r[2]))
    head = [
        "| Pilot | Class | Games | Completed | Wins | Wilson 95 % for the win rate | Mean floor | Simulator errors · timeouts |",
        "|---|---|---|---|---|---|---|---|",
    ]
    return "\n".join(head + [r[3] for r in rows])


# ------------------------------------------------------------------------------------------------------------ comparisons
def comparison_row(name: str, d: dict, registration: str) -> tuple:
    a, b = d["a"], d["b"]
    c = d.get("cohort", {})
    r1 = d["reachedAct2"]
    t = r1["pairedTable"]
    fd = d["floorDifference"]
    held_out = str(d.get("role", "")).startswith("held-out")
    wins = f"{a['wins']} · {b['wins']}"
    cls = c.get("character", "?")
    row = (
        f"| `{name}` | {registration if held_out else 'development, not held-out'} | {cls} · {c.get('partition', '?')} | "
        f"{variant(a['batchId'], a['policy'])} | {variant(b['batchId'], b['policy'])} | {d['bothCompleted']} | "
        f"{100 * r1['a']['rate']:.1f} % · {100 * r1['b']['rate']:.1f} % | {t['a_only']} · {t['b_only']} | {pval(t['mcnemar_p'])} | "
        f"{fd['meanAMinusB']:+.2f} ({fd['ci95'][0]:+.2f} to {fd['ci95'][1]:+.2f}) | {wins} |"
    )
    return (0 if held_out else 1, cls, name, row)


def table_comparisons() -> str:
    rows = []
    for p in sorted(glob.glob(str(ROOT / "experiments" / "comparisons" / "*.json"))):
        name = Path(p).stem
        rows.append(comparison_row(name, load(p), REGISTERED.get(name, "")))
    for p in sorted(glob.glob(str(ROOT / "experiments" / "neow" / "per-class" / "*.json"))):
        name = Path(p).stem
        rows.append(comparison_row(name, load(p), NEOW_REGISTRATION))
    pooled = load(ROOT / "experiments" / "neow" / "pooled-neow-values-v2-vs-rules_v2-val.json")
    r1, t = pooled["reachedAct2"], pooled["reachedAct2"]["pairedTable"]
    fd = pooled["floorDifference"]
    rows.append(
        (
            -1,
            "",
            "pooled",
            "| `pooled-neow-values-v2-vs-rules_v2-val` | ADR-049, **the registered test** | all five classes · val | "
            f"{pooled['policies']['a']} | {pooled['policies']['b']} | {pooled['bothCompleted']} | "
            f"{100 * r1['a']['rate']:.2f} % · {100 * r1['b']['rate']:.2f} % | {t['a_only']} · {t['b_only']} | {pval(t['mcnemar_p'])} | "
            f"{fd['meanAMinusB']:+.2f} ({fd['ci95'][0]:+.2f} to {fd['ci95'][1]:+.2f}, resampling pairs) | {pooled['wins']['a']} · {pooled['wins']['b']} |",
        )
    )
    rows.sort(key=lambda r: (r[0], r[2]))
    head = [
        "| Comparison file | Status | Class · seeds | A | B | Pairs completed by both | Past the Act-1 boss A · B | Pairs only A · only B | Exact McNemar p | Mean floors A − B (95 % bootstrap) | Wins A · B |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    return "\n".join(head + [r[3] for r in rows])


# ------------------------------------------------------------------------------------------------------------ card values
def table_cardvalues() -> str:
    sets = load(ROOT / "experiments" / "cardvalue" / "site-sets.json")["sets"]
    head = [
        "| File | Class | Runs that reached the Act-1 boss | Passed it | Cards valued | Cross-validated AUC · log-loss (covariate-only log-loss) | Spearman with the hand-written rating | Held-out test: past the Act-1 boss, pilot with these values · comparator (exact McNemar p) |",
        "|---|---|---|---|---|---|---|---|",
    ]
    rows = []
    for s in sets:
        d = load(ROOT / "experiments" / "cardvalue" / s["file"])
        cv = d["model"]["cross_validation"]
        best = cv["l2"][str(float(cv["best_l2"]))]
        cls = d["character"]
        test = s.get("test", {}).get("comparison") or f"rules_v2-vs-rules_v1-{cls.lower()}-a0-veteran-val"
        t = load(ROOT / "experiments" / "comparisons" / f"{test}.json")
        r1 = t["reachedAct2"]
        against = "first values" if "values2" in test else "rules_v1"
        rows.append(
            f"| `{s['file']}` | {cls} | {d['games']} | {100 * d['pass_rate']:.1f} % | {len(d['cards'])} | "
            f"{best['auc']:.3f} · {best['log_loss']:.3f} ({cv['baseline_log_loss']:.3f}) | {d['spearman_with_static_rating']:.2f} | "
            f"{100 * r1['a']['rate']:.1f} % · {100 * r1['b']['rate']:.1f} % against {against} ({pval(r1['pairedTable']['mcnemar_p'])}) |"
        )
    return "\n".join(head + rows)


# ------------------------------------------------------------------------------------------------------------------ relics
def table_relics() -> str:
    d = load(ROOT / "experiments" / "neow" / "neow-values-v2.json")
    head = [
        "| Relic | Kind | Value β (log-odds, 95 % bootstrap by seed) | Offered | Taken | Past the Act-1 boss when taken · when offered and not taken | Flag |",
        "|---|---|---|---|---|---|---|",
    ]
    rows = []
    for r in sorted(d["relics"], key=lambda r: -r["beta"]):
        flag = "more simulator errors and timeouts than chance explains" if r["exclusion_flag"] else ""
        rows.append(
            f"| {r['label']} | {r['kind']} | {r['beta']:+.2f} ({r['ci95'][0]:+.2f} to {r['ci95'][1]:+.2f}) | {r['offered']} | {r['taken']} | "
            f"{100 * r['pass_rate_taken']:.1f} % · {100 * r['pass_rate_offered_not_taken']:.1f} % | {flag} |"
        )
    return "\n".join(head + rows)


# ---------------------------------------------------------------------------------------------------------------- networks
def table_networks() -> str:
    bc = load(ROOT / "experiments" / "rl" / "results" / "combat-bc-v1.json")
    ppo = load(ROOT / "experiments" / "rl" / "results" / "combat-ppo-v1-run1.json")
    head = [
        "| Network | Checkpoint SHA-256 | Win on the held-out combats | `rules_v1` on the same combats | Pairs only `rules_v1` won · only the network won | Exact McNemar p | HP lost, `rules_v1` − network (95 % interval) |",
        "|---|---|---|---|---|---|---|",
    ]

    def row(label: str, sha: str, summaries: dict, key: str, paired: dict) -> str:
        n, r = summaries[key]["ALL"], summaries["rules"]["ALL"]
        lo, hi = paired["hp_lost_ci95"]
        return (
            f"| {label} | `{sha[:16]}…` | {100 * n['win']:.1f} % ({n['n']}) | {100 * r['win']:.1f} % | {paired['a_only_wins']} · {paired['b_only_wins']} | "
            f"{pval(paired['mcnemar_p'])} | {paired['hp_lost_a_minus_b']:+.3f} ({lo:+.3f} to {hi:+.3f}) |"
        )

    pe = bc["paired_evaluation"]
    key = next(k for k in pe["summaries"] if k.startswith("net:"))
    rows = [row("Behaviour cloning of `rules_v1` (`combat-bc-v1`)", bc["checkpoints"]["bc.pt"]["sha256"], pe["summaries"], key, pe["paired"][f"rules vs {key}"])]
    pe = ppo["paired_evaluation"]
    for which, label in (("best", "PPO from scratch, best checkpoint (`combat-ppo-v1-run1`, selected on the monitor set)"), ("latest", "PPO from scratch, last checkpoint (iteration 180)")):
        key = next(k for k in pe["summaries"] if k.endswith(f"{which}.pt"))
        rows.append(row(label, ppo["checkpoints"][f"{which}.pt"]["sha256"], pe["summaries"], key, pe["paired"][f"rules vs {key}"]))
    v2 = load(ROOT / "experiments" / "rl" / "results" / "combat-ppo-v2-paused.json")
    mon = [(r["iteration"], r["win"]) for r in v2["validation"]]
    rows.append(
        "| PPO fine-tune of the cloned network (`combat-ppo-v2`), paused at iteration "
        f"{v2['iterations_logged']} of {v2['config']['iterations']}; its win rate on the monitor set, which is also the selection set, was "
        + ", ".join(f"{100 * w:.1f} % at iteration {i}" for i, w in mon)
        + f" | not recorded | none: not evaluated on held-out combats | {100 * ppo['paired_evaluation']['summaries']['rules']['ALL']['win']:.1f} % | "
        "none | none | none |"
    )
    return "\n".join(head + rows)


# ---------------------------------------------------------------------------------------------------------------- the register
def table_rules() -> str:
    """Rule counts by status group, grouped exactly as the Methods page groups them (apps/web/src/lib/methods-data.ts)."""
    rules = load(ROOT / "apps" / "web" / "src" / "content" / "rules.generated.json")["rules"]
    groups = {"verified": 0, "corroborated": 0, "secondary": 0, "recorded": 0}
    for r in rules:
        s = r.get("status") or ""
        if s.startswith("VERIFIED"):
            groups["verified"] += 1
        elif s.startswith("CORROBORATED"):
            groups["corroborated"] += 1
        elif s.startswith("SECONDARY") or s.startswith("UNVERIFIED"):
            groups["secondary"] += 1
        else:
            groups["recorded"] += 1
    label = {
        "verified": "Verified against the game's own logic or official statements",
        "corroborated": "Corroborated by independent secondary sources",
        "secondary": "Single secondary source or unverified",
        "recorded": "Recorded fact (build, implementation note)",
    }
    rows = [f"| {label[k]} | {groups[k]} |" for k in groups]
    ids = [r["id"] for r in rules]
    rows.append(f"| **All rules in the register** ({len(set(ids))} distinct ids) | **{len(rules)}** |")
    return "\n".join(["| Status | Rules |", "|---|---|"] + rows)


# ------------------------------------------------------------------------------------------------------------------- gaps
def table_gaps() -> str:
    gaps = load(ROOT / "sim" / "slay2_sim" / "gaps.json")["gaps"]
    rows = []
    for g in gaps:
        gid = g["id"].split("-", 1)[0]
        classes = f" ({', '.join(g['classes'])})" if g.get("classes") else ""
        rows.append(f"| {gid} | {g['affects']}{classes} | {g['min_ascension']} | {g['summary'].replace('|', chr(92) + '|')} |")
    return "\n".join(["| Gap | Affects | From Ascension | What is different |", "|---|---|---|---|"] + rows)


# ------------------------------------------------------------------------------------------------------------ completed games
def table_games() -> str:
    """Games actually played and completed (a win or a death), by class and by what the seeds were for. Void batches are not here."""
    manifests = (
        glob.glob(str(ROOT / "experiments" / "batches" / "*" / "manifest.json"))
        + glob.glob(str(ROOT / "experiments" / "neow" / "explore-*" / "manifest.json"))
        + glob.glob(str(ROOT / "experiments" / "cardvalue" / "explore*" / "manifest.json"))
    )
    cols = ("batches", "games", "completed", "wins", "errors", "timeouts")
    acc: dict[tuple[str, str], dict[str, int]] = {}
    for p in manifests:
        m = load(p)
        c = m["summary"]["counts"]
        kind = "held-out (val)" if m["seeds"]["partition"] == "val" else "development (train, dev)"
        key = (m["config"]["character"], kind)
        a = acc.setdefault(key, dict.fromkeys(cols, 0))
        a["batches"] += 1
        a["games"] += m["summary"]["episodes"]
        a["completed"] += m["summary"]["completed"]
        a["wins"] += c["win"]
        a["errors"] += c["simulator_error"]
        a["timeouts"] += c["timeout"]
    rows = []
    total = {k: dict.fromkeys(cols, 0) for k in ("held-out (val)", "development (train, dev)")}
    for (cls, kind), a in sorted(acc.items(), key=lambda kv: (kv[0][0], kv[0][1] != "held-out (val)")):
        rows.append(f"| {cls} | {kind} | " + " | ".join(f"{a[k]:,}" for k in cols) + " |")
        for k in cols:
            total[kind][k] += a[k]
    for kind, a in total.items():
        rows.append(f"| **All classes** | **{kind}** | " + " | ".join(f"**{a[k]:,}**" for k in cols) + " |")
    return "\n".join(
        ["| Class | Seeds used for | Batches | Games started | Completed (win or death) | Wins | Simulator errors | Timeouts |", "|---|---|---|---|---|---|---|---|"] + rows
    )


# ---------------------------------------------------------------------------------------------------------------- findings
def table_findings() -> str:
    """Findings of docs/ADVERSARIAL-AUDIT.md by severity (every row of that table names its fix and its regression test)."""
    counts = {"P0": [], "P1": [], "P2": [], "P3": []}
    for line in FINDINGS.read_text(encoding="utf-8").splitlines():
        m = re.match(r"\|\s*(RT-\d+-\d+)\s*\|\s*\**(P[0-3])\**\s*\|", line)
        if m:
            counts[m.group(2)].append(m.group(1))
    meaning = {
        "P0": "false probability certainty, wrong game, hidden information, illegal play, security",
        "P1": "an unsupported simulator or model shipped as validated, or a production error",
        "P2": "accessibility or user flow",
        "P3": "polish",
    }
    rows = [f"| {k} | {meaning[k]} | {len(v)} | {', '.join(v) if v else 'none found'} |" for k, v in counts.items()]
    return "\n".join(["| Severity | Meaning (prompts/11) | Found and fixed | Ids |", "|---|---|---|---|"] + rows)


# ---------------------------------------------------------------------------------------------------------------- synergy
def signed(x: float, places: int = 4) -> str:
    text = f"{x:+.{places}f}"
    if float(text) == 0:
        return f"{0:.{places}f}"  # a change too small to show carries no sign
    return text.replace("-", "\u2212")


def interval(ci: list[float], places: int = 4) -> str:
    return f"{signed(ci[0], places)} to {signed(ci[1], places)}".replace("+", "")


def minus(x: float, places: int = 2) -> str:
    return f"{x:.{places}f}".replace("-", "−")


def table_synergy_b1() -> str:
    d = load(ROOT / "experiments" / "synergy" / "b1-calibration.json")
    p = d["pooled"]["all_cohorts"]
    gap, ratio, cv = p["loss_gaps"]["synergy_added_to_index"], p["ratios"], p["cross_validation"]
    beyond = d["beyond_additive_card_values"]["pooled"]
    rows = [
        "| What was asked | Answer (95 % interval, resampling whole seeds) |",
        "|---|---|",
        f"| Held-out log loss of the advisor's index without the synergy term, then with it ({p['rows']:,} runs that brought a random deck to the Act-1 boss) | {cv['index']['log_loss']:.4f}, then {cv['index+synergy']['log_loss']:.4f}: change **{signed(gap['mean'])}** ({interval(gap['ci95'])}); AUC {cv['index']['auc']:.4f} to {cv['index+synergy']['auc']:.4f} |",
        f"| The same for a model that already knows every card (ridge logistic regression on card counts, one model per class) | {beyond['log_loss_cards']:.4f}, then {beyond['log_loss_cards_and_parts']:.4f}: change **{signed(beyond['gap']['mean'])}** ({interval(beyond['gap']['ci95'])}) |",
    ]
    for key, label in (("unmet", "unmet needs"), ("scaler", "Strength, Dexterity and Focus lifting the cards they help"), ("engines", "engines (sources and payoffs together)"), ("coverage", "role coverage, as the index weights it")):
        r = ratio[key]
        rows.append(f"| Worth of a point of {label}, relative to a point of average card rating | **{r['to_quality']:.2f}** ({r['ci95'][0]:.2f} to {r['ci95'][1]:.2f}) |".replace("-0.", "\u22120.").replace("-1.", "\u22121."))
    return "\n".join(rows)


def table_synergy_cohorts() -> str:
    d = load(ROOT / "experiments" / "synergy" / "b1-calibration.json")
    head = [
        "| Cohort | Runs at the Act-1 boss | Passed it | Held-out log-loss change when the synergy term is added to the index | When added to a model that knows every card |",
        "|---|---|---|---|---|",
    ]
    rows = []
    for c in d["cohorts"]:
        a = d["per_cohort"][c["name"]]["loss_gaps"]["synergy_added_to_index"]
        b = d["beyond_additive_card_values"]["per_cohort"][c["name"]]["gap"]
        rows.append(
            f"| {c['name']} ({c['partition']} seeds) | {c['boss_fights']:,} | {100 * c['pass_rate']:.1f} % | {signed(a['mean'])} ({interval(a['ci95'])}) | {signed(b['mean'])} ({interval(b['ci95'])}) |"
        )
    return "\n".join(head + rows)


def table_synergy_mechanics() -> str:
    d = load(ROOT / "experiments" / "synergy" / "b1-mechanics.json")

    def worth(r: dict) -> str:
        return f"**{minus(r['to_quality'])}** ({minus(r['ci95'][0])} to {minus(r['ci95'][1])})"

    head = [
        "| Mechanic whose unmet need is read | Decks that need it | Mean index points held back | Worth of a point of it, relative to a point of average card rating (95 % interval) |",
        "|---|---|---|---|",
        f"| All needs together, one slope (stage B1) | all {d['rows']:,} runs | | {worth(d['pooled_unmet_ratio'])} |",
    ]
    rows = []
    for r in d["mechanics"]:
        mean = minus(r["mean_points"], 3)
        rows.append(f"| {r['label']} | {r['decks_with_the_need']:,} | {mean} | {worth({'to_quality': r['ratio_to_quality'], 'ci95': r['ratio_ci95']})} |")
    return "\n".join(head + rows)


def fmt_p(p: float) -> str:
    if p == 0:
        return "p < 1e-300"
    return f"p = {p:.1e}" if p < 1e-4 else f"p = {p:.2g}"


DEV_KEEPS = {
    "d1": "needs 1, scalers 0.7, no engine credit",
    "d2": "needs 1, scalers 0.7, engines 0.25",
    "d3": "needs 1, scalers 0.7, engines 0.5",
    "d4": "every part at its first judgement (1, 1, 1)",
    "m1": "the chosen configuration, a card has to add 1.5 index points",
    "m2": "the chosen configuration, a card has to add 3 index points",
}


def table_synergy_dev() -> str:
    """The development stage's two selection files (ADR-050 item 3 and addendum D): tuning numbers on development seeds, not evidence."""
    first = load(ROOT / "experiments" / "synergy" / "dev" / "selection-phase1.json")
    second = load(ROOT / "experiments" / "synergy" / "dev" / "selection-phase2.json")
    head = [
        "| Phase | Arm | What it keeps | Past the Act-1 boss, against → arm | Difference in points (95 %, whole seeds resampled) | Exact McNemar | Pairs |",
        "|---|---|---|---|---|---|---|",
    ]
    rows = []
    for number, phase, against, chosen in (
        (1, first, "`d0`, no synergy term", first["chosen"]),
        (2, second, f"`{second['baseline']}` at margin 0", None),
    ):
        for arm, r in phase["differences"].items():
            mark = " (chosen)" if arm == chosen else ""
            ci = r["ci95"]
            rows.append(
                f"| {number} | `{arm}`{mark} | {DEV_KEEPS[arm]} | {against}: {100 * r['b_rate']:.1f} % → {100 * r['a_rate']:.1f} % | "
                f"{signed(100 * r['difference'], 1)} ({signed(100 * ci[0], 1)} to {signed(100 * ci[1], 1)}) | {fmt_p(r['mcnemar_p'])} | {r['pairs']:,} |"
            )
    rows.append(f"| 2 | margin 0 (chosen) | no skip margin: a card is skipped only when no card raises the index | | | | |" if second["chosen_margin"] == 0 else
                f"| 2 | margin {second['chosen_margin']:g} (chosen) | | | | | |")
    return "\n".join(head + rows)


def table_synergy_coverage() -> str:
    cat = load(ROOT / "packages" / "game-data" / "data" / "cards.sts2-main-0.107.1.json")["cards"]
    syn = load(ROOT / "packages" / "game-data" / "data" / "synergy.sts2-main-0.107.1.json")
    head = [
        "| Class | Reward cards | With written tags | Starting relic's supply (the table's `innate`) |",
        "|---|---|---|---|",
    ]
    rows = []
    for cls in ("ironclad", "silent", "regent", "necrobinder", "defect"):
        pool = [c for c in cat if c["class"] == cls and c["rewardEligible"] and c["rarity"] in ("common", "uncommon", "rare")]
        tagged = [c for c in pool if c["id"] in syn["cards"]]
        inn = syn["innate"].get(cls)
        supply = f"{inn['relic']}: " + ", ".join(f"{m} {w}" for m, w in inn["gives"].items()) if inn else "none (the starting relic heals after combat)"
        rows.append(f"| {cls.capitalize()} | {len(pool)} | {len(tagged)} ({100 * len(tagged) / len(pool):.0f} %) | {supply} |")
    rows.append(f"| All tagged cards in the table | | {len(syn['cards'])} (hash `{syn['sha256'][:12]}`) | {len(syn['mechanics'])} mechanics |")
    return "\n".join(head + rows)


# Which blocks each document carries.
DOCS = {
    CARDS: ("rules", "gaps", "games", "policies", "comparisons", "cardvalues", "relics", "networks", "synergy_coverage", "synergy_b1", "synergy_cohorts", "synergy_mechanics", "synergy_dev"),
    AUDIT: ("games", "findings"),
    STATUS: ("games",),
}
BLOCKS = {
    "rules": table_rules,
    "gaps": table_gaps,
    "games": table_games,
    "findings": table_findings,
    "policies": table_policies,
    "comparisons": table_comparisons,
    "cardvalues": table_cardvalues,
    "relics": table_relics,
    "networks": table_networks,
    "synergy_coverage": table_synergy_coverage,
    "synergy_b1": table_synergy_b1,
    "synergy_cohorts": table_synergy_cohorts,
    "synergy_mechanics": table_synergy_mechanics,
    "synergy_dev": table_synergy_dev,
}


def render(doc: str, names: tuple[str, ...]) -> tuple[str, list[str]]:
    stale = []
    for name in names:
        begin, end = f"<!-- table:{name}:begin -->", f"<!-- table:{name}:end -->"
        m = re.search(re.escape(begin) + r"\n(.*?)\n?" + re.escape(end), doc, re.S)
        if not m:
            stale.append(f"{name} (markers missing)")
            continue
        new = BLOCKS[name]()
        if m.group(1) != new:
            stale.append(name)
        doc = doc[: m.start()] + f"{begin}\n{new}\n{end}" + doc[m.end() :]
    return doc, stale


def main(argv: list[str]) -> int:
    if len(argv) != 2 or argv[1] not in ("--write", "--check"):
        print(__doc__)
        return 2
    bad = []
    for path, names in DOCS.items():
        if not path.exists():
            if argv[1] == "--check":
                bad.append(f"{path.name}: the document does not exist")
            continue
        new, stale = render(path.read_text(encoding="utf-8"), names)
        if argv[1] == "--check":
            if stale:
                bad.append(f"{path.name}: stale or missing blocks: " + ", ".join(stale))
        else:
            path.write_text(new, encoding="utf-8")
            print(f"{path.name}: rewrote " + (", ".join(stale) if stale else "nothing (already current)"))
    if bad:
        print("\n".join(bad) + "\nrun: python3 scripts/docs-tables.py --write")
        return 1
    if argv[1] == "--check":
        print("docs tables: current")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
