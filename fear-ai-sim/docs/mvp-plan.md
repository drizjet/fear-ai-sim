# Fear AI / BadAI — Comprehensive Product Specification and Build Plan

**Document status:** Planning baseline  
**Version:** 1.0  
**Date:** 2026-08-26  
**Scope:** Fear AI Evolution Simulator, its research workflow, and the proposed BadAI evolution  
**Authority:** This document is a plan. Repository code, tests, and runtime behavior are the authority for current implementation.

> **Important boundary:** This is the plan for the Fear AI / BadAI simulation project. It is not a plan for Freebuff Desktop. Freebuff may later become a tooling surface for this project, but the two products must not be conflated.

---

## 0. Executive direction

Fear AI is the existing simulation and research system. BadAI is the proposed long-term evolution: a perceived-reality simulation platform where agents, characters, caravans, towns, factions, and institutions make decisions from imperfect beliefs, emotional state, capabilities, norms, and goals.

The immediate objective is **not** to build every advanced system at once. The immediate objective is to establish a trustworthy, deterministic foundation and then add one complete, observable decision loop at a time.

### North-star loop

```text
Ground truth
  → perception
  → belief / uncertainty
  → appraisal
  → emotion and needs
  → affordances
  → hard prerequisites
  → utility scoring
  → intent
  → planning
  → execution
  → world consequence
  → memory, reputation, rumor
  → updated beliefs
```

### First strategic rule

Do not expand the feature list until the existing simulation has a verified baseline, an agreed state model, a single fear-scale contract, and a reproducible test harness.

---

## 1. Scope, identity, and outcomes

### 1.1 Product identity

| Item | Definition | Status |
|---|---|---|
| Current product | Fear AI Evolution Simulator with browser/Tauri/Electron surfaces and MASAC-related systems | Repository/documented; implementation details require verification |
| Long-term product | BadAI: perceived-reality simulation platform | Proposed |
| Core research question | How fear, uncertainty, emotion, memory, social information, and incentives alter individual and collective behavior | Project direction / design goal |
| First demonstrable result | A reproducible simulation where a threat changes beliefs, decisions, movement, and measurable outcomes | Target |

### 1.2 Primary users

1. **Researcher/designer:** creates scenarios, controls parameters, runs experiments, and exports data.
2. **Engineer:** extends mechanics without breaking deterministic behavior or provenance.
3. **Observer/player:** watches agents and understands why significant actions occurred.
4. **Future mod author:** defines actors, actions, response curves, doctrines, and worlds through data rather than code.

### 1.3 Product outcomes

The project succeeds when a user can:

- Start a reproducible run from a known seed.
- Inspect what the world actually contains.
- Distinguish actual danger from what each actor believes.
- Observe fear influencing behavior without a scripted outcome.
- See why an agent or faction selected an action.
- Export enough state and event data to reproduce and analyze the result.
- Add a new scenario or action without rewriting the core simulation.

### 1.4 Non-goals for the immediate build

- Claiming research findings are proof of project behavior.
- Replacing the deterministic core with an unrestricted LLM.
- Implementing every proposed system before validating the core contract.
- Building multiplayer, cloud infrastructure, or production deployment first.
- Rewriting working systems solely to match the BadAI name.
- Treating old status documents as current runtime truth without checking code and tests.

### 1.5 Part map and interaction policy

**Part 1 status:** `IN_REVIEW` — the protocol is documented in `docs/PROVENANCE.md`, the decision register is in `docs/DECISIONS.md`, and reusable record templates are in `docs/PROVENANCE_RECORD_TEMPLATES.md`.

**Part 0 status:** `PARTIALLY_COMPLETE` — baseline results are documented in `docs/BASELINE.md`; the current architecture map is documented in `docs/ARCHITECTURE.md`. Full module reachability, seeded smoke evidence, performance methodology, native packaging verification, and knowledge-database writeback remain before Part 0 is `VERIFIED`.

This plan is divided into work packages. The packages are ordered for risk reduction, not because later packages are forbidden from informing earlier ones.

