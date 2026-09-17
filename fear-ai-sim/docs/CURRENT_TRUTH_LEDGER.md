---
title: "Fear AI — Authoritative Current Truth Ledger"
created: 2026-09-17
updated: 2026-09-17
type: specification
status: active
---

# Fear AI — Authoritative Current Truth Ledger

**Document Version**: 1.0.0  
**Date**: September 17, 2026  
**Auditor / Maintainer**: Antigravity Cognitive Assistant  
**Repository**: `C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim`  
**Standard**: Reconciled Evidence Protocol (First-Principles Manual Audit + Deterministic Scenario Proof; Zero Automated Test Runners)

---

## 1. Purpose & Operating Principles

This ledger establishes the **single authoritative status record** for every live capability across the Fear AI middleware. It supersedes all legacy checklists (including `PROJECT_STATUS.md` and historical evidence JSON dumps) and enforces three core operating principles:

1. **Host Game Authority Invariant**: Fear AI is non-mutating intelligence middleware. The host game retains 100% exclusive authority over transforms, movement, physics, combat, damage, spawning, and inventory.
2. **Zero Fabrication & Parity Standard**: A feature is not complete because a file exists, a test passed historically, or an audit counted it. A capability is complete only when its contracts, live callers, consumers, persistence lifecycle, authority boundaries, and known failure modes are verified.
3. **Controlled Status Taxonomy**:
   - `VERIFIED_CURRENT`: Fully implemented, verified via line-by-line first-principles source audit, actively wired into callers and consumers, and verified on an active host or CLI scenario.
   - `PARTIAL`: Code exists and runs, but has known missing persistence, incomplete UI coverage, or unverified wiring.
   - `EXPERIMENTAL`: Code exists as a prototype or research model, but lacks a live host consumer or has unresolved stability/entanglement challenges.
   - `BLOCKED`: Development or certification is blocked on external resources (e.g. human participant evaluations).
   - `DEFERRED`: Intentionally postponed by owner policy decision (e.g. Unreal Engine 5).
   - `HISTORICAL`: Preserved legacy research or early browser simulation capability (not part of the shippable plug-in SDK).
   - `CONTRADICTED`: Explicitly superseded or rejected by subsequent design rules or empirical findings.

---

## 2. Core Middleware Status Matrix

