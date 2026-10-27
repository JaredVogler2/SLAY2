"""Stage B2-dev of the synergy study (ADR-050): the selection rule, applied by a program so that it is applied as written.

Phase 1 compares the advisor_v1 arms ``d1`` to ``d4`` with ``d0`` (the index without the synergy term) on development seeds, the
five classes pooled. The chosen configuration is the arm with the largest pooled difference in the rate of getting past the
Act-1 boss; an arm within 0.5 percentage points of the best loses to a lower-numbered one (the least engine credit); if no arm is
above ``d0`` the choice is ``d1``. Phase 2 compares the skip margins 1.5 and 3 with the chosen configuration at margin 0 by the
same rule (a tie within 0.5 points goes to the lower margin; margin 0 if neither is above it).

    python -m slay2_sim.synergydev --phase 1 --dir experiments/synergy/dev --out experiments/synergy/dev/selection-phase1.json
    python -m slay2_sim.synergydev --phase 2 --chosen d2 --dir experiments/synergy/dev --out experiments/synergy/dev/selection-phase2.json
    python -m slay2_sim.synergydev --astar --dir experiments/synergy/dev      # A*, read back from the two selection files, as a JSON object
    python -m slay2_sim.synergydev --fragment d2      # the arm's parameters as the JSON fragment run-dev.sh takes as CHOSEN for phase 2
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

TIE = 0.005  # 0.5 percentage points
PHASE1_ARMS = ("d1", "d2", "d3", "d4")
PHASE2_ARMS = {"m1": 1.5, "m2": 3.0}
# What each phase-1 arm keeps of the index's hand-set parts (scripts/studies/synergy/common.sh runs the same arms; a test holds the two together).
ARM_PARAMS = {
    "d1": {"needs": 1, "scalers": 0.7, "engines": 0},
    "d2": {"needs": 1, "scalers": 0.7, "engines": 0.25},
    "d3": {"needs": 1, "scalers": 0.7, "engines": 0.5},
    "d4": {"needs": 1, "scalers": 1, "engines": 1},
}


def pooled_difference(pooled: dict) -> dict:
    """The pooled difference (A minus B) in the rate of getting past the Act-1 boss, with the seed-clustered interval."""
    r = pooled["reachedAct2"]  # the pooled file's name for "got past the Act-1 boss"
    return {
        "a_rate": r["a"]["rate"],
        "b_rate": r["b"]["rate"],
        "difference": r["a"]["rate"] - r["b"]["rate"],
        "ci95": pooled["clusteredDifference"]["ci95"],
        "pairs": pooled["bothCompleted"],
        "mcnemar_p": r["pairedTable"]["mcnemar_p"],
    }


def choose_configuration(differences: dict[str, float]) -> str:
    """The arm among d1..d4 with the largest pooled difference against d0; ties within 0.5 points go to the lower-numbered arm;
    d1 when no arm is above d0."""
    best = max(differences[a] for a in PHASE1_ARMS)
    if best <= 0:
        return "d1"
    return next(a for a in PHASE1_ARMS if differences[a] >= best - TIE)


def choose_margin(differences: dict[str, float]) -> float:
    """The margin among 0, 1.5 and 3 with the largest pooled difference against margin 0; ties within 0.5 points go to the lower
    margin; 0 when neither skip margin is above it."""
    options = [(0.0, 0.0)] + [(PHASE2_ARMS[a], differences[a]) for a in PHASE2_ARMS]
    best = max(d for _, d in options)
    return next(m for m, d in options if d >= best - TIE)


def read(directory: Path, arm: str, baseline: str) -> dict:
    return pooled_difference(json.loads((directory / f"{arm}-vs-{baseline}-pooled.json").read_text(encoding="utf-8")))


def astar(directory: Path) -> dict:
    """A*, the configuration phase 1 chose with the margin phase 2 chose, read back from the two selection files. The rule is applied
    again to the numbers in them, so a file that was edited by hand, or written for another choice, is refused."""
    first = json.loads((directory / "selection-phase1.json").read_text(encoding="utf-8"))
    second = json.loads((directory / "selection-phase2.json").read_text(encoding="utf-8"))
    chosen = choose_configuration({arm: first["differences"][arm]["difference"] for arm in PHASE1_ARMS})
    if first["phase"] != 1 or first["chosen"] != chosen:
        raise ValueError(f"selection-phase1.json chooses {first.get('chosen')}; the rule chooses {chosen} from its numbers")
    margin = choose_margin({arm: second["differences"][arm]["difference"] for arm in PHASE2_ARMS})
    if second["phase"] != 2 or second["baseline"] != chosen or second["chosen_margin"] != margin:
        raise ValueError(f"selection-phase2.json chooses margin {second.get('chosen_margin')} on {second.get('baseline')}; the rule chooses {margin} on {chosen}")
    return {**ARM_PARAMS[chosen], "margin": margin}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--phase", type=int, choices=(1, 2))
    ap.add_argument("--dir", help="the folder compare-dev.sh wrote the pooled comparisons into")
    ap.add_argument("--chosen", help="phase 2: the arm phase 1 chose (d1 to d4)")
    ap.add_argument("--out")
    ap.add_argument("--astar", action="store_true", help="print A*, read back from the two selection files in --dir")
    ap.add_argument("--fragment", choices=PHASE1_ARMS, help="print an arm's parameters as the JSON fragment run-dev.sh takes as CHOSEN")
    args = ap.parse_args(argv)
    if args.fragment:
        print(json.dumps(ARM_PARAMS[args.fragment], separators=(",", ":"))[1:-1])
        return 0
    if args.dir is None:
        ap.error("--dir is required unless --fragment is given")
    directory = Path(args.dir)
    if args.astar:
        print(json.dumps(astar(directory), separators=(",", ":")))
        return 0
    if args.phase is None or args.out is None:
        ap.error("--phase and --out are required unless --astar is given")
    if args.phase == 1:
        reads = {arm: read(directory, arm, "d0") for arm in PHASE1_ARMS}
        chosen = choose_configuration({a: r["difference"] for a, r in reads.items()})
        body = {"phase": 1, "baseline": "d0", "tie_points": TIE * 100, "differences": reads, "chosen": chosen}
    else:
        if args.chosen not in PHASE1_ARMS:
            raise SystemExit("--chosen must be the arm phase 1 chose (d1 to d4)")
        reads = {arm: read(directory, arm, args.chosen) for arm in PHASE2_ARMS}
        margin = choose_margin({a: r["difference"] for a, r in reads.items()})
        body = {"phase": 2, "baseline": args.chosen, "tie_points": TIE * 100, "differences": reads, "chosen_margin": margin}
    out = Path(args.out)
    out.write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
    for arm, r in reads.items():
        print(f"  {arm}: {r['a_rate']:.1%} against {r['b_rate']:.1%}  difference {r['difference'] * 100:+.2f} points  95% {r['ci95'][0] * 100:+.2f} to {r['ci95'][1] * 100:+.2f}  p={r['mcnemar_p']:.3g}")
    print("  chosen:", body.get("chosen") or body["chosen_margin"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