| Part | Focus | Primary outputs | May revise or consume |
|---|---|---|---|
| 0 | Grounding | baseline and architecture map | all parts |
| 1 | Provenance | evidence protocol and decision register | all parts |
| 2 | State safety | numeric/state contracts | 3–12 |
| 3 | FearCore | fear transitions and parity | 2, 4, 5, 6, 11 |
| 4 | DecisionCore | affordance-to-execution contract | 3, 5, 7, 8, 9, 10 |
| 5 | Explainability/events | traces and causal events | all behavior parts |
| 6 | SocialCore | personality, morale, beliefs, rumors | 3, 4, 7, 8, 9, 10 |
| 7 | Interactions | actor/target behavior | 4, 5, 6, 8 |
| 8 | FactionCore | collective decisions | 4, 5, 6, 9, 10 |
| 9 | Routing/trade | economic and route loops | 5, 6, 8, 11 |
| 10 | Justice | crime/reporting/legitimacy | 5, 6, 8, 11 |
| 11 | Closed world | integrated emergent experiment | all previous parts |
| 12–14 | Research/advisory/platform | expansion | only after prerequisites |

A later part may expose a requirement missing from an earlier part. When that happens, update the earlier contract through a decision record; do not silently bypass it or pretend the later behavior was already supported.

---

## 2. Evidence and planning discipline

### 2.1 Required status labels

Every meaningful statement in future planning and implementation notes must use one of these labels when its status matters:

- **CODE_VERIFIED:** confirmed by current repository code.
- **RUNTIME_VERIFIED:** confirmed by an executed test, benchmark, or reproducible run.
- **TEST_VERIFIED:** covered by a passing automated test.
- **DOCUMENTED_CLAIM:** stated in an existing document but not independently confirmed.
- **RESEARCH_ONLY:** supported by external literature; not evidence of project implementation.
- **PROPOSED:** design idea not implemented.
- **ASSUMPTION:** temporary interpretation awaiting evidence.
- **UNKNOWN:** insufficient evidence.
- **STALE:** contradicted or superseded by newer evidence.

### 2.2 Source hierarchy

When sources disagree, use this order for current implementation facts:

1. Reproducible runtime behavior and passing tests.
2. Current source code and import/runtime wiring.
3. Current configuration and build artifacts.
4. Current project documentation.
5. Historical chats, audits, and status reports.
6. External research and assistant suggestions for design inspiration only.

Preserve conflicts rather than silently deleting them.

### 2.3 Required engineering record

For every non-trivial phase, record:

- What was believed before the work.
- What files and runtime paths were inspected.
- What changed.
- What was verified.
- What remains unknown.
- Which design decisions were made and why.
- Which tests and commands were run.
- What evidence should be added to the knowledge database.

The knowledge database is a provenance aid, not a substitute for repository verification. Historical tables remain read-only; new work belongs in the designated write-safe tables.

---

## 3. Current baseline: what we know and what we do not

This section must be updated as verification improves. It intentionally separates documented claims from confirmed facts.

### 3.1 Repository facts to maintain

| Area | Current evidence/status |
|---|---|
| Main implementation | JavaScript ES modules in the simulator repository; CODE_VERIFIED by repository inspection |
| Front ends | Browser/Vite plus Tauri/Electron-related surfaces are present; exact supported release path requires verification |
| Automated tests | A Jest test suite exists; current passing count must be re-run rather than copied from historical reports |
| Build | Vite build script exists; current build must be re-run for each release gate |
| Core entities | `Simulation`, `LearningAgent`, predators, environment and supporting systems exist in code |
| Fear/emotion logic | Live logic exists in `brain.js`, `emotions.js`, and related modules; exact ownership and scale must be documented before refactoring |
| Learning/RL | MASAC and related modules exist; completeness, training validity, and runtime wiring must be measured rather than assumed |
| Data/replay | Data bridge, exporters, replay, metrics, and FearDataGen-related modules exist; output contracts require a compatibility test |
| Knowledge package | `fear_ai_knowledge.db` and related exports exist outside or alongside the code workspace; provenance must be preserved |
| CI | A workflow exists under the application subtree; whether GitHub discovers it depends on the actual repository root and must be fixed/verified before relying on CI |

