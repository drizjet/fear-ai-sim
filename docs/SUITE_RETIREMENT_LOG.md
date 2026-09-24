# Suite retirement log

The campaign owner's rule is that this repository carries no test suites, so the suites under
`tests/` are retired in **alphabetical batches**. A retirement is evidence-preserving, not silent:
each suite is run and read *before* it is removed, and this file records what it verified, what it
changed, and where the next batch resumes. The gate counts in the four orientation documents are
re-derived after every batch (`npm run gate:sync`), so the surviving prose never quotes a count the
runner no longer produces.

**Status: complete.** Batch 13 (below) retired the last twelve suites; `tests/` is empty, `npm test`
exits 0, and the gate is `npm run gate:check` — the eleven document rules plus the derived counts.

## Protocol (per suite, in order)

1. **Run it alone** and record the case count and result (`node --experimental-vm-modules
   node_modules/jest/bin/jest.js tests/<name>.test.js`).
2. **Read every assertion** against the production behavior it names.
3. **Fix any genuine defect it exposes** — in production if the suite is right, in the suite if the
   suite is wrong — and re-run before proceeding.
4. **Record it here** (below): what it verified, what changed, what guard is lost with it.
5. **Delete it and de-cite it everywhere** — README/doc map, `docs/CAMPAIGN_STATE.md`,
   `docs/FEAR_AI_GLOBAL_WORK_LEDGER.md`, `completion-ledger.md`, agent comments — then run
   `npm run gate:sync` and `npm run gate:check` so nothing dangles.

## Batch 1 — retired 2026-09-23 (first three suites, alphabetically)

Run before removal: **3 suites / 18 cases green** (`assertion-quality` 2/2, `autonomous-combat-tick`
13/13, `autopilot-agent` 3/3), 0.66 s.

| Suite | Cases | What it verified | Change made before removal |
|---|---|---|---|
| `tests/assertion-quality.test.js` | 2 | `RESP-ASSERTION-QUALITY-GUARD-001` — a corpus-wide meta-guard: it scanned every other suite for signatures that can pass while proving nothing (empty `toMatchObject({})`, a literal `expect(true)`/`expect(false)`, a `?.` actual under a matcher `undefined` satisfies, an assertion inside `catch`, an `it` with no assertion at all), asserted it had actually seen the corpus (`> 150` files) so a broken glob fails loudly, and self-verified that it detects each banned signature. | None needed: the corpus was clean at retirement and each rule was self-checked. **Guard lost:** nothing now audits the surviving suites for vacuous assertions, so the rule survives only as prose in `docs/CAMPAIGN_STATE.md`. |
| `tests/autonomous-combat-tick.test.js` | 13 | `RESP-AUTONOMOUS-COMBAT-TICK-001` — `COMBAT_MACRO_TICK`: every faction with living actors runs its own production `evaluateAction` on its own numeric state, names the richest counterpart that still has actors resolved at turn time, and a `RAID` selection dispatches one engagement as a TURN-rooted single-tail chain; `DECLINED`/`NO_ACTORS`/`NO_COUNTERPART` recorded for every faction that sits out; `worldStep({ combatTurns: true })` as the default-off entry; an autonomous fight reaching the one fear seam (habituation `1,1,2,2,3,3`, band transitions), the learned danger grid (three deaths → `learnedDanger` 1, pressure .1 → .4) and the migration decision; determinism and save/load round-trip. | **Two production defects found by reading this suite's behavior and fixed in production** (it was right): (1) the engagement id was stamped with the **world clock** (`north->south@1`), so two macro ticks inside one turn — which share a tick number — handed two *different* engagements the same label; the id now names the **macro event** that opened the engagement (`north->south@<event id>`). (2) `COMBAT_MACRO_TICK` published a full faction→actor **roster on every evaluation event** with no consumer; removed. One behavior **documented rather than changed**: an actor deployed with no faction belongs to no faction's units, so no evaluation can name it and it is not fought over. |
| `tests/autopilot-agent.test.js` | 3 | The `.agents/fear-ai-autopilot.mjs` controller: the definition shape the `@codebuff/sdk` loader validates (`id`, `name`, `displayName`, `model`, a **sync** `function*` `handleSteps` per `isValidGeneratorFunction`), the inlined directive byte-equal to the exported `DIRECTIVE` (the runner `eval()`s the generator source, so module-scope bindings are invisible to it), and the real runner protocol driven headlessly — terminal certificate probe → `STEP_TEXT` unit → `'STEP'` pause → re-probe, and halting with `done` when a verified certificate exists. | The two comments in `.agents/fear-ai-autopilot.mjs` that cited this suite were rewritten, so the module no longer points at a file that does not exist. **Guard lost:** the byte-equality of the inlined directive is no longer machine-checked — it survives only as the comment on the inlining. |

### De-citation performed for batch 1

18 citation sites were retired across `README.md` (2), `completion-ledger.md` (3),
`docs/CAMPAIGN_STATE.md` (7), `docs/FEAR_AI_GLOBAL_WORK_LEDGER.md` (4) and
`.agents/fear-ai-autopilot.mjs` (2). Each site now names the suite as *retired* and points here
instead of quoting a case count the runner can no longer produce. `docs/GATE_COUNTS.json` and the
live gate sentences in the four orientation documents are re-derived by `npm run gate:sync`.

## Batch 2 — retired 2026-09-23 (the next six suites, alphabetically)

Run before removal: **6 suites / 29 cases green** (`causal-chain-inspector` 4/4,
`character-interaction-execution` 6/6, `ci-workflow` 2/2, `completion-ledger-integrity` 3/3,
`convoy-escort-bandit` 7/7, `core-systems` 7/7).

| Suite | Cases | What it verified (what it was written to catch) | Change made before removal |
|---|---|---|---|
| `tests/causal-chain-inspector.test.js` | 4 | `RESP-CAUSAL-CHAIN-INSPECTOR-001` — `causalChain()` walks a `TRADE_ROUTE_DECISION` back through its cross-tick parent to the `ROUTE_OBSERVATION` that produced its belief and the `TURN` root; surfaces cited belief producers (`BELIEF_UPDATED`) **with their own lineages**; validates ordered parentage (unknown id, dangling parent, and parent-order violation each throw); and is read-only (history byte-identical after walking). Mutants it named: lineage order reversed, belief-producer walk skipped. | None needed — no defect found in the inspector. Coverage lost: the inspector contract (production `causalChain`/`auditEventGraph` remain, unguarded). |
| `tests/character-interaction-execution.test.js` | 6 | `RESP-CHARACTER-INTERACTION-AFFORDANCES-001` — every catalog affordance executes end-to-end through `AdvisoryGate` as a TURN child, only declared effects mutate state (`transform`/`recruit` convert the target type), gate rejections land with blockers and mutate nothing, a converted target rejects further transforms, actor types survive save/load with unique ids, and identical seeds produce identical worlds. Mutant it named: advisory-gate bypass. | None needed — no defect found. Coverage lost: the interaction-execution contract. |
| `tests/ci-workflow.test.js` | 2 | the workflow exists and runs the full gate on `push` and `pull_request` with `npm ci`, `npm test`, a pinned `node-version` and `fetch-depth: 0` (the SOURCE_ABSENT manifest guard reads `origin/master` blobs), and the workflow's command is **exactly** the package test script, so local and CI gates cannot drift. | **Salvaged**: both invariants moved into `npm run gate:check` — the workflow must contain `npm run gate:check` and `npm test`, and the package test script must keep `--experimental-vm-modules`. The invariant outlives the suite instead of dying with it. |
| `tests/completion-ledger-integrity.test.js` | 3 | `RESP-LEDGER-STALE-CLAIMS-AUDIT-001` — every ledger data row parses to the expected shape with a status from a closed vocabulary, every file cited in a healthy row **exists**, a `SOURCE_ABSENT` row may cite only files that are provably absent (the absence is its evidence), and the retracted-row list is exactly `['VR/biofeedback']`. Mutant it named: phantom citation added to a verified row. | **Salvaged**: the citation rule in both directions now runs in `npm run gate:check` (`tools/gate-counts.mjs`), so a later retirement that forgets to de-cite a suite fails the gate instead of drifting into prose — the defect class this row was created for (the ledger already carries phantom citations from before this guard existed). Not carried: the row-shape/status-vocabulary and retracted-row-list checks. |
| `tests/convoy-escort-bandit.test.js` | 7 | `RESP-CONVOY-ESCORT-BANDIT-LOOP-001` — the full `ROUTE_OBSERVATION` → `CONVOY_DISPATCH` → `CONVOY_BANDIT_THREAT` → `CONVOY_ESCORT_RESOLUTION` → market-consequence cycle as one validated lineage with belief provenance, one world-RNG draw at resolution, exact conservation on both sides (and theft without breaking either balance sheet), stage gates (unknown trip, duplicate convoy id, out-of-order stages, rejection on an unavailable route with no state touched), `worldStep` trip automation deferring to escort-owned convoys, save/load bit-for-bit continuation and determinism. Mutants it named: threat-state gate removed, resolution forced to victory, automation not deferring. | None needed — no defect found. Coverage lost: the convoy/escort/bandit loop contract. |
| `tests/core-systems.test.js` | 7 | the smoke matrix over the small modules — `DecisionCore` prerequisites/blockers, `Personality` fear-sensitivity and `Morale` bounds/freeze, `AgentBelief` evidence + `ReputationBook` blend, `routeCost`/`raidUtility`/`escalationLevel`, `InteractionCore` validation + `AdvisoryGate`, `RumorNetwork`/`Market`/`chooseRoute`, and the crime/justice/legitimacy/migration helpers. | None needed — no defect found. **Cited by no document** (a finding in itself: the oldest suite was pure regression coverage nobody referenced). Coverage note: `routeCost` is the one subject no surviving suite names directly, but it stays exercised **indirectly** — `chooseRoute` consumes it (`societycore.js:256-257`) and `tests/locality.test.js` and `tests/societycore.test.js` drive `chooseRoute`. Every other subject in the matrix is named by at least one surviving suite. |

### Instrument change made by this batch

`gate:sync` used to print a false red (`N suites / M tests (N FAILING)`) for a legitimate batch: its
derivation run executes **before** the docs are rewritten, so the gate-agreement suites are still
comparing against the pre-batch counts. The tool now names which files were red on that run, takes its
verdict from a **second run after the rewrite**, and reports the difference explicitly: a failure the
rewrite cures is the batch's own bootstrap artifact and the gate is green; a failure that survives the
rewrite fails the tool, as does the runner disagreeing with itself across two consecutive runs. Sync
also exits non-zero when problems remain, instead of rewriting silently.

Proved on the real thing, both outcomes. This batch's own `gate:sync` named the red files and then
printed `the derivation run was red on 2 failing test(s) in 2 file(s): doc-integrity.test.js,
gate-counts-derivation.test.js — because the counts it had just produced were not written yet; the
rewrite made them current, and the runner is green at 157 suites / 528 tests` — exit 0. With a
genuine production failure injected (`raidUtility` given a `+1000` bias, a real behavior break), the
same command reported `the runner is still red AFTER the rewrite (4 failing test(s) in 2 file(s):
faction-evaluation-raid-chain.test.js, faction-raid-loop.test.js) — not the batch's bootstrap
artifact` and exited 1; the mutant was reverted and the gate came back green. That probe also caught
a defect in the tool itself: it counted failing **cases** and called them **files**, so its evidence
misdescribed what happened — fixed before this entry was written.

### De-citation performed for batch 2

Twenty-three sites: `README.md` (4, including the "machine-guarded by" line, which now names
`npm run gate:check`), `docs/CAMPAIGN_STATE.md` (7), `docs/FEAR_AI_GLOBAL_WORK_LEDGER.md` (8),
`completion-ledger.md` (3) and `docs/IMPLEMENTATION_STATUS_2026-08-26.md` (1, the ledger pointer
now names the tool). `core-systems` needed none — it was cited nowhere.

Pre-existing and **not** introduced here: `fearcore.test.js`, `persistence-equivalence.test.js`,
`scheduler-dispatch.test.js` and `scheduler-ownership.test.js` appear in the docs' own audit
narrative (they record phantom README citations that were corrected) and `tests/x.test.js` is the
prose example in the gate-count explanation. They read as history, not as live citations.

## Batch 3 — retired 2026-09-23 (the next twelve suites, alphabetically)

Run before removal: **12 suites / 63 cases green** (`crime-justice-legitimacy-migration` 6,
`decision-causality` 6, `determinism` 6, `doc-integrity` 4, `dynamic-health` 3,
`ecology-cascade` 2, `event-causality-belief-path` 6, `event-graph-audit` 5, `faction-action` 2,
`faction-evaluation-raid-chain` 8, `faction-macro-tick` 7, `faction-raid-loop` 7).

