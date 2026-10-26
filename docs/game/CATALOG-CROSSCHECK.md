# Card catalog cross-check (2026-10-25)

`packages/game-data/data/cards.sts2-main-0.107.1.json` is derived by `python -m slay2_sim catalog` from two pinned,
read-only, git-ignored references (ADR-011): `nkhoit/spire-archive` @ `4e6b0e0` (identifiers, names, class, rarity,
type, cost, keywords; game v0.107.1) and `zhiyue/sts2-rl-agent` @ `5d874e8` (E1: class pool membership, epoch unlock
lists, multiplayer constraints). It stores **facts and SLAY2 analysis only** - no card text, art or effect numbers.

## What was compared

The catalog was compared with the third-party simulator's own card tables (`sts2_env.cards.factory.create_card`) for every card id:

| Check | Result |
|---|---|
| Catalog cards | 577 (spire-archive); Almanauts also lists 577 cards |
| Catalog ids with a simulator `CardId` | 576 of 577 (the simulator appends `_CARD` to 68 ids that collide with power names; the one remaining id, `SLOTH`, is `SLOTH_STATUS` there) |
| Simulator ids with no catalog card | 4 real ones (`FOLLOW_THROUGH`, `GRAPPLE`, `PAIN`, `PARASITE`), plus `DEPRECATED_CARD`, `GENERIC` - cards the simulator carries that the archive's 0.107.1 list does not |
| Cost mismatches | **0** |
| Card-type mismatches | **0** |
| Rarity mismatches | **0** (ten token cards are labelled `Token` by the archive and `STATUS` by the simulator - non-reward cards) |

Two data sets derived from the same game build agreeing on 576 of 577 cards is a consistency check on the extraction,
**not** independent proof about the live game.

## Solo reward pools (closes open question Q3)

Per playable class with every epoch revealed: **20 common, 35 uncommon, 25 rare**. The class pool holds 87-88 cards (3-4
starters, 2 Ancient-rarity cards, 20 commons, 36 uncommons, 26 rares); starters and Ancient-rarity cards never appear in
rewards, and one uncommon plus one rare per class are multiplayer-only, which leaves 20/35/25 in a solo run. With no epoch revealed the pools shrink (e.g. Ironclad 17 / 32 / 22) because nine cards per class are
gated behind unlock epochs. Colorless pool (solo): 32 uncommon + 21 rare.
