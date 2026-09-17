---
title: "Fear AI — Authoritative Current Truth Ledger"
created: 2026-09-17
updated: 2026-09-17
type: specification
status: active
---

# Fear AI — Authoritative Current Truth Ledger

**Document Version**: 1.2.0-CERTIFIED  
**Date**: September 17, 2026  
**Auditor / Maintainer**: Antigravity Cognitive Assistant  
**Repository**: `C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim`  
**Sibling Host Repository**: `C:\tools\03-Projects\lains Tools\New Master Game` (commit `db19d1fb6`)  
**Standard**: Reconciled Evidence Protocol (First-Principles Manual Audit + Deterministic Scenario Proof; Hard Rule 9: Zero Automated Test Runners)

---

## 1. Purpose & Operating Principles

This ledger establishes the **single authoritative status record** for every live capability across the Fear AI middleware system. It supersedes all legacy checklists (including `PROJECT_STATUS.md` and historical evidence JSON dumps) and enforces four core operating principles:

1. **Host Game Authority Invariant**: Fear AI is strictly non-mutating intelligence middleware. The host game engine retains 100% exclusive authority over transforms, movement, physics, pathfinding, combat, damage, spawning, and inventory. Fear AI emits non-binding advisory intent vectors and affective state signals only.
2. **Zero Fabrication & Parity Standard**: A feature is not complete because a file exists, a test passed historically, or an audit counted it. A capability is certified only when its contracts, live callers, consumers, persistence lifecycle, authority boundaries, and known failure modes are mathematically verified.
3. **Modular Release Tiering**:
   - **Tier 1: Core Affective SDK**: The foundational deterministic runtime (`FearCore`, `AffectiveAgent`, `RuntimeSimulation`, `BinaryWireProtocol`, `HostCapabilityNegotiator`).
   - **Tier 2: Optional Modular Extensions**: Standalone plug-in systems for tactical coordination, social rumors, and macroeconomics (`PackCoordinationEngine`, `EpistemicBeliefEngine`, `EconomicFeedbackSystem`, `SettlementMigrationSystem`).
   - **Tier 3: Tooling & Analytics**: Visual inspection, replay, and causal analytics (`DesignerDashboardServer`, `WorldCounterfactualEngine`).
   - **Tier 4: Engine Adapters**: Host engine bridges (`Godot 4.6`, `Unity UPM`, `Unreal Engine 5`).
   - **Tier 5: Research & Experimental**: Unfinished research frontiers (`FABE Functional Persona Signatures`, `MoralDissonanceEngine`).
4. **Controlled Status Taxonomy**:
   - `VERIFIED_CURRENT`: Fully implemented, verified via line-by-line first-principles source audit, actively wired into callers and consumers, and proven via standalone deterministic verification scripts.
   - `PARTIAL`: Code exists and runs, but has known missing persistence, incomplete editor verification, or unverified wiring.
   - `EXPERIMENTAL`: Code exists as a prototype or research model, but lacks a live host consumer or has unresolved stability/entanglement challenges.
   - `BLOCKED`: Development or certification is blocked on external resources (e.g. human participant evaluations).
   - `DEFERRED`: Intentionally postponed by owner policy decision (e.g. Unreal Engine 5).
   - `HISTORICAL`: Preserved legacy research or early browser simulation capability.

---

## 2. Core Middleware Status Matrix

