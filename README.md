# Fear AI — Deterministic Society Simulation

Orientation for this repository. **Evidence rule: repository evidence outranks historical claims.** Development verification is not supervisor acceptance.

**Current gate: 0 suites / 0 tests passing** (`npm test`) — as of 2026-09-23.

## What this is

A unified Fear AI runtime with a deterministic, testable society and trading system: agents hold beliefs and confidence, act through utility-scored decisions, and everything that happens lands in an ordered, parented event graph. Determinism is structural, not incidental — a world clock, a monotonic event allocator, one injectable serializable RNG, and explicit save/load make identical seeds replay identically. Random chaos is only acceptable when reproducible by seed.

Scope: deterministic world clock, event ids, market stock/resource flows, injectable RNG, save/load, JSON-first construction, and test-driven mutation gates.

## Quick start

```bash
npm test          # full gate: 0 suites / 0 tests (ESM + Jest via --experimental-vm-modules)
npm run gate:sync # re-derive the gate counts in the four orientation docs from the runner
npm run gate:check# fail if any of them is stale (CI runs this before npm test)
```

The counts above are **derived, not hand-maintained**: `tools/gate-counts.mjs` runs the suite with jest's machine-readable reporter, writes what it saw to `docs/GATE_COUNTS.json`, and rewrites the live gate sentences in the four orientation docs. `gate:check` re-derives and fails the build on any drift, and the `gate-counts-derivation` suite (retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`) holds the offline half — the docs must agree with the artifact, the artifact must account for every suite on disk, and no cited `N/N` case count may contradict it. This exists because a hand-copied count drifted into print once already (a row's negative-control count was documented as 6/6 after a 9/9 mutant campaign), and nothing in the repository could tell; the first run of the derived check then found the `hysteresis-reopen` row cited at 8 cases when its suite had grown to 9.

Key APIs (see the retired `world-tick` suite — `docs/SUITE_RETIREMENT_LOG.md` — for canonical world setup):

```js
const core = new SocietyCore(/* seed, actors, routes, ... */);
core.tick();                                  // canonical turn: decay → decisions → execution → events
core.worldStep();                             // full turn + world-level rumor queue/delivery
core.serialize();                             // instance → plain JSON-ready structure
SocietyCore.deserialize(saved);               // JSON-ready structure → live world (revives class instances)
core.causalChain(eventId);                    // { event, lineage, beliefProducers, roots } — read-only walk to roots
core.auditEventGraph();                       // { ok, checked, roots, eventSeq, violations } — whole-history integrity
```

## Architecture pipeline

```
ground truth → perception → belief/confidence → appraisal → affordances → hard prerequisites
→ utility/DecisionCore → intent → execution → world consequences → memory/reputation/rumors
→ updated beliefs
```

(from `docs/IMPLEMENTATION_STATUS_2026-08-26.md`; decisions and executions now additionally emit canonical events — see `RESP-EVENT-CAUSALITY-001` below.)

## Module map (8 production modules, ~3,180 lines)

