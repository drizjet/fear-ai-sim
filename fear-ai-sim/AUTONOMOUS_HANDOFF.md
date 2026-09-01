# AUTONOMOUS HANDOFF

EVID-2026-08-31-PENDING-TRIP-MARKET-LOOP

Test Suites: 142 passed, 142 total
Tests:       1139 passed, 1139 total
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
- migration destination utility: food (shortage), safety (bandit), distance, faction trust (Slice B) — not lowestPop; WHY filled
- justice → faction legitimacy: JUSTICE_RESOLVED lowers owning faction legitimacy (0.85*old+0.15*justice), recovers 0.02/tick when no crime, legitimacy dampens raidScore 0.15*(1-legitimacy) (Slice C)

## Still false / still open
- 0/10 frozen core mutation kills
- evidence ledger stale (0 admissible, linter exit 1)
- market loop: Slice A done; pending-trip → market delivery now WIRED via trip (see below)
- FearCore vs Brain dual-ownership parked
- runtime is DOM shim
- Lane A not operational
- historical relationshipGate:false isolations still in place
- build rollup native missing in WSL

## What was done 2026-08-31 Slice A+B+C (Lane B, unaccepted)
- Slice A (market): 8 tests market-material-loop — deliverCargo→price, BANDIT loss→price, conservation, opportunityBonus fallback to town.market (was decorative)
- Slice B (migration): 4 tests migration-destination-utility — utility beats lowestPop, bandit safety, 200-tick conservation (FIRE==MIG), WHY with utilities
  - Fix: closed-world.js destination utility `0.4*(1-shortage)+0.3*(1-danger)+0.2*(1/(1+dist/10))+0.1*trust`
- Slice C (justice): 3 tests justice-faction-legitimacy — JUSTICE_RESOLVED→owning faction legitimacy (blend 0.85/0.15, recover 0.02), legitimacy dampens raidScore `0.15*(1-legitimacy)`; production path crime→justice→faction differs, not unit-only
  - Fix: factioncore.js legitimacy field (default 0.9) + closed-world.js justice loop updates owning faction
- Slice A follow-up (pending-trip market loop): 3 tests pending-trip-market-conservation — schedule→TRIP_ARRIVAL→deliverCargo lands stock, price drops, §155 flows.delivered booked into marketFlows + MARKET_TICK; per-tick mass-balance holds with the +delivered term; a raid that strips merchant cargo blocks shipping so no delivery lands
  - Fix: closed-world.js canonical merchant wiring now calls schedulePendingTradeTrip (was decorative TRIP_COMMITMENT event only — cargo never traveled); world.deliveredThisTick bridges advancePendingWorldObligations → step-4 market loop tickFlow.delivered; default merchant gets cargoKind:'food' so opportunityBonus fires in production; delivered trips pruned from pendingTrips (was unbounded growth ~72/500 ticks → now 1)
  - Fix: mass-balance identity now `(produced-overflow) + delivered - consumed - spoiled` (was missing +delivered and violated by exactly the delivered amount on delivery ticks)
  - Production nuance: shipment volume scales with merchant's believed route danger and world perceivedDanger (dangerous worlds ship less), so §138 differentiation flows through delivered supply — updates to sensitivity-500tick (deliveredTotal axis) and scenario-differentiation-long-horizon (memoryOfLoss axis) are STRENGTHENINGS per audit law, tracked with the axes they measure

## Next 5
1. Drought/season → production → shortage → migration (ecology cascade, one stock change consumed by decision)
2. Justice outcome → faction legitimacy (resolve → faction state) — done in Slice C; re-verify against any further raidScore changes
3. Real pending-state fork + MUT-SAVE-001 held under two-branch identity
4. WHY inspector for merchant route B vs A
5. Ecology/season material loop full integration

Do not start another evidence-framework slice unless a P0 ledger write bug reappears.

