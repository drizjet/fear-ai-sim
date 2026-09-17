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

| Capability / Subsystem | Current Status | Primary Source Files / Symbols | Live Caller | Downstream Consumer | Persistence Contract | Host Authority Status | Known Gaps / Research Frontiers | Release Scope Disposition |
|---|---|---|---|---|---|---|---|---|
| **Canonical Fear-Band & Panic Hysteresis** | `VERIFIED_CURRENT` | `src/engine/ai/fear.rs`<br>`packages/core/src/FearCore.js` | Host fixed tick orchestrator / `RuntimeSimulation.step()` | BrainIntent emitters / Goal Arbitrator | Persisted as resting fear score (clamped $[0.0, 5.0]$) | **Strictly Advisory**; outputs fear bands and vectors | Fully certified; 10-tick panic recovery lock pinned in Rust and JS parity port. | **Core Release** |
| **Host Capability Negotiation** | `VERIFIED_CURRENT` | `packages/core/src/HostCapabilityNegotiator.js` | Middleware server handshake / `negotiateCapabilities` | Intent dispatch pipeline | Stateless per connection handshake | **Enforces Host Limits**; downgrades unsupported intents | Graceful degradation chains (`TAKE_COVER` $\to$ `FLEE_FROM`) verified. | **Core Release** |
| **Protocol V2 Zero-Copy Binary Wire** | `VERIFIED_CURRENT` | `packages/protocol/src/BinaryWireProtocol.js`<br>`packages/protocol/src/BinaryFrameReader.js` | Adapter network egress / `fear-ai stream` | Host game memory-mapped frame inspector | Byte-stream wire payload | **Read-Only / Non-Mutating**; transfers 32-byte binary records | Sub-millisecond performance certified (>675k entities/sec). | **Core Release** |
| **Multi-Agent Pack Coordination & Swarms** | `VERIFIED_CURRENT` | `packages/core/src/PackCoordinationEngine.js` | `fear-ai pack` / `RuntimeSimulation.step()` | Tactical intent emitter / flock vector hints | Pack ID & role persisted on agent state | **Advisory Vectors Only**; host computes actual physics & collisions | 4 formations, 7 roles, Alpha morale damping, and Alpha Fall Catastrophe certified. | **Core Release** |
| **External Host Integration (Pixel Pets)** | `VERIFIED_CURRENT` | `pixel-pets/tests/fear_ai_external_host_integration.rs` | Pixel Pets skirmish simulation loop | `BrainDirector` $\to$ `GoapPlanner` | Persisted within Pixel Pets save matrix | **Host Retains 100% Authority**; middleware outputs advisory intents | True independent host proof; demonstrates zero host mutation. | **Core Release** |
| **Godot 4.6 Multi-Station Showcase** | `VERIFIED_CURRENT` | `tests/godot_project/`<br>`packages/adapters/godot/` | `npm run godot:showcase` / `fear-ai godot` | Godot visual agent controllers | Godot scene state | **Advisory Intent Badges**; Godot handles movement & navigation | 9 live stations operational (Threat Appraisal, Sound, Crowd, Leader, etc.). | **Core Release** |
| **Runtime State Snapshot & Persistence** | `VERIFIED_CURRENT` | `packages/runtime/src/RuntimeSimulation.js` (`saveSnapshot`, `loadSnapshot`) | CLI checkpointing / `fear-ai stepper` | Rehydration pipeline | **Complete V2 Bidirectional Round-Trip** | **Safe** | Fully certified under v2 schema: preserves agents, RNG, pacing, trauma zones, `coreTrauma` crystallized/active phobias, `social` relationship tensor, `contagion`, and `timeDiscipline` with zero post-load divergence or cross-run dirty leakage. | **Core Release** |
| **Designer Workbench Dashboard** | `VERIFIED_CURRENT` | `bin/fear-ai.js` (`dashboard`)<br>`packages/runtime/src/DesignerDashboardServer.js` | `fear-ai dashboard` (port 8766) | Human designers / web browser | Session-only runtime inspection | **Observability Only** | 10 operational inspection views backed by 11 zero-dependency HTTP endpoints. Inspection views consume synthetic vignettes, static diagrams, and live attached simulation runs. | **Tooling Release** |
| **Unity UPM Engine Adapter** | `PARTIAL` (`IMPLEMENTED_NOT_EDITOR_VERIFIED`) | `packages/adapters/unity/` | Unity C# game scripts | Unity NavMesh / GameObject transforms | Unity Scene serialization | **Advisory Vector Hints** | UPM package structure fully declared; awaits verification inside live Unity Editor. | **Deferred / Adapter Track** |
| **Unreal Engine 5 Adapter** | `DEFERRED` | `packages/adapters/unreal/` | Future Unreal C++ game host | Unreal Character Movement Component | Unreal SaveGame | **Advisory Vector Hints** | Deliberately deferred per owner policy (do not install UE5 or treat as blocking). | **Deferred / Adapter Track** |
| **FABE Behavioral Personality Profiler** | `EXPERIMENTAL` | `packages/core/src/FunctionalPersonaSignatures.js`<br>`benchmarks/behavioral-evaluation/` | `fear-ai fabe-world` | Persona curve generators | Serialized on agent personality vector | **Affective Reasoning Only** | **Research Frontier**: Coupled $N/R$ decay parameters; raw cross-scenario identity invariance outperformed by Utility AI on stateless benchmarks; external human evaluation blocked. | **Research / Experimental** |
| **Moral Engine & Ethical Appraisal** | `EXPERIMENTAL` | `packages/core/src/MoralDissonanceEngine.js` | `fear-ai moral` CLI command | None (No live production game consumer) | Map-based agent moral state | **Advisory Judgments** | Research prototype; evaluateAction and guilt dynamics functional, but lacks host-attached pipeline loop. | **Research / Experimental** |
| **Causal Counterfactual World Forks** | `VERIFIED_CURRENT` | `packages/core/src/WorldCounterfactualEngine.js` | `fear-ai counterfactual-world` | ATE effect analytics & scenario reporting | State clones in-memory | **Observability & Analytics** | Parallel world branching and Average Treatment Effect (ATE) causal chains certified. | **Tooling / Analytics Release** |
| **Systemic Economic Feedback & Pathology** | `VERIFIED_CURRENT` | `packages/core/src/EconomicFeedbackSystem.js` | `fear-ai economy` / `RuntimeSimulation` | Commodity trading & famine desperation fear | Faction inventory & price indices persisted | **Advisory Pricing Pressure**; host handles inventory items | Guaranteed against infinite wealth, negative prices, and starvation deadlocks. | **Core Release** |
| **Epistemic Belief & Rumor Diffusion** | `VERIFIED_CURRENT` | `packages/core/src/EpistemicBeliefEngine.js` | `fear-ai epistemic-fog` | Agent perception filter | Rumor graph persisted on agent memory | **Advisory Perception Bias** | Spatial hearing radius, confidence attenuation, and misinformation decay verified. | **Core Release** |