| Module | Lines | Role |
|---|---|---|
| `societycore.js` | 2097 | The world: clock, event allocator/graph, action kinds, markets, routes, rumors, factions, settlements, roaming groups, queues, advisory wiring, retaliation chain, neural-fear integration, the fear seam (`applyFearExposure`), the actor/combat loop (`COMBAT_DEPLOY`, `COMBAT_ENGAGEMENT`) and its self-raise tick (`COMBAT_RECRUIT_TICK`), serialize/deserialize, `causalChain`, `auditEventGraph` |
| `utilitycore.js` | 44 | Shared utility/affordance runtime: `AffordanceRegistry` (id-keyed, duplicate-rejecting, actor/target type gating, runtime register/unregister) + `UtilityRuntime` (prerequisites hard-block → response-curve/weight considerations → clamped-mean `finalScore` → narrow-band selection via shared RNG) — **canonical owner of scoring and affordances** |
| `decisioncore.js` | 18 | Thin facade over `UtilityRuntime` (unchanged public API and RNG consumption order) |
| `interactioncore.js` | 14 | Character affordance catalog (`INTERACTION_ACTIONS`) on the shared registry; `decide`/`validate` |
| `advisorygate.js` | 6 | Pure validation gate (`source: 'ADVISORY_VALIDATOR'`), never mutates state; the only approval path for `INTERACTION_EXECUTION` |
| `socialcore.js` | 969 | `Personality`, `Morale`, `AgentBelief`/`BeliefEvidence`, `ReputationBook`, `HabituationBook`, `HysteresisBook`, `NeuralFearModel`, `CombatActor`/`CombatCore` — the canonical owners (no `brain.js` in this checkout) |
| `macrocore.js` | 5 | `routeCost` (perceived risk), `raidUtility`, `FactionState` |
| `randomcore.js` | 24 | `mulberry32`/`randomSource` — every random draw flows through the injectable serializable RNG |

Orphan scan: **0 orphans** (verified by import scan, `RESP-LEDGER-STALE-CLAIMS-AUDIT-001`). Stray files: `persistence-probe.txt` (archive-decided, 17 bytes), `.agents/fear-ai-autopilot.mjs` (keep — campaign controller), `tools/run-autopilot-step.mjs` (bounded live-step runner), `legacy/` (byte-exact extracted evidence sources — never imported by production).

## Canonical contracts (verified)