## Repair notes 2026-08-31
- Probe before repair: FIRE 16, MIGRATION 1, FIRE without MIG 15, toTownId null, pop 0. After repair: one-town FIRE 0 MIG 0 pop 1; two-town FIRE 6 MIG 6 conserved, FIRE==MIG, all MIG have destination.
- Demography: previousPopChange chain fixed for immigration audit duplicate; immigration now parents to dest previous POP + recent FIRE decision (not same-tick impossible)
- Production-default: removed >=0 and OR-of-five, now asserts nervous fear > calm fear
- Tests patched for WSL path (brain-fearcore-authority, quarantine)
- Mutation: forced FIRE before population/destination guards; migration-pressure-contracts decision integrity test fails as expected; reverted.

## Verification 2026-08-31 Slice A follow-up (pending-trip market loop)
```
Test Suites: 142 passed, 142 total
Tests:       1139 passed, 1139 total
Time:        25.16s (parallel, all suites)
Focused pending-trip-market-conservation: 3 passed, 3 total
500-tick probe: 1.80 ms/tick; maxPendingTrips 72 -> 1 after prune fix; 71 deliveries; no NaN.
5000-tick direct probe (1 seed): crashed=false nan=false negInv=false pop=2 events=87132
  maxPending=1, 155s/seed (the 3-seed Jest suite is the known >600s WSL outlier).
```
FOCUSED_GREEN / FULL_GREEN (142/142)
DEVELOPMENT_VERIFIED_CURRENT_TREE
SUPERVISOR_ADMITTED = no
KNOWN_GAPS_PRESENT = yes
Mutation (kill): disabled the deliveredThisTick→tickFlow merge; pending-trip-market-conservation
+ market-mass-balance-invariant 4 tests go red (mass balance violates by exactly the delivered
amount); restored. Proves the booking fix is real, not decorative.

## Independent verification 2026-08-31 (post-audit)
An independent audit directive (FEAR-AI-TRUTH-CORRECTION) was issued against a
pre-repair tree state (HEAD 050d3db, branch co-author-removal, dirty worktree,
FIRE-without-MIGRATION, demography-causal-parentage red). Reproduction against
the CURRENT tree (HEAD 99e439a, master, clean except this doc) shows the audit's
P0-1/P0-2/P1-1/P1-3/P1-4 findings are already resolved by commits e85650d +
Slice A/B/C:
- Full Jest: 141 suites / 1136 tests GREEN (audit claimed FAIL — was true on pre-repair tree).
- One-town probe (audit §3.3): FIRE 0, MIGRATION 0, SUPPRESSED 25, population stays 1,
  0 null destinations. Audit's "FIRE 16 / MIG 1 / pop 0 / 15 FIRE-without-MIG / null dest"
  is no longer reproducible — fixed by e85650d.
- Two-town probe: initial 10 / final 10 (delta 0), FIRE 6 == MIGRATION 6, 0 null dest.
- demography-causal-parentage.test.js: 3/3 PASS (audit claimed red — fixed by e85650d).
- reportedCrime is per-town via recentAttacksByTown (roadId incident to townId), not global.
- migration-pressure-contracts incidence oracle asserts near-ceiling
  (highMigs >= eligibleOpportunities-1 AND <= eligibleOpportunities), not merely > 0.
- production-default test uses named-axis direction (nervous.factionFear > calm.factionFear),
  no vacuous >= 0.

One genuinely-open audit P0 was found and fixed this pass:
- P0-4 TEST_CHANGES self-approval: all 15 rows had reviewer="agent" reviewStatus="APPROVED"
  (implementer self-approving its own test changes). Downgraded to reviewStatus="PROPOSED"
  (implementer-asserted, supervisor admission still pending). Rows remain append-only.

lint:evidence: exit 1, 0 admissible, 267 stale, 0 errors — fingerprints stale against
HEAD movement; rebuild is a later evidence slice, not a code bug. Honest, not fixed here.
