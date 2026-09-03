# Domain Maturity Map — Fear AI World-Completion View

EVID-2026-08-28-DOMAIN-MATURITY-MAP

This is the machine-readable world-completion artifact required by the
World-Scale Living-Systems Constitution §2 and the World-Completion
Directive §2. It tracks every world domain against the full evidence
ladder, never collapsing labels into one vague DONE.

**Maturity labels in the table below are derived from the
machine-readable evidence ledger** (`docs/evidence/EVIDENCE_LEDGER.jsonl`,
audited by `evidence/lint.mjs`, gated by `evidence/maturity.mjs`).
The hand-written column-2 labels below are kept for human readability
but the linter's derived label is the authority. To audit:

```bash
npm run lint:evidence
```

## Evidence ladder

For each domain we record separately:

- `SPECIFIED` — the contract is documented in code or `docs/`
- `CODE_EXISTS` — a module implements the contract
- `UNIT_VERIFIED` — focused unit tests pass
- `LIVE_PATH_INTEGRATED` — a live entry point calls this code
- `CROSS_DOMAIN_INTEGRATED` — the module influences another domain
- `LONG_HORIZON_VERIFIED` — multi-hundred-tick runs behave correctly
- `MULTI_SEED_VERIFIED` — behavior is stable across seeds
- `SENSITIVITY_VERIFIED` — sensitivity / OFAT sweeps have been run
- `RUNTIME_VERIFIED` — observed in the real Tauri runtime
- `VISUAL_VERIFIED` — confirmed by screenshot or visual inspection
- `RESEARCH_GROUNDED` — anchored to a literature mechanism
- `BLOCKED` — cannot advance without an external dependency

## Domain table