**This slice surfaced no production defect.** It is recorded plainly rather than padded: every
suite was read against the production code it exercises and every one told the truth about
behavior that still holds. The defect this pass found was in the loop's own machinery — three
document invariants whose only owner was a suite in this slice — and it is fixed under "Instrument
change" below.

| Suite | Cases | What it verified (what it was written to catch) | Change made before removal |
|---|---|---|---|
| `tests/crime-justice-legitimacy-migration.test.js` | 6 | the crime → report → justice → legitimacy → migration loop as canonical parented events, with every stage's number re-derived from the production primitive (`resolveCrime`, `reportCrime`, `accessToJustice`, `updateLegitimacy`, `shouldMigrate`); accessible justice raises legitimacy enough to **stop** the migration while inaccessible justice does not (the loop has teeth); an unreported crime stops the chain at the report gate (and later stages throw); the cross-tick chain survives save/load; seeded replay is bit-for-bit. Mutants it named: legitimacy write skipped, report primitive ignored, migration reading pre-justice legitimacy, parentage dropped. | None needed. Coverage lost: the loop contract and the direct unit coverage of `accessToJustice`/`updateLegitimacy`'s justice path. |
| `tests/decision-causality.test.js` | 6 | a `DECISION` is a real TURN child (parent, tick, actorId, selected, score), rejected alternatives are recorded for why-not explainability, a blocked decision is truthful (`selected: null` + blockers), several decisions in one turn keep ordered parentage, the world RNG is shared so identical seeds give identical selections, and decisions survive save/load with unique ids. | None needed. Coverage lost: decision-level explainability; graph-level parentage still has incidental callers of `auditEventGraph`. |
| `tests/determinism.test.js` | 6 | `RESP-RNG-OWNERSHIP-001` — `Personality` trait defaults draw from the **injected** RNG, default instances are deterministic, the same seed reproduces traits and a different seed diverges, `DecisionCore` is deterministic by default and cursor-driven when injected, `BeliefEvidence`/`AgentBelief` timestamps come from the injected clock, and RNG state serializes so a restored runtime continues the identical stream. | None needed. Successor survives: `tests/time-ownership.test.js` source-scans all eight production modules for wall-clock/RNG escapes. |
| `tests/doc-integrity.test.js` | 4 | `RESP-INFO-DOC-CONSISTENCY-001` — the four orientation docs must declare the same gate and the suite count must equal the files on disk; README doc-map targets must exist; **every suite referenced in the README must exist**; and the campaign state and work ledger must name the same next responsibility. Mutants it named: gate drift, doc-map rename, next-responsibility mismatch, and the IMPLEMENTATION_STATUS pointer that had drifted to 142/405 unguarded. | **Salvaged — all three invariants that had no other owner** moved into `npm run gate:check`: gate agreement was already owned by the tool; added there now are the **suite-reference rule** (every `.test.js` name a document uses must exist on disk or be registered in this log — the rule that would have caught the README table still citing a deleted suite for a whole batch) and the **next-responsibility agreement**. This is the last suite that policed the docs by test. |
| `tests/dynamic-health.test.js` | 3 | counterexamples: 100 HOLD evaluations cannot inflate settlement legitimacy without cooperation, a destination price below the merchant's minimum yields `WAIT`/not-profitable/no route, and one above it selects the route. | None needed. Coverage lost: the legitimacy-inflation counterexample — no surviving suite names it. |
| `tests/ecology-cascade.test.js` | 2 | a `DROUGHT` reduces the harvest entering the market (10 → 2) and the season **changes production** rather than a label (`SUMMER` > `DROUGHT`). | None needed. Coverage lost: `SEASON_UPDATE` has no surviving suite. |
| `tests/event-causality-belief-path.test.js` | 6 | `RESP-EVENT-CAUSALITY-001` — `worldStep` routes rumor queue/delivery through parented events, belief decay is recorded on the TURN (counters **and** real confidence movement), the relayer's republished rumor is queued as a child of its own TURN, a `TRADE_ROUTE_DECISION` cites the `BELIEF_UPDATED` that produced its route belief, a queue-aware decision consumes the delivered rumor it depends on, the invariant that any recipient gaining evidence in a tick has a `BELIEF_UPDATED` in that tick, and seeded determinism + save/load provenance resolution. | None needed. Coverage lost: the belief-provenance contract (the strongest statement of it in the corpus). |
| `tests/event-graph-audit.test.js` | 5 | `RESP-EVENT-GRAPH-AUDIT-001` — one pass over the whole history: a healthy mixed world is `ok` with `checked`/`eventSeq`/`roots` consistent, empty and deserialized worlds are `ok`, and a forged graph yields exactly the right violation kinds (`DANGLING_PARENT`, `PARENT_SEQ_ORDER`, `PARENT_TICK_ORDER`, `DUPLICATE_ID`, `SEQ_MIRROR`), each restorable to clean. | None needed. Coverage lost: the only deliberate exercise of the audit's **violation vocabulary**; the production guard remains and is still called incidentally by surviving suites. |
| `tests/faction-action.test.js` | 2 | `FactionRuntime.evaluateAction` selects from faction state, and RAID is unavailable when capability is absent (`canRaid` blocker, selection not RAID). | None needed. Coverage lost: the only suite naming `FactionRuntime` directly. |
| `tests/faction-macro-tick.test.js` | 7 | `RESP-FACTION-AUTONOMOUS-TICK-001` — `FACTION_MACRO_TICK` gives every registered faction a turn chained off the macro event, the target is the richest other faction with insertion order breaking loot ties, a raid runs the full chain with exact loot conservation, peaceful worlds emit no raid events, lone/empty worlds emit the macro event alone, `worldStep({ factionTurns })` is opt-in and default-off, and save/load + seeded determinism hold. | None needed. Coverage lost: the autonomous faction-turn contract. |
| `tests/faction-evaluation-raid-chain.test.js` | 8 | `RESP-FACTION-EVALUATION-RAID-CHAIN-001` — one production RAID choice drives `FACTION_RAID_EVALUATION` → `DISPATCH` → `RESOLUTION` as a single TURN-rooted lineage; context `force`/`bagSize`/`defense` overrides flow through it; a de-escalating raid evaluation stops at a `REJECTED` dispatch with no raid entity; unregistered and self targets record a skip instead of throwing; non-RAID selections leave legacy behavior and its `.1` patrol nudge untouched; the `worldStep` entry drives the same chain; save/load continues bit-for-bit. | None needed. Coverage lost: the evaluation→raid chaining contract. |
| `tests/faction-raid-loop.test.js` | 7 | `RESP-FACTION-RAID-LOOP-001` — the raid loop production-wired: the full lineage with `raidUtility` scoring and `escalationLevel` surfaced on every stage; a repulsed raid moves no loot and applies the defeat consequences (attacker confidence, defender grievance); exact loot conservation across mixed victory/defeat; every stage gate and guard order firing **before** any mutation; save/load mid-cycle; determinism. | None needed. Coverage lost: the raid loop contract — note these three faction suites are exactly the ones that went red in the last batch's injected-failure probe, so they were load-bearing coverage for the raid path. |

### Instrument change made by this batch

`doc-integrity` was the last suite policing the documents, and three of its invariants had no other
owner. They now live in `npm run gate:check` (`tools/gate-counts.mjs`): every `.test.js` name a
document uses must **exist on disk or be registered in this log**, and the campaign state and work
ledger must name the same next responsibility. The log is now also the registry that makes that rule
usable, so a later batch that forgets one citation fails the gate instead of leaving prose behind —
the failure mode this loop already produced once.

## Registry of names used by the documents that never existed in this checkout

These are historical narrative, not live citations: the docs record phantom README references that
were corrected, and one prose example from the gate-count explanation. The citation rule above
accepts them; when their prose is ever rewritten, they can leave this list.

`fearcore.test.js`, `persistence-equivalence.test.js`, `scheduler-dispatch.test.js`,
`scheduler-ownership.test.js`, `x.test.js`.

## Batch 4 — retired 2026-09-23 (the next twelve suites, alphabetically)

Run before removal: **12 suites / 55 cases green** (`fork-holdout` 2, `gate-counts-derivation` 5,
`grievance-economy` 9, `habituation-reopen` 7, `hysteresis-reopen` 9, `interaction-causality` 2,
`journey-risk-consumer` 2, `locality` 4, `long-horizon` 1, `long-horizon-regimes` 3,
`market-conservation` 8, `market-pending-trip-automation` 3).

**This slice surfaced no production defect either.** Stated plainly rather than padded: every suite
was read against the code it exercises and each one told the truth. The defects this pass found were
the two the previous pass named against itself — guards that had only ever been exercised passing —
and the structural pile-up the mission named: `gate-counts.mjs` had grown five unrelated jobs.

| Suite | Cases | What it verified (what it was written to catch) | Change made before removal |
|---|---|---|---|
| `tests/fork-holdout.test.js` | 2 | fresh-runtime persistence: a saved world continues identically **after the original runtime is destroyed**, and two forks of one save diverge only after an intervention. | None needed. Coverage lost: the destroy-the-original holdout. |
| `tests/gate-counts-derivation.test.js` | 5 | the offline half of the count derivation — `citationMismatches` semantics (nearest equal pair wins, `"a.test.js, b.test.js (3/3)"` attributes to b, unequal pairs are frozen history and stay untouched, a citation with no pair claims nothing), all four docs agreeing with the machine-written artifact, the artifact accounting for every suite on disk, no cited count contradicting it, and the mechanism's wiring (scripts, CI, README, tool source). | None needed — and note its own known hole: a citation naming a suite the artifact does not know is skipped, which is exactly why the suite-reference rule in `tools/doc-guards.mjs` exists. With this suite gone, the artifact-vs-disk agreement is owned by the runner alone (`gate:sync`/`gate:check`). |
| `tests/grievance-economy.test.js` | 9 | `RESP-FACTION-GRIEVANCE-ECONOMY-001` — being hurt breeds resentment at .5 per applied fear point (recorded as `factionGrievanceAfter`), resentments renew on every gain and cool only after five idle ticks at .01 with a floor at zero, the cooled-faction count lands on the TURN, the retaliation gate can be reached (and disarmed) purely from production pressure, and `grievanceTick` round-trips so a restored world cools on schedule rather than immediately. | None needed. Coverage lost: the grievance economy, and with the faction suites retired last batch, the whole retaliation path is now unguarded. |
| `tests/habituation-reopen.test.js` | 7 | the re-opened Habituation row — `legacy/habituation.js` byte-exact against the manifest blob + sha256 with provenance, then the V8 semantics in production: novelty protects the first two exposures, decay speed differs by stimulus type, the cap holds, recovery runs on **world** time, every exposure is a canonical `FEAR_HABITUATED` chained to the fear event it shaped, exposure keys isolate per faction and per source, factionless wounds never touch the book, and the book round-trips. | None needed. Coverage lost: the habituation contract and the only provenance check (sha256 + blob) for the extracted habituation source. |
| `tests/hysteresis-reopen.test.js` | 9 | the re-opened Hysteresis row — `legacy/hysteresis.js` byte-exact with provenance, the asymmetric enter/exit gap that holds state where a single threshold would oscillate, the minimum-duration gate, the seeded FREEZE roll behind low morale, production fear driving `FEAR_STATE_TRANSITION` events chained off the `FEAR_HABITUATED` exposure they read, per-faction isolation, the production FREEZE branch actually reached, and save/load. | None needed. Coverage lost: the hysteresis machine contract, its provenance check, and the state vocabulary. |
| `tests/interaction-causality.test.js` | 2 | `INTERACTION_EVALUATION` recorded as a TURN child with alternatives, and an advisory rejection recorded as history with `action: null` — no mutation authority. | None needed. Coverage lost: the interaction-event contract. |
| `tests/journey-risk-consumer.test.js` | 2 | perceived route danger (not hidden `actualDanger: 99`) governs settlement, and a high-risk migration group returns home **without losing population**. | None needed. Coverage lost: hidden-truth neutrality for journey settlement. |
| `tests/locality.test.js` | 4 | `RESP-BELIEF-LOCALITY-001` — route choice is unchanged by hidden actual danger, perception crosses an explicit observation boundary that strips `actualDanger`, an out-of-range observation is refused (`null`), and a changed perception really flips the choice. | None needed. Coverage lost: the locality contract, including the only direct exercise of `observeRoute`'s range refusal. |
| `tests/long-horizon.test.js` | 1 | a 1000-tick smoke: finite clock, unique event ids, nonnegative stock, market balance sheet balanced, legitimacy bounded to [0, 1], finite trajectory. | None needed. Coverage lost: the plain long-horizon guardrail (the regimes variant below covered less). |
| `tests/long-horizon-regimes.test.js` | 3 | the same 1000-tick health check across three seeds with roaming groups, traffic decay and drought cycling — finite and nonnegative state, traffic inside capacity, conservation, unique ids, ordered parentage, and an exact serialize round-trip. | None needed. Coverage lost: multi-seed long-horizon health. |
| `tests/market-conservation.test.js` | 8 | `RESP-MARKET-CONSERVATION-001` — unmet demand recorded rather than discarded, mixed production/consumption/trade flows reconciled exactly, negative demand creating nothing, destruction beyond stock booked as discard, `flows()` kept trade-only for compatibility, oversold trades rejected, a duplicate trip id throwing **even when stock is also short** (the guard-order defect this suite pinned), and exact reconciliation after save/load. | None needed. Coverage lost: exact stock-and-flow accounting — the strongest statement of market conservation in the corpus. |
| `tests/market-pending-trip-automation.test.js` | 3 | `RESP-MARKET-PENDING-DELIVERY-AUTOMATION-001` — `worldStep` settles pending trips once (a second step adds no events), an unavailable route yields an explicit terminal `BLOCKED` outcome with no delivery, and pending-trip state round-trips byte-identically. | None needed. Coverage lost: pending-trip automation. |