| Capability / Subsystem | Current Status | Primary Source Files / Symbols | Live Caller | Downstream Consumer | Persistence Contract | Host Authority Status | Known Gaps / Research Frontiers | Modular Release Scope |
|---|---|---|---|---|---|---|---|---|
| **Canonical Fear-Band & Panic Hysteresis** | `VERIFIED_CURRENT` | `pixel-pets/src/engine/ai/fear.rs`<br>`packages/core/src/FearCore.js` | Host fixed-tick orchestrator / `RuntimeSimulation.tick()` | BrainIntent emitters / Goal Arbitrator | Persisted as resting fear score (clamped $[0.0, 5.0]$) | **Strictly Advisory**; outputs fear bands and vectors | Fully certified; 10-tick panic recovery lock pinned in Rust and JS parity port. Verified by `tools/verification/verify_cross_tree_parity.mjs`. | **Tier 1: Core Affective SDK** |
| **Host Capability Negotiation** | `VERIFIED_CURRENT` | `packages/core/src/HostCapabilityNegotiator.js` | Middleware server handshake / `negotiateCapabilities` | Intent dispatch pipeline | Stateless per connection handshake | **Enforces Host Limits**; downgrades unsupported intents | Graceful degradation chains (`TAKE_COVER` $\to$ `FLEE_FROM`) verified. | **Tier 1: Core Affective SDK** |
| **Protocol V2 Zero-Copy Binary Wire** | `VERIFIED_CURRENT` | `packages/protocol/src/BinaryWireProtocol.js`<br>`packages/protocol/src/BinaryFrameReader.js` | Adapter network egress / `fear-ai stream` | Host game memory-mapped frame inspector | Byte-stream wire payload | **Read-Only / Non-Mutating**; transfers 32-byte binary records | Sub-millisecond performance certified (>675k entities/sec). | **Tier 1: Core Affective SDK** |
| **Runtime State Snapshot & Persistence** | `VERIFIED_CURRENT` | `packages/runtime/src/RuntimeSimulation.js` (`saveSnapshot`, `loadSnapshot`) | CLI checkpointing / `fear-ai stepper` | Rehydration pipeline | **Complete V2 Bidirectional Round-Trip** | **Safe** | Fully certified under v2 schema: preserves agents, RNG, pacing, trauma zones, `coreTrauma`, `social` tensor, `contagion`, and `timeDiscipline` with full-state bit-exact parity across 1, 10, and 100 post-load ticks, legacy v1 migration into dirty state, and soft/hard reset. Verified by `tools/verification/verify_persistence_roundtrip.mjs`. | **Tier 1: Core Affective SDK** |
| **Multi-Agent Pack Coordination & Swarms** | `VERIFIED_CURRENT` | `packages/core/src/PackCoordinationEngine.js` | `fear-ai pack` / Reference Scenarios / Collision Harness | Tactical intent emitter / flock vector hints | Pack ID & role persisted on agent state | **Advisory Vectors Only**; host computes actual physics & collisions | 4 formations, 7 roles, Alpha morale damping, and Alpha Fall Catastrophe certified. Standalone tactical module (not imported into core RuntimeSimulation). | **Tier 2: Optional Tactical Module** |
| **Systemic Economic Feedback & Pathology** | `VERIFIED_CURRENT` | `packages/core/src/EconomicFeedbackSystem.js` | `fear-ai economy` / `SettlementMigrationSystem` / Collision Harness | Commodity trading & famine desperation fear | Faction inventory & price indices persisted | **Advisory Pricing Pressure**; host handles inventory items | Guaranteed against infinite wealth, negative prices, and starvation deadlocks. Optional world-sim module (not imported into core RuntimeSimulation). | **Tier 2: Optional World-Sim Module** |
| **Epistemic Belief & Rumor Diffusion** | `VERIFIED_CURRENT` | `packages/core/src/EpistemicBeliefEngine.js`<br>`packages/core/src/InformationPropagationEngine.js` | `fear-ai epistemic-fog` / Scenario scripts | Agent perception filter (`observations.reportedDanger`) | Rumor graph persisted on agent memory | **Advisory Perception Bias** | Spatial hearing radius, confidence attenuation, and misinformation decay verified. Standalone perception module. | **Tier 2: Optional Social/Belief Module** |
| **Designer Workbench Dashboard** | `VERIFIED_CURRENT` | `bin/fear-ai.js` (`dashboard`)<br>`packages/runtime/src/DesignerDashboardServer.js` | `fear-ai dashboard` (port 8766) / Browser | Human designers / web browser / live telemetry | Session-only runtime inspection | **Observability Only** | 10 operational inspection views backed by 12 zero-dependency HTTP endpoints including live `GET /api/sim/inspect` attached simulation inspection. Verified by `tools/verification/verify_dashboard_endpoints.mjs`. | **Tier 3: Tooling & Analytics** |
| **Causal Counterfactual World Forks** | `VERIFIED_CURRENT` | `packages/core/src/WorldCounterfactualEngine.js` | `fear-ai counterfactual-world` | ATE effect analytics & scenario reporting | State clones in-memory | **Observability & Analytics** | Parallel world branching and Average Treatment Effect (ATE) causal chains certified. | **Tier 3: Tooling & Analytics** |
| **Godot 4.6 Multi-Station Showcase** | `VERIFIED_CURRENT` | `tests/godot_project/`<br>`packages/adapters/godot/` | `npm run godot:showcase` / `fear-ai godot` | Godot visual agent controllers | Godot scene state | **Advisory Intent Badges**; Godot handles movement & navigation | 9 live stations operational (Threat Appraisal, Sound, Crowd, Leader, etc.). | **Tier 4: Engine Adapters** |
| **External Host Integration (Pixel Pets)** | `VERIFIED_CURRENT` | `pixel-pets/src/engine/ai/fear_ai_bridge.rs`<br>`pixel-pets/src/bin/audit_fear_ai_connection.rs`<br>`pixel-pets/tests/brain_intent_advisory.rs` | Pixel Pets skirmish simulation loop | `BrainDirector` $\to$ `GoapPlanner` | Persisted within Pixel Pets save matrix | **Host Retains 100% Authority**; middleware outputs advisory intents | Certified at sibling commit `db19d1fb6`. 10-point integration contract verified: zero host mutation, advisory BrainIntent JSON parsing, and deterministic headless validation. | **Tier 4: Engine Adapters** |
| **Unity UPM Engine Adapter** | `PARTIAL` (`IMPLEMENTED_NOT_EDITOR_VERIFIED`) | `packages/adapters/unity/` | Unity C# game scripts | Unity NavMesh / GameObject transforms | Unity Scene serialization | **Advisory Vector Hints** | UPM package structure fully declared; awaits verification inside live Unity Editor. | **Tier 4: Engine Adapters** |
| **Unreal Engine 5 Adapter** | `DEFERRED` | `packages/adapters/unreal/` | Future Unreal C++ game host | Unreal Character Movement Component | Unreal SaveGame | **Advisory Vector Hints** | Deliberately deferred per owner policy (do not install UE5 or treat as blocking). | **Tier 4: Engine Adapters** |
| **FABE Behavioral Personality Profiler** | `EXPERIMENTAL` | `packages/core/src/FunctionalPersonaSignatures.js`<br>`benchmarks/behavioral-evaluation/` | `fear-ai fabe-world` | Persona curve generators | Serialized on agent personality vector | **Affective Reasoning Only** | **Research Frontier**: Coupled $N/R$ decay parameters; raw cross-scenario identity invariance outperformed by Utility AI on stateless benchmarks; external human evaluation blocked. | **Tier 5: Research / Experimental** |
| **Moral Engine & Ethical Appraisal** | `EXPERIMENTAL` | `packages/core/src/MoralDissonanceEngine.js` | `fear-ai moral` CLI command | None (No live production game consumer) | Map-based agent moral state | **Advisory Judgments** | Research prototype; evaluateAction and guilt dynamics functional, but lacks host-attached pipeline loop. | **Tier 5: Research / Experimental** |