### 3.2 Known architecture risks

1. Multiple fear-state/threshold concepts may coexist across live, dead, Rust, and historical implementations.
2. Numeric scale conversions may be implicit; scale must be explicit in names, contracts, and tests.
3. Some modules may exist without being imported by the live loop.
4. Documentation may report features as complete when only prototypes, tests, or dead code exist.
5. The old simulator has broad scope, so adding systems without a vertical slice risks disconnected features.
6. Browser performance and RL training claims require reproducible benchmarks, not historical numbers.
7. Tauri and Electron surfaces may have different capabilities and security boundaries.

### 3.3 Baseline verification gate

Before implementing new mechanics:

- Run the full test suite.
- Run the build.
- Run syntax/static checks available in the repository.
- Record Node/package-manager versions.
- Confirm the actual Git root and CI working directory.
- Capture a seeded smoke run and state hash.
- Confirm which modules are reachable from the actual entry points.
- Record baseline performance for a small, medium, and stress population.

**Exit criterion:** baseline results are stored in a dated verification note and can be reproduced by another engineer.

---

## 4. Architecture: contracts before features

### 4.1 Layer boundaries

| Layer | Responsibility | Must not own |
|---|---|---|
| World state | Actual entities, resources, locations, events, rules | Individual beliefs or decisions |
| Perception | What an actor can sense and how observations are filtered | Omniscient world truth |
| Belief state | Actor/faction estimates, confidence, evidence age/source | Directly mutating reality |
| Appraisal | Threat, opportunity, controllability, blame, uncertainty, relevance | Choosing execution steps |
| Emotion/needs | Fear, anger, morale, energy, hunger, trauma, hope, etc. | Hard capability gates |
| Affordances | Actions potentially available to an actor/target pair | Utility preference |
| Prerequisites | Capability, resource, legal, cultural, and state validation | Soft scoring |
| Utility | Preference and trade-offs using response curves | Executing actions |
| Intent | Chosen action and target with trace | Direct world mutation |
| Planning | GOAP/HTN decomposition into achievable steps | Inventing illegal actions |
| Execution | Behavior tree/FSM/action executor | Rewriting intent silently |
| Consequences | World events and state changes | Hiding causal effects |
| Memory/social | Memory, reputation, rumors, belief updates | Omniscient correction |
| Metrics/export | Observations, traces, reproducibility data | Driving simulation behavior |

### 4.2 Ground truth and belief separation

Every state value must identify its epistemic type:

```text
GROUND_TRUTH
AGENT_BELIEF
FACTION_BELIEF
PUBLIC_RUMOR
PUBLIC_REPUTATION
INSTITUTIONAL_RECORD
PREDICTION
```

Names should make this visible. For example:

```text
enemyStrengthActual
enemyStrengthEstimate
routeDangerActual
routeDangerBelief
rumorConfidence
```

Never pass an actual value into a decision function where a belief is required without an explicit adapter and test.

### 4.3 Canonical decision contract

The project should converge on a shared decision record:

```js
{
  actorId,
  scope,                 // individual, group, faction, institution
  actionId,
  targetId: null,
  valid,
  blockers: [],
  considerations: [
    {
      id,
      rawValue,
      normalizedValue,
      responseCurve,
      contribution,
      sourceType           // actual, belief, memory, doctrine, derived
    }
  ],
  finalScore,
  selected,
  confidence,
  alternatives: [],
  createdAtTick,
  explanation: []
}
```

The trace is not merely a debug feature. It is required for research, balancing, bug diagnosis, and user trust.

### 4.4 Action pipeline

```text
Enumerate affordances
→ evaluate hard prerequisites
→ calculate utility considerations
→ rank eligible actions
→ select within policy/personality band
→ create intent
→ plan
→ execute
→ emit consequences
→ update memory/social/belief state
```

A missing prerequisite disqualifies an action. It must not be represented as a low preference score.

### 4.5 Determinism contract

For a fixed:

```text
scenario definition
seed
initial state
configuration
code version
```

 the simulation must produce the same deterministic outputs within the documented tolerance.