| Contract | Guarantee | Pinning suite |
|---|---|---|
| RNG ownership | One injectable serializable RNG; identical seeds replay identically | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| World tick (`RESP-WORLD-TICK-001`) | Canonical `tick()`/`step()` turns; monotonic unique event ids with ordered parentage; `Market.trade` rejects oversell, records flows truthfully | `world-tick`/`world-loop` suites, retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Event ID authority | Rumor/event ids never collide or restart, across turns and save/load | the `rumor-identity` suite, retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Market conservation | Exact stock/resource flows — nothing created or destroyed | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Time ownership (`RESP-TIME-OWNERSHIP-001`) | World-clock timestamps only, never `Date.now` — behaviorally pinned and source-scanned across all 8 production modules | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`; the source scan now runs in `npm run gate:check` |
| Actors & combat (`RESP-SIMULATION-AGENTS-COMBAT-REOPEN-001`) | The society world's actors (legacy lineage, engagement window, trauma model, survival book) fight as ONE TURN-rooted chain through `COMBAT_DEPLOY`/`COMBAT_ENGAGEMENT`; casualties mark a learned danger grid that the migration decision consumes, and every death reaches the shared fear seam | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Autonomous deploy (`RESP-AUTONOMOUS-COMBAT-DEPLOY-001`) | Factions ARRIVE with no caller too: `COMBAT_RECRUIT_TICK` runs each faction's own production evaluation and, unless it holds (`DECLINED`), raises a levy and deploys it through the same production `COMBAT_DEPLOY` tail — the legacy lineage rule kept (a founder for a faction with nobody living, generation 0 and the child recorded for a levy drawn off a living veteran), a population bound (`action.populationCap`, default 8) recording `POPULATION_BOUND` instead of growing past it, entry `worldStep({ recruitTurns: true })` default-off, cohort save/load-intact and two identical seeded worlds bit-identical | the `autonomousDeploy` rule in `npm run gate:check` (`tools/doc-guards.mjs`), proved by `npm run gate:prove` — this contract landed after the corpus retired, so a guard rule is its durable pin and it never had a suite |
| Autonomous combat tick (`RESP-AUTONOMOUS-COMBAT-TICK-001`) | Factions fight with no caller: `COMBAT_MACRO_TICK` gives every faction with living actors a turn running its OWN production evaluation, names the richest counterpart that still has actors at turn time, and dispatches one engagement as the same TURN-rooted single-tail chain — a faction that sits out records `DECLINED`/`NO_ACTORS`/`NO_COUNTERPART`, casualties reach the shared fear seam and the learned danger grid, entry `worldStep({ combatTurns: true })` default-off | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Derived gate counts (`RESP-GATE-COUNT-DERIVATION-001`) | The gate counts in the four orientation docs come from the runner (`tools/gate-counts.mjs` → `docs/GATE_COUNTS.json`), `npm run gate:check` fails CI on drift, anchored so frozen history is never rewritten, and every cited suite's `N/N` is validated against the per-suite count | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Rumor latency & decay (`RESP-OBSERVATION-RUMOR-LATENCY-DECAY-001`) | Delivered confidence decays with in-transit latency; distortion compounds; recipient-local trust; relays use the relayer's local belief | `observation-rumor-latency-decay` + `observation-hidden-truth-twin-audit` suites (both retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`) |
| Event causality (`RESP-EVENT-CAUSALITY-001`) | Belief paths run through canonical events (`RUMOR_QUEUE → RUMOR_DELIVER → RUMOR_DELIVERED → BELIEF_UPDATED`, TURN-carried `beliefDecay`); consuming decisions cite `beliefProvenance` | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Crime/justice loop (`RESP-CRIME-JUSTICE-LEGITIMACY-LOOP-001`) | Crime → report → justice → legitimacy → migration run as parent-chained events; settlement legitimacy carries the justice consequence into the migration decision; an unreported crime halts the cycle | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Utility/affordance runtime (`RESP-UTILITY-AFFORDANCE-RUNTIME-001`) | One shared scoring + registry implementation behind all production paths | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Causal-chain inspector (`RESP-CAUSAL-CHAIN-INSPECTOR-001`) | `causalChain()` walks any event to its roots, validating ordered parentage; surfaces belief producers | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Interaction execution (`RESP-CHARACTER-INTERACTION-AFFORDANCES-001`) | Advisory-gated affordance execution applies the declared `INTERACTION_EFFECTS` table; rejections mutate nothing | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Event graph audit (`RESP-EVENT-GRAPH-AUDIT-001`) | Whole-history validation: unique ids, contiguous seq, seq↔eventSeq mirror, resolvable + ordered parents (seq and tick) | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Personality/Morale ownership | `socialcore` classes are sole owners; `Personality.decisionBandWidth` owns the band formula; `MORALE_UPDATE → MORALE_SHIFT` TURN children; class revival across save/load | `personality-morale-ownership` suite (retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`) |
| Persistence | Save/load equivalence — RNG state, typed actors (incl. `type`), beliefs, markets, rumors, reputation, factions, settlements, journeys, groups all round-trip | `persistence-causal-chain` suite (retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`) |
| Ledger integrity (`RESP-LEDGER-STALE-CLAIMS-AUDIT-001`) | `completion-ledger.md` citations machine-checked in both directions against the repo; closed status vocabulary | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |
| Doc consistency (`RESP-INFO-DOC-CONSISTENCY-001`) | Gate counts agree across README/CAMPAIGN/ledger/IMPLEMENTATION_STATUS and match the repo; doc-map targets and every cited suite exist; next-responsibility ids agree | suite retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md` |

### Event-graph guarantees

- `allocateEvent` assigns unique ids, mirrors `eventSeq`, accepts only committed parents, enforces `parent.seq < child.seq`, and stamps ticks from the world clock.
- New memory/belief/deliberation events are TURN children with recorded ordered parentage; rumor queue/deliver/relay are in-turn actions.
- Seq ordering makes cycles structurally impossible — `auditEventGraph` rules them out in bulk; `causalChain` validates walk-by-walk.
- Known real structure surfaced by the inspector: `TRADE_ROUTE_DECISION` parents cross-tick to the actor's latest `ROUTE_OBSERVATION` (a decision's lineage root is the tick where its belief was observed).
- Crime-loop stages parent to each other (`MIGRATION_EVALUATION → JUSTICE_RESOLUTION → CRIME_REPORTED → CRIME_COMMITTED → TURN`), so the whole cycle is one validated lineage; a probability-0 report stops the chain with no downstream events.

## Doc map — which file is authoritative

| File | Authority |
|---|---|
| `README.md` (this file) | Orientation: architecture, contracts, doc map, open work |
| `docs/CAMPAIGN_STATE.md` | Campaign manager view: completed responsibilities with evidence, **next responsibility** |
| `docs/FEAR_AI_GLOBAL_WORK_LEDGER.md` | Counters, recently verified work, currently selected responsibility |
| `completion-ledger.md` | Per-area status table — **machine-guarded** by `npm run gate:check` (`tools/gate-counts.mjs` counts, `tools/doc-guards.mjs` document rules) |
| `docs/IMPLEMENTATION_STATUS_2026-08-26.md` | **Historical snapshot** (superseded): 66 tests/18 suites baseline from 2026-08-26 |
| `.agents/fear-ai-autopilot.mjs` | Autonomous campaign controller agent (bounded steps until a valid stop certificate) |

## Status vocabulary & completion policy

Row statuses (closed vocabulary): `IMPLEMENTED_AND_VERIFIED`, `PARTIALLY_IMPLEMENTED`, `PROPOSED`, `ACTIVE`, `UNKNOWN`, `IMPLEMENTED_BUT_DEAD_CODE`, `SOURCE_ABSENT` (cited source not in this checkout — claim retracted with glob evidence), `BLOCKED_EXTERNAL` (needs access outside this repository).

Completion policy: standalone passing tests are insufficient — a row closes only when (1) tests exist, (2) the serialize/deserialize round-trip covers the claim, (3) runtime integration is exercised by those tests, (4) nothing supersedes the claim or leaves it dead, (5) the ledger row is updated durably. `DEVELOPMENT_VERIFIED` is never supervisor acceptance.

Mutation-gate/defect policy: when adversarial tests or new tests expose a real defect, production is fixed first, then the defect class becomes a regression/mutation gate — failures are evidence, not reasons to delete the gate.

## Open work (2026-09-23)

Counters: `ACTIONABLE_OPEN 0`, `P0_OPEN 0`, `P1_OPEN 0`, `FAILED_TESTS 0`, `BLOCKED_EXTERNAL 1` (Knowledge DB; git/source fingerprinting unblocked — repo initialized 2026-09-22, branch `main` pushed to drizjet/fear-ai-sim 2026-09-23 with a green first CI run), `P2_OPEN` many (world-expansion).

- Closed 2026-09-23: `RESP-AUTONOMOUS-COMBAT-TICK-001` (`autonomous-combat-tick` suite, retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`) — the world's actors now fight without a caller: `COMBAT_MACRO_TICK` runs each faction's own production evaluation on its own numeric state, names the richest counterpart that still has actors resolved at turn time, and dispatches one engagement per willing faction as the same TURN-rooted single-tail chain, with `DECLINED`/`NO_ACTORS`/`NO_COUNTERPART` recorded for every faction that sits out and `worldStep({ combatTurns: true })` as the default-off entry; an autonomous fight attenuates against the shared habituation book and marks the learned danger grid that the migration decision consumes. The tick's own first draft returned an already-committed tail whenever a later faction sat out (`Duplicate event id` on ordinary worlds) — every turn now writes exactly one `COMBAT_MACRO_EVALUATION`, and the sitting-out cases pin id uniqueness and seq continuity. Closed with it: `RESP-GATE-COUNT-DERIVATION-001` (the `gate-counts-derivation` suite (retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`) 5/5) — the four orientation docs' gate counts are now derived from the runner by `tools/gate-counts.mjs`, enforced by `npm run gate:check` in CI, with anchored gate sites (the first draft rewrote frozen history) and per-citation `N/N` validation (which immediately caught the `hysteresis-reopen` suite (retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`) still cited at 8 cases after its suite grew to 9 — corrected in all seven places). Also closed 2026-09-23: `RESP-SIMULATION-AGENTS-COMBAT-REOPEN-001` (the `simulation-agents-combat-reopen` suite — retired 2026-09-23, `docs/SUITE_RETIREMENT_LOG.md` — 12/12 with 9/9 negative controls) — the fifth and last locatable re-open: all three sources (`legacy/simulation.js`, `legacy/agent.js`, `legacy/learningagent.js`) byte-exact with provenance, and the implement-and-test pass that row always needed — the world's actors (`CombatActor`/`CombatCore`: legacy lineage, engagement window, trauma model, survival book) fight through the production `COMBAT_DEPLOY`/`COMBAT_ENGAGEMENT` chain, the learned danger grid feeds the migration decision, and bloodshed reaches the ONE fear seam factored out of `PLAYER_DAMAGE`. Two production defects were found and fixed by the pass (the band event's `tick` shadowed the world clock; the deploy event's `parentId` shadowed its own parentage). Also closed earlier: `RESP-FACTION-EVALUATION-RAID-CHAIN-001` (the `faction-evaluation-raid-chain` suite (retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`), 8/8 with 4/4 negative controls) — a production DecisionCore RAID choice now drives `FACTION_RAID_EVALUATION` → `FACTION_RAID_DISPATCH` → `FACTION_RAID_RESOLUTION` as one TURN-rooted lineage (reference-guard skip markers for unregistered/self targets, context force/bagSize/defense honored, save/load-verified). Also `RESP-REPUTATION-PUBLIC-PRIVATE-001` (the `reputation-public-private` suite, retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`) — public/private reputation channels as canonical `REPUTATION_UPDATE` events plus production DECISION consumption via `evaluationContext`. The autopilot now runs LIVE: `tools/run-autopilot-step.mjs` drives it over the real runner protocol (certificate tool call executed on the platform, chat call issued to codebuff.com) and halts at **HTTP 402 Payment Required** for model `mimo-v2-flash` — account credits, not code; retry with `AUTOPILOT_MODEL=<model>` once topped up. Earlier closures: player-to-invasion, routing/trade/economy (both 2026-09-23), convoy loop (2026-09-22).
- Closed 2026-09-23: `RESP-AUTONOMOUS-COMBAT-DEPLOY-001` — deploy autonomy, the autonomy thread's last leg: the world's actors could already fight with no caller behind them, but every one of them had still arrived through an explicit `COMBAT_DEPLOY`, so `COMBAT_RECRUIT_TICK` now has each registered faction raise and deploy its own from its own production evaluation and state — the first levy of a faction with nobody living is the legacy FOUNDER (generation 1, no parent), a later levy is drawn off its living veteran (generation 0, recorded as that veteran's child), each is deployed through the same production `COMBAT_DEPLOY` tail as one `COMBAT_RECRUIT_TICK`-rooted single-tail chain per faction (each chain commits before the next allocates, the final tail uncommitted), under a population bound (`action.populationCap`, default 8) with `POPULATION_BOUND`/`DECLINED` recorded for every faction that raises nobody — `worldStep({ recruitTurns: true })` is the default-off entry and the self-raised cohort survives save/load; pinned by the `autonomousDeploy` rule in `npm run gate:check` (`tools/doc-guards.mjs`) and proved able to fail by `npm run gate:prove` (16 drifts).
- **Next responsibility: `RESP-VR-BIOFEEDBACK-SCOPE-001`** — the one open row that waits on the owner rather than on an executor: `VR/biofeedback` is the last `SOURCE_ABSENT` row and both of its cited sources are already located and blob-pinned in `docs/SOURCE_ABSENT_RECONCILIATION.md`, so what remains is a product-scope decision — re-open it through the documented procedure (byte-exact extraction + provenance + the tripwire that forbids extraction outside it) or retire the claim together with its manifest entry — and neither branch is an executor's to take. Closed 2026-09-23: `RESP-FEARCORE-REOPEN-001` — the fourth re-open: `legacy/fearcore.js` (blob `185494c8…`) and `legacy/brain.js` (blob `163dfa7a…`) extracted byte-exact with provenance, the legacy 11-band contract plus its §332 scale adapter integrated in production (a real band change is a canonical `FEARCORE_BAND_TRANSITION`), three legacy quirks preserved and documented rather than silently fixed, and both the `FearCore live transitions` and `Brain scale cleanup` rows closed (the `fearcore-reopen` suite (retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`) 11/11, 6/6 negative controls); `RESP-FACTION-GRIEVANCE-ECONOMY-001` (hurt breeds resentment — fear feeds grievance, resentments renew on every gain and cool only while nothing renews them, so an ordinary world reaches the retaliation gate without anyone scripting it and cools back below it — the `grievance-economy` suite (retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`) 9/9, 12/12); `RESP-NEURAL-FEAR-LOOP-001` (the extracted MLP stops being a read-only observer — a model that has EARNED calibration acts on fear and on the `opportunity` the production RAID candidate scores on, bounded by blend, cap and deadband — the `neural-fear-loop` suite, retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`); and `RESP-ASSERTION-QUALITY-GUARD-001` (a durable meta-test that fails any suite carrying an unprovable assertion signature, after the audit below found two negative controls passing for the wrong reason — `assertion-quality` suite, retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`). Also closed earlier: `RESP-FACTION-RETALIATION-LOOP-001` (the struck faction evaluates and runs its own counter-raid off the resolution that hit it — the `faction-retaliation-loop` suite (retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`) 8/8), `RESP-RUMOR-REPUTATION-EVIDENCE-001` (delivered `reputation:` claims judge their subject from ARRIVED evidence, moving both channels — the `rumor-reputation-evidence` suite (retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`, 6/6)) and `RESP-NEURAL-FEAR-REOPEN-001` (third re-open — `legacy/neuralfear.js` + `legacy/neuralnet.js` byte-exact, `NeuralFearModel` predicting/learning in production — the `neural-fear-reopen` suite, retired 2026-09-23 — `docs/SUITE_RETIREMENT_LOG.md`); the same wave fixed three production defects (the fear machine's RNG adapter threw on the seeded FREEZE roll, production never supplied morale so the legacy FREEZE branch was unreachable, and the reputation blend pushed standing the wrong way for sub-unit weights) — two `SOURCE_ABSENT` rows remain, the FearCore and Brain rows having closed with their own sources. Earlier: `RESP-HYSTERESIS-REOPEN-001`, `RESP-FACTION-AUTONOMOUS-TICK-001`, `RESP-FACTION-EVALUATION-RAID-CHAIN-001`, `RESP-FACTION-RAID-LOOP-001`, the Habituation re-open, `RESP-SOURCE-ABSENT-RECONCILIATION-001` (blob+sha256 manifest `docs/SOURCE_ABSENT_RECONCILIATION.md`, guard suite, monorepo option 1 executed — default branch `main`, master untouched) — divergence facts: `docs/MONOREPO_RECONCILIATION.md`.
- One `SOURCE_ABSENT` row remains: VR/biofeedback — both cited sources are located and blob-pinned in `docs/SOURCE_ABSENT_RECONCILIATION.md`, so the row waits on an explicit product-scope decision, not on a missing artefact; a re-open runs only through the proven procedure (byte-exact extraction + provenance + guard tripwire). CI is `IMPLEMENTED_AND_VERIFIED` (green runs on `main`, cited in the ledger).
- **Global completion is NOT claimed and no stop certificate exists**: `docs/FEAR_AI_GLOBAL_STOP_CERTIFICATE.json` has never been created — a valid certificate can only come from an independent supervisor (never from an executor running the campaign), so every closure above is development-verified only..
