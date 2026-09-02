# AUTONOMOUS HANDOFF

EVID-2026-09-01-SLICE-F-MERCHANT-WHY-INSPECTOR (Lane B, unaccepted)

Test Suites: 148 passed, 148 total (was 147)
Tests:       1167 passed, 1167 total (+4)
Merchant WHY inspector: B vs A ranked, observations, threshold, rng draws
build: fail (rollup native missing in WSL, not related to code)
lint:evidence: exit 1 expected (stale fingerprints, 0 admissible)
lane: B
supervisor admitted: no

## SLICE F — merchant WHY inspector (route B vs A)
WHY that just said "chosen route" was decorative. Now it names the belief that mattered.
- canonical-trade-system.js:138 ranked now carries distanceCost, dangerPenalty, familiarityBonus, opportunityBonus, cargoLossRisk, perceivedDanger, confidence per route. TickMerchant captures WHY: observations (bandit road observations with rng draws), beliefSnapshotBefore/After, ranked with breakdown, threshold {switchingCost, ticksSinceSwitch, inertiaApplied}, chosenRoute/Score (canonical-trade-system.js:270, 352).
- MERCHANT_ROUTE_DECISION event now has `why` with observations, beliefSnapshot, ranked, threshold, rngDraws, rejected (closed-world.js via tickMerchant). Toggling one belief flips choice and WHY shows which belief (score breakdown diff).
- Detectors: tests/merchant-why-inspector.test.js (4 tests):
  1) toggle road-a 0.8→0.1 + road-b 0.1→0.8 flips road-b→road-a and WHY shows dangerPenalty diff
  2) WHY contains ranked breakdown, observations, beliefSnapshot, threshold, rngDraws
  3) inertia threshold captured (switchingCost 10, 1 tick ago → stays on road-b, WHY inertiaApplied true; cost 0 → flips)
  4) tickClosedWorld ledger populates WHY
- Mutation: set ranked dangerPenalty to 0 → toggle test fails (ranked diff 0); restored.

## SLICE E — encounter RNG persistence (W1-CONTINUITY-RNG)
W1-CONTINUITY-RNG CONFIRMED_CURRENT at re-anchor (4 production sites
closed-world.js:1271/2337/2434/2438) was a closure outside serializable
world — saveWorld dropped it, true restart diverged. Now persisted.
- world.rngStreams.encounter { algorithm:'xorshift32', state, draws } plain
  JSON, initialized in ensurePendingWorldState and createClosedWorldScenario
  (closed-world.js:40, 49, 607). nextEncounterRandom / makeEncounterRng
  (closed-world.js:197) replace tick-seeded deterministicRng at all 4 sites:
  tickCanonicalMerchant, encounter selection, tickBandit, tickPatrol.
  Custom encounterRng still overrides for tests but persistence is via the
  stream when null — real restart no longer needs the closure.
- Detectors: tests/encounter-rng-persistence.test.js (3 tests):
  1) 5-tick checkpoint → 10-tick resume WITHOUT custom rng is byte-identical
     (saveWorld equality, RNG state/draws equal)
  2) custom RNG still works but does not corrupt persistent stream
  3) drought + encounter stream both survive save/load
- Mutation: remove rngStreams.encounter init, resumed.rngStreams.encounter undefined → test fails; restored.
- Filed: statistical-validation-trade-loop still reuses closure for both twins
  (fake restart) — now documented, not blocking; real two-branch test above
  is the honest one.

## SLICE D — drought → production → shortage → migration cascade
Ecology now drives migration via a real stock change, not a flag.
- world.drought { active, severity, kind, townId, remainingTicks, startEventId } transient ecology modifier on food production for a single town. Severity [0,1] → production multiplier max(0.1, 1 - severity*0.6) clamped so 0.6 severity = 0.64x, 1.0 = 0.4x. Applied in step-4 market loop after season modifier (closed-world.js:1776). Plain JSON: save/load/fork safe.
- Tick lifecycle: decrements remainingTicks each tick in step 0.1, emits DROUGHT_ENDED parented to DROUGHT_STARTED when reaching 0 (closed-world.js:819).
- Detectors: tests/drought-shortage-migration.test.js (4 tests):
  1) drought produces 0.64x vs control and shortage 0→1 while non-drought town unaffected
  2) drought shortage drives demography emigration 414→496 over 30 ticks (north pop 100, south 100)
  3) mass conservation holds (no NaN, no negative, market mass-balance invariant still green)
  4) DROUGHT_STARTED → DROUGHT_ENDED parent chain correct