### Instruments proven this pass (both negative controls)

The two rules salvaged from the retired `doc-integrity` suite had only ever been exercised passing,
which is the defect class this corpus exists to prevent. Both were driven with real injected drift in
`docs/CAMPAIGN_STATE.md` and `gate:check` named each one, then the drift was reverted and the gate
came back clean:

    STALE: docs/CAMPAIGN_STATE.md: cites ghost-suite.test.js, which is neither on disk nor registered in docs/SUITE_RETIREMENT_LOG.md
    STALE: the campaign state names RESP-GHOST-DRIFT-001 as next while the work ledger selects RESP-AUTONOMOUS-COMBAT-DEPLOY-001

Reverted byte-identically (the ghost strings no longer appear), `gate:check` exits 0 at the new
counts. **Both rules can fail, and each failure names its drift.**

### Structural change: the rules left the counts tool

`gate-counts.mjs` had grown five unrelated jobs. The four document invariants (ledger citations,
suite references, next responsibility, CI wiring) moved to `tools/doc-guards.mjs`, each as its own
named function with the failure that created it written above it; `gate:check` still reports them
before `npm test`, so CI's entry point is unchanged. `gate-counts.mjs` is back to one job — the
counts the runner produces — and its header now points at the guards instead of describing them.

### De-citation performed for batch 4

Every citation of the twelve retired, across six documents: `README.md`,
`docs/CAMPAIGN_STATE.md`, `docs/FEAR_AI_GLOBAL_WORK_LEDGER.md`, `docs/SOURCE_ABSENT_RECONCILIATION.md`,
`docs/IMPLEMENTATION_STATUS_2026-08-26.md` and `completion-ledger.md` (which cites the two re-opened
rows with **bare paths**, a third citation shape the sweep had to handle). The suite-reference rule
now enforces this mechanically for every later batch.

## Batch 5 — retired 2026-09-23 (the next twelve suites, alphabetically)

Run before removal: **12 suites / 19 cases green** — `market-pending-trip-automation-closure-audit`
(1), `market-pending-trip-cargo-identity` (2), `market-pending-trip-cargo-identity-closure-audit`
(1), `market-pending-trip-material-accounting-closure-audit` (1),
`market-pending-trip-material-accounting-dynamic` (1), `market-price-shortage-merchant-causal` (2),
`market-price-shortage-merchant-causal-closure-audit` (3), `market-price-shortage-merchant-causal-dynamic`
(1), `market-price-shortage-merchant-causal-long-horizon` (1), `market-route-feedback` (2),
`migration-process` (3), `migration-topology` (1).

**No production defect in this slice either — stated plainly.** These were closure-audit and
counterfactual suites in the market/migration domain: automatic delivery with terminal `BLOCKED`
outcomes, cargo identity and theft ownership, mixed-good conservation across outcomes and restart
checkpoints, price-shortage → merchant-profitability causality, route-decision evidence and
non-vacuity, migration that arrives exactly once and refuses over-capacity begins, and multi-hop
migration choosing by **perceived** danger while actual danger is 99.

One coverage-quality finding is recorded rather than fixed, because the suite is gone:
`market-price-shortage-merchant-causal-closure-audit`'s second case called itself a mutation control
but computed its "mutated" decision as the literal `'TRAVEL'` whenever routes exist — a self-fulfilling
assertion, not a mutant. Its real content was the `profitable === false` assertion beside it.

| Suite | Verdict | Coverage lost |
|---|---|---|
| `market-pending-trip-automation-closure-audit` | green, no defect | delivery automation closure (terminality, balance sheets) |
| `market-pending-trip-cargo-identity` | green, no defect | cargo kind + owner custody through delivery and theft |
| `market-pending-trip-cargo-identity-closure-audit` | green, no defect | three-outcome identity audit with persistence on both sides |
| `market-pending-trip-material-accounting-closure-audit` | green, no defect | mixed-good terminal accounting across markets |
| `market-pending-trip-material-accounting-dynamic` | green, no defect | 60-trip multi-seed conservation with restart checkpoints |
| `market-price-shortage-merchant-causal` | green, no defect | shortage price → profitability direction |
| `market-price-shortage-merchant-causal-closure-audit` | green, no defect; weak "mutation control" recorded above | the live price consumer changing the merchant decision |
| `market-price-shortage-merchant-causal-dynamic` | green, no defect | directional price feedback across 40-tick regimes |
| `market-price-shortage-merchant-causal-long-horizon` | green, no defect | non-vacuous exposure with counterfactual scarity/supply contrast |
| `market-route-feedback` | green, no defect | destination price recorded as decision evidence |
| `migration-process` | green, no defect | in-transit journey, one-shot arrival, capacity refusals, save/load |
| `migration-topology` | green, no defect | multi-hop path preservation + perceived-danger hop choice |

### Salvage and proof: the extracted sources' provenance now has an owner

Retiring `habituation-reopen` and `hysteresis-reopen` (batch 4) left the byte-exact sha256/blob
verification of the extracted legacy sources with **no owner anywhere** — the thing that proves the
repository's evidence is what it claims to be. It now runs in `tools/doc-guards.mjs` as
`provenanceHashes`: the table in `legacy/PROVENANCE.md` is the source of truth, every file it lists is
hashed against the pinned sha256, and a table that parses to zero rows is itself a failure so the
guard cannot go blind.

Demonstrated failing and then passing: with one pinned hash changed by a single digit,
`npm run gate:check` exited 1 and printed

    STALE: legacy/habituation.js: hashes to df02134b92…db27, but legacy/PROVENANCE.md pins df02134b92…db28 (blob df69efd8bf62…c5d)

then the mismatch was reverted byte-identically and the gate came back clean.

Same pass, one hole closed in a rule salvaged earlier: `suiteReferences` scanned README, the ledger
and `docs/*.md` but **not** `legacy/PROVENANCE.md`, whose closing paragraph cited the five re-open
suites. It now scans that file too (it is where the byte-exactness claim lives), and its citations of
retired suites were rewritten to point at `npm run gate:check` and this log.

### De-citation performed for batch 5

Only `completion-ledger.md` cited any of the twelve (two sites in the market-pending-trip family
row), and both are retired. Every other citation was already gone.

## Batch 6 — retired 2026-09-23 (the next fifteen suites, alphabetically)

Run before removal: **15 suites / 58 cases green**: `faction-retaliation-loop` (8),
`fearcore-reopen` (11), `infrastructure-conflicting-reports` (3),
`infrastructure-danger-encounter` (4), `infrastructure-danger-feedback` (4),
`infrastructure-danger-recovery` (4), `infrastructure-encounter-recovery` (3),
`infrastructure-encounter-reporting` (3), `infrastructure-recovery` (1),
`infrastructure-repair-mutation` (1), `infrastructure-report-confidence` (4),
`infrastructure-report-consumer` (4), `infrastructure-report-evidence-bounds` (3),
`infrastructure-report-evidence-compaction` (2), `infrastructure-report-expiry-dynamic` (3).

**No production defect in this slice — stated plainly.** Every suite was read against the production
code it exercises and each told the truth. **No self-fulfilling control was found this time either:**
the `mutation control` cases here (infrastructure risk set to zero, a removed repair producer, an
un-delivered report) each change an input and observe a genuinely different outcome, so unlike the
`market-price-shortage-merchant-causal-closure-audit` case recorded in batch 5 they are coverage, not
theatre. `infrastructure-report-confidence`'s "falls back to local perception" case was checked for
the same flaw and clears it: with the report still at perceived danger 10 the decision would pick the
long detour, so the assertion discriminates.

| Suite | Verdict | Coverage lost |
|---|---|---|
| `faction-retaliation-loop` | green, no defect | `RESP-FACTION-RETALIATION-LOOP-001` — the struck faction's own counter-raid, retaliation eligibility/depth/threshold and the one-level budget; the last leg of the Factions row |
| `fearcore-reopen` | green, no defect | the 11-band vocabulary and thresholds, panic lock, PRESENCE_BREAK bypass, extended-band rules and their exit fallbacks, the §332 scale adapter, the bounded decision trace, and the three documented legacy quirks. **Already salvaged:** the byte-exact hashes of `legacy/fearcore.js` and `legacy/brain.js` are owned by the provenance guard |
| `infrastructure-conflicting-reports` | green, no defect | contradictory scout reports preserved per actor, divergent decisions from contradictory local beliefs |
| `infrastructure-danger-encounter` | green, no defect + valid risk-zero control | degraded infrastructure becoming an explicit raid with exact loot loss |
| `infrastructure-danger-feedback` | green, no defect + valid risk-zero control | degradation raising legal perceived danger and forcing avoidance |
| `infrastructure-danger-recovery` | green, no defect + valid control | repair reversing route risk without saturating the decision |
| `infrastructure-encounter-recovery` | green, no defect + valid control | RAID → PASS reversal after repair with loot balance |
| `infrastructure-encounter-reporting` | green, no defect | delayed uncertain reports queued instead of mutating beliefs globally; hidden danger never exposed |
| `infrastructure-recovery` | green, no defect | repeated failure/repair cycles reversing route avoidance |
| `infrastructure-repair-mutation` | green, no defect | the repair producer being required before travel resumes |
| `infrastructure-report-confidence` | green, no defect | confidence-weighted report consumption and decay fallback |
| `infrastructure-report-consumer` | green, no defect | a delivered report driving a later canonical decision; pre-delivery neutrality |
| `infrastructure-report-evidence-bounds` | green, no defect | belief evidence bounded at 128 while retaining the latest report; rumor/queue bounds |
| `infrastructure-report-evidence-compaction` | green, no defect | compaction not changing the latest decision value |
| `infrastructure-report-expiry-dynamic` | green, no defect | active deliveries alive, stale unqueued reports expiring, queued reports never expiring inside their window |

### De-citation performed for batch 6

Only two of the fifteen were cited anywhere: `faction-retaliation-loop` (README, `completion-ledger.md`,
`docs/CAMPAIGN_STATE.md` ×3, `docs/FEAR_AI_GLOBAL_WORK_LEDGER.md` ×2) and `fearcore-reopen`
(README, `completion-ledger.md`, `docs/CAMPAIGN_STATE.md` ×2, `docs/FEAR_AI_GLOBAL_WORK_LEDGER.md`,
`docs/SOURCE_ABSENT_RECONCILIATION.md` ×2). All retired; the thirteen `infrastructure-*` suites were
cited nowhere, which is itself the shape of this corpus — the audit suites were added as evidence and
never woven into the orientation documents.

## Batch 7 — retired 2026-09-23 (the next fifteen suites, alphabetically)

Run before removal: **15 suites / 44 cases green**: `infrastructure-report-expiry` (4),
`infrastructure-report-provenance` (3), `infrastructure-report-queue-admission-dynamic` (2),
`infrastructure-report-queue-admission-mutation` (3), `infrastructure-report-queue-admission` (3),
`infrastructure-report-queue-fairness-closure-audit` (3),
`infrastructure-report-queue-fairness-dynamic` (2), `infrastructure-report-queue-fairness` (3),
`infrastructure-report-queue-recipient-fairness` (3),
`infrastructure-report-queue-recipient-negative` (3),
`infrastructure-report-queue-recipient-weighting` (3), `infrastructure-report-queue-starvation` (3),
`infrastructure-report-reconciliation` (3), `infrastructure-report-trust-recovery` (3),
`infrastructure-report-trust` (3).

