# PROMPT 04 — FAIR-INFORMATION ML, SEARCH, NEURAL NETS AND STRONGEST POLICY SELECTION

Act as applied RL research lead and statistically rigorous optimizer. Identify the strongest real-world repeatable strategy for the particular STS2 game build, character, difficulty and competitive objective. Do not force a neural network to be production champion. Train/evaluate using **actual phase-03 end-to-end simulations and legal-policy data**; if no data exists, mark model experimental/not trained and ship a useful heuristic-only advisor.

## Decision optimization model
STS2 is a long-horizon, combinatorial, partially observable MDP with high variance and sparse binary terminal rewards. Maximize `P(complete legal Act3 win | player-observable state)`, conditional on solo A0–A10, character, build/version, fair policy time budget, resource preservation and chance to survive next bosses. For A10 optimize two final boss fights. Separate co-op team objective and role-specific value if/when valid.

Distinct strategy horizons:
- combat action order/target/turn sequencing (deterministic visible effects + sampled hidden futures),
- card, enchantment, created-card, potion, relic and Ancient boon value,
- map route HP/reward/deck strength dynamic programming,
- campfire heal/upgrade/special and merchant optimization,
- adaptation to class-specific Stars/Forge/Osty/Doom/Sly/Orbs,
- short-term survival and long-term win chance with explicit opportunity costs.

## Candidate methods (measured ablations, not buzzword checklist)
1. Exact probability/one-turn deterministic calculation, basic hand-enumeration and simple heuristic baseline.
2. **Small fair-state exact combat enumerator**, then approximate search when branching too large. Optimize scenario HP-loss PMF and value; sample draw/order and enemy intents from their conditional distributions, not actual RNG.
3. Beam search/expectimax/determinized belief-state MCTS with legal-action masks, class-specific pruning, action ordering, transposition tables and search-budget adaptivity.
4. Supervised action-conditioned ranker (logistic regression/gradient boosting vs MLP/DeepSets/attention). Preserve unordered deck multiset and variable legal candidates, card IDs, upgrades/enchantments, relic state, Ancient and encounter matchup. Train on actual fair decision/outcome data; policy imitation only from trustworthy teacher or heldout outcomes.
5. Trained actor-critic/masked PPO if simulation throughput and true long-run reward allow, replay/baseline management, entropy/exploration, class/difficulty curriculum A0→A10, self-play or self-imitation when justified.
6. Neural value network for search leaf evaluation, calibrated boss-survival head and risk distribution; value uncertainty and OOD detection trigger heuristic/analytic fallback.
7. Cross-context champion arbitration: simple analytic quick mode; trained macro policy where validated; search in combat under budget; no model where no coverage.

## Strict feature encoder
Inputs allowed: visible cards in hand, observable deck multiset but not shuffled order, known map and current choices, unlocked Ancients, offered options, HP/energy/gold, current visible enemy intents, current buffs/party health, character resource status (Stars, Osty, Souls, Doom, orbs, Sly, enchantments), relic counters where publicly tracked, observed history state without future values, currently known opponent patterns. Not allowed: true RNG, seed or hash, future rewards, enemy move *future* unavailable in UI, internal draw pile permutation, result/termination flags, future floor/boss not yet displayed, hidden multiplayer teammate private hand unless game UI shares it.

Guard against side channels (run ID revealing seed, metadata filepath, episode length/action index target leakage, summary data included in features, dataset future-state normalization). Model's recommendation must remain invariant when internal RNG/future order changes but exact same visible state; establish metamorphic property suite.

## Training & testing pipeline
- Validate trace correctness, observed-action labels, choice availability, model train/val/test split by seed/episode/build/patch; no training on linked test runs even with other policy decisions.
- Feature embeddings: canonical per-build item IDs, costs, rarity, enchantment instances, card generated/persistent flags and structured stats. DeepSets pooling for cards/relics, cross-attention optional for candidate vs deck; graph encoder optional for reachable map DAG; masked action set variable. Start tiny MLP/boosted tree and measure whether transformer justified.
- Missingness: distinguish zero vs unknown, absent/unlocked/restricted vs not offered; human logs lack alternatives; use causal caution.
- Balance rare terminal success with calibrated labels and reward shaping that is ablated against *true full-run win*. Curriculum, scenario synthetic augmentations from validated exact sim, 3 independent training seeds where feasible, hyperparameter sweeps bounded by CPU/GPU credits.
- Train outcome distribution value (V(s)), action counterfactual (Q(s,a)), optional win classifier `P(win|s)`, death/HP-loss quantile distribution, and time-budgeted PUCT prior if beneficial. Do not interpret uncalibrated Q as a probability.
- Track Brier/log-loss/ECE, reliability charts and subgroup calibration by class/A/biome/boss/build, novelty/OOD probability of a rare item combo, and model abstention rate.
- Compare blind paired seed results vs simplest rules/search methods under same computation and rules; Wilson/paired-bootstrap intervals, effect size and search latency. A +1% estimated difference from 100 runs is inconclusive; preregister evaluation. Do not take 20.7% published FableBot win rate as own score or as causal proof of improvement.
- Examine leakage & simulation-real transfer, evaluate on actual game replay parity and then limited supervised user sessions where consent exists; no auto-play on public co-op/leaderboards by default.
- Export tiny inference model with explicit feature schema and content hash; benchmark CPU ONNX or lightweight JS execution for Vercel; heavy simulation/model training on worker only.

## Deliverables
Actual training commands/scripts, valid dataset card, fair-observation tests, evaluation split manifests, model artifacts and model cards when trained, experiment table including failures and negative ablations, calibrated reliability diagrams, reproducible policy arbitration and honest coverage/fallback interface. Report actual compute, training seeds, run counts, confidence intervals and game builds; do not invent. Commit and proceed phase 05.
