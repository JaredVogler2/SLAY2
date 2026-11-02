"""The record of ADR-062 (docs/DECISIONS.md) says what the scripts do and quotes what they compute: the headings the scripts look for, the hashes of the files the arms read,
the thresholds, the power tables, the scale of the thresholds and the rates of the screen. A number typed by hand into the record that the code does not give is found
here (the review of the record asked for the equivalent of the test that reads ADR-061's record)."""

from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
import re
import subprocess
from contextlib import redirect_stdout

from slay2_sim import external
from slay2_sim import threshstudy as ts

REPO = external.REPO_ROOT
MARK1 = "Registration of ADR-062 (part 1, frozen choices)"
MARK2 = "Frozen choices of ADR-062 (part 2)"
ARM_TAG = re.compile(r"(?:^|[^A-Za-z0-9_])ARM_[a-z0-9]+", re.M)


def load(name: str, rel: str):
    spec = importlib.util.spec_from_file_location(name, REPO / rel)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def record() -> str:
    text = (REPO / "docs" / "DECISIONS.md").read_text(encoding="utf-8")
    i = text.rfind("\n## ", 0, text.index("ADR-062:")) + 1
    j = text.find("\n## ", i + 1)
    return text[i : j if j > 0 else None]


def design_text(adr: str) -> str:
    """Everything before the line that carries the registration heading (what the scripts call the design text)."""
    out = []
    for line in adr.split("\n"):
        if MARK1 in line:
            break
        out.append(line)
    return "\n".join(out)


def sha(rel: str) -> str:
    return hashlib.sha256((REPO / rel).read_bytes()).hexdigest()


def test_the_headings_the_scripts_look_for_occur_once_and_the_design_text_names_none_of_the_tags_they_read():
    adr = record()
    assert adr.count(MARK1) == 1, "the registration heading must occur once (the first commit that adds it is the registration)"
    assert adr.count(MARK2) <= 1                                           # part 2 is added after the development stage
    design = design_text(adr)
    assert MARK1 not in design and MARK2 not in design
    assert not ARM_TAG.search(design) and not re.search(r"DEV_HEAD=[0-9a-f]{40}", design) and not re.search(r"PINNED_DIFF=[0-9a-f]{64}", design)
    if MARK2 not in adr:
        assert not ARM_TAG.search(adr) and not re.search(r"DEV_HEAD=[0-9a-f]{40}", adr)


def test_the_record_quotes_the_hash_of_every_file_an_arm_reads_and_of_the_seed_file(tmp_path):
    adr = record()
    r = subprocess.run(["bash", "-c", "source scripts/studies/thresh/common.sh; shown_files"], cwd=REPO, env={**os.environ, "OUT": str(tmp_path)}, capture_output=True, text=True, check=True)
    files = r.stdout.split()
    assert sorted(files) == ["experiments/cardvalue/defect-a0-keep-v1.json", "experiments/cardvalue/ironclad-a0-v2.json"]
    for rel in (*files, ts.SEEDS_FILE):
        assert sha(rel) in adr, rel
    m = json.loads((REPO / ts.SEEDS_FILE).read_text(encoding="utf-8"))
    assert m["sha256"] in adr                                              # the seed file's own checksum field
    for part, n in (("dev2", ts.DEV_N), ("val3", ts.VAL_N)):
        assert len(m["partitions"][part]) == n
        assert all(str(s) in adr for s in m["partitions"][part][:3])       # the first three seeds, for identification


def test_the_thresholds_the_sizes_and_the_names_in_the_record_are_the_scripts():
    adr = record()
    shown = ", ".join(f"{v:g}" for v in list(ts.GRID.values())[:-1])
    assert f"with the late threshold {shown} and 100" in adr and shown == "0.1, 0.2, 0.3, 0.45, 0.6" and list(ts.GRID.values())[-1] == 100.0
    assert "thresh-val-<arm>-<class>-a0-veteran-keeprelics-val3-n15000" in adr and "n10000" not in adr and (ts.VAL_N, ts.DEV_N) == (15000, 3000)
    assert "**`dev2`** (3,000 seeds, the development stage)" in adr and "**`val3`** (15,000 seeds, the held-out run)" in adr and "dev2=3000,val3=15000" in adr
    assert "0.05 / 3 = 0.016667" in adr and ts.STUDY_ALPHA == 0.05 and ts.HEAD_ALPHA == 0.20 and "exact two-sided McNemar p below 0.20" in adr