Randomness must be injectable or centrally managed. Time, network responses, and UI timing must not affect core simulation results.

---

## 5. Product capabilities, decomposed by area

### 5.1 Simulation control

**Capability:** configure and run a scenario.

Sub-capabilities:

- Select scenario and seed.
- Set population, predator/prey composition, environment, and duration.
- Start, pause, resume, step, and stop a run.
- Reset to initial state.
- Save/load a reproducible scenario configuration.
- Display tick, generation, population, and health metrics.

Acceptance criteria:

- Same seed/config produces matching state hashes.
- Pause/step does not advance hidden simulation time.
- Stop returns the UI to a usable state.
- Invalid configuration is rejected before run start.

### 5.2 Agent behavior

**Capability:** agents perceive threats and act according to state.

Sub-capabilities:

- Perception and threat extraction.
- Fear/emotion updates.
- State transitions with explicit thresholds and hysteresis.
- Movement/escape strategies.
- Energy, hunger, trauma, and recovery.
- Social grouping and contagion.
- Learning and adaptation.

Acceptance criteria:

- Every state transition has a testable reason.
- Invalid numeric inputs cannot produce NaN or Infinity in movement/state output.
- Dead agents cannot affect alive-only metrics unless explicitly intended.
- Behavior remains valid under zero, boundary, missing, and extreme values.

### 5.3 Research and data

**Capability:** produce useful, reproducible evidence.

Sub-capabilities:

- Seeded run metadata.
- Per-tick aggregate metrics.
- Optional agent-level samples.
- Event log with causal IDs.
- Decision traces.
- Replay and state snapshots.
- JSON/CSV/JSONL export.
- Dataset validation and balancing.
- Basic comparison between runs.

Acceptance criteria:

- Export includes seed, configuration, version, and timestamp.
- A replay can identify the originating run.
- Numeric fields stay numeric; display formatting happens only at UI boundaries.
- Export schema changes are versioned.

### 5.4 Visualization and inspection

**Capability:** understand the current world and why it changed.

Sub-capabilities:

- Main simulation view.
- Agent inspector.
- Fear/trauma/energy/morale view.
- Threat and action heatmaps.
- Replay controls.
- Analytics charts.
- Event and decision timeline.
- Explanation panel.

Acceptance criteria:

- The inspector identifies whether displayed values are actual, believed, derived, or formatted.
- The UI distinguishes no data, zero, unavailable, and failed calculation.
- Long runs do not make the UI unusable.

### 5.5 Performance and scale

**Capability:** run the largest supported scenario at a documented quality level.

Sub-capabilities:

- Spatial indexing.
- Object pooling.
- Level of detail.
- Web workers where appropriate.
- Frame-time monitoring.
- Memory-growth monitoring.
- Headless batch mode.

Acceptance criteria:

- Benchmarks use a fixed scenario and seed.
- Results report median and tail frame/update times, not only a best FPS.
- Performance optimizations cannot change deterministic outcomes without an explicit policy.

### 5.6 Learning and reinforcement systems

**Capability:** compare scripted/statistical/RL behavior without confusing training with validation.

Sub-capabilities:

- Separate training mode from evaluation mode.
- Versioned model/checkpoint metadata.
- Replay buffer validation.
- Reward definition and component logging.
- Policy/action validity checks.
- Baseline policy for comparison.
- Learning curve and confidence reporting.

Acceptance criteria:

- A model cannot issue an action outside the affordance/prerequisite contract.
- Training and evaluation seeds are separated.
- Claims such as “learns” or “better” require a defined metric and comparison baseline.

### 5.7 Provenance and knowledge workflow

**Capability:** preserve project history while distinguishing fact, proposal, and research.

Sub-capabilities:

- Claim/source/evidence records.
- Implementation evidence.
- Design proposals.
- Worklog entries.
- Contradiction and supersession links.
- Coverage status for chats/documents.

Acceptance criteria:

- No historical record is overwritten to make it look current.
- Every new implementation claim links to code/test evidence.
- Every research-derived design remains labeled RESEARCH_ONLY or PROPOSED until implemented and verified.

---

## 6. FearCore specification

### 6.1 Goal