- Mutation: set drought multiplier to 1, ratio goes 0.64→1.00, shortage test fails — restored.
- Wiring: drought → perCapitaProduction → marketFlows.produced → shortage/price → demography emigration (POPULATION_CHANGE) and faction supplyShortage. One stock change consumed by a decision, per §11 Slice D.

EVID-2026-08-31-R2-W1-CAUSAL-DAG-AUTHORITY (V8 Supercampaign R2, Wave 1 lane C)

Test Suites: 145 passed, 145 total (was 144)
Tests:       1156 passed, 1156 total (+9)
1000-tick ledger probe: 15,814 events — ids UNIQUE and allocator-shaped
  (WORLD-EVENT-*), zero unknown parents, zero future parents, maxPendingTrips=1,
  no NaN (mass identity enforced by in-suite loss-sink tests, unchanged)
build: fail (rollup native missing in WSL, not related to code)
lint:evidence: exit 1 expected (stale fingerprints, 0 admissible)
lane: B
supervisor admitted: no

## LANE C RESULT — one event-ID authority + protected parentage + causal linter
RESP-EVENT-ID-AUTHORITY-001. Re-anchored on 194f022 (clean tree): all claims
CONFIRMED_CURRENT — 4 template-ID emitters (canonical-trade-system.js
MERCHANT_ROUTE_DECISION/BANDIT_RELOCATION/PATROL_INTERCEPTION/PATROL_DETECTION_MISS,
two-roads-world.js benchmark MERCHANT_ROUTE_DECISION filed as benchmark scope),
~19 bare world.events.push sites in the reducer path, and the
MIGRATION_PRESSURE_EVALUATED orphan on stable-justice ticks.

Production changes:
- appendWorldEvent now the ONLY emission path for protected events in the
  canonical world: resolveBanditAttack, encounter-engine BANDIT_ATTACK,
  ROUTE_SELECTED/ROUTE_CHANGED (parented to the canonical
  MERCHANT_ROUTE_DECISION of the tick via decisionEventIds capture;
  legacy-only merchants declare rootReason LEGACY_AUDIT_TRAIL),
  CONVOY_FORMED (parent = TRIP_COMMITMENT) / CONVOY_DISBANDED,
  FACTION_REASSESSMENT, STANCE_TRANSITION, INTRUSION, BANDIT_RELOCATION,
  MARKET_TICK, REPORT_FILED.
- tickMerchant/tickBandit/tickPatrol emit through appendWorldEvent
  (allocator ids); PATROL_* events parent to the BANDIT_ATTACK they react
  to (rootReason PATROL_SWEEP when the attack id is not yet allocator-issued).
- MERCHANT_ROUTE_DECISION parents: this tick's BELIEF_UPDATE events, falling
  back to the merchant's most recent belief event (stale belief = legitimate
  causal parent), or explicit rootReason DECISION_FROM_BELIEFS.
- MIGRATION_PRESSURE_EVALUATED on stable-justice ticks now parents to the
  town's recent BANDIT_ATTACK events (the real causal inputs) instead of
  silent []; rootReason WORLD_CONDITIONS only when no attack exists.

New read-only causal-ledger.js linter (no deps, never mutates):
- EVENT-ID-001: duplicate ids, missing ids, template ids on protected types
- EVENT-PARENT-001: chain-connector types REQUIRE a parent; derivative types
  require parent OR explicit rootReason (the silent-[] orphan class)
- EVENT-PARENT-ORDER-001: future parents
- CHAIN-MERCHANT-001: decision->commitment->exposure->consequence in the
  parent/child graph (EVENTUALLY semantics: a consequence existing anywhere
  without any exposure->consequence path is a broken wire)
- CHAIN-MIGRATION-001: migration->decision->pressure evaluation

Detectors: tests/w1-causal-ledger.test.js (9 tests) — clean-lint smoke on
plain AND attack-driven worlds (which also prove real ENCOUNTER + MIGRATION
events), and mutations KILLED: MUT-EVENT-TEMPLATE-001 (TEMPLATE_EVENT_ID),
MUT-EVENT-DUP-001 (DUP_EVENT_ID), MUT-EVENT-UNKNOWN-PARENT-001
(UNKNOWN_PARENT), MUT-EVENT-FUTURE-PARENT-001 (FUTURE_PARENT),
MUT-EVENT-ORPHAN-001 (MISSING_PARENT), MUT-CHAIN-MERCHANT-001
(CHAIN_MERCHANT_DECISION), MUT-CHAIN-MIGRATION-001 (CHAIN_MIGRATION +
MISSING_PARENT).

Filed (benchmark scope): two-roads-world.js:365 MERCHANT_ROUTE_DECISION
still template-id (its own arena, exempt from closed-world linter).