**No production defect in this slice — stated plainly.** The whole batch exercises the rumor/queue
and route-belief surface of `societycore.js` (`RumorNetwork.publish`/`enqueue`/`expireStale`/`deliverDue`,
`SocietyCore.tick`/`deliverRumors`/`decayRouteBeliefs`, and the `INFRASTRUCTURE_ENCOUNTER_REPORT` →
belief → `TRADE_ROUTE_DECISION`/`ROAMING_GROUP_ROUTE_ENCOUNTER` path), and every assertion was read
against that code. The two claims worth keeping on record are the ones that measure production rather
than restate it: the trust suite's `1 → .5` and `.1 → .05` pair *is* `AgentBelief.addEvidence`'s
`weight = confidence × sourceTrust; confidence = (old + weight) / 2`, and the insertion-order case
discriminates (three equal-`deliveryTick` entries against `maxQueue = 2` evict `first` and keep
`[second, third]`, which a non-stable sort would not).

### Coverage-quality findings (recorded, not fixed — the suites are gone)

1. **An inert-field twin control — the first of the family batch 8 completes (five in all).**
   `infrastructure-report-trust-recovery`'s third case, "mutation control rejects hidden truth as a trust
   source", plants `actualDanger: 999` on the route and asserts the belief estimate is the reported `0`.
   `actualDanger` is read by **zero production modules** (verified: 0 matches across all eight), so both
   arms are identical by construction and the case cannot fail until production changes. Batch 6 checked
   its infrastructure mutation controls for exactly this flaw and cleared them; this one does not clear
   it. No production defect follows from it — see batch 8 for the full family and what the flaw does and
   does not mean.
2. **A weakened bound.** `infrastructure-report-queue-fairness`'s persistence case sets `maxQueue = 4`
   in its own fixture and then asserts `queue.length <= 8`. The `toEqual` round-trip beside it is real;
   the bound is not — it is looser than the contract the fixture declares and looser than what production
   guarantees.
3. **Two mirrored capacity assertions.** `rumors.length <= maxRumors` (closure audit) and
   `<= 2048` (two dynamic suites) restate the publish-path invariant (`publish` splices to `maxRumors`),
   so they hold whatever the queue logic does.
4. **A name that overstates its differential.** `infrastructure-report-queue-admission-mutation`'s first
   case is called "…through recipient service", but both runs deliver the urgent rumor; the only
   difference the case proves is the queue bound (6 vs 1000).
5. **Two decorative assertions** — `expect(actors).toHaveLength(4)` and `expect(actors[0].id).toBe('actor-0')`
   in the admission suite restate local fixtures.

| Suite | Verdict | Coverage lost |
|---|---|---|
| `infrastructure-report-expiry` | green, no defect | `expireStale` rule (queued rumors retained past `maxAge` while unqueued old ones go), route-belief decay, fresh-vs-stale strength, decayed-state persistence |
| `infrastructure-report-provenance` | green, no defect | the `provenance` record (`source`/`confidence`/`age`) that route decisions and roaming encounters publish |
| `infrastructure-report-queue-admission-dynamic` | green, no defect | sustained-churn admission across four capacity/recipient shapes, every recipient still served |
| `infrastructure-report-queue-admission-mutation` | green, no defect; differential is the bound, not service (finding 4) | bounded-vs-unbounded admission as an explicit mutation pair |
| `infrastructure-report-queue-admission` | green, no defect; two decorative assertions (finding 5) | burst admission mix, imminent-before-deferred admission, unbounded-admission starvation negative control |
| `infrastructure-report-queue-fairness-closure-audit` | green, no defect; one mirrored capacity assertion (finding 3) | the closure pass over four regimes with per-recipient delivery counts |
| `infrastructure-report-queue-fairness-dynamic` | green, no defect; one mirrored capacity assertion (finding 3) | 1000-item churn where deferred volume cannot displace an imminent report |
| `infrastructure-report-queue-fairness` | green, no defect; weakened bound (finding 2) | imminent-delivery protection when over capacity, and the eviction negative control proven by letting the evicted entry's own delay elapse |
| `infrastructure-report-queue-recipient-fairness` | green, no defect | per-recipient protection under a monopolizing flood, recipient spread through persistence, mixed-recipient churn |
| `infrastructure-report-queue-recipient-negative` | green, no defect + valid differential | bounded-vs-unbounded shed with the quiet recipient served in both, and recipient starvation asserted as zero beliefs |
| `infrastructure-report-queue-recipient-weighting` | green, no defect + discriminating case | unequal-volume protection and stable insertion order on equal priority |
| `infrastructure-report-queue-starvation` | green, no defect | an older valid deferred report surviving sustained urgent traffic |
| `infrastructure-report-reconciliation` | green, no defect | evidence history vs latest-wins estimate under contradictory reports, and actor-locality of contradictory beliefs |
| `infrastructure-report-trust-recovery` | green, no defect; one self-fulfilling control (finding 1) | trust-weighted refresh after staleness, and recovery state persisting actor-locally |
| `infrastructure-report-trust` | green, no defect | trust-weighted belief confidence, reliable-vs-weak influence on route choice, source trust through persistence |

### Instrument proven this pass (negative control)

This batch retired the family that carried the queue/belief coverage, so the instrument it leans on —
the counts derived from the runner — was driven with real injected drift: `README.md`'s live banner was
rewritten from `91 suites / 289 tests` to `90 suites / 288 tests`. `npm run gate:check` exited 1 and
named the site exactly:

    STALE: README.md: the current-gate banner is stale (should read "91 suites / 289 tests")

then the banner was restored byte-identically (a grep for the injected `90` across all four orientation
docs returns zero matches) and `gate:check` came back clean at 91/289, exit 0. The document guards in
`tools/doc-guards.mjs` (ledger citations, suite references, provenance hashes, next responsibility, CI
wiring) ran on that same path and reported nothing — this batch needed no salvage because none of the
fifteen names was cited outside this log, and the guards agree.

### De-citation performed for batch 7

**None needed.** Zero of the fifteen names appear in `README.md`, `completion-ledger.md`,
`docs/CAMPAIGN_STATE.md`, `docs/FEAR_AI_GLOBAL_WORK_LEDGER.md`,
`docs/IMPLEMENTATION_STATUS_2026-08-26.md`, `docs/SOURCE_ABSENT_RECONCILIATION.md`,
`legacy/PROVENANCE.md`, `.agents/` or `tools/` — the only mentions anywhere were this log's own resume
point, rewritten below. That is the same shape batch 6 recorded and found again here: the
`infrastructure-*` families were added as evidence and never woven into the orientation documents, so
retiring them costs the documents nothing and the suite-reference rule has nothing to catch.

## Batch 8 — retired 2026-09-23 (the next fifteen suites, alphabetically)

Run before removal: **15 suites / 64 cases green**: `infrastructure-route` (2),
`infrastructure-trust-calibration-negative` (4), `infrastructure-trust-calibration` (3),
`infrastructure-trust-encounter` (3), `infrastructure-wear-recovery` (4), `infrastructure-wear` (4),
`interactioncore` (3), `locality-causal` (3), `locality-graph-holdout` (4), `neural-fear-loop` (10),
`neural-fear-reopen` (8), `observation-belief` (2), `observation-hidden-truth-twin-audit` (2),
`observation-rumor-latency-decay` (11), `persistence-causal-chain` (1).

**No production defect in this slice — stated plainly.** The slice spans infrastructure
condition/availability (`INFRASTRUCTURE_WEAR`, `SETTLEMENT_INFRASTRUCTURE_MAINTENANCE`,
`ROUTE_TRAFFIC_DECAY`, `INFRASTRUCTURE_UPDATE`), the observation boundary (`ROUTE_OBSERVATION` and its
`_REJECTED` sibling), trust-gated encounters (`INFRASTRUCTURE_ENCOUNTER_REPORT` →
`ROAMING_GROUP_ROUTE_ENCOUNTER`), `InteractionCore`/`AdvisoryGate`, `NeuralFearModel`
predict/learn/forecast, and rumor latency/decay/relay. Every case was read against that code and the
exact numbers hold against it — the wear formula `min(condition, traffic × rate)` with a same-tick
`ROUTE_TRAFFIC_DECAY` taken as parent, the world-clock stamps (`deliveredAt 3`, `latency 2`), and the
neural chain `.5` prediction → `.4` dread → step capped at `.1` → production RAID candidate
`.35 → .30`.

### The hidden-truth twin controls cannot fail (five cases, one field)

Four of this batch's controls vary exactly one input — `actualDanger` on a route — and assert both arms
agree: `locality-causal` (`decide(0) === decide(100)`), `locality-graph-holdout` (the same twin),
`observation-hidden-truth-twin-audit` (`setup(0)` vs `setup(999)`) and
`infrastructure-trust-calibration-negative` (`-999` vs `999`). `actualDanger` is read by **zero
production modules** — 0 matches across all eight — and the route object keeps it only because
`RouteNetwork` spreads the edge, so both arms are identical by construction. By batch 6's standard for a
control (change an input and observe a genuinely different outcome) none of the four is a differential,
and with batch 7's `infrastructure-report-trust-recovery` case they form a **family of five over the
same inert field**.

To be precise about the label: they are not batch 5's defect (a mutated arm computed from a literal).
They name a real mutant — production starting to read hidden truth — and would fail if it ever did, so
they keep their value as tripwires; what they cannot be is the evidence that hidden truth is neutral
**today**, since that evidence is the source scan above (zero reads). That scan now has no owner at all,
these suites being its only carriers. If the owner wants the neutrality durable, its one-line home is
`tools/doc-guards.mjs` beside the provenance hashes — recorded, not added unilaterally in a deletion
pass.

### Other coverage-quality findings (recorded, not fixed)

- `infrastructure-trust-calibration`'s 1000-tick case is named "preserving conservation" but asserts no
  balance sheet; its `lootLoss ≥ 0` and `loot ≥ 0` checks restate production's own clamps, and two of its
  assertions are decorative (`expect(result.society ?? result.serialized).toBeTruthy()`,
  `toEqual(expect.objectContaining({ actors: expect.any(Object), events: expect.any(Array) }))`).
- `infrastructure-wear-recovery`'s `[0, 1]` bounds restate the `clamp` applied on write.
- `neural-fear-reopen`'s "the manifest no longer lists the row" pin (a closed row stays closed) is lost;
  its sha256/blob check is not — `npm run gate:check` owns that, and
  `docs/SOURCE_ABSENT_RECONCILIATION.md` now says so instead of citing the suite.

### Instrument proven this pass (negative control)

The de-citation sweep below is manual, and the suite-reference rule **cannot** catch a missed site: a
retired name is *registered* in this log, so citing it is accepted by design. What the rule must still
do is catch a name that is neither on disk nor registered, and with 90 names now retired the risk is a
blinded guard. Driven with real drift — `ghost-batch8.test.js` planted in `docs/CAMPAIGN_STATE.md` —
`npm run gate:check` exited 1 and named it:

    STALE: docs/CAMPAIGN_STATE.md: cites ghost-batch8.test.js, which is neither on disk nor registered in docs/SUITE_RETIREMENT_LOG.md

reverted byte-identically, gate clean again.

