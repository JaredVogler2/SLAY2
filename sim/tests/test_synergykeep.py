"""ADR-053 item 6: the stage-B1 reading of runs that keep their relics. Checked on the committed B1 cohorts (runs that hold two relics),
where the relic-aware reading must differ from the class-alone one only where a run holds a relic the table tags."""

from __future__ import annotations

import numpy as np

from slay2_sim import advisor, synergykeep, synergystudy


def test_the_class_alone_reading_is_exactly_stage_b1_and_the_relic_reading_differs_only_where_a_tagged_relic_is_held():
    cohort = synergystudy.COHORTS[1]  # silent-train: 2,332 runs
    card, relic, metas, held = synergykeep.build_tables((cohort,))
    b1, _ = synergystudy.build_table((cohort,))
    assert np.array_equal(card.F, b1.F) and np.array_equal(card.X0, b1.X0) and np.array_equal(card.y, b1.y)  # the committed reading, untouched
    records, _ = synergystudy.load_cohort(cohort)
    tagged = advisor.relic_synergy_table()["relics"]
    holds = np.array([any(x in tagged for x in r["relics"]) for r in records])
    differs = np.array([not np.array_equal(a, b) for a, b in zip(card.F, relic.F)])
    assert not differs[~holds].any()  # a run with no tagged relic reads exactly as before
    assert differs.sum() == held["parts_differ"] and holds.sum() == held["with_a_tagged_relic"] and held["runs"] == len(records)
    assert 0 < differs.sum() < 0.03 * len(records)  # with two relics a run, a relic's supply moves the parts of about 1 % of the decks
    assert np.array_equal(card.g, relic.g) and np.array_equal(card.cohort, relic.cohort)


def test_the_cohorts_of_the_replication_are_the_five_exploration_batches():
    cohorts = synergykeep.cohorts()
    assert [c.character for c in cohorts] == list(synergykeep.CLASSES)
    assert all(c.partition == "dev" and c.path.startswith("experiments/cardvalue/explore4-") and c.path.endswith("-a0-keeprelics-dev-o5000-n5000") for c in cohorts)