---

## 3. Immediate Engineering Closure Backlog

Based on the reconciled evidence standards and rigorous reachability audit, the following backlog represents the mandatory closure sequence:

### Priority 1: Runtime Persistence Closure (`RuntimeSimulation.js`) — [COMPLETED]
- **Implementation**: Upgraded `RuntimeSimulation.js` snapshot schema to Version 2. Added full bidirectional round-trip serialization for `coreTrauma` (crystallized/active traumas and conditioned phobias), `social` (RelationshipTensorSystem), `contagion` (ContagionGraph), `timeDiscipline` (HostTimeDiscipline), `flags`, and `lastContagion`. Hardened `reset()` and `loadSnapshot()` against stale/dirty-state contamination across runs.
- **Verification**: Verified via single-pass deterministic execution (`tools/verification/verify_persistence_roundtrip.mjs`); post-load stepping yields identical `CALM` bands with zero behavioral or state drift. Status elevated to `VERIFIED_CURRENT`.

### Priority 2: Middleware Reachability & Dead Code Disposal — [COMPLETED]
- **Clarification & Classification**: Source tree audit confirms modules like `MoralDissonanceEngine.js` (`packages/core/src/MoralDissonanceEngine.js`) are research prototypes with functional CLI callers (`fear-ai moral`) and test batteries, but are formally classified as `EXPERIMENTAL` (out of Core Middleware 1.0 release scope) rather than dead code.
- **Packaging Disposition**: Manifests and documentation clearly delineate core middleware from experimental research frontiers.