| Suite | Verdict | Coverage lost |
|---|---|---|
| `infrastructure-route` | green, no defect | condition 0 → `available: false` → `AVOID`/`INFRASTRUCTURE_UNAVAILABLE` supply feedback parented to the update, and its restoration |
| `infrastructure-trust-calibration-negative` | green, no defect + two valid controls (belief removed, stale confidence); one inert-field twin (above) | belief removal as a trust differential, staleness weakening influence while provenance survives |
| `infrastructure-trust-calibration` | green, no defect; conservation not actually asserted (finding) | non-saturated categorical RAID/PASS divergence by trust, and monotonic loot-vs-trust over 1000 ticks |
| `infrastructure-trust-encounter` | green, no defect + valid control with the loot balance sheet | trust-weighted encounter severity end-to-end |
| `infrastructure-wear-recovery` | green, no defect + valid zero-traffic control | traffic decay lowering later wear (same-tick parentage), maintenance sustaining a route after a shock |
| `infrastructure-wear` | green, no defect + valid zero-traffic control | traffic → bounded wear → `available: false`, and maintenance reversing it with parentage |
| `interactioncore` | green, no defect | affordance gating by type and prerequisite, and the advisory gate's refusal shape |
| `locality-causal` | green, no defect; one inert-field twin | out-of-range `ROUTE_OBSERVATION_REJECTED` with no belief created, distortion-additive perception, no `actualDanger` on stored evidence |
| `locality-graph-holdout` | green, no defect + one valid control; one inert-field twin | belief-driven route choice with `ROUTE_OBSERVATION` parentage, and continuation after a fresh deserialize |
| `neural-fear-loop` | green, no defect | the calibrated-forecast loop: sample/tolerance gates, deadband, blend/cap bounds, dread → fear and `opportunity`, the RAID-candidate move, save/load, determinism |
| `neural-fear-reopen` | green, no defect | lazy draw-free init (148 weights, once), architecture and legacy `[64, 32]` config, online learning proven by parameter diffs, early stopping, save/load incl. the uninitialized case, production chaining/guards/determinism |
| `observation-belief` | green, no defect | perceived-not-actual belief recording and world-timestamp preservation across save/load |
| `observation-hidden-truth-twin-audit` | green, no defect; one inert-field twin | decision invariance under changed hidden danger, and the no-leak serialization check |
| `observation-rumor-latency-decay` | green, no defect | the latency/decay/distortion/recipient-trust/relay-through-belief surface, incl. the `confidenceHalfLife` round-trip fix and the per-item half-life override |
| `persistence-causal-chain` | green, no defect | restart causal continuity: stage events parenting to their own TURN, allocator/seq continuation |

### De-citation performed for batch 8

Six of the fifteen were cited, at 24 sites across five documents: `README.md` (4),
`completion-ledger.md` (5), `docs/CAMPAIGN_STATE.md` (8), `docs/FEAR_AI_GLOBAL_WORK_LEDGER.md` (5) and
`docs/SOURCE_ABSENT_RECONCILIATION.md` (2). Two of the SOURCE_ABSENT sites were rewritten to point at
`npm run gate:check` rather than swapping one suite name for another, because that is what owns the
byte-exactness claim now. The nine uncited: `infrastructure-route`,
`infrastructure-trust-calibration`, `infrastructure-trust-calibration-negative`,
`infrastructure-trust-encounter`, `infrastructure-wear`, `infrastructure-wear-recovery`,
`locality-causal`, `locality-graph-holdout`, `observation-belief` — the shape batches 6 and 7 found.

## Batch 9 — retired 2026-09-23 (the next fifteen suites, alphabetically)

Run before removal: **15 suites / 44 cases green**: `personality-morale-ownership` (6),
`player-invasion-chain` (5), `queue-aware-economy-closure-audit` (3),
`queue-aware-economy-conservation-dynamic` (3), `queue-aware-economy-conservation` (4),
`queue-aware-economy-cross-market-closure-audit-dynamic` (1),
`queue-aware-economy-cross-market-closure-audit` (3), `queue-aware-economy-cross-market-dynamic` (2),
`queue-aware-economy-cross-market-multi-route-closure-audit-dynamic` (1),
`queue-aware-economy-cross-market-multi-route-closure-audit` (3),
`queue-aware-economy-cross-market-multi-route-dynamic` (2),
`queue-aware-economy-cross-market-multi-route` (4), `queue-aware-economy-cross-market-negative` (4),
`queue-aware-economy-cross-market-route-coupling-closure-audit` (2),
`queue-aware-economy-cross-market-route-coupling-dynamic` (1).

**No production defect in this slice — stated plainly.** Every case was read against the code it names:
`transferQueueAwareEconomicSupply` (candidate selection through `chooseRoute`, the access rule
`Boolean((routeIds.length || routeId) && (!selectedRoute || !selectedRoute.available))`,
`moved = accessBlocked ? 0 : min(requested, source stock)`, ledger entries written **only** when
`moved > 0`, and the returned `requested`/`routeIds`/`sourceStock`/`destinationStock` shape),
`applyQueueAwareSettlementEconomy` (consumption `min(requested, available)`, a history entry only when
consumed > 0, `unmet` drawn against settlement resources), the `Market` ledger and `balanceSheet()`,
the personality/morale path (`evaluationContext`, `Personality.decisionBandWidth`, `MORALE_UPDATE` →
`MORALE_SHIFT` at `1 + .01 + 10 × .01`), and the player chain (a lethal blow doubling pressure →
`200 ≥ 70` → WAR → loot `10` off the settlement's `40` with `warLoot` `10`).

Two of the batch's checks are genuinely load-bearing and worth naming: the multi-route dynamic case
re-derives production's `moved` and `accessBlocked` as **independent oracles** (a real differential,
unlike batch 8's inert-field twins), and `queue-aware-economy-cross-market-route-coupling-closure-audit`
plants the *value* `88888` in `actualDanger` and asserts the emitted event's JSON never contains it — a
value-level leak check, strictly stronger than a field-name check. Against that, much of the slice
restates by-construction invariants (contiguous `seq`, exact event counts, JSON round-trip) and the same
conservation triple at another scale, which is why fifteen suites buy 44 cases of which perhaps a third
is distinct content. That is the shape of this family, not a defect in it.

### Salvage — the hidden-truth invariant now has an owner

Batch 8 recorded that production's neutrality about hidden route truth rested on twin controls that
could not fail, and that deleting them left the invariant unowned. This pass carried it into the durable
guard, as batches 2–5 did for provenance and CI wiring: `tools/doc-guards.mjs` gained **`hiddenTruthInert`**,
about fifteen lines — the eight production modules, a scan for the token `actualDanger`, a failure when
a module is missing (a guard that cannot see its subject must fail, not pass), and one line in
`docProblems()`. No new file and no new tool; `npm run gate:check` is unchanged as the entry point.

Proved in both directions on the real tree. Injected into `chooseRoute`:

    if (!belief || !Number.isFinite(belief.estimate)) return num(route.actualDanger ?? route.perceivedDanger, 0);

`npm run gate:check` exited 1 with

    STALE: societycore.js: names the hidden-truth field `actualDanger` — production must never read it

and — the part that justifies the salvage — **`npm test` stayed green at 225/225 with that leak in
place.** The fourteen deleted twin-control cases were therefore not merely unable to fail; the entire
remaining corpus cannot see the mutant they were written for. Reverted byte-identically (0 occurrences
across all eight modules) and the gate came back clean at 76/225, exit 0. The guard's third branch was
driven too rather than asserted: with a non-existent module added to the list it exits 1 with
`the hidden-truth scan cannot see ghostmodule.js — this guard is blind`, then reverted.

### Other findings

- A name that overstates its behavior: `queue-aware-economy-cross-market-multi-route-closure-audit`'s
  third case is called "rejects invalid route references without mutation", but production deliberately
  does not reject — it returns `accessBlocked: true, moved: 0`, and the assertion is `.not.toThrow()`.
  The no-mutation half is the real content (same class as batch 7's finding 4).

### De-citation performed for batch 9

Only two of the fifteen were cited: `personality-morale-ownership` (5 sites — `README.md` 1,
`completion-ledger.md` 2, `docs/CAMPAIGN_STATE.md` 1, `docs/FEAR_AI_GLOBAL_WORK_LEDGER.md` 1) and
`player-invasion-chain` (4 sites — `completion-ledger.md` 1, `docs/CAMPAIGN_STATE.md` 1,
`docs/FEAR_AI_GLOBAL_WORK_LEDGER.md` 2); nine sites in four documents. The other thirteen are cited in
no prose document at all: the string `queue-aware` (case-insensitively) appears in **none** of the five
orientation documents, and no `queue-aware-economy*.test.js` name is cited anywhere outside this log. So
the remaining ~30 suites of that family are evidence for nothing but themselves, and batch 10's sweep
will be almost pure deletion work.

## Batch 10 — retired 2026-09-23 (the next fifteen suites, alphabetically)

Run before removal: **15 suites / 37 cases green**: `queue-aware-economy-cross-market-route-coupling`
(3), `-route-selection-closure-audit-dynamic` (1), `-route-selection-closure-audit-mutation` (3),
`-route-selection-closure-audit` (3), `-route-selection-fairness-dynamic` (1),
`-route-selection-fairness` (2), `-cross-market` (4), `queue-aware-economy-dynamic` (2),
`queue-aware-economy-event-dynamic` (2), `queue-aware-economy-event` (4),
`queue-aware-economy-explanation-negative` (3), `queue-aware-economy-explanation` (3),
`-route-traffic-consequence-closure-audit` (3), `-route-traffic-consequence-dynamic` (1),
`-route-traffic-consequence` (2).

**No production defect in this slice — stated plainly.** Every case was read against the code it names:
the access rule and `moved` arithmetic in `transferQueueAwareEconomicSupply` (goods spend once —
`routes.travel` clamps `traffic` while `receive` adds `moved` exactly once),
`applyQueueAwareSettlementEconomy` (`informationPenalty = confidence × reportedDanger ×
priceSensitivity`, `requested = demand × (1 + informationPenalty)`, `consumed = min(requested,
available)`, a history entry only when `consumed > 0`), `balanceSheet`'s branch table,
`decayTraffic`'s `×(1 - rate)`, `Market.update`'s `production`/`destruction`/`destroyed`/`discard`
arithmetic, and event allocation with its contiguous `seq`.

### Findings

- **A theatre control, third instance in the campaign.** `queue-aware-economy-explanation-negative`'s
  third case is named "detects a mutated explanation that asserts unsupported certainty", but it
  overwrites the event's *own* field with a string literal (`event.explanation = ['the route is
  certainly dangerous']`) and then asserts the literal differs from what it replaced and lacks a phrase
  it plainly lacks. Nothing production computes can affect either assertion — same class as batches 5
  and 7. The suite's *other* two cases (no delivered report → no demand influence; `actualDanger` never
  leaks into an explanation) are its real content.
- **A decorative assertion inside a genuine control.** `queue-aware-economy-event`'s mutation control
  decrements `market.stock.grain` directly and asserts `balanceSheet().balanced === false` — a real
  differential, since an unrecorded mutation cannot reconcile. Its second assertion,
  `expect(society.events).toHaveLength(0)`, is decoration: that world never ticks, so no event could
  exist regardless of the withdrawal.
- **A name that overstates its fixture.** `-route-selection-closure-audit`'s third case,
  "keeps deterministic choice stable for equal-cost candidates", zeroes `perceivedDanger` on one edge and
  draws the transfer twenty times. But `routeCost = travelTime + …`, and the fixtures are
  `travelTime: 2 / 5 / 9`, so no two candidates are ever equal-cost — the case actually asserts that the
  cheapest route wins deterministically, which is a real differential that its name does not describe.
- **A ledger label worth knowing.** `balanceSheet()` books `TRIP_IMPORT` — written by `receive()` — as
  `production`, so a destination market's "production" includes goods transferred in rather than created
  locally. Conservation still reconciles exactly; recorded so a later reader does not read `production`
  as locally-created stock.

### The conservation question, decided: the invariant moves to the durable guard

Batch 9 left this open. It is now settled by measurement, and the answer is both: **market-level
conservation is genuinely owned by surviving suites, and the queue-aware transfer's half of it was not
owned at all.** `trips-causality` survives with eight `balanceSheet()` assertions carrying independent
oracles (exact `tradeOut` 4 and 7, `destroyed` 3, `balanced` in four arms) and `routing-trade-economy`
survives asserting the two-market total conserved at 105 with both sides balanced. That covers the
`TRIP_EXPORT`/`TRIP_DESTRUCTION` branches of the ledger.

What no surviving suite covers is the `QUEUE_AWARE_CROSS_MARKET_EXPORT` pairing, and the reason it
cannot be left to `balanceSheet()` is structural: the exporter books the quantity as `tradeOut` and
reconciles, while an importer whose `receive` never happened has no history at all — so **both markets
report `balanced: true` while goods vanish.** The pair breaks silently. It was therefore landed, not
recorded as a loss: `tools/doc-guards.mjs` gained **`queueAwareConservation`**, ~13 lines, one entry in
`docProblems()`, no new file and no new tool.

It is a *runtime* rule rather than a source scan, and that choice is the point: the invariant is numeric
equality across two markets, which no text scan can check — a scan could only pin the three source lines
that currently implement the pairing, which is duplicated coverage of the code rather than a check on it.
The rule drives one transfer between two markets and asserts the world total is unchanged.

Proved in both directions. Injected `destination.receive(good, moved * .9)` and `npm run gate:check`
exited 1 with

    STALE: a queue-aware transfer of 4 shifted the world total by -0.40000000000000036 — goods may leave a market only by arriving at another

Unlike batch 9's salvage, the corpus is **not** blind to this mutant today — the derivation run also
named `queue-aware-economy-cross-market.test.js` as failing, and that suite is in this batch. So this is
a transfer of ownership ahead of deletion, and that suite's conservation cases are exactly what the rule
replaces. Reverted, gate clean. The rule's second branch exists because a vacuous control is the flaw
this campaign keeps finding: the fixture must *prove* it moved 4 goods, or a blocked route would satisfy
the sum trivially. Driven with `available: false` on the fixture's only route:

    STALE: the conservation fixture moved 0 instead of 4 — the sum below would hold vacuously

### De-citation performed for batch 10

**None was needed, and batch 9's warning is now measured rather than predicted.** All fifteen names were
grepped across `README.md`, `completion-ledger.md`, `legacy/PROVENANCE.md`, `.agents/`, `tools/` and all
six prose documents: zero hits outside this log. Batch 9 predicted batch 10's sweep would be "almost pure
deletion work" and that held exactly.

## Batch 11 — retired 2026-09-23 (one 19-suite family, one consolidated read)

**The slice shape was decided from the list, not from habit — and the list says the remaining corpus has
grown into exactly the cluster the last four batches kept finding.** Of the 46 suites, **19 are
`roaming-group-*`** (positions 7–25 alphabetically), so the ordinary fifteen-file slice would have
snapped the family in half. The measurements that made it one slice:

- **466 lines / 37 cases across 19 files** — about 24 lines and 2 cases per suite, and 17 of the 19 have
exactly 2 cases.
- **466 lines contain only 216 distinct lines** after number-normalisation (blank lines included), i.e.
  roughly **54% of the family is byte-identical boilerplate**: the same import 19×, the same
  `const society = new SocietyCore();` 35×, 37× `});`.
- **Two invariants restated at 19 scales.** 17 of the 19 assert the same
  `deserialize(JSON.parse(JSON.stringify(society.serialize()))).serialize()` round-trip, and 10 assert the
  same `expect(event.parentId).toBe(society.events.at(-N).id)` causal chain. Each suite is one behaviour
  case plus one negative-or-persistence case, and for most of them the persistence half *is* the
  round-trip.
- Both restated invariants are **heavily owned outside the family**: the round-trip is asserted by 18
  other surviving suites, `parentId` chains by 10, so retiring these 19 removes duplicated coverage, not
  coverage.

Run before removal: **19 suites / 37 cases green** — `consequences` 2, `decay` 2, `dependency` 2,
`encounter` 2, `loot-conservation` 2, `loot-consumer` 2, `mobility` 2, `needs` 2, `recovery` 2,
`route-risk` 2, `settlement-loot` 2, `settlement` 2, `supply-feedback` 3, `supply-recovery` 2,
`supply-shock` 2, `traffic-consumer` 2, `traffic-recovery` 2, `traffic-threshold-mutation` 1,
`traffic-threshold` 1.

### The read pass found a real production defect — and it was invisible to the whole corpus

Every case was checked against the handler it drives (`ROAMING_GROUP_EVALUATION`,
`_MOBILITY_ROUTE`, `_DEPENDENCY_DECAY`/`_EVALUATION`, `_LEGITIMACY_RECOVERY`, `_CONSEQUENCE`,
`_LOOT_CONSUMER`, `_LOOT_SETTLEMENT`, `_SETTLEMENT_INTERACTION`, `_SECURITY_SHOCK`, `_SUPPLY_FEEDBACK`,
`_TRAFFIC_CONSUMER`, `_ROUTE_RISK`, `_ROUTE_ENCOUNTER`, `ROUTE_TRAFFIC_DECAY`) and the arithmetic holds
throughout: `shortage 4 → pressure .8 → MIGRATION_PRESSURE`, the `min(foodPressure, raidYield)` selection
branch, `reliance .4 → ROAM`, `risk = perceivedDanger + traffic × trafficWeight = 2.5`, `congestion .9`,
`(1 - security × .5) → perceivedDanger .75`, the traffic clamp at `trafficCapacity` and decay to `75`,
`loot 5 - 2 = 3`, `supplySecurity .2 + 3 × .01 = .23`, and the `ROUTE_ENCOUNTER` yield path that adds to
both `loot` and `initialLoot` so the balance survives the raid.

What did not hold was the market ledger on the loot path. `ROAMING_GROUP_LOOT_SETTLEMENT` called
`market.receive()`, which pushes `TRIP_IMPORT`, and then pushed its own
`ROAMING_GROUP_LOOT_TRANSFER` — and `balanceSheet()` counts **both** as `production`. Measured directly:

    stock: 3 | history: TRIP_IMPORT:3, ROAMING_GROUP_LOOT_TRANSFER:3
    balanceSheet: {"initial":0,"production":6,"expected":6,"actual":3,"balanced":false}

So a market that received goods correctly reported itself unreconciled. **No test in the corpus could
see it**: `roaming-group-settlement-loot` asserts the group's `lootBalanceSheet` and the market's stock,
never the market's sheet, and the only other `balanceSheet` assertion in the family is on the
`ROAMING_GROUP_CONSUMPTION` (grain-aid) path, which books one entry and reconciles. Fixed in production:
the handler now adds the arrival inline and lets its own accurately-named entry be the single accounting
one — which is this codebase's own convention (`QUEUE_AWARE_CROSS_MARKET_EXPORT` books its own entry
rather than borrowing a generic one). The `receive()` call was also the source of batch 10's belt-and-
braces label finding (a loot market recording a `TRIP_IMPORT`), and the fix removes that too. Verified:
`stock: 3 | history: ROAMING_GROUP_LOOT_TRANSFER:3`, `expected 3 = actual 3`, `balanced: true`, group
sheet still `balanced: true`, and the full gate green at 46/144 — nothing depended on the duplicate.