EVID-2026-08-31-R2-W1-PARTIAL-OBSERVABILITY (V8 Subagent Supercampaign R2, Wave 1 lane B)

Test Suites: 144 passed, 144 total (superseded by 145/1156 above)
Tests:       1147 passed, 1147 total (+4)
1000-tick direct probe (organic default world): worst mass drift 3.55e-11,
  maxPendingTrips=1, no NaN / negative population; 932 food organically stolen
  and booked through the loss sink over the run (world alive under the fixes)
build: fail (rollup native missing in WSL, not related to code)
lint:evidence: exit 1 expected (stale fingerprints, 0 admissible)
lane: B
supervisor admitted: no

## LANE B RESULT — hidden-truth reads killed (OBS-HIDDEN-001 / OBS-LOCALITY-001)
Re-anchored all §3.2 claims on the current tree (3e93a1f, clean). Three live
truth-reads CONFIRMED and closed; two fidelity items deferred (not truth reads):
1. closed-world.js (legacy route pass): missing belief fell back to
   `world.bandits.some(...) ? route.actualDanger : route.actualDanger*0.1` —
   hidden truth injected into merchant perception. Now NEUTRAL PRIOR 0.5.
2. Faction step: confirmedLoss / memoryOfLoss / per-target memory / pair harm
   counted ALL world attacks for EVERY faction (north learned south-only hits).
   Now scoped to attacks on roads incident to the faction's home town (helper
   `incidentRoadsByTown`); factions without a town keep the world aggregate;
   pair material signal scoped to the pair's towns. Canonical two-town world
   is unchanged (every road touches both towns) — zero behavior delta there.
3. Migration destination safety read live `world.bandits.some(...)` (binary
   0.7/0.2). Now derived from the origin town's merchants' routeBeliefs
   (legal observation/rumor surface; neutral prior 0.3 with no knowledge).
DEFERRED (fidelity, not omniscience — filed): exact actualDanger written into
legal OBSERVATION values without noise (closed-world.js belief wiring), and
the canObserve town-adjacency panopticon (closed-world.js canObserve). Both
are legal-observation quality issues; R2.1 accepts legal observation paths.

Detectors (tests/w1-observability-twin.test.js, 4 tests, hidden-vs-visible
twin worlds, identical RNG):
- OBS-HIDDEN route twin: bandit on road-a vs road-c → identical ROUTE_SELECTED
  (neutral-prior outcome road-a) + no belief minted from truth
- OBS-LOCALITY twin: road-a attack leaves the separate east faction untouched
  (memory 0 / grief 0 / no per-target entry) while road-ne attack reaches it;
  canonical two-town guard: both canonical factions still feel road-a
- OBS-HIDDEN migration twin: bandit present vs absent → identical safety-score
  vectors, pinned to the belief surface (south 0.2 / east 0.9)
Mutations KILLED (restored after each):
- MUT-OBS-FALLBACK-001 (restore truth fallback) → twin route ranking diverges
  road-a vs road-b
- MUT-OBS-LOCALITY-001 (global scope) → east faction absorbs road-a attack,
  memory 0.1 vs expected 0
- MUT-OBS-MIGRATION-001 (restore bandit truth) → twin safety arrays differ
Oracle update (truth-honest): migration-destination-utility 'safety avoids
bandit road' asserted omniscience (world with NO knowledge channel still
avoided a bandit it could not know about). The traveler now cannot; the test
seeds the north town's legal belief surface instead — same intent, legal path.

EVID-2026-08-31-R2-W1-MATERIAL-LOSS-SINK (V8 Subagent Supercampaign R2, Wave 1 lane A remainder)

Test Suites: 143 passed, 143 total (superseded by 144/1147 above)
Tests:       1143 passed, 1143 total
time (parallel, excl. long-horizon-5000tick): 27.6s
2000-tick direct probe (season cadence 700): mass residual 0.000000 across all ticks,
  maxPendingTrips=1, no NaN / negative inventory / negative population — loss ledger 1709
  food vs restock ledger 4220 food (auditable destruction vs declared injection)
build: fail (rollup native missing in WSL, not related to code)
lint:evidence: exit 1 expected (stale fingerprints, 0 admissible)
lane: B
supervisor admitted: no