---

## 3. Verified Proof Artifacts & Verification Run Registry

All claims marked `VERIFIED_CURRENT` in this ledger are backed by reproducible standalone verification scripts complying with **Hard Rule 9** (0 test runners, 100% manual static line review and deterministic execution):

### 1. Persistence Round-Trip & Dirty-State Isolation (`tools/verification/verify_persistence_roundtrip.mjs`)
- **Suite 1 (Multi-Tick Full-State Parity)**: Step 5 initial ticks $\to$ capture V2 snapshot $\to$ restore into clean instance and contaminated dirty instance (pre-populated with ghost agent, ghost trauma, ghost social relationships, ghost contagion). Verifies complete eradication of stale state. Evaluates post-load stepping under identical observation streams across 1, 10, and 100 future ticks. Verified that all normalized snapshot fields (RNG, pacing, trauma zones, coreTrauma, social, contagion, timeDiscipline, agents) match **bit-for-bit**.
- **Suite 2 (Legacy V1 Snapshot Migration)**: Ingests legacy v1 frozen fixture (`packages/protocol/fixtures/save-v1-frozen.json`) into contaminated dirty instance. Verifies rehydration of `survivor_01`, auto-registration in `coreTrauma`, and bit-exact parity over 50 post-load ticks.
- **Suite 3 (Reset Semantics)**: Verifies that soft reset (`sim.reset({ clearAgents: false })`) completely wipes agent fear, habituation exposure maps, and runtime tick count while retaining agent registrations. Verifies that hard reset (`sim.reset({ clearAgents: true })`) wipes all agent instances, coreTrauma records, and trauma zones.