### The pin: the conservation rule now carries this scenario, and the corpus is still blind to it

Batch 10's `queueAwareConservation` is now **`marketConservation`** (same rule, renamed because it
widened): it runs the cross-market scenario and now also drives one loot settlement into a market and
requires that market to reconcile, with its own vacuity guard (the fixture must move 3, or the
reconciliation would hold on an empty ledger). The batch-10 entry above refers to the rule by its name at
the time.

Proved in both directions. With the defect re-injected (`market.receive(good, amount)` restored),
`npm run gate:check` exits 1 with

    STALE: a market that received 3 loot reconciles to expected 6 against actual 3 — an arrival must be booked exactly once

**and `npm test` stays green at 144/144 with that defect in place** — the corpus-blindness proof that
justifies both the fix and the pin, in the same form batch 9 used for the hidden-truth leak. Restored and
clean.

### Other findings

- **Four more inert-field twins, and they cost nothing now.** `encounter`, `mobility`, `route-risk` and
  `traffic-consumer` each plant `actualDanger` (99, 99, 99/100, 100) and assert their arm behaves
  normally — batch 8's five-case family over a field production never reads. Unlike batch 8, retiring them
  leaves the invariant owned: batch 9's `hiddenTruthInert` scan is the owner, which is what that salvage
  was for.
- **A genuine differential control worth keeping on the record:** `roaming-group-traffic-threshold-mutation`
  drives the same handler at `(20, .5) → OPEN`, `(80, .5) → CONGESTED`, `(80, 2) → OPEN`, so it kills both
  a traffic mutant and a threshold mutant with asymmetric outcomes — not a restatement.
- **An inconsistency, not a defect:** `ROAMING_GROUP_LOOT_CONSUMER` pushes its
  `ROAMING_GROUP_LOOT_CONSUMPTION` entry even when `consumed === 0`, where the queue-aware and loot-transfer
  siblings all guard on `> 0`. It adds zero to `balanceSheet()`, so reconciliation is unaffected; recorded
  because the asymmetry is the kind a later reader would trip over.
- **A stale table the gate does not cover:** `README.md`'s module table claimed `societycore.js` at 1991
  lines against an actual 2050 (and `socialcore.js` at 967 against 969). No counting convention matches
  the claimed figure (2,053 non-blank / 1,710 non-comment), so it is drift, not a different unit. Corrected
  in place to the measured values — but **nothing enforces these numbers**, and this pass's own fix moved
  one of them, so the row will drift again. Recorded rather than instrumented: a sync rule for it is not
  something this pass was asked to add.

### De-citation performed for batch 11

**None needed, measured.** All nineteen names were grepped across `README.md`, `completion-ledger.md`,
`legacy/PROVENANCE.md`, `.agents/` and every document in `docs/`: the only hits are `docs/GATE_COUNTS.json`,
which `gate:sync` regenerates. The five occurrences of the word "roaming" in the orientation documents are
prose about the world module's scope, not suite citations.

## Batch 12 — retired 2026-09-23 (the ordinary alphabetical slice; the list does not cluster)

**The slice shape was decided by measuring the list, and this time the answer is the ordinary slice.**
Batch 11 found 19 of 46 suites in one near-duplicate family; the same measurements on the 27 remaining say
that family shape is gone:

- **The largest cluster is 7 of 27** (`settlement-*`, 26%) against 19 of 46 (41%) last pass.
- **The assertions are distinct.** Across the 27 suites, 584 `expect(` lines contain **508 distinct** after
  number-normalisation (87%) — batch 11's family restated one round-trip line 17× and one `parentId` chain
  10×. The `queue-aware-economy` four are 28/30 distinct and the `rumor-*` trio 66/72: neither is a family
  in the sense that mattered.
- The `settlement-*` seven do share boilerplate (316 lines, 129 distinct) but the repetition is **setup**
  (`const society = setup()`, the `bridge` fixture) and one `restored.serialize()` line 6×; each suite
  drives a different production action, and the suites are ~45 lines with 3–4 cases rather than 24-line
  stubs. So the boundary may split that seven (five here, two next) at the cost of one shared line.

Run before removal: **15 suites / 55 cases green** — `queue-aware-economy-route-traffic-risk-consequence-closure-audit`
1, `-risk-consequence-dynamic` 1, `-risk-consequence` 2, `queue-aware-economy` 4, `report-encounter-feedback`
3, `reputation-public-private` 6, `routing-trade-economy` 5, `rumor-identity` 5, `rumor-reputation-evidence`
6, `rumor-transport` 3, `settlement-adaptation-recovery` 3, `settlement-adaptation` 4,
`settlement-economic-recovery` 4, `settlement-maintenance` 4, `settlement-market-feedback` 4.

### Guard lost with each suite (the column that matters)

| Suite | Cases | Guard lost with it |
|---|---|---|
| `queue-aware-economy-route-traffic-risk-consequence-closure-audit` | 1 | The only check that one trip settles once: it drives `DELIVERED`/`STOLEN`/`BLOCKED` in a single turn and asserts a re-settle throws. |
| `…-risk-consequence-dynamic` | 1 | The long-horizon conservation fuzz: 3 seeds × 120 trips under route-availability churn, both sheets reconciled at the end. |
| `…-risk-consequence` | 2 | Risk-gated cargo loss (`perceivedDanger` 2 ≥ threshold → `STOLEN`, destination untouched) and that an unavailable route is `BLOCKED` even at `perceivedDanger` 9. |
| `queue-aware-economy` | 4 | The demand-vs-report differential (`reportedDanger` 0 before delivery, 3 after; `requested` 5 → >10) — the queue-aware demand path's last direct exerciser. Its hidden-truth arm is now owned by `hiddenTruthInert`. |
| `report-encounter-feedback` | 3 | Report → belief → later exposure (`lootLoss` .5 from trust-floored loss) including the pre-arrival arm — and **the group-side loot ledger, which this retirement orphaned** (see below). |
| `reputation-public-private` | 6 | The only machine check of the public/private split: blend math `(.5×0 + .75×1)/1 = .75` then `(.75+.25)/2 = .5`, per-observer isolation, seven guards before mutation, `evaluationContext` consumption, seeded-identical continuation. |
| `routing-trade-economy` | 5 | The merchant loop's exact conservation triple (`80`/`25`, two-market total `105`, both sheets reconciled) and its one validated lineage `TURN → PLAN → CREATE → SETTLE → UPDATE × 2`. |
| `rumor-identity` | 5 | Rumor id collision: monotonic counter, duplicate rejection, an explicit `rumor-1` reservation that the auto counter skips, and `seq` surviving save/load. |
| `rumor-reputation-evidence` | 6 | Arrived-evidence judging (verdict = arrived estimate clamped, weight = surviving confidence), delay attrition, the `reputation:` namespace guard, subject fallback, one private channel per recipient. |
| `rumor-transport` | 3 | Delivery not before its arrival tick, TTL expiry draining the queue, and relay hops carrying delay, distortion and the relay's evidence source. |
| `settlement-adaptation-recovery` | 3 | Adaptation reversing route failure end-to-end: `INFRASTRUCTURE_UPDATE` → `AVOID` → funded adaptation → `TRAVEL`, twice from a spent budget. |
| `settlement-adaptation` | 4 | The `.05`-per-unit stress-funded investment and its budget-empty arm (adaptation 0, condition 0, market sheet byte-unchanged). |
| `settlement-economic-recovery` | 4 | `TRADE_ROUTE_DECISION` → settlement resources gated on profitable *and* accessible access; blocked/unprofitable paths create nothing. |
| `settlement-maintenance` | 4 | `spent = min(amount, budget)`, the condition cap at `1`, and zero budget repairing nothing. |
| `settlement-market-feedback` | 4 | Failed infrastructure blocking market travel (`accessBlocked`, `WAIT`) and causally restoring it after adaptation, with the decision parented to the adaptation event. |