## R2 CAMPAIGN STATE (manager-owned; V8 Subagent Supercampaign R2)
Wave 0 re-anchor against master 566c343 (clean tree) — the R2 doc's §2 "reported
reality" (99e439a / 141 suites) was stale by two commits; claims re-anchored to
current symbols. Wave 1 lane classification:
- W1-MATERIAL-TRADE-CLOSURE: PARTIAL at re-anchor. Booking/delivery/trip sides
  CONFIRMED_DONE (schedulePendingTradeTrip caller closed-world.js:1334,
  deliveredThisTick bridge, cargoKind:'food' default, prune). LOSS SIDE was open:
  theft/toll/settling/restock were unbooked mass creation/destruction. CLOSED this
  lane (below). Remaining: trip LOST/CANCELLED terminal states only declarative.
- W1-PARTIAL-OBSERVABILITY: CONFIRMED_CURRENT at re-anchor (5 leaks + BeliefStore
  aliasing + bandit-all-merchants read). EXECUTED this lane (see LANE B RESULT
  above): 3 of the 5 leaks closed with twin-world detectors + triplet of killed
  mutations; remaining fidelity items (observation noise, canObserve breadth,
  BeliefStore reference aliasing, bandit-all-merchants topology read) filed for
  a later information-quality slice.
- W1-CAUSAL-DAG-AUTHORITY: CONFIRMED_CURRENT — ~25+ bare world.events.push sites
  (canonical-trade-system.js:375/521/581/592/604, closed-world.js:601/644/653/669/
  684/698/702/726/883/970/1059/1100/1423/1430/1460/1474/1539/1561/1718/2077,
  ecology.js:127, encounters.js:278/328, treaty.js:95/130/158/226, two-roads-world.js:
  588/630) + template eventIds (MERCHANT_ROUTE_DECISION-${tick}-${id}, BANDIT_RELOCATION-
  ${tick}-, PATROL_INTERCEPTION-${tick}-). Inventory done; execution pending.
- W1-CONTINUITY-RNG: CONFIRMED_CURRENT — encounterRng closure used at 4 production
  sites (closed-world.js:1271/2337/2434/2438), outside the serializable world;
  statistical-validation-trade-loop reuses the same closure after "load" (fake
  restart). Fix: persist rngStreams.encounter.{state,draws} or deprecate param.
- W1-EVIDENCE-TRUST-ROOT: CONFIRMED_CURRENT — lint.mjs DEFAULT_ROOT C:/ resolution,
  SUPERSESSION miscounted as inadmissible, EVIDENCE_LEDGER stale vs 566c343.
  Bounded lane; not started (world lanes get priority per campaign §23).

## What this tree now contains (Lane B, unaccepted)
- R2-W1 MATERIAL LOSS SINK + GLOBAL MASS IDENTITY (this lane):
  - world.transitLoss / world.exogenousInflow persistent ledgers (JSON-safe,
    save/load/fork covered; initialized in ensurePendingWorldState)
  - theft books at ALL debit sites: resolveBanditAttack, encounter bandit-ambush,
    convoy ambush (mutation branch), broken-caravan settling cost,
    patrol-checkpoint toll
  - patrol interception REVERSES the booking (cargo recovered, not destroyed)
  - MERCHANT_RESPAWN booked as declared exogenous inflow (was +20 from nowhere)
  - delivery overflow bookable into marketFlows as deliveryOverflow term
  - REAL BUG FIX: convoy ambush redistributed merchant cargo from a STALE
    formation-time snapshot (merchants ship/raid/restock every tick), fabricating
    or destroying whole cargo units; now syncs convoy.cargo to actual carried
    material before resolving the ambush. Global mass drifted ±1..3 units on
    ambush ticks before; 2000-tick residual is 0.000000 after.
  - detectors: tests/w1-material-loss-sink.test.js (4 tests) — theft booking,
    interception reversal, 40-tick production identity, exact-once terminal
  - mutations KILLED: MUT-MARKET-THEFT-001 (unbook resolveBanditAttack → 2 red),
    MUT-MARKET-THEFT-002 (unbook encounter path → 40-tick identity red),
    MUT-MARKET-EXACTONCE-001 (open consequence/trip closure → 2 red, incl. the
    production identity). All restored.
- parentEventIds chain on merchant path (MUT-CHAIN-001 detector)

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
- market loop: Slice A done; pending-trip → market delivery WIRED via trip; drought cascade WIRED (Slice D)
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
1. Real pending-state fork + MUT-SAVE-001 held under two-branch identity (encounterRng persistence still open)
2. WHY inspector for merchant route B vs A (observations, beliefs, candidates, utilities, threshold, rng)
3. Justice → legitimacy re-verify after drought changes supplyShortage feeding faction reassess
4. Ecology/season material loop full integration (drought done; next: season→trade→migration multi-season)
5. Evidence linter gate fix (SUPERSESSION + WSL DEFAULT_ROOT) — bounded, not another framework

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
