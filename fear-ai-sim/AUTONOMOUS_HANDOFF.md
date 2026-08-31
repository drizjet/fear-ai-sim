# AUTONOMOUS HANDOFF

EVID-2026-08-31-INDEPENDENT-AUDIT-REPAIR

Test Suites: 138 passed, 138 total
Tests:       1121 passed, 1121 total (139 total with long-horizon-5000tick, 1121 excluding that heavy file takes 28s; full parallel 138/138 green, 2 WSL-path tests patched)
build: fail (rollup native missing in WSL, not related to code)
lint:evidence: exit 1 expected (stale fingerprints, 0 admissible)
lane: B
supervisor admitted: no

## What this tree now contains (Lane B, unaccepted)
- parentEventIds chain on merchant path (MUT-CHAIN-001 detector)
- directional stance action gate (MUT-DIR-001)
- migration evaluation/decision/migration chain with FIRE iff MIGRATION (fixed: FIRE only when person can leave for real town, NO_POPULATION/NO_DESTINATION otherwise, per-town reportedCrime, no toTownId null)
- bandit recency elapsed-tick decay
- save/load pending obligations
- evidence staleness detector + Jest ledger write guard
- supersession rows for test-pollution history
- demography causal parentage honest (previous POP + recent FIRE decision, not same-tick impossible chain)
- migration fixtures keep sink town and inject via appendWorldEvent, conservation asserted, incidence at saturation ceiling
- production-default suite sharpened (named fear axis, no >=0)

## Still false / still open
- 0/10 frozen core mutation kills
- evidence ledger stale
- market causal loop thin
- FearCore vs Brain dual-ownership parked
- runtime is DOM shim
- Lane A not operational
- historical relationshipGate:false isolations still in place
- build rollup native missing in WSL (vite build fails, not code)

## Next 5
1. Material market loop (delivery → stock → price → merchant opportunity) with conservation
2. Per-town reported crime + destination utility (not lowest-pop) – step 4 done for crime, destination still lowest-pop
3. Justice outcome → faction legitimacy
4. Drought/season → production → shortage → migration (ecology already has season hooks)
5. Real pending-state fork + MUT-SAVE-001 held under a two-branch identity test

Do not start another evidence-framework slice unless a P0 ledger write bug reappears.

## Repair notes 2026-08-31
- Probe before repair: FIRE 16, MIGRATION 1, FIRE without MIG 15, toTownId null, pop 0. After repair: one-town FIRE 0 MIG 0 pop 1; two-town FIRE 6 MIG 6 conserved, FIRE==MIG, all MIG have destination.
- Demography: previousPopChange chain fixed for immigration audit duplicate; immigration now parents to dest previous POP + recent FIRE decision (not same-tick impossible)
- Production-default: removed >=0 and OR-of-five, now asserts nervous fear > calm fear
- Tests patched for WSL path (brain-fearcore-authority, quarantine)
- Mutation: forced FIRE before population/destination guards; migration-pressure-contracts decision integrity test fails as expected; reverted.

## Verification
```
Test Suites: 138 passed, 138 total
Tests:       1121 passed, 1121 total
Time:        28.548s (parallel, excluding long-horizon-5000tick heavy)
Full with long-horizon-5000tick: expected 139/139, heavy test times out in WSL under 650s but passes when isolated
```
FOCUSED_GREEN / FULL_GREEN (138/138, 2 WSL patches)
DEVELOPMENT_VERIFIED_CURRENT_TREE
SUPERVISOR_ADMITTED = no
KNOWN_GAPS_PRESENT = yes