### No production defect this slice — stated plainly, and checked systematically

Every case was read against its handler (`MARKET_TRIP_SETTLE` ×3, `applyQueueAwareSettlementEconomy`,
`ROAMING_GROUP_ROUTE_ENCOUNTER`, `REPUTATION_JUDGE`, `MERCHANT_ECONOMY_CYCLE`, `RumorNetwork.publish`,
`RUMOR_DELIVER`, `SETTLEMENT_ADAPTATION`, `SETTLEMENT_INFRASTRUCTURE_MAINTENANCE`,
`TRADE_ROUTE_DECISION`) and the arithmetic holds, including `stress = (1 + min(1, 1/8) + 1)/3` with
`investment × .05`, `spent = min(10, 2)` against `effect 1 → condition 1`, and `resourceGain` gated on
`selected && settlement`.

Because batch 11's defect was a **double-booked ledger entry**, this pass checked that class directly
rather than by reading: every `market.history.push` kind was compared with the kinds `balanceSheet()`
counts. Fourteen kinds are pushed, ten are counted, and the four uncounted ones are metadata that cannot
break conservation — `TRIP_SETTLEMENT`, `TRIP_THEFT` and `TRIP_RETURN` (the movement is already booked by
`TRIP_EXPORT`/`TRIP_IMPORT`/`TRIP_DESTRUCTION`) and `QUEUE_AWARE_CROSS_MARKET_IMPORT` (whose arrival
`receive()` books as `TRIP_IMPORT`). That confirms the convention batch 11's fix restored: **one counted
entry per movement, every other entry metadata.** So the slice's verdict is a clean read, not a padded one.

### The orphan this slice created, and its one-line pin

`report-encounter-feedback` was the **last** suite asserting `lootBalanceSheet` — the group's own ledger
(`initial − destroyed − transferred = current`). The three roaming-group owners went in batch 11, so this
retirement left that invariant with **no owner at all**. `marketConservation` already drives exactly the
movement that exercises it, so the whole cost was two lines: the group's sheet must balance after it
sends 3 loot. Proved by injecting the mutant that removes the `lootTransferred` booking — `gate:check`
exits 1 with

    STALE: a group that transferred 3 loot reconciles to expected 5 against current 2 — an exit must be booked exactly once

**while `npm test` stays green at 107/107**, the corpus-blindness proof again: no surviving suite would
have caught it. Restored, clean.

### Other findings

- **Two more inert-field twins** (`settlement-market-feedback` case 3 and `queue-aware-economy` case 3,
  both planting `actualDanger: 999`) — the eighth and ninth in the campaign, and again costless to retire
  because `hiddenTruthInert` owns the invariant.
- **The settlement-7 boundary split is measured, not assumed:** five suites retire here, two
  (`resource-cap`, `resource-recovery-consumer`) remain for batch 13, and the only repeated assertion
  across the seven is one `restored.serialize()` line, so the split loses no consolidated read.

### De-citation performed for batch 12

**Fourteen sites across five documents** — the largest sweep since batch 8. `README.md` 2 (the event-ID
row and the reputation closure line), `completion-ledger.md` 5 (Rumors, Reputation/trust, Routing/trade,
Event-ID rows), `docs/CAMPAIGN_STATE.md` 4 (the auto-id defect, two suite bullets, the reputation-evidence
closure), `docs/FEAR_AI_GLOBAL_WORK_LEDGER.md` 5, `docs/IMPLEMENTATION_STATUS_2026-08-26.md` 1. Each now
names its suite as retired and points here; none quotes a case count the runner can no longer produce.

## Batch 13 — retired 2026-09-23 (the whole remainder; the repository now carries no suites)

**The slice is the whole remainder, and the resume point had already measured it: 12 suites, no family
larger than two, 52 cases.** The largest cluster is 2 (`settlement-resource-cap` / `-recovery-consumer`)
and the rest are singletons, so splitting it would have cost a consolidated read for nothing. Every suite
was run alone before removal.

Run before removal: **12 suites / 52 cases green** — `settlement-resource-cap` 4,
`settlement-resource-recovery-consumer` 4, `simulation-agents-combat-reopen` 12, `social-causal-chain` 3,
`societycore` 4, `source-absent-reconciliation` 4, `time-ownership` 3, `trip-ownership-holdout` 1,
`trips-causality` 5, `utility-affordance-runtime` 5, `world-loop` 1, `world-tick` 6.

**No production defect in this final read — stated plainly.** Every case was checked against the handler
or module it names: `MARKET_TRIP_CREATE`/`MARKET_TRIP_SETTLE` (delivery through
`destinationMarket.receive`, `TRIP_DESTRUCTION` on loss, `TRIP_RETURN`/`TRIP_THEFT` as metadata),
`Market.trade`/`flows`/`balanceSheet`, `worldStep`/`tick`/`step`, `FACTION_EVALUATION` and the
justice/legitimacy/migration primitives, `UtilityRuntime`/`AffordanceRegistry` delegation, the
actor/combat chain, `spreadRumor`/`RumorNetwork`, and the SOURCE_ABSENT manifest. The arithmetic holds
throughout. Batch 12's ledger convention check was re-run directly: **fourteen `market.history.push`
kinds, ten counted by `balanceSheet()`, four metadata** (`TRIP_SETTLEMENT`, `TRIP_THEFT`, `TRIP_RETURN`,
`QUEUE_AWARE_CROSS_MARKET_IMPORT`) — one counted entry per movement, nothing double-booked.

### Guard lost with each suite (the column that matters)

| Suite | Cases | Guard lost with it |
|---|---|---|
| `settlement-resource-cap` | 4 | `RESP-SETTLEMENT-RESOURCE-CAP-001` — a settlement's market resource gain is capped with the overflow recorded, blocked access cannot bypass the cap or create resources, capacity/overflow survive a fresh deserialize, and a zero-capacity control records **all** gains as overflow. |
| `settlement-resource-recovery-consumer` | 4 | `RESP-SETTLEMENT-RESOURCE-RECOVERY-CONSUMER-001` — the recovery budget is replenished from settlement resources, consumption cannot exceed what exists, consumer state persists, and a no-resources control leaves recovery unchanged. |
| `simulation-agents-combat-reopen` | 12 | `RESP-SIMULATION-AGENTS-COMBAT-REOPEN-001` — the three legacy sources byte-exact with provenance; the legacy lineage (family derivation, generation rule, parent/children), engagement window (idempotent open, stress ticker, one-way death), trauma model (`fear * 0.8` cap, `0.9995` decay, `> 0.3` floor), survival book (`.5` prior, context bonuses, choice-as-use, `.05` EMA), danger grid (50-unit cells, `danger > 2` gate), adaptation windows + the 50/100 caps; one engagement as a TURN-rooted chain with one uncommitted tail; casualties through the survival book into the migration decision; bloodshed through the one fear seam; the production seam guards; save/load + determinism. |
| `social-causal-chain` | 3 | The faction→justice→migration chain: `FACTION_EVALUATION` as a TURN child that mutates faction state, justice loss lowering legitimacy and raising migration pressure, and successful justice lowering grievance/migration **relative to** injustice. |
| `societycore` | 4 | The core smoke matrix: `spreadRumor` into belief state, a price update under shortage, cheapest-perceived-route choice with traffic tracking, and the crime/report/justice/legitimacy/migration primitives together. |
| `source-absent-reconciliation` | 4 | The manifest↔ledger row agreement and the no-extraction tripwire (both landed below), and the blob+sha256 re-resolution (accepted loss — needs a fetched `origin/master`). |
| `time-ownership` | 3 | `RESP-TIME-OWNERSHIP-001` — belief/evidence stamps come from the world clock (value 1, and `restored.now()` after save/load) and the eight-module wall-clock/RNG source scan. Both halves landed below. |
| `trip-ownership-holdout` | 1 | Cargo custody across a restart: `STOLEN` settles the origin to 15 with owner recorded and the sheet balanced, and `RETURNED` restores ownership exactly once after a fresh deserialize. |
| `trips-causality` | 5 | Observation→belief ordering as TURN children; origin material allocated into transit and settled exactly once; a declared loss **not** silently restoring stock; stolen/returned ownership recorded once; mass preserved across origin+destination on delivery. |
| `utility-affordance-runtime` | 5 | `RESP-UTILITY-AFFORDANCE-RUNTIME-001` — registry type-gating/duplicate rejection, DecisionCore delegation parity, shared-RNG band selection, `InteractionCore` runtime registration, and the society production paths all running through the one runtime. |
| `world-loop` | 1 | The canonical multi-system step: production + price-aware travel + faction state + delayed information in one `worldStep`, with the farm stock at 12, the four event types present, delayed rumor belief (4) landing only after delivery, and the market sheet balanced. |
| `world-tick` | 6 | `RESP-WORLD-TICK-001` — the clock (ticks from the clock, not array length), unique monotonic ids with ordered parentage and duplicate rejection, truthful oversell rejection + exact flow reconciliation, injectable-RNG determinism, actions as ordered TURN children, and unique-id continuation across serialize/deserialize. |

### The orphaned invariants, decided one at a time

Every invariant this batch orphaned was measured against the whole corpus first. Seven had their **only**
owner here — two named in advance (`trips-causality`'s market conservation and `time-ownership`'s scan)
and five found by measuring — so each needed either a durable home or a recorded loss. All seven were
landed in `tools/doc-guards.mjs`, each as its own named rule with the failure that created it written
above it.

| Invariant orphaned | Only owner retiring | Where it landed | Proof it fires |
|---|---|---|---|
| Market stock-and-flow conservation across a delivered/lost/oversold **trip**, on both sheets | `trips-causality`, `trip-ownership-holdout`, `world-loop` | extended `marketConservation` with the trip path | `destinationMarket.receive(trip.good, trip.quantity * .9)` → `a delivered trip left the pair's total at 11.6 instead of 12 — mass must survive the trip` |
| Wall-clock / global-RNG ownership, **structural** half | `time-ownership`, `world-tick` | new `timeOwnership`: the eight-module scan **plus** the belief-stamp check | `const guardProbe = Date.now();` in `macrocore.js` → `macrocore.js: references a wall-clock or global random source — the world clock and the injected RNG own both` |
| Wall-clock ownership, **behavioral** half (a belief stamped mid-run) | `time-ownership` | the same rule's second branch | `lastUpdated = evidence.timestamp + 1` → `a belief stamped 2/1 disagrees with the world clock 1` |
| Event-graph integrity (unique ids, tick from the clock, actions parented to TURN, impostors rejected) | `world-tick`, `trips-causality`, `simulation-agents-combat-reopen` | new `eventGraphIntegrity` | `commitEvent` duplicate guard broken → `a duplicate event id was accepted — the event graph must reject impostors` |
| Faction loot conservation (a won engagement moves loot, does not mint it) | `simulation-agents-combat-reopen` | new `factionLootConservation` | `winnerFaction.loot += stolen * 2` → `a won engagement left the factions' loot total at 100 from 80 — spoils transfer between owners, they are not minted` |
| SOURCE_ABSENT manifest ↔ ledger row agreement | `source-absent-reconciliation`, `simulation-agents-combat-reopen` | new `sourceAbsentRows` | manifest row renamed to `VR/biofeedback-ghost` → `docs/SOURCE_ABSENT_RECONCILIATION.md covers "VR/biofeedback-ghost", which is not a SOURCE_ABSENT row in completion-ledger.md` |
| SOURCE_ABSENT **no-extraction tripwire** (the re-open procedure's own "designed tripwire") | `source-absent-reconciliation` | a second branch of `sourceAbsentRows` | a stray `vrsystem.js` at the repo root → `vrsystem.js: a manifest source exists in this checkout — extraction must update the manifest and ledger in the same change` (and `ledgerCitations` fired too: `row "VR/biofeedback" is SOURCE_ABSENT but cites the existing file vrsystem.js`) |

**Accepted losses, each with its reason:** (1) the blob+sha256 re-resolution of the two still-absent
manifest rows — needs a fetched `origin/master` and the network, so a `gate:check` on a shallow or offline
checkout could not honor it; the rows are re-opened by hand, and the row agreement plus the no-extraction
tripwire are what the gate can own. (2) the ledger row's **provenance-wording** regex (`blob [0-9a-f]{40}`,
`upstream|origin/master`, manifest citation) — it pins prose, not behavior, and `sourceAbsentRows` already
owns the machine-readable half (which rows exist). (3) the per-feature contracts the table above names for
every other suite (settlement caps, the recovery consumer, justice/migration direction, registry
delegation parity, cargo custody, the core smoke matrix) — feature coverage, not cross-cutting invariants;
every prior batch retired that class, and the bar for a durable home is a structural rule the guard can
state in a few lines. `timeOwnership` and the trip path of `marketConservation` were the two the request
named specifically, and both were landed and proved.