def test_the_power_tables_of_the_record_are_the_ones_power_py_computes():
    adr = record()
    pw = load("thresh_power_record", "scripts/studies/thresh/power.py")
    r = pw.rates()
    held = round(2 * pw.SEEDS_PER_CLASS_HELD_OUT * (1 - r["lost"]))
    stated = (f"{r['pairs']:,} pairs both games completed, {r['aOnly']} won only by the arm and {r['bOnly']} only by S: D = {r['d']} discordant pairs ({r['dPerPair']:.4f} a pair), "
              f"net {r['net']:+d} ({100 * r['netPerPair']:+.3f} points of the win share)")
    assert stated in adr and f"{held:,} pairs" in adr
    d = round(r["dPerPair"] * held)
    for share in (1.0, 0.75, 0.5, 0.33):
        net = share * r["netPerPair"] * held
        theta = (d + net) / (2 * d)
        cells = [f"{pw.power_exact(d, theta, a):.2f} / {pw.power_interval(d, theta, held, a):.2f}" for a in (0.05, 0.05 / 3)]
        assert f"| {share:.2f} | {net:.0f} | {theta:.3f} | {cells[0]} | {cells[1]} |" in adr, share
    alpha = 0.05 / 3
    for dd in (100, 200, 300, 400):
        cells = " | ".join(f"{pw.power_exact(dd, t, alpha):.2f} / {pw.power_interval(dd, t, held, alpha):.2f}" for t in (0.55, 0.60, 0.65, 0.70))
        assert f"| {dd} | {cells} |" in adr, dd
    need = [pw.net_needed(dd, alpha, held) for dd in (100, 200, 300, 400)]
    assert need == [38, 53, 65, 75] and "**38 with D = 100 discordant pairs, 53 with 200, 65 with 300 and 75 with 400**" in adr
    n1 = pw.net_needed(d, alpha, held)
    assert f"**{n1} wins ({100 * n1 / held:.2f} points of the win share, {100 * n1 / (r['netPerPair'] * held):.0f} % of ADR-061's net)**" in adr
    out = io.StringIO()
    with redirect_stdout(out):
        pw.main()
    rows = [ln for ln in out.getvalue().splitlines() if ln.startswith(("| Ironclad |", "| Defect |"))]
    assert len(rows) == 2 and all(row in adr for row in rows)             # the scale of the thresholds, row for row

    def half(per_class: int) -> tuple[float, float]:                       # T1 at half of ADR-061's effect, at the split level, for a held-out run of this size
        n = round(2 * per_class * (1 - r["lost"]))
        dd2 = round(r["dPerPair"] * n)
        th = (dd2 + 0.5 * r["netPerPair"] * n) / (2 * dd2)
        return pw.power_exact(dd2, th, alpha), pw.power_interval(dd2, th, n, alpha)

    (e10, i10), (e15, i15) = half(10_000), half(pw.SEEDS_PER_CLASS_HELD_OUT)
    # (the registration paragraph says what the larger held-out run bought, for the exact test and for the interval that has to clear zero as well)
    if MARK1 in adr:
        assert f"from {e10:.2f} to {e15:.2f} for the exact test and from {i10:.2f} to {i15:.2f} for the exact test together with the interval" in adr