| Domain | Status (best level reached) | Evidence | Limitation | Next action |
|---|---|---|---|---|
| fear | `CROSS_DOMAIN_INTEGRATED` | `fearcore.js` is the production owner (imported by `brain.js`); `tests/brain.test.js` (7+ tests) covers trait determinism, fear-band transitions, and dual-ownership. Brain has the rng fix and the inline state-mutation step is still documented as a residual concern. | The 43% brain.state vs fearcore.state divergence from `EVID-2026-08-27-BRAIN-DUAL-OWNERSHIP` is still not structurally closed — it is a parked P0. | Slice: route the remaining `this.state = ...` mutations through `FearCore` as additional bands (HIDE, FREEZE, AGGRESSIVE, RECOVER, PRESENCE_BREAK). |
| individual cognition | `UNIT_VERIFIED` | `Brain` has 600+ lines of decision logic; tests cover the trait set and the rng determinism contract. | Decision rationale (`why did the agent pick this action?`) is not surfaced; no test for the §344 explanation API on `Brain`. | Slice: add `brain.explain(visuals)` that returns the top decision factors; test. |
| memory | `LIVE_PATH_INTEGRATED` | `memorysystem.js` is the production owner (imported by `agent.js` and `learningagent.js`). | Memory decay / salience is not part of the live migration; the per-target memory live-wire from the prior session added `memoryByActor` to `FactionDecisionModel` but the scalar still exists. | Slice: extend `memorysystem.js` with a confidence decay field and wire it to the per-target memory so historic events fade. |
| observation | `LIVE_PATH_INTEGRATED` | `canObserve(actor, event, world)` is in the closed-world reducer; merchants on road-b no longer learn road-a events (`EVID-2026-08-27-OBSERVATION-BOUNDARY`). | Observation radius is hand-coded (location + road-adjacency); there is no spatial radius or LOS. | Slice: add perception radius to the observation predicate; test that a merchant far from a road does not observe. |
| belief | `LIVE_PATH_INTEGRATED` | `BeliefStore` is used by the closed-world for per-merchant route beliefs; evidence-type trust is in `evidenceStrength()`. | The belief store is still scoped to merchants; the same pattern is not yet propagated to guards or bandits. | Slice: extend `BeliefStore` usage to the guard and bandit actors. |
| rumor | `LIVE_PATH_INTEGRATED` | The closed-world reducer now auto-shares witness observations with non-witness merchants (step 2.4.5, EVID-2026-08-28-RUMOR-AUTO-SHARE-LIVE). The `propagateRumor` function is proven end-to-end (EVID-2026-08-28-RUMOR-PROPAGATION-LIVE). The `shareObservation` and `recordObservation` functions are the core primitives. | The auto-share uses the same location-based `canObserve` boundary as belief formation. A future slice can add a richer propagation model (e.g., merchants in the same town share observations before cross-town sharing). | Slice: add per-merchant `informationRadius` and a gradient propagation model. |
| reputation | `CROSS_DOMAIN_INTEGRATED` | `escalation.js` retains violence reputation via `computeReputation(targetId, observers)`. `reputation.js` owns independent bounded dimensions, including destination-scoped `tradeReliability` and observer-scoped `lawfulness`: completed/partial/failed shipments update weighted reliability records, treaty breaches write lawfulness observations, scores decay toward neutral by elapsed time, and trusted observers can be aggregated without treating missing observations as failures. Merchant route scoring consumes observed destination reliability; patrol detection consumes only its own faction's observed lawfulness and records the bounded attention adjustment in `PATROL_* .enforcementWhy`. The 6 violence aggregation tests, 5 trade-reliability tests, 4 lawfulness/patrol tests, and treaty/save-load coverage prove isolation, live consumers, persistence, and determinism. | Violence, trade reliability, and lawfulness are separate, but fairness/honesty remain generic ledger dimensions and there is no outlier or appeal policy yet. | Slice: route trade fairness into merchant/justice decisions, or add observer-specific confidence calibration and an appeal/retraction path for stale lawfulness records. |
| relationships | `CROSS_DOMAIN_INTEGRATED` (with full directional pressure components) | `FactionRelationshipVector` and the `StanceLadder` are wired into the closed-world reducer; the invasion gate consults the pair's stance. The vector supports §15 directional trust + per-perspective `directedTerritorialPressure` / `directedGrievance` / `directedFear` maps (EVID-2026-08-28-TERRITORY-VERTICAL-SLICE). The legacy `trust`, `territorialPressure`, `grievance`, `fear` fields are all derived getters (mean across perspectives) with throwing setters. `recordHarm` / `recordTrade` / `recordTrespass` / `recordIntrusion` accept a `fromFactionId` (or `observerFactionId`) to credit/debit the per-perspective value. **The audit's P1 #1 acceptance test now runs in the live path** (EVID-2026-08-28-PERSPECTIVE-AWARE-CHOOSE-STANCE-LIVE): the closed-world reducer consumes `pair.pressureFrom(fromFactionId)` and `pair.getTrustFrom(fromFactionId)` so A→B and B→A produce independent STANCE_TRANSITION events. `pair.stanceFrom` / `observeFrom` track per-perspective stance memory; the legacy `stance` field is the PEAK observation across perspectives (preserves the invasion-gate query). 6 tests in `tests/directed-relationship-ownership.test.js`, 7 in `tests/live-perspective-aware-choose-stance.test.js`, and 13 in `tests/territory-vertical-slice.test.js` prove the full directional + contextual contract end-to-end. | None. The audit's debt #1 (territory) and debt #3 (per-perspective components) are both resolved. | Slice: extend the WHY inspector to surface the per-perspective stance trajectories in the runtime debugger. |
| factions | `LIVE_PATH_INTEGRATED` (with structured live chooseStance) | `FactionDecisionModel` is the production owner; the closed-world chain uses it. The new `chooseStance({pressure, trust, previous, militaryResources, informationConfidence, dampenByTrust})` function (EVID-2026-08-28-FACTION-STANCE-MACHINE, the audit's P1 #2) returns a structured `{from, to, reason, evidence, capability, blocked}` decision object with §18 hysteresis, capability gate (cannot enter MOBILIZING / WAR / LIMITED_CONFLICT with low `militaryResources`), and uncertainty gate (cannot escalate from TOLERANT with low `informationConfidence`). **The audit's P1 #2 acceptance test now runs in the live path** (EVID-2026-08-28-PERSPECTIVE-AWARE-CHOOSE-STANCE-LIVE): the closed-world reducer calls `chooseStance` per evaluator perspective and emits a structured `STANCE_TRANSITION` event with `reason` / `evidence` / `capability` / `blocked` / `evaluatorId` / `militaryResources` / `informationConfidence` fields. `FactionDecisionModel` gained an `informationConfidence` constructor field (default 1.0) so the uncertainty gate is wired into live state. 5 tests in `tests/faction-stance-machine.test.js` and 7 tests in `tests/live-perspective-aware-choose-stance.test.js` prove the audit's acceptance test end-to-end. | The reducer still emits the legacy `FACTION_REASSESSMENT` event in addition to the new structured `STANCE_TRANSITION` event. A future slice can wire the structured `decision` output into downstream action selection (WATCHFUL → SCOUT, HOSTILE → RAID, etc.). | Slice: route the per-perspective `decision.to` into the invasion gate so the action selection consumes the new structured output. |
| territory | `LIVE_PATH_INTEGRATED` (with directional + contextual pressure) | Town territory fields exist (`controlledBy`, `homeRadius`, `claimedRadius`, `contestedRadius`, `scarceResources`) and are set in `createClosedWorldScenario`. The new `canObserveTerritory(observer, intruder, world)` predicate (closed-world.js) is the *legal* observation path for territorial intrusions (replaces the old ad-hoc trespass detection). The territory pass in `tickClosedWorld` iterates `allIntruders(world)` and writes directional `INTRUSION` events into the world event log plus per-pair `recordIntrusion` records into the observer's perspective of the directed relationship state. `FactionRelationshipVector` gained per-perspective `directedTerritorialPressure`, `directedGrievance`, `directedFear` maps with `getXFrom` / `setXFrom` accessors; the legacy `territorialPressure` / `grievance` / `fear` fields are derived getters (mean across perspectives) with throwing setters. The `recordIntrusion` writer scales severity by `groupSize`, `armedStatus`, `scarceResourceOccupancy`, `priorIncidents`, and `duration` (the contextual severity table). `chooseStance` consumes `perceivedGroupSize` (capability gate) and `previousIncidentsCount` (trust-dampening: 5 prior incidents caps the damping at 0.2× baseline — the contextual-dampening upgrade). `pressureFrom(fromFactionId)` now uses the directed components, so the live `chooseStance` call site is fully directional. The `INTRUSION` event type is emitted into `world.events` and the `context` field carries `{groupSize, armedStatus, priorIncidents, duration, location, scarceResourceOccupancy, treatyPassage?}`. The audit's debt #1 (territory) AND debt #3 (per-perspective components) are both resolved. 13 tests in `tests/territory-vertical-slice.test.js` prove the full Part XIV acceptance chain end-to-end. | The strategic graph still has no coordinates; `canObserveTerritory` resolves to "same town OR adjacent road" as a coarse proxy for the symbolic `claimedRadius`. Full radius-based checks require coordinates (a future slice). Treaty→territory passage is partially wired (the suppression hook reads `world.treaties`); full treaty integration (treaty violation cost → territory, passage terms) is a follow-up slice. | Slice: add per-tile coordinates to the strategic graph; extend `canObserveTerritory` to a real `claimedRadius` check; finish the treaty→territory integration. |
| diplomacy | `LIVE_PATH_INTEGRATED` | The `treaty.js` module provides `createTreaty`, `requestPassage`, `requestNonAggression`, `violateTreaty`, `terminateTreaty`, `activeTreatiesFor` (with optional `kind` filter), and `checkTreatyCompliance`. The treaty record has id, participants, terms, startTick, obligations, violations, status ('ACTIVE' \| 'TERMINATED'), and termination. The closed-world now initializes `world.treaties = []`, the encounter step runs `checkTreatyCompliance` after each `instantiateEncounter` (so a bandit-ambush on a passage-treated road emits `TREATY_VIOLATED`), and the invasion gate consults `activeTreatiesFor` for non-aggression pacts and emits `TREATY_BLOCKED_RAID` when a treaty partner would be raided (EVID-2026-08-28-TREATY-ENFORCEMENT, EVID-2026-08-28-NONAGGRESSION-INVASION-GATE). 18 tests across `tests/treaty-system.test.js`, `tests/treaty-enforcement.test.js`, and `tests/treaty-nonaggression.test.js` prove the §12 / §28 contract end-to-end. | `requestPassage` / `requestNonAggression` default to mutual consent. The bandit must have a `factionId` for the violation / block to be recorded — the default `createClosedWorldScenario` does not set one, so production callers see no enforcement unless they opt in. The MVP checks passage and non-aggression treaty kinds; trade pacts and embargoes are not yet exposed in the invasion gate. | Slice: add `requestTradeAgreement` and `requestEmbargo` interactions; extend `checkTreatyCompliance` and the invasion gate to handle these new kinds; normalize treaty id format across all kinds. |
| combat | `UNIT_VERIFIED` | `resolveBanditAttack` and `resolveConvoyAmbush` exist with attackOpportunityId. | The attacker does not have a `health` model; combat is a one-shot. | Slice: extend the attacker and convoy with `health` and resolve combat across multiple ticks. |
| justice | `LIVE_PATH_INTEGRATED` | `JusticeSystem.resolve` is called per-tick per town with `{legitimacy,grievance,reportedCrime,investigationQuality,corruption,lawPenalty}`; Slice W adds bounded `lawPenalty` (mean `LAW_VIOLATED` penalty in the 5-tick window, 0 when absent) eroding legitimacy by `penalty*0.15` only when `reportedCrime` is true. `closed-world.js` feeds the per-town window mean, audits `{lawPenalty,lawViolationCount}` on `JUSTICE_RESOLVED`, and parents the event to both attack and law events. The owning faction tracks the outcome via the existing Slice C 0.85/0.15 blend. Restitution (Slice X) moves resources at violation time; justice remains the legitimacy channel. | No law-volume-driven investigation-quality feedback; idle path unchanged (hand-forged LAW without attack cannot erode). | Slice: add law-volume-driven investigation quality or multi-town apportionment of penalties. |
| law | `CROSS_DOMAIN_INTEGRATED` | `law.js` owns `town.laws` (array of `{id,type,prohibits,scope,penalty}`) with `ensureTownLaws`, `isActionIllegal`, `checkLawCompliance`; `closed-world.js` initializes each town with a `banditry` law on `town-roads`, migrates older saves, checks every `BANDIT_ATTACK` (both direct `resolveBanditAttack` and encounter `BANDIT_ATTACK` consequences) and emits `LAW_VIOLATED` parented to the attack. Slice V routes each `LAW_VIOLATED` through `observeLawViolation`: the violated town's `controlledBy` faction records observer-scoped `lawfulness` against the violator faction (bandit `factionId` when known, else raw actor id), and the existing patrol attention consumer reacts without requiring a treaty. Slice W closes the second consumer: the per-town mean `LAW_VIOLATED` penalty erodes `JusticeSystem` legitimacy (`penalty*0.15`, `reportedCrime`-gated) and flows to the owning faction via Slice C. Slice X closes the third consumer: penalty-funded restitution transfers `penalty` resource units (1:1) from the violator faction to the observer faction inside `observeLawViolation`, zero-sum and clamped (violator floored at 0, observer capped at `maxResources`, same cap semantics as refill); non-faction violators, missing observers, and self-loops skip honestly with `restitution: null`. `LAW_VIOLATED` audits `{violatorFactionId,observerFactionId,lawfulness,restitution}`. `BANDIT_ATTACK` now carries `factionId` when the attacker bandit has one (omitted for legacy free agents). `tests/law-violation.test.js` (5 tests), `tests/law-lawfulness-enforcement.test.js` (6 tests), `tests/law-justice-penalty.test.js` (6 tests), and `tests/law-restitution.test.js` (6 tests) prove violation, empty-law neutrality, live patrol attention shift, encounter-path faction identity, save/load enforcement identity, free-agent fallback, penalty monotonicity, forged-LAW honesty, resolve backward compatibility, zero-sum transfer, broke/capped boundaries, and tick-path audit with persistence. | `tradeFairness`/`honesty` dimensions remain consumer-less; restitution has no multi-town apportionment (first matching town wins). | Slice: give `tradeFairness`/`honesty` a live consumer (merchant route scoring or treaty terms). |
| crime | `LIVE_PATH_INTEGRATED` | The closed-world chain records `BANDIT_ATTACK` and treats it as a reported crime. | No modeling of unreported crime; no investigation system. | Slice: add `crime.investigationQuality` per town. |
| economy | `LIVE_PATH_INTEGRATED` | `Market` has the full stock-flow loop: produce / consume / spoil / capacity / overflow. | The economy is per-town; there is no inter-town trade beyond the closed-world merchant. | Slice: add a `CaravanTrade` slice that runs the trader between two towns and updates both markets. |
| markets | `LIVE_PATH_INTEGRATED` | `Market` is used by the closed-world; per-tick `MARKET_TICK` events include per-flow numbers. | No price elasticity / bidding / price memory beyond the simple `getQuote`. | Slice: add `Market.updatePrice` based on a supply/demand model. |
| production | `LIVE_PATH_INTEGRATED` | Per-town `produces` and per-kind `perCapitaProduction` are in the scenario seed. | Production is a flat rate; no input goods / no production chains. | Slice: add a `productionChain` for tools (ore → metal → tools). |
| trade | `LIVE_PATH_INTEGRATED` | The closed-world has a merchant that delivers cargo through `Market.deliverCargo`. | The merchant is a closed-world one-shot; the real `trade.js` / `routing.js` integration is not wired into the closed-world. | Slice: replace the closed-world's `chooseMerchantRoute` with the real `routing.selectRoute`. |
| trade routes | `UNIT_VERIFIED` | `routing.js` provides `selectRoute`, `routeCost`, `findRoutePath`, `createRouteBelief`. | Not wired into the closed-world's per-tick reroute. | Slice: wire `routing.selectRoute` into the closed-world's merchant reroute step. |
| logistics | `SPECIFIED` only | The directive's §64 specifies logistics. No implementation. | No logistics system. | Slice: add `market.inventory` `transferCost` that models wagon capacity. |
| roaming groups | `LIVE_PATH_INTEGRATED` | `roaming.js` has the full `RoamingGroup` + `chooseRoamingDestination` + `ROAMING_MODE` profiles + `tickRoamingGroup`. The closed-world reducer's bandit relocation is now driven by `chooseRoamingDestination` via the `relocateBanditViaRoaming` wrapper (EVID-2026-08-28-ROAMING-LIVE-WIRE). | The live-wire's belief map is synthesized from the world's roads and the bandit's `lootExpectation`; real bandit observations (scout → belief) are not yet wired. The legacy `relocateBandit` in `escalation.js` is still exported but no longer called from the live path. | Slice: wire `scoutDestination` into the bandit so it builds its own belief map over time. |
| migration | `LIVE_PATH_INTEGRATED` | The closed-world emits a `MIGRATION` event when `migrationPressure > 0.5` and the population floor is 0. Immigration is the post-loop pass to the lowest-population town. The per-town migration cooldown (EVID-2026-08-28-MIGRATION-COOLDOWN) prevents the ~2/tick oscillation the §29 audit found. The `pop > 0` guard at the top of the MIGRATION block prevents depopulated towns from creating population from nothing. | Only one emigrant per MIGRATION event; the §156 immigration case is tested but the destination logic is "lowest population" (a placeholder). | Slice: replace the lowest-population heuristic with push-factor / pull-factor selection. |
| refugees | `LIVE_PATH_INTEGRATED` (basic) | The 3-town immigration test proves a refugee camp can grow. | No persistent refugee *group*; the immigrants are absorbed into the destination town's population. | Slice: add a `world.refugees` array and a `refugeeGroup` type. |
| settlements | `UNIT_VERIFIED` | `town` has name, population, market, consumes, produces, storageCapacity, spoilageRate. | No settlement founding / collapse; no specialization. | Slice: add `settleAttempt(world, group, locationId)` that creates a new town if the location supports it. |
| demography | `UNIT_VERIFIED` | The §156 population balance is proven as a property across 100 seeds. | No birth / death / aging model. | Slice: add a `demographicTick(world, rng)` that produces births and deaths based on food availability. |
| ecology | `SPECIFIED` only | The directive's §70 specifies ecology. No implementation. | No ecology system. | Slice: add a `Season` tick that reduces `produces` by 30% in winter for a 2-good market. |
| weather | `SPECIFIED` only | No weather system. | No weather system. | Slice: add a `WeatherState` that increases road risk during storms. |
| resources | `LIVE_PATH_INTEGRATED` | `Market` has the per-kind `capacity` and `spoilage`. | Resources are per-town; no global resource model. | Slice: add a `world.resources` map for non-town-located resources (a forest, a mine). |
| wildlife | `SPECIFIED` only | No wildlife system. | No wildlife system. | Slice: add a `WildlifeGroup` type that competes with the bandit for a road. |
| infrastructure | `SPECIFIED` only | No infrastructure model. | No infrastructure system. | Slice: add `town.roads` and a `roadDecay` rate. |
| institutions | `UNIT_VERIFIED` | `Faction` and `FactionDecisionModel` are the only institutions. | No guild / church / court model. | Slice: add a `Guild` type. |
| leadership | `UNIT_VERIFIED` | The faction model has `lastDecision` and `decision`; `executeRetaliation` is the leader's response. | No succession model. | Slice: add `faction.leaderHealth` and a `succession` event. |
| encounters | `LIVE_PATH_INTEGRATED` | The encounter catalog (`encounters.js`) has 5 templates with world-state-driven eligibility checks. The `instantiateEncounter` function performs the §96 "outcomes return to authoritative world state" contract. The closed-world reducer now calls `selectEncounterCandidates` + `instantiateEncounter` after emitting `CANDIDATE_ENCOUNTER`, so CANDIDATE_ENCOUNTER → ENCOUNTER is a live transition (EVID-2026-08-28-ENCOUNTER-LIVE-INSTANTIATE). All 5 templates have working `apply` functions: `bandit-ambush` (debits merchant cargo by 30%), `broken-caravan` (20% settling cost), `patrol-checkpoint` (10% toll to guard faction), `refugee-group` (1-3 refugees absorbed into a town), `wildlife-encounter` (sighting pushed to `world.wildlife`) (EVID-2026-08-28-ENCOUNTER-APPLY-FUNCTIONS). The closed-world now initializes `world.wildlife = []`. 9 tests across `encounter-live-instantiate.test.js` and `encounter-apply-functions.test.js` prove the §89-§96 contract end-to-end. The `instantiateEncounter` returns `null` when the precondition is not met, so the audit trail is not polluted with phantom encounters. | The per-template outcomes use HEURISTIC fractions (30%, 20%, 10%, 1-3 refugees). A future slice can add rng-jittered outcomes and a sensitivity sweep. The `refugee-group` destination is "first town" — a placeholder. The `wildlife-encounter` does not yet model predator-prey dynamics. | Slice: replace heuristic fractions with rng-jittered outcomes; wire `world.wildlife` to a wildlife subsystem that models predator-prey dynamics; use push-factor / pull-factor selection for `refugee-group` destinations. |
| procedural narrative | `SPECIFIED` only | The directive's §14 specifies procedural narrative. No implementation. | No procedural narrative. | Slice: add a `deriveQuest(world, recentEvents)` that produces a quest object. |
| quests | `SPECIFIED` only | No quest system. | No quest system. | Slice: add a `Quest` type. |
| background simulation | `SPECIFIED` only | The directive's §113 specifies background simulation. No implementation. | No background sim. | Slice: add a `backgroundSim(world, tick, window)` that runs the world at coarser LOD outside a focus area. |
| simulation LOD | `SPECIFIED` only | The directive's §114 specifies LOD. No implementation. | No LOD system. | Slice: add `agent.lod` field and a `tickLOD(agent, distanceToFocus)` that switches detail. |
| serialization | `LIVE_PATH_INTEGRATED` | The `saveWorld(world)` and `loadWorld(json)` functions round-trip the closed-world through JSON (EVID-2026-08-28-SAVE-LOAD, EVID-2026-08-28-STRICT-RESUME-EQUIVALENCE). Maps and Sets are preserved via `__map__` / `__set__` markers; class-instance prototypes (`FactionDecisionModel`, `FactionRelationshipVector`, `Market`, `BeliefStore`) are re-attached on load. The §119 RESUME EQUIVALENCE test asserts strict event-count, event-type, and final-state equality between a save/load-resumed run and an uninterrupted run. 9 tests in `tests/save-load.test.js` (5 strict) and `tests/fork-independence.test.js` (4) prove the §22 / §118 / §119 / §120 / §121 contracts end-to-end. | The `RoamingGroup`'s private `rng` closure is not serialized as a function (functions don't survive JSON), but the live-wire re-seeds from `bandit.id` on every tick, so the deterministic stream is implicitly preserved across save/load and forks. A future slice can add an explicit `RoamingGroup.serialize` / `deserialize` pair that captures the rng state for explicit reproduction. | Slice: add `RoamingGroup.serialize` / `deserialize` to make the rng persistence explicit; add a pre-commit hook that scans for `?? Math.random` in stochastic code paths to enforce the explicit-rng rule. |
| replay | `LIVE_PATH_INTEGRATED` (closed-world) | `replay.js` is deterministic (no `Date.now()`); the `captureFrame` method was patched to support both the old `agent.brain.state` shape and the new closed-world merchant shape (EVID-2026-08-28-REPLAY-DETERMINISM). The new `replay-closed-world-bridge.js` (`recordClosedWorldTick`, `extractClosedWorldFrame`, `playClosedWorldReplay`) converts the closed-world `world` to the replay format AND plays it back, proving the §119 RESUME EQUIVALENCE contract (two independent runs produce byte-identical frames, 4 tests; playback is deterministic, 5 tests). The closed-world now exposes the §120 FORK API: `forkWorld`, `runForkedBranches`, `diffWorlds` (EVID-2026-08-28-FORK-API). 6 tests in `tests/fork-api.test.js` and 5 tests in `tests/replay-playback.test.js` prove the §22 / §119 / §120 / §121 contracts end-to-end. | No full-world save/load (the closed-world's Maps, Sets, and class instances are not yet round-tripped through JSON). The `diffWorlds` walk is shallow (one level into array elements). `runForkedBranches` does not yet support a per-tick option schedule. | Slice: add a `saveWorld(world)` / `loadWorld(json)` API that round-trips the full world (Maps, Sets, class instances via `serialize` / `deserialize`); add a deep-walk option to `diffWorlds`; add per-tick option schedules to `runForkedBranches`. |
| chronicle/history | `UNIT_VERIFIED` | The closed-world event log is a chronicle. | No `world.history` summary; no event-bucketing. | Slice: add `world.history` that records a per-tick summary. |
| visualization | `BLOCKED` | The dashboard exists but the `RUNTIME_VERIFIED` path is blocked by the missing Tauri runtime. | The runtime is not available in this environment. | Unblock: boot the Tauri app or a Node-side stub that renders the closed-world to a terminal/HTML. |
| analytics | `LONG_HORIZON_VERIFIED` | The `population-balance-property.test.js` runs 100 random seeds × 100 ticks. The `scenario-differentiation-long-horizon.test.js` runs 4 distinct scenarios for 50 ticks each and proves that calm vs nervous produce different faction states (HOLD vs RAID) (EVID-2026-08-28-SCENARIO-DIFFERENTIATION-LONG-HORIZON). The 500-tick multi-seed sensitivity audit (`scratchpad/audit-500tick-sensitivity.mjs` + `tests/sensitivity-500tick.test.js`) runs 5 seeds × 3 perceivedDanger values × 500 ticks and verifies the §121 / §138 / §207 contracts end-to-end (EVID-2026-08-28-SENSITIVITY-500TICK). The default scenario now sets `bandit.factionId = 'south-faction'` so the diplomatic subsystem is exercised by default (EVID-2026-08-28-DEFAULT-BANDIT-FACTION). | No analytics dashboard; no time-series export. The audit found that the default scenario's merchant is too risk-averse (0 bandit-ambushes over 500 ticks); this is a real audit observation tracked as a future slice. | Slice: add `analytics/world-snapshot.mjs` that exports per-tick metrics to a JSON file; address the merchant's risk-aversion by seeding a more accurate initial belief store. |
| performance | `LONG_HORIZON_VERIFIED` | `tests/long-horizon-5000tick.test.js` completes 5,000 ticks across 3 seeds with no crash, NaN, or negative inventory. The incremental event-ledger index keeps the final three-seed run at about 23.8 seconds / 1.54 ms per tick, with event counts and final summaries unchanged. `tests/event-ledger-index.test.js` proves typed tick/range queries, legacy direct-push compatibility, ledger ordering, and the non-serialized cache boundary. | The full causal-ledger linter still performs graph-wide analysis when explicitly invoked; the index accelerates reducer queries, not arbitrary external scans over the complete history. | Slice: profile causal-ledger audit workloads and add bounded snapshot/index support if audit latency becomes operationally significant. |

## Breadth debt (ranked)

The breadth debt is the gap between the current row label and the
desired row label per the §1 north star. Ranked highest-to-lowest:

1. **Runtime + WHY inspection** — Movement 3 of the
   co-adaptive campaign. Launch the actual
   application and verify the trade-security
   loop visually. The Two Roads world is a
   benchmark laboratory; wiring it into the
   real runtime is the next step. **HIGH**.
2. **Trade → bandit → market cross-domain
   statistical validation** — the Two Roads
   metamorphic tests prove direction; adaptive
   replication (Movement 2 §30) is needed to
   confirm distributional claims. **MEDIUM**.
3. **factions → invasion action selection** — the new structured
   `chooseStance` output is not yet routed into the
   invasion gate; the reducer still uses the legacy
   `FactionDecisionModel.reassess` path for that decision.
   **MEDIUM**.
4. **treaty→territory integration** — the suppression
   hook is wired but the cost of a violation
   (e.g. grievance delta, trust debit) is not yet
   routed through the territory pass. **MEDIUM**.
5. **roaming degeneracy** — bandit locks in when `restBonus` for
   RAID is 0. **LOW (cosmetic)**.
6. **demography** — births / deaths.
7. **ecology** — season.
8. **coordinates on the strategic graph** — territory
   radius is symbolic; full `claimedRadius` checks
   require coordinates. **LOW (well-deferred)**.
9. **24 under-evidenced domains** — 24 of the 25
   original migrated SPECIFIED rows have no
   follow-up evidence. The Movement 2 seeds
   added 5 new domains (trade, merchants,
   bandits, patrol, market) which now have
   real evidence. Future slices should seed
   the high-maturity legacy domains. **LOW
   (mechanical) but evidence-gap is the
   literal Part VIII / Part IX surface**.

## Heuristic register

Every parameter whose value is a guess rather than derived:

| Parameter | Where | Provenance class | Calibration evidence | Sensitivity? |
|---|---|---|---|---|
| `attackThreshold: 0.55` | `factioncore.js` | DESIGN_TARGET | The closed-world all-systems test reaches RAID on first attack with this value. | Not yet. |
| `cooldown: 5` | `closed-world.js` `tickClosedWorld` | HEURISTIC | The 19% raid rate over 200 ticks. | Not yet. |
| `griefHalfLifeTicks: 22.8` | `factioncore.js` | HEURISTIC | The audit-specified Wolfram table for 3% decay. | Not yet. |
| `fearHalfLifeTicks: 6.6` | `factioncore.js` | HEURISTIC | The audit-specified Wolfram table for 10% decay. | Not yet. |
| `restHalfLifeTicks: 30` | `roaming.js` | HEURISTIC | The 50-tick long-horizon trace. | Not yet. |
| `migrationPressureThreshold: 0.5` | `closed-world.js` | HEURISTIC | The 50-tick MIGRATION test. | Not yet. |

## Research gaps

The directive's §34 says to record where research is missing:

- **Constitution-of-modes** for the ROAMING_MODE enum (FORAGE, TRADE,
  RAID, SCOUT, RETREAT, REST). The audit named the pastoral-mobility
  work as the source; we have not yet cited a specific paper.
- **Demography** — no literature citation for the birth / death
  model.
- **Diplomacy treaty model** — no literature citation for the
  `treaty` record type.
- **Price elasticity** — the `Market` uses a supply / shortage
  heuristic; no literature citation.

## Reading this map

A new worker should:

1. Pick the highest-breadth-debt row that is not BLOCKED.
2. Move that row up at least one evidence level in one bounded
   vertical slice.
3. Re-verify the gate (`npm test -- --runInBand && npm run build
   && npm audit --omit=dev --audit-level=high`).
4. Update this map.
5. Repeat.