### Instrument proof: each guard fires, and at the end the corpus is blind to all of them

The five rules and the two `sourceAbsentRows` branches were driven with real injected drift. On the
**pre-deletion** tree, `npm run gate:check` exited 1 naming each exactly (strings above), and the
derivation run also named the five files the corpus still uses to catch them
(`simulation-agents-combat-reopen`, `source-absent-reconciliation`, `time-ownership`, `trips-causality`,
`world-tick`). So unlike batches 9, 11 and 12 this is a straight **transfer of ownership as the owners
retire**, not a rescue of coverage the corpus never had: every orphaned invariant was still caught by the
suite that is leaving. Each mutation was reverted byte-identically and the gate came back clean.

The closing proof is the end state itself. With `tests/` empty (0 suites), two of the injections were
re-run and `npm run gate:check` still exited 1 with

    STALE: a delivered trip left the pair's total at 11.6 instead of 12 — mass must survive the trip
    STALE: macrocore.js: references a wall-clock or global random source — the world clock and the injected RNG own both

while **`npm test` exited 0** (`No tests found, exiting with code 0`) — the corpus cannot see either
defect because the corpus is gone, and the durable guards are now their sole owners. Reverted,
`gate:check` clean at 0/0.

The new `ciWiring` branch was proved too: removing `--passWithNoTests` from the test script makes
`gate:check` fail with `package.json: the test script lost \`--passWithNoTests\` — with the corpus
retired, an unadorned jest exits 1 and CI goes red on a green tree`.

### The empty-corpus end state, decided

Retiring the last suite raised a question no earlier batch faced: the owner's rule says the repository
carries **no** test suites, but plain `jest` exits 1 when it finds none, so `npm test` would fail CI on a
green tree. Measured rather than assumed: `jest --json --outputFile` **does** write a report with
`numTotalTestSuites: 0` even as it exits 1, so `gate-counts.mjs`'s `derive()` needs no change; the only
thing that needs the flag is the bare `npm test`. Decision: the test script is now
`node --experimental-vm-modules node_modules/jest/bin/jest.js --passWithNoTests`, `npm test` exits 0,
`derive()` reports **0 suites / 0 tests**, `docs/GATE_COUNTS.json` is `{suites: 0, tests: 0, casesByFile:
{}}`, and the seven live gate sentences read 0 suites / 0 tests. `npm run gate:check` remains the gate —
it runs the eleven document rules (which never depended on the suites) plus the counts — and `ciWiring`
guards the flag so the empty-corpus contract cannot be silently reverted.

### De-citation performed for batch 13

**Thirty-three citations across seven documents** — the largest sweep of the campaign. `README.md` 7 (the
canonical-setup line and four contract-table rows, one of them citing two names), `completion-ledger.md`
6 (the combat row, utility/affordances, world-tick, determinism, advisory gate, and the `VR/biofeedback`
row's guard pointer, which now names `npm run gate:check (sourceAbsentRows)`), `docs/CAMPAIGN_STATE.md` 8,
`docs/FEAR_AI_GLOBAL_WORK_LEDGER.md` 6, `docs/SOURCE_ABSENT_RECONCILIATION.md` 4 (two rewritten to point
at `sourceAbsentRows` rather than swap one suite name for another), `docs/IMPLEMENTATION_STATUS_2026-08-26.md`
1 and `docs/MONOREPO_RECONCILIATION.md` 1. Every site now names its suite in the bare form ("the
`world-tick` suite …") with the retirement date and a pointer here — the `.test.js` token is gone, which
is what the suite-reference rule requires. Verified mechanically: a repo-wide scan for all twelve names
returns **zero** hits outside this log.

## Running tally after thirteen batches

| | Baseline | Now | Removed |
|---|---|---|---|
| Suites | 166 | **0** | 166 |
| Cases | 575 | **0** | 575 |
| Verification lines | 10,045 | **0** | **10,045** |

Production is **3,130 lines** across the eight modules, measured and unchanged by this pass (its only
production edits were the injected mutants, all restored byte-identically). `tools/doc-guards.mjs` was
**239 lines** at the batch's close (291 after the same-day residue pass below) and holds the rules
harvested across the campaign — this batch added `timeOwnership`,
`eventGraphIntegrity`, `factionLootConservation`, `sourceAbsentRows` (with its second, no-extraction
branch), the trip path of `marketConservation`, and the `--passWithNoTests` clause of `ciWiring`. Retired
per batch: 3, 6, 12, 12, 12, 15, 15, 15, 15, 15, 19, 15, 12. Nothing is committed — the whole loop lives
in the working tree.

## End state: the repository carries no test suites

`tests/` is empty and **`npm test` exits 0**. The gate is `npm run gate:check` — the eleven document rules
in `tools/doc-guards.mjs` (ledger citations, suite references, provenance hashes, hidden-truth inertness,
market conservation, time ownership, event-graph integrity, faction-loot conservation, SOURCE_ABSENT rows,
next responsibility, CI wiring) plus the counts derived from the runner — and it is green at 0 suites / 0
tests, which is the honest number the runner produces. Coverage was not replaced by tests; where the
invariant was structural it was replaced by those rules, each of which was proved to fail on a real
injection before it was trusted. The campaign's evidence for the retired corpus remains in this file and
in the per-suite verification history it records; the suites themselves are gone by design.

## Residue closed after batch 13 (same day)

Batch 13 recorded three accepted losses and one standing risk. Two were closed immediately rather than
left as prose:

- **The SOURCE_ABSENT blob re-resolution is guarded again.** It was accepted out because it needs a
  fetched `origin/master`; the rule now performs it **where that remote is present** and skips it —
  never silently passes — where it is not (a shallow or offline checkout). Proved by flipping one hex
  digit of `vrsystem.js`'s pinned sha256: `STALE: vrsystem.js: origin/master blob
  ac84c092… hashes to d2a9c628…b4cd, but the manifest pins d2a9c628…b4ce`. With `origin/master`
  absent the branch is skipped, not failed, so a shallow checkout still gates.
- **The settlement resource ledger now has a durable owner.** The last structural feature contract
  without one — `RESP-SETTLEMENT-RESOURCE-CAP-001` and `RESP-SETTLEMENT-RESOURCE-RECOVERY-CONSUMER-001`
  — is a numeric conservation invariant like the others, so it is now the rule
  `settlementResourceLedger`: a gain is bounded by capacity with the excess recorded as overflow, an
  inaccessible route pays nothing, consumption is bounded by what exists, and the recovery budget
  accrues from exactly what was consumed. Proved by dropping the cap
  (`resourceGain = requestedResourceGain`): `STALE: a gain of 4 into capacity 5 left resources 8 and
  overflow 0 instead of 5/3 — a gain may not exceed capacity, and the excess must be recorded, not
  minted`.

The standing risk was the campaign's own recurring defect: **a guard that has only ever been exercised
passing.** `tools/guard-selftest.mjs` (`npm run gate:prove`) now closes it. It builds a throwaway tree
in the system temp dir holding copies of every file the rules read, points a `.git` gitfile at this
checkout so `origin/master` resolves exactly as CI's full checkout does, injects each rule's canonical
drift into the copy, and requires the rule's own message — the working tree is never touched. **Sixteen
drifts currently pass** (baseline clean; each rule can fail), covering all thirteen rules — three drifts
for `sourceAbsentRows` and two for `ciWiring`, one for each of the rest. It runs in CI after `gate:check`,
and `ciWiring` now guards that step, so the proof of the guards cannot itself silently disappear.

Remaining accepted losses after this pass: the ledger row's provenance-wording regex (prose, not
behavior) and the feature contracts that are not conservation invariants (the recovery-consumer shape,
registry delegation parity, cargo custody, the core smoke matrix). The blob re-resolution and the
settlement resource ledger are no longer among them.

## After retirement: the campaign's next responsibility was never a retirement job (same day)

The campaign's own last act was to name a next responsibility that had never been part of retirement at
all — `RESP-AUTONOMOUS-COMBAT-DEPLOY-001`, a PRODUCTION contract (factions raising and deploying their
own actors). It has now been built with the corpus already at zero suites, which makes it the first
contract here whose durable pin was a guard rule from the start instead of a suite harvested into one
later:

- `societycore.js`: `DEFAULT_COMBAT_POPULATION_CAP = 8` plus the new `COMBAT_RECRUIT_TICK` action. Each
  registered faction runs its OWN production evaluation on its own numeric state and, unless it holds,
  raises a levy and deploys it through the production `COMBAT_DEPLOY` tail — the legacy lineage rule is
  kept (a faction with nobody living raises the FOUNDER, generation 1 with no parent; a later levy is
  drawn off a living veteran as generation 0 naming it, and the veteran records the child), each
  faction's chain commits before the next allocates and the final tail returns uncommitted, a faction
  at the population bound records `POPULATION_BOUND` and one whose evaluation says `HOLD` records
  `DECLINED`. The default-off entry is `worldStep({ recruitTurns: true })`. The deletion-first trim that
  closed the pass factored the identical numeric-state context builder out of three copies — the
  faction macro tick, the macro combat tick and the self-raise tick all now score from one
  `SocietyCore.factionNumericContext(faction)` helper (same object, one definition).
- `tools/doc-guards.mjs` (334 lines with it): the `autonomousDeploy` rule, run by `npm run gate:check`,
  asserts what the
  retired suites would have — founder/descendant lineage with the child recorded on the veteran, every
  recruit parented to its tick and every self-raised deploy to its recruit, a clean `auditEventGraph()`,
  the bound held over five ticks at cap 2, a `HOLD` faction recording `DECLINED`, the cohort surviving
  save/load, and two identical seeded worlds reaching the same state (the contract's determinism half,
  which a probe alone would have left unpinned).
- `tools/guard-selftest.mjs`: the rule's clauses are individually falsified across six distinct drifts (cohort
  bound removed `cap + 99`, veteran lineage severed `parentId: null`, recruit tail parentage decoupled `tick`
  instead of `recruit`, HOLD-decision gate bypassed `false`, save/load state wiped `combat: null`, and determinism
  broken via static counter drift) — moving the selftest suite from 16 to 21 proven drifts killed by
  `npm run gate:prove`. Every assertion in `autonomousDeploy` is thus individually proved able to fail rather
  than exercising as an un-isolated conglomerate.

Evidence discipline for a suite-less contract: the behavioral claims above were read off a probe on the
real tree (two factions, three ticks — three levies each, all `RAID`, the first generation 1 with no
parent and two recorded children, later levies generation 0 naming it; `auditEventGraph()` clean; a
`populationCap` of 2 held across five ticks; a calm faction recording `DECLINED`; two identical seeded
worlds bit-identical after three ticks; the cohort bit-identical through serialize → deserialize), and the durable half of that probe is the rule, which
runs on every gate and in CI. It also moved the live line counts (societycore.js 2050 → 2097, the eight
modules 3,130 → 3,177 — the new contract, its action entry and the shared context helper the trim
factored out), which is exactly the drift batch 11 recorded as unenforced ("nothing enforces
these numbers") — the README's module table is corrected in the same pass and is still unguarded, by
design and by record. Development verification only, as everywhere in this repository: no supervisor
acceptance is claimed, and no stop certificate exists.

Remaining accepted losses are unchanged by this pass: the ledger row's provenance-wording regex and the
feature contracts that are not conservation invariants (the recovery-consumer shape, registry delegation
parity, cargo custody, the core smoke matrix). The new contract is not among them — its invariant is a
lineage/ownership one, which is exactly the kind that does become a rule.