### Priority 3: Cross-System Compound Collision Verification — [COMPLETED]
- **Implementation & Proof**: Formally executed deterministic verification across both compound interaction stressors:
  1. $\text{Leader Fall} \times \text{Contagion Cascade} \times \text{Rumor Distortion}$ (`PackCoordinationEngine`, `ContagionGraph`, `InformationPropagationEngine`, `AffectiveAgent`, `FearCore`).
  2. $\text{Scarcity Shock} \times \text{Migration Flight} \times \text{Panic Lock}$ (`EconomicFeedbackSystem`, `SettlementMigrationSystem`, `MultiFeedbackCascadeSystem`).
- **Verification**: Zero NaNs, zero Infs, zero negative inventories, strict world population conservation ($\Delta \text{Pop} \equiv 0$), bounded price ceiling ($10\times$ base), finite recovery latencies post-shock, accurate $R_{\text{contagion}} = 300$ default dispersion kinematics, and bit-exact replay determinism across runs. Documented in [COMPOUND_COLLISION_VERIFICATION.md](file:///C:/tools/03-Projects/lains%20Tools/lainself/fear-ai-sim/fear-ai-sim/docs/COMPOUND_COLLISION_VERIFICATION.md).

### Priority 4: Designer Workbench Completion (10 Inspection Surfaces) — [COMPLETED]
- **Implementation & Proof**: Verified `packages/runtime/src/DesignerDashboardServer.js` delivering an embedded zero-dependency HTTP server with 11 API endpoints and 10 interactive diagnostic views:
  1. `NPC Threat Attribution` (`/api/explain`): Diagnostic explainability breakdown, threat contributors, trait impacts, and rejected alternative intents.
  2. `Functional Persona Curves` (`/api/personas`): FABE FPS v1 reaction norms and recovery half-lives ($\tau_{1/2}$).
  3. `14-Stage Faction Escalation` (`/api/explain-faction`): Bilateral grievance, military readiness ratios, and peace barrier hysteresis.
  4. `Cognitive LOD & Route Safety`: 5-tier cognitive LOD with active and blocked caravan vectors.
  5. `Reference Game Replay` (`/api/sim/step`): Turn-by-turn authoritative 2D dungeon crawler loop with zero authority leakage.
  6. `Memory Explorer` (`/api/memory`): Multi-tier episodic, semantic, and rumor recall ranked by `MemoryRelevanceScorer`.
  7. `Relationship Graph` (`/api/relationships`): Directed asymmetric trust and affection tensor matrix ($A \to B \ne B \to A$).
  8. `Causal Graph` (`/api/causal`): Backward-chaining root-cause attribution and automated narrative generation via `CausalEventGraph`.
  9. `Live Trade Map` (`/api/trade-map`): Closed-world route danger beliefs conditioned on rumor vs direct observation provenance.
  10. `Subsystem Performance Benchmark` (`/api/performance`): Micro-benchmarks across 200 seeded agents with sub-millisecond per-agent latency ($< 0.025\,\text{ms}$).
- **Verification**: Verified via single-pass deterministic HTTP client (`tools/verification/verify_dashboard_endpoints.mjs`); all 11 endpoints returned 200 OK with valid payloads. Status elevated to `VERIFIED_CURRENT`.