| Capability / Subsystem | Current Status | Primary Source Files / Symbols | Live Caller | Downstream Consumer | Persistence Contract | Host Authority Status | Known Gaps / Research Frontiers |
|---|---|---|---|---|---|---|---|
| **Canonical Fear-Band & Panic Hysteresis** | `VERIFIED_CURRENT` | `src/engine/ai/fear.rs`<br>`packages/core/src/FearModel.js` | Host fixed tick orchestrator / `RuntimeSimulation.step()` | BrainIntent emitters / Goal Arbitrator | Persisted as resting fear score (clamped $[0.0, 5.0]$) | **Strictly Advisory**; outputs fear bands and vectors | Fully certified; 10-tick panic recovery lock pinned in Rust and JS parity port. |
| **Host Capability Negotiation** | `VERIFIED_CURRENT` | `packages/runtime/src/HostCapabilityNegotiator.js` | Middleware server handshake / `negotiateCapabilities` | Intent dispatch pipeline | Stateless per connection handshake | **Enforces Host Limits**; downgrades unsupported intents | Graceful degradation chains (`TAKE_COVER` $\to$ `FLEE_FROM`) verified. |
| **Protocol V2 Zero-Copy Binary Wire** | `VERIFIED_CURRENT` | `packages/protocol/src/BinaryWireProtocol.js`<br>`packages/protocol/src/BinaryFrameReader.js` | Adapter network egress / `fear-ai stream` | Host game memory-mapped frame inspector | Byte-stream wire payload | **Read-Only / Non-Mutating**; transfers 32-byte binary records | Sub-millisecond performance certified (>675k entities/sec). |
| **Multi-Agent Pack Coordination & Swarms** | `VERIFIED_CURRENT` | `packages/runtime/src/PackCoordinationEngine.js` | `fear-ai pack` / `RuntimeSimulation.step()` | Tactical intent emitter / flock vector hints | Pack ID & role persisted on agent state | **Advisory Vectors Only**; host computes actual physics & collisions | 4 formations, 7 roles, Alpha morale damping, and Alpha Fall Catastrophe certified. |
| **External Host Integration (Pixel Pets)** | `VERIFIED_CURRENT` | `pixel-pets/tests/fear_ai_external_host_integration.rs` | Pixel Pets skirmish simulation loop | `BrainDirector` $\to$ `GoapPlanner` | Persisted within Pixel Pets save matrix | **Host Retains 100% Authority**; middleware outputs advisory intents | True independent host proof; demonstrates zero host mutation. |
| **Godot 4.6 Multi-Station Showcase** | `VERIFIED_CURRENT` | `tests/godot_project/`<br>`packages/adapters/godot/` | `npm run godot:showcase` / `fear-ai godot` | Godot visual agent controllers | Godot scene state | **Advisory Intent Badges**; Godot handles movement & navigation | 9 live stations operational (Threat Appraisal, Sound, Crowd, Leader, etc.). |
| **Runtime State Snapshot & Persistence** | `PARTIAL` | `packages/runtime/src/RuntimeSimulation.js` (`saveSnapshot`, `loadSnapshot`) | CLI checkpointing / `fear-ai stepper` | Rehydration pipeline | **Incomplete Round-Trip** | **Safe** | **CRITICAL GAP**: Saves agents, RNG, and trauma zones, but misses `coreTrauma` records, relationship tensor, contagion cache, and cadence state. Immediate code priority. |
| **Designer Workbench Dashboard** | `PARTIAL` | `bin/fear-ai.js` (`dashboard`)<br>`packages/runtime/src/DashboardServer.js` | `fear-ai dashboard` (port 8766) | Human designers / web UI | Session-only runtime inspection | **Observability Only** | 5 of 9 pages operational. Missing: Memory Inspector, Relationship Tensor, Causal Graph, Full Trade Chains, Performance Budgeting. |
| **Unity UPM Engine Adapter** | `PARTIAL` (`IMPLEMENTED_NOT_EDITOR_VERIFIED`) | `packages/adapters/unity/` | Unity C# game scripts | Unity NavMesh / GameObject transforms | Unity Scene serialization | **Advisory Vector Hints** | UPM package structure fully declared; awaits verification inside live Unity Editor. |
| **Unreal Engine 5 Adapter** | `DEFERRED` | `packages/adapters/unreal/` | Future Unreal C++ game host | Unreal Character Movement Component | Unreal SaveGame | **Advisory Vector Hints** | Deliberately deferred per owner policy (do not install UE5 or treat as blocking). |
| **FABE Behavioral Personality Profiler** | `EXPERIMENTAL` | `packages/runtime/src/FABEProfiler.js`<br>`packages/core/src/Personality.js` | `fear-ai fabe-world` | Persona curve generators | Serialized on agent personality vector | **Affective Reasoning Only** | **Research Frontier**: Neuroticism/Resilience entanglement; raw cross-scenario identity invariance outperformed by Utility AI; external human evaluation blocked. |
| **Moral Engine & Ethical Appraisal** | `EXPERIMENTAL` | `packages/runtime/src/MoralEngine.js` | `fear-ai moral` CLI command | None (No live host consumer) | None | **Advisory Judgments** | Prototype implementation; currently lacks a live production consumer. |
| **Causal Counterfactual World Forks** | `VERIFIED_CURRENT` | `packages/runtime/src/WorldCounterfactualEngine.js` | `fear-ai counterfactual-world` | ATE effect analytics & scenario reporting | State clones in-memory | **Observability & Analytics** | Parallel world branching and Average Treatment Effect (ATE) causal chains certified. |
| **Systemic Economic Feedback & Pathology** | `VERIFIED_CURRENT` | `packages/runtime/src/EconomicFeedbackSystem.js`<br>`packages/runtime/src/EconomicPathologyDetector.js` | `fear-ai economy` / `RuntimeSimulation` | Commodity trading & famine desperation fear | Faction inventory & price indices persisted | **Advisory Pricing Pressure**; host handles inventory items | Guaranteed against infinite wealth, negative prices, and starvation deadlocks. |
| **Epistemic Belief & Rumor Diffusion** | `VERIFIED_CURRENT` | `packages/runtime/src/EpistemicBeliefEngine.js` | `fear-ai epistemic-fog` | Agent perception filter | Rumor graph persisted on agent memory | **Advisory Perception Bias** | Spatial hearing radius, confidence attenuation, and misinformation decay verified. |

---

## 3. Immediate Engineering Closure Backlog

Based on the reconciled evidence standards and rigorous reachability audit, the following backlog represents the mandatory closure sequence:

### Priority 1: Runtime Persistence Closure (`RuntimeSimulation.js`)
- **Defect**: `saveSnapshot()` in `RuntimeSimulation.js` currently serializes base agent states, RNG seeds, pacing phase, and basic trauma zones, but **drops** runtime-owned `coreTrauma` records, cross-faction relationship tensors, contagion spatial cache, and cadence/time-discipline counters.
- **Consequence**: Reloading a saved snapshot leads to psychological divergence (loss of crystallized trauma and relationship bias).
- **Target**: Implement full bidirectional round-trip serialization in `saveSnapshot()` and `loadSnapshot()` with deterministic equality validation.

### Priority 2: Middleware Reachability & Dead Code Disposal
- **Defect**: Modules like `MoralEngine.js` exist in the tree without a live pipeline consumer.
- **Target**: Formally wire `MoralEngine` into the decision arbitration layer or label it explicitly as `PROTOTYPE_ONLY` in packaging manifests.

### Priority 3: Cross-System Compound Collision Verification
- **Target**: Mathematically prove stability under compound interaction stressors:
  - $\text{Leader Fall} \times \text{Contagion Cascade} \times \text{Rumor Distortion}$
  - $\text{Scarcity Shock} \times \text{Migration Flight} \times \text{Panic Lock}$
  - Verify that recovery is always reachable, feedback loops are mathematically dampened, and no NaNs or unbounded memory growths can occur.

### Priority 4: Designer Workbench Completion (5 $\to$ 9 Pages)
- **Target**: Implement the 4 missing inspection surfaces in `packages/runtime/src/DashboardServer.js`:
  1. Memory & Trauma Anchor Visualizer
  2. Cross-Faction Relationship Tensor Grid
  3. Causal Counterfactual Branching Graph
  4. Performance Budget & Entity Backpressure Monitor