Create one authoritative fear-state pipeline before adding macro behavior.

### 6.2 Required decisions

Resolve and document:

1. Canonical internal fear scale.
2. Public/UI scale, if different.
3. Threshold units and conversion functions.
4. State names and allowed transitions.
5. Entry and exit thresholds.
6. Panic lock semantics.
7. Habituation ownership and stimulus categories.
8. Trauma interaction.
9. Mirror-fear/contagion interaction.
10. Interaction with anger, morale, energy, and learning policy.

### 6.3 Safe contract

Do not change thresholds based only on a historical document. First inspect the Rust lane/source or other authoritative implementation, create table-driven parity vectors, then change the JavaScript behavior behind regression tests.

### 6.4 FearCore tests

- Exact entry boundary for every state.
- Exact exit boundary for every state.
- No skipped state unless explicitly specified.
- Panic lock cannot release early.
- Panic lock releases at the documented tick.
- Repeated stimuli and habituation behavior.
- Novel versus familiar stimulus.
- Trauma fade and reactivation.
- Mirror fear with zero, normal, and extreme inputs.
- NaN, Infinity, null, missing, negative, and oversized inputs.
- Deterministic transition sequence.
- No invalid movement output after fear update.

---

## 7. DecisionCore specification

### 7.1 Goal

Replace disconnected behavior selection with a reusable, explainable action architecture.

### 7.2 Required stages

#### Stage A — Affordance catalog

Start with existing actions and add new actions only when they have:

- Stable ID.
- Actor/target contract.
- Preconditions.
- Costs/resources.
- Effects.
- Failure modes.
- Test fixtures.
- Explanation metadata.

#### Stage B — Hard prerequisites

Check:

- Capability.
- Target validity.
- Distance/visibility.
- Resource availability.
- Cooldowns.
- Legal and cultural rules.
- Faction doctrine prohibitions.
- World state.

#### Stage C — Utility considerations

Each consideration must declare:

- Input source.
- Epistemic type.
- Normalization range.
- Response curve.
- Weight.
- Whether it can disqualify.
- Explanation label.

#### Stage D — Selection policy

Do not always select the absolute maximum. Select from an eligible near-best band, with band width controlled by personality, doctrine, and uncertainty. This must be deterministic under a seeded RNG.

#### Stage E — Planning and execution

Planning turns intent into steps. Execution handles movement, interruption, failure, and partial completion. The planner must not bypass prerequisites.

### 7.3 First vertical slice

Implement one fully traceable action from each scale only after the individual slice is stable:

1. Individual: flee or hide.
2. Character interaction: observe or recruit.
3. Faction: scout or raid.
4. Economy: choose a route.

The first slice should use a small catalog and excellent traces rather than a large catalog with missing semantics.

---

## 8. SocialCore specification

### 8.1 Personality

Personality should influence response curves, risk tolerance, planning interval, social weighting, and selection variance. It must not secretly alter hard prerequisites.

Current OCEAN-like traits in existing code are a baseline claim requiring importer/runtime verification before being declared the canonical personality system.

### 8.2 Morale

Morale becomes first-class only after its scope is defined:

- Individual morale.
- Group morale.
- Faction morale.
- Relationship to fear, energy, losses, legitimacy, and hope.

Define whether morale is a cause, an output, or both. Prevent circular updates from becoming unbounded feedback.

### 8.3 Beliefs and evidence

Represent evidence with:

```text
claim
subject
estimate
source
sourceTrust
confidence
timestamp
location
emotionalIntensity
factionBias
supportingEvidence
contradictingEvidence
```

Belief updates must have explicit rules for decay, corroboration, contradiction, and source reliability.

### 8.4 Rumors and reputation

A rumor is not ground truth. It is information with a source, path, mutation risk, audience, confidence, and social effect. Reputation must distinguish private knowledge, public belief, institutional record, and actual behavior.

### 8.5 SocialCore tests

- Evidence confidence decays as configured.
- Trusted and untrusted sources produce different updates.
- Corroboration increases confidence without making certainty automatic.
- Rumors mutate according to explicit rules.
- Public and private beliefs diverge.
- Deception can produce wrong but internally coherent decisions.
- Social effects are reproducible under a seed.