### 2. Cross-System Compound Collision Verification (`tools/verification/verify_compound_collisions.mjs`)
- **Scenario 1A (60-Unit Contagion Radius)**: Proves rapid dispersal past 60 units attenuates contagion, allowing rumor correction to cleanly recover squad fear ($\text{avgFear} < 0.005$).
- **Scenario 1B (Production-Default 300-Unit Radius)**: Documents simulated host kinematics ($\Delta t = 0.05\text{s}$, 20 Hz, scatter speed $5.0\text{ units/tick} = 100\text{ units/s}$). Proves that in open terrain with radial host dispersal, units separate past the 300-unit boundary within 100 ticks, breaking contagion and recovering ($\text{avgFear} < 0.001$).
- **Scenario 1C (Confined Space Panic Attractor vs Calm Leader Intervention)**: Proves mathematically and empirically that when agents are confined within mutual proximity ($d < 6\text{ units} \ll 300$) without host dispersal:
  1. An isolated squad locks permanently into a self-sustaining panic attractor ($\text{final fear} \equiv 1.0000$, 3/3 panickers) because mutual screams keep $\text{contagionFear} > 0.40$, permanently bypassing fear decay (`AffectiveAgent.js:382`).
  2. A calm, trusted leader ($L = 0.95, \text{trust} = 1.0$) suppresses perceived threat, breaking the runaway attractor and restoring calm ($\text{final fear} = 0.0074$, 0/3 panickers).
  3. A distrusted leader ($\text{trust} = -0.9$) discounts reassurance but still halts the runaway lock ($\text{final fear} = 0.0107$).
- **Scenario 2 (Economic Famine Shock $\times$ Migration Flight $\times$ Panic Lock)**: Proves strict world population conservation ($\Delta \text{Pop} \equiv 0$), bounded price ceiling ($10\times$ base), zero NaNs/Infs, and full post-relief market equilibrium ($10.00$). Documented in [COMPOUND_COLLISION_VERIFICATION.md](file:///C:/tools/03-Projects/lains%20Tools/lainself/fear-ai-sim/fear-ai-sim/docs/COMPOUND_COLLISION_VERIFICATION.md).

### 3. Designer Dashboard & Live Attached Inspection (`tools/verification/verify_dashboard_endpoints.mjs`)
- **Surface Taxonomy Classification**: Classifies all 10 dashboard tabs into `DETERMINISTIC DIAGNOSTIC VIGNETTE` (7 tabs), `LIVE REFERENCE SIMULATION` (2 tabs), and `LIVE ATTACHED MIDDLEWARE SESSION` (`/api/sim/inspect`).
- **Semantic Discrimination Assertions**:
  - `/api/explain`: Validates semantic discrimination between acute threat (high fear, PANIC/FLEE intent, threat attribution) and benign stimuli (CALM, composure preserved).
  - `/api/explain-faction`: Validates escalation to MOBILIZE and positive bilateral grievance.
  - `/api/memory`: Validates non-trivial relevance-ranked recall with monotonic score descent.
  - `/api/relationships`: Validates directed tensor asymmetry ($A \to B \ne B \to A$).
  - `/api/causal`: Validates causal root-cause extraction.
  - `/api/sim/inspect`: Validates read-only inspection on both unattached and attached `RuntimeSimulation` instances, exposing sanitized affective state vectors without mutating simulation state.

### 4. Cross-Tree Rust <-> JS Threshold Parity (`tools/verification/verify_cross_tree_parity.mjs`)
- **Canonical Model Alignment**: Validates exact threshold parity between Rust (`pixel-pets/src/engine/ai/fear.rs`) and JavaScript (`packages/core/src/FearCore.js`):
  - Alert: Enter = 0.80, Exit = 0.55
  - Afraid / Anxious: Enter = 1.40, Exit = 0.80
  - Panicked / Panic: Enter = 3.80, Exit = 1.20, Panic Lock = 10 ticks
- **Boundary Test Vectors (`evidence/rust_js_parity_vectors.json`)**: 17 boundary vectors executed bit-identically, validating hysteresis hold, panic recovery lock enforcement, NaN/Inf sanitization, and documenting the architectural distinction between Rust's single-tick multi-tier jump and JS FearCore's stepped 1-band-per-tick ladder.