def test_the_rates_of_the_screen_in_item_3_are_the_ones_screen_sim_gives():
    adr = record()
    sim = load("thresh_screen_sim_record", "scripts/studies/thresh/screen_sim.py")
    item = next(line for line in adr.split("\n") if line.startswith("3. *The development stage"))
    worlds = list(sim.WORLDS)

    def span(model: str, world: str, key: str = "advance") -> tuple[int, int]:
        runs = [sim.simulate(sim.WORLDS[world], h, draws=20_000, model=model) for h in sim.HEAD_PAIRS]
        vals = [r["advance"] if key == "advance" else r["chose"]["t030"] for r in runs]
        return round(100 * min(vals)), round(100 * max(vals))

    def stated(pattern: str) -> tuple[int, int]:
        m = re.search(pattern, item)
        assert m, pattern
        return int(m.group(1)), int(m.group(2))

    def close(a: tuple[int, int], b: tuple[int, int]) -> bool:
        return abs(a[0] - b[0]) <= 1 and abs(a[1] - b[1]) <= 1             # rounded to a percent; a draw is a draw

    assert close(stated(r"\*\*(\d+) % to (\d+) % of the draws when no threshold does anything\*\*"), span("shared", worlds[0]))
    assert close(stated(r"in (\d+) % to (\d+) % when every threshold has \+22"), span("shared", worlds[1]))
    assert close(stated(r"in (\d+) % to (\d+) % when 0\.2 has \+22"), span("shared", worlds[2]))
    assert close(stated(r"in (\d+) % to (\d+) % with a peak at 0\.3 of \+35"), span("shared", worlds[3]))
    assert close(stated(r"\(0\.3 itself in (\d+) % to (\d+) %\), and in"), span("shared", worlds[3], "t030"))
    assert close(stated(r"and in (\d+) % to (\d+) % with a high peak"), span("shared", worlds[4]))
    assert close(stated(r"\(0\.3 in (\d+) % to (\d+) %\)"), span("shared", worlds[4], "t030"))
    assert close(stated(r"the first two figures are (\d+) % to (\d+) % and"), span("independent", worlds[0]))
    assert close(stated(r"the first two figures are \d+ % to \d+ % and (\d+) % to (\d+) %"), span("independent", worlds[1]))

    def games(model: str) -> tuple[str, str]:                              # 60,000 plus 30,000 times the share of draws that advance, where no threshold does anything
        runs = [sim.simulate(sim.WORLDS[worlds[0]], h, draws=20_000, model=model)["advance"] for h in sim.HEAD_PAIRS]
        lo, hi = (round((60_000 + 30_000 * f(runs)) / 1000) * 1000 for f in (min, max))
        return f"{lo:,}", f"{hi:,}"

    (lo, hi), (ilo, ihi) = games("shared"), games("independent")
    assert f"about {lo} to {hi} games on average where no threshold does anything ({ilo} to {ihi} with independent arms)" in item
    assert f"about {lo} to {hi} on average where no threshold does anything, {ilo} to {ihi} with independent arms" in adr      # the Cost paragraph says the same


def test_the_frozen_paths_the_registration_names_are_the_ones_the_scripts_read(tmp_path):
    adr = record()
    r = subprocess.run(["bash", "-c", 'source scripts/studies/thresh/common.sh; printf "%s\\n" "${PINNED_PATHS[@]}" "${READING_PATHS[@]}"'], cwd=REPO, env={**os.environ, "OUT": str(tmp_path)},
                       capture_output=True, text=True, check=True)
    paths = [p for p in r.stdout.split() if not p.startswith(":(")]
    assert "scripts/lib/thresh.mjs" in paths and "scripts/lib/pooled.mjs" in paths and "sim" in paths      # the reading code is frozen from the registration
    registration = adr[adr.index(MARK1):] if MARK1 in adr else ""
    item10 = next(line for line in adr.split("\n") if line.startswith("10. *The runs are checked"))
    for p in paths:
        name = p + "/" if (REPO / p).is_dir() else p
        assert f"`{name}`" in item10, p                                       # item 10 lists what the preflights pin
        if registration:
            assert f"`{name}`" in registration, p                            # and so does the registration paragraph
    if registration:
        assert "its tests excepted" in registration and "its README and `part2.py`" in registration
        assert "part 2 adds the reading code" not in registration