---

## 9. MacroCore specification

### 9.1 Factions

Faction decisions must use estimates, not omniscient actuals. Required state categories:

- Threat and threat confidence.
- Enemy strength estimate.
- Enemy intent estimate.
- Military confidence.
- Resource need.
- Grievance and anger.
- Legitimacy and domestic support.
- Alliance confidence.
- Supply security.
- Doctrine and risk tolerance.
- Recent losses/humiliation.
- Opportunity.

Escalation levels are outputs of the state and decision model, not the entire faction brain.

### 9.2 Trade and routing

A route model must distinguish:

- Actual danger.
- Known danger.
- Perceived danger.
- Information confidence.
- Fear sensitivity.
- Familiarity.
- Escort confidence.
- Political/legal/weather/toll costs.
- Predictability and adversarial adaptation.

The first route experiment should measure whether attacks, rumors, and route changes produce a feedback loop without a direct relocation script.

### 9.3 Crime and justice

Proposed equations from the knowledge archive remain PROPOSED until implemented and validated. Each equation requires:

- Named inputs.
- Units/ranges.
- Ground-truth versus belief mapping.
- Calibration method.
- Sensitivity tests.
- Boundary behavior.
- Comparison against a baseline.

### 9.4 MacroCore flagship experiment

Use a small closed world:

- Two towns.
- Three routes.
- Two factions.
- One bandit group.
- Merchants, civilians, guards, and optional supernatural actors.
- Seeded events and observable metrics.

Demonstrate one causal chain such as:

```text
attack
→ witness fear
→ rumor
→ perceived route danger
→ route choice
→ trade volume
→ scarcity/price change
→ bandit relocation
→ faction opportunity estimate
→ raid decision
```

A chain step must be caused by the shared systems, not hardcoded as a cinematic sequence.

---

## 10. External advisory and LLM boundary

Any future LLM integration is advisory only.

```text
LLM suggestion
→ schema validation
→ action registry lookup
→ prerequisite validation
→ policy/safety validation
→ deterministic intent
→ planner
→ executor
```

The LLM may not:

- Mutate world state directly.
- Bypass action prerequisites.
- Execute arbitrary code.
- Invent unavailable capabilities.
- Claim verification it did not observe.
- Convert research into implementation status.

Every accepted or rejected suggestion should be logged with the validator result.

---

## 11. UX and observability requirements

### 11.1 Required run states

```text
READY
CONFIGURING
RUNNING
PAUSED
STEPPING
ERROR
COMPLETED
CANCELLED
EXPORTING
```

### 11.2 Required inspection panels

- Run configuration and seed.
- World overview.
- Selected entity.
- Fear/emotion state.
- Belief versus ground truth.
- Available actions and blockers.
- Decision trace and alternatives.
- Event/cause timeline.
- Metrics and charts.
- Replay/export status.

### 11.3 Honest display rules

- Format numbers only at display boundaries.
- Show unavailable separately from zero.
- Show stale data explicitly.
- Never hide failed calculations.
- Identify whether a value is actual, estimated, rumored, or derived.
- Keep a visible run identifier and seed.

---

## 12. Reliability, safety, and security

### 12.1 Numeric safety

All public subsystem boundaries must validate numeric inputs. Use non-coercive finite checks, explicit defaults, range clamps where semantically correct, and tests for invalid values.

### 12.2 Resource safety

- Bound population and sample sizes.
- Bound replay/event history or use documented rotation.
- Avoid unbounded per-agent arrays.
- Monitor heap growth during long runs.
- Clean up workers, timers, listeners, and replay buffers.

### 12.3 Execution safety

- Keep evaluation/debug features development-only.
- Do not ship arbitrary evaluation hooks.
- Keep DevTools and diagnostics behind explicit development controls.
- Review CSP and desktop capabilities before release.
- Treat exports and imported scenarios as untrusted data.

### 12.4 Failure policy

When a subsystem fails:

1. Preserve the error and run ID.
2. Identify whether state was mutated.
3. Stop or isolate the affected operation.
4. Keep the rest of the interface usable.
5. Mark the run incomplete or invalid.
6. Offer a safe retry or export of diagnostic data.

---

## 13. Testing and validation strategy

### 13.1 Test layers

1. **Unit:** formulas, clamps, transitions, curves, serialization.
2. **Contract:** action schemas, event schemas, export schemas.
3. **Integration:** simulation tick, perception-to-decision, planner-to-executor.
4. **Determinism:** fixed seed, state hashes, replay consistency.
5. **Regression:** inherited Fear AI behavior that is intentionally retained.
6. **Property/fuzz:** invalid, boundary, and randomized inputs.
7. **Performance:** fixed scenarios at defined population sizes.
8. **Research validity:** baseline comparison, metrics, confidence intervals where appropriate.
9. **UI/smoke:** controls, pause, reset, inspector, export, error states.

### 13.2 Minimum release gate

A phase cannot be called complete until:

- Relevant tests pass.
- Build passes.
- No new NaN/Infinity paths are detected.
- Determinism check passes or documented nondeterminism is intentional.
- Performance is measured against the phase budget.
- Documentation and evidence records are updated.
- Known failures are listed honestly.

### 13.3 Test fixture policy

Every new mechanic gets:

- Minimal happy-path fixture.
- Boundary fixture.
- Invalid-input fixture.
- Interaction fixture.
- Deterministic replay fixture.
- Explanation/trace fixture.

---

## 14. Delivery roadmap with hard exits

### Phase 0 — Grounding and inheritance lock

**Purpose:** establish reality before redesign.

Work:

- Re-run baseline tests/build/checks.
- Confirm repository root and CI discovery.
- Map actual entry points and imported modules.
- Verify fear/emotion ownership and scales.
- Read/verify the Rust parity source or mark it unavailable.
- Create the evidence and decision log.
- Refresh stale status documentation with dated labels.

Exit:

- Reproducible baseline.
- Current architecture map.
- Explicit unknowns.
- No unresolved ambiguity about the first implementation target.

### Phase 1 — FearCore parity and stability

Work:

- Lock canonical scale.
- Add table-driven parity oracle.
- Implement tested state transitions and panic lock.
- Decide whether/how to revive hysteresis and habituation.
- Preserve intentional inherited behavior with regression tests.
- Add numeric-safety sweep.

Exit:

- Fear transitions are documented and test-verified.
- No invalid state/movement outputs under fuzz/boundary tests.
- Divergence from the Rust target is explicit, not accidental.

### Phase 2 — DecisionCore vertical slice

Work:

- Define action schema.
- Separate affordances, prerequisites, utility, planning, execution.
- Wire one existing action through the complete pipeline.
- Produce decision traces and alternatives.
- Keep old paths behind compatibility tests until migration is proven.

Exit:

- One action is end-to-end, explainable, deterministic, and regression-tested.

### Phase 3 — SocialCore

Work:

- First-class personality and morale contracts.
- Belief/evidence model.
- Rumor propagation.
- Reputation/trust integration.
- Social feedback metrics.

Exit:

- A rumor can change a belief and produce a changed decision without direct scripting.

### Phase 4 — MacroCore closed world

Work:

- Faction state and escalation.
- Route/trade model.
- Bandit/adversarial adaptation.
- Crime, reporting, justice, legitimacy as separate slices.
- Closed-world scenario runner and dashboard.

Exit:

- At least one multi-step emergent chain is reproduced and explained from event logs.

### Phase 5 — Research platform

Work:

- Scenario definitions.
- Batch/headless runs.
- Versioned exports.
- Experiment comparison.
- Statistical summaries.
- Provenance-linked reports.

Exit:

- Another user can run a documented experiment and reproduce its headline result.

### Phase 6 — Advisory/modding surface

Work:

- Data-driven action/actor definitions.
- Scenario editor.
- Validator-gated advisory model.
- Import/export validation.
- Mod API and compatibility versioning.

Exit:

- A new scenario can be built without modifying core decision code.

### Phase 7 — Platform expansion

Work only after prior exits:

