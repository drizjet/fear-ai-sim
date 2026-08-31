# AUTONOMOUS HANDOFF

EVID-2026-08-31-SLICE-B-MIGRATION-DESTINATION-UTILITY

Test Suites: 140 passed, 140 total
Tests:       1133 passed, 1133 total
build: fail (rollup native missing in WSL, not related to code)
lint:evidence: exit 1 expected (stale fingerprints, 0 admissible)
lane: B
supervisor admitted: no

## What this tree now contains (Lane B, unaccepted)
- parentEventIds chain on merchant path (MUT-CHAIN-001 detector)
- directional stance action gate (MUT-DIR-001)
- migration evaluation/decision/migration chain with FIRE iff MIGRATION (fixed: FIRE only when person can leave for real town, NO_POPULATION/NO_DESTINATION otherwise, per-town reportedCrime, no toTownId null, utility-driven destination)
- bandit recency elapsed-tick decay
- save/load pending obligations
- evidence staleness detector + Jest ledger write guard
- supersession rows for test-pollution history
- demography causal parentage honest (previous POP + recent FIRE decision, not same-tick impossible chain)
- migration fixtures keep sink town and inject via appendWorldEvent, conservation asserted, incidence at saturation ceiling
- production-default suite sharpened (named fear axis, no >=0)
- market material loop: deliverCargo→stock→price, BANDIT loss→price delta, conservation, opportunityBonus uses quote (Slice A)
- migration destination utility: food (shortage), safety (bandit), distance, faction trust (Slice B) — not lowestPop; WHY filled with utilities

## Still false / still open
- 0/10 frozen core mutation kills
- evidence ledger stale (0 admissible, linter exit 1)
- market loop: Slice A done, pending-trip → market delivery still thin
- FearCore vs Brain dual-ownership parked
- runtime is DOM shim
- Lane A not operational
- historical relationshipGate:false isolations still in place
- build rollup native missing in WSL

## What was done 2026-08-31 Slice A+B (Lane B, unaccepted)
- Slice A (market): 8 tests market-material-loop — deliverCargo→price, BANDIT loss→price, conservation, opportunityBonus fallback to town.market (was decorative)
- Slice B (migration): 4 tests migration-destination-utility — food/safety/distance/trust utility beats lowestPop (south 1 pop starving vs east 20 pop abundant → east wins), bandit safety, 200-tick conservation multi-seed (FIRE==MIG), WHY with utilities
  - Fix: closed-world.js destination now utility `0.4*(1-shortage)+0.3*(1-danger)+0.2*(1/(1+dist/10))+0.1*trust`, MIGRATION_DECISION.why + MIGRATION.why with rejected sinks

## Next 5
1. Pending-trip cargo in transit → scheduled DELIVER_CARGO → market delivery (trip material path)
2. Justice outcome → faction legitimacy (resolve → faction state)
3. Drought/season → production → shortage → migration (ecology cascade)
4. Real pending-state fork + MUT-SAVE-001 held under a two-branch identity test
5. WHY inspector for merchant route B vs A (observations, beliefs, candidates, utilities, threshold, rng)

Do not start another evidence-framework slice unless a P0 ledger write bug reappears.

## Repair notes 2026-08-31
- Probe before repair: FIRE 16, MIGRATION 1, FIRE without MIG 15, toTownId null, pop 0. After repair: one-town FIRE 0 MIG 0 pop 1; two-town FIRE 6 MIG 6 conserved, FIRE==MIG, all MIG have destination.
- Demography: previousPopChange chain fixed for immigration audit duplicate; immigration now parents to dest previous POP + recent FIRE decision (not same-tick impossible)
- Production-default: removed >=0 and OR-of-five, now asserts nervous fear > calm fear
- Tests patched for WSL path (brain-fearcore-authority, quarantine)
- Mutation: forced FIRE before population/destination guards; migration-pressure-contracts decision integrity test fails as expected; reverted.

## Verification 2026-08-31 Slice A+B
```
Test Suites: 140 passed, 140 total
Tests:       1133 passed, 1133 total
Time:        32.06s (parallel, all suites)
Focused Slice A: 8 passed, 8 total
Focused Slice B: 4 passed, 4 total
```
FOCUSED_GREEN / FULL_GREEN (140/140)
DEVELOPMENT_VERIFIED_CURRENT_TREE
SUPERVISOR_ADMITTED = no
KNOWN_GAPS_PRESENT = yes
Mutation Slice A: opportunityBonus=0 → high-price test fails (road-a wins, expected road-b). Mutation Slice B: set destination to lowestPop → lower-shortage test fails (south wins, expected east). Restored.