- Elixir/backend experiments.
- Larger populations.
- VR/spectator surfaces.
- Multiplayer or remote execution.
- Packaging and distribution.

Exit:

- Scale and platform claims have measured budgets and operational documentation.

---

## 15. Prioritization framework

Use this order for any proposed task:

### P0 — Trust and correctness

- Data corruption.
- NaN/Infinity/state invalidity.
- Determinism failures.
- Security boundaries.
- Misleading verification/status.
- Broken CI or unreproducible baseline.

### P1 — Core loop

- FearCore contract.
- Decision pipeline.
- Planning/execution wiring.
- Event and trace model.
- Reproducible scenario runner.

### P2 — Meaningful emergence

- Beliefs, rumors, reputation.
- Morale/personality.
- Factions, routes, trade, justice.

### P3 — Scale and presentation

- Advanced visualization.
- RL improvements.
- VR, multiplayer, cloud, packaging.

A feature may move upward only when a concrete user/research outcome and verification plan are defined.

---

## 16. Decision log template

Every consequential design decision should use this format:

```text
Decision ID:
Date:
Question:
Options considered:
Recommendation:
Decision:
Why:
Evidence:
Assumptions:
Rejected alternatives:
Compatibility impact:
Tests required:
Revisit condition:
Status:
```

Initial decisions to resolve:

- Canonical fear scale.
- Rust-to-JavaScript parity mapping.
- Panic lock versus general minimum-duration hysteresis.
- Inline versus stimulus-aware habituation.
- GOAP/HTN planner ownership and behavior-tree execution boundary.
- Morale scope and update ownership.
- Whether BadAI is a rename, successor, or separate package.
- Which orphaned modules are revived, archived, or deleted.
- Whether and how the knowledge database is bundled into the research workflow.

---

## 17. Documentation set

Maintain these documents with clear ownership:

| Document | Purpose |
|---|---|
| `docs/mvp-plan.md` | This comprehensive product/build plan |
| `docs/BADAI_MASTER_SPEC.md` | Long-term BadAI architecture and epochs |
| `docs/RUST_PARITY.md` | Exact cross-language behavior matrix and vectors |
| `docs/ARCHITECTURE.md` | Current implemented runtime architecture and grounding map |
| `docs/DECISIONS.md` | Accepted/rejected design decisions |
| `docs/EXPERIMENTS.md` | Reproducible scenarios and research protocols |
| `docs/DATA_SCHEMA.md` | Event, export, trace, and snapshot contracts |
| `docs/SECURITY.md` | Desktop/browser boundaries and release checks |
| `docs/CHANGELOG.md` | User-visible and behavior-significant changes |
| `docs/BASELINE.md` | Dated Part 0 verification results, risks, and unknowns |

Historical documents should remain available, but current documents must include dates and status labels.

---

## 18. Immediate next actions

The next work session should perform only these tasks:

1. Verify the current baseline with tests, build, syntax checks, and a seeded smoke run.
2. Confirm the true Git root and repair CI placement/working directory if necessary.
3. Read the authoritative Rust fear implementation or explicitly record it as unavailable.
4. Create `docs/RUST_PARITY.md` with source references, scales, transitions, and test vectors.
5. Resolve the first decision: canonical internal fear scale.
6. Choose one FearCore vertical slice and implement it with tests.
7. Update the knowledge database only with evidence/proposal/worklog rows after backup.

Do not begin Morale, trade, faction warfare, LLM integration, VR, or a large action catalog until the Phase 0/1 exits are met.

---

## 19. Definition of done for the first meaningful release

The first meaningful release is complete when:

- A seeded scenario runs from a documented configuration.
- Fear state transitions have one authoritative contract.
- At least one action uses affordance → prerequisite → utility → plan → execution.
- The action produces an explainable trace.
- World events and consequences are logged.
- Actual state and actor belief are visibly separate.
- Replay/export includes enough metadata for reproduction.
- Invalid inputs are safely handled.
- Tests cover normal, boundary, invalid, deterministic, and integration paths.
- Build and CI are reproducible.
- Documentation states what is implemented, proposed, stale, and unknown.

That is the foundation on which the larger BadAI vision can safely be built.
