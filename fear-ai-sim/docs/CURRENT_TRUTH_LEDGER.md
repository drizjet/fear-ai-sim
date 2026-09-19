---
title: "Fear AI — Authoritative Current Truth Ledger"
created: 2026-09-17
updated: 2026-09-19
type: specification
status: active
---

# Fear AI — Authoritative Current Truth Ledger

**Document Version**: 1.3.0-CERTIFIED  
**Date**: September 19, 2026  
**Auditor / Maintainer**: Muse Spark (OpenCode) — Continuous Closure Campaign Phases 1–4  
**Repository**: `C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim`  
**Sibling Host Repository**: `C:\tools\03-Projects\lains Tools\New Master Game` (branch `codex/canonical-consolidation-2026-08-12`, commits `91af8f957` → `e2090880a` → `f3f5e8d25`)  
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
| **Host Capability Negotiation** | `VERIFIED_CURRENT` | `packages/core/src/HostCapabilityNegotiator.js` | Middleware server handshake / `negotiateCapabilities` | Intent dispatch pipeline | Stateless per connection handshake | **Enforces Host Limits**; downgrades unsupported intents | Graceful degradation chains (`TAKE_COVER` $\to$ `FLEE_FROM`) verified. Proven by `tools/verification/verify_adapter_conformance.mjs` Suite 3 (R36 omitted=null legacy, empty-array filters, `SEEK_COVER`/`WARN_GROUP` $\to$ `FLEE_FROM`). | **Tier 1: Core Affective SDK** |
| **Protocol V2 Zero-Copy Binary Wire** | `VERIFIED_CURRENT` | `packages/protocol/src/BinaryWireProtocol.js`<br>`packages/protocol/src/BinaryFrameReader.js` | Adapter network egress / `fear-ai stream` | Host game memory-mapped frame inspector | Byte-stream wire payload | **Read-Only / Non-Mutating**; transfers 32-byte binary records | Sub-millisecond performance certified (>675k entities/sec). Proven by `tools/verification/verify_adapter_conformance.mjs` Suite 2 (intent/observation round-trip, magic/version guards, Godot constant parity, zero-copy reader). | **Tier 1: Core Affective SDK** |
| **Runtime State Snapshot & Persistence** | `VERIFIED_CURRENT` | `packages/runtime/src/RuntimeSimulation.js` (`saveSnapshot`, `loadSnapshot`) | CLI checkpointing / `fear-ai stepper` | Rehydration pipeline | **Complete V2 Bidirectional Round-Trip** | **Safe** | Fully certified under v2 schema: preserves agents, RNG, pacing, trauma zones, `coreTrauma`, `social` tensor, `contagion`, and `timeDiscipline` with full-state bit-exact parity across 1, 10, and 100 post-load ticks, legacy v1 migration into dirty state, and soft/hard reset. Verified by `tools/verification/verify_persistence_roundtrip.mjs`. | **Tier 1: Core Affective SDK** |
| **Multi-Agent Pack Coordination & Swarms** | `VERIFIED_CURRENT` | `packages/core/src/PackCoordinationEngine.js` | `fear-ai pack` / Reference Scenarios / Collision Harness | Tactical intent emitter / flock vector hints | Pack ID & role persisted on agent state | **Advisory Vectors Only**; host computes actual physics & collisions | 4 formations, 7 roles, Alpha morale damping, and Alpha Fall Catastrophe certified. Standalone tactical module (not imported into core RuntimeSimulation). | **Tier 2: Optional Tactical Module** |
| **Systemic Economic Feedback & Pathology** | `VERIFIED_CURRENT` | `packages/core/src/EconomicFeedbackSystem.js` | `fear-ai economy` / `SettlementMigrationSystem` / Collision Harness | Commodity trading & famine desperation fear | Faction inventory & price indices persisted | **Advisory Pricing Pressure**; host handles inventory items | Guaranteed against infinite wealth, negative prices, and starvation deadlocks. Optional world-sim module (not imported into core RuntimeSimulation). | **Tier 2: Optional World-Sim Module** |
| **Epistemic Belief & Rumor Diffusion** | `VERIFIED_CURRENT` | `packages/core/src/EpistemicBeliefEngine.js`<br>`packages/core/src/InformationPropagationEngine.js` | `fear-ai epistemic-fog` / Scenario scripts | Agent perception filter (`observations.reportedDanger`) | Rumor graph persisted on agent memory | **Advisory Perception Bias** | Spatial hearing radius, confidence attenuation, and misinformation decay verified. Standalone perception module. | **Tier 2: Optional Social/Belief Module** |
| **Designer Workbench Dashboard** | `VERIFIED_CURRENT` | `bin/fear-ai.js` (`dashboard`)<br>`packages/runtime/src/DesignerDashboardServer.js` | `fear-ai dashboard` (port 8766) / Browser | Human designers / web browser / live telemetry | Session-only runtime inspection | **Observability Only** | 10 operational inspection views backed by 12 zero-dependency HTTP endpoints including live `GET /api/sim/inspect` attached simulation inspection. Verified by `tools/verification/verify_dashboard_endpoints.mjs`. | **Tier 3: Tooling & Analytics** |
| **Causal Counterfactual World Forks** | `VERIFIED_CURRENT` | `packages/core/src/WorldCounterfactualEngine.js` | `fear-ai counterfactual-world` | ATE effect analytics & scenario reporting | State clones in-memory | **Observability & Analytics** | Parallel world branching and Average Treatment Effect (ATE) causal chains certified. Causal root-cause surface proven by `tools/verification/verify_dashboard_endpoints.mjs` (`POST /api/causal`). | **Tier 3: Tooling & Analytics** |
| **Godot 4.6 Multi-Station Showcase** | `VERIFIED_CURRENT` | `tests/godot_project/`<br>`packages/adapters/godot/` | `npm run godot:showcase` / `fear-ai godot` | Godot visual agent controllers | Godot scene state | **Advisory Intent Badges**; Godot handles movement & navigation | 9 live stations operational (Threat Appraisal, Sound, Crowd, Leader, etc.). Protocol conformance proven by `tools/verification/verify_adapter_conformance.mjs` Suites 1–4 (handshake, binary constants, capability omission, outcome receipts, advisory-only motor). | **Tier 4: Engine Adapters** |
| **External Host Integration (Pixel Pets)** | `VERIFIED_CURRENT` | `pixel-pets/src/engine/ai/fear_ai_bridge.rs`<br>`pixel-pets/src/bin/audit_fear_ai_connection.rs`<br>`pixel-pets/tests/brain_intent_advisory.rs` | Pixel Pets skirmish simulation loop | `BrainDirector` $\to$ `GoapPlanner` | Persisted within Pixel Pets save matrix | **Host Retains 100% Authority**; middleware outputs advisory intents | Certified at sibling commit `91af8f957` (branch `codex/canonical-consolidation-2026-08-12`), extended thereafter. 8-section diagnostic audit verified: zero host mutation, advisory BrainIntent JSON parsing, deterministic headless validation, 1v1–6v6 faction-configuration matrix, 2,000-tick multi-faction skirmish (tick 2000, verified finite state), 719,600-offset formation-geometry stress, live squad-path formation cycle, and a host-sim tick scaling probe. Middleware advisory p95 19µs (release) / 143µs (debug) with an enforced hard p99 < 1ms gate. Alpha Fall catastrophe. Proof: `evidence/audit_fear_ai_connection_extended_2026-09-19.md` + `evidence/host_sim_tick_profiling_2026-09-19.md`. Safeguards: `formation_geometry::square_offset` ring≥1 (modulo-by-zero), `overlay_audio` Windows gating for Linux headless builds. C# adapter `dotnet build`: 0 warnings, 0 errors. | **Tier 4: Engine Adapters** |
| **Unity UPM Engine Adapter** | `PARTIAL` (`IMPLEMENTED_NOT_EDITOR_VERIFIED`) | `packages/adapters/unity/` | Unity C# game scripts | Unity NavMesh / GameObject transforms | Unity Scene serialization | **Advisory Vector Hints** | UPM package structure fully declared; awaits verification inside live Unity Editor. | **Tier 4: Engine Adapters** |
| **Unreal Engine 5 Adapter** | `DEFERRED` | `packages/adapters/unreal/` | Future Unreal C++ game host | Unreal Character Movement Component | Unreal SaveGame | **Advisory Vector Hints** | Deliberately deferred per owner policy (do not install UE5 or treat as blocking). | **Tier 4: Engine Adapters** |
| **FABE Behavioral Personality Profiler** | `EXPERIMENTAL` | `packages/core/src/FunctionalPersonaSignatures.js`<br>`benchmarks/behavioral-evaluation/` | `fear-ai fabe-world` | Persona curve generators | Serialized on agent personality vector | **Affective Reasoning Only** | **Research Frontier**: Coupled $N/R$ decay parameters; raw cross-scenario identity invariance outperformed by Utility AI on stateless benchmarks; external human evaluation blocked. Decoupled advisory-only math proven by `tools/verification/verify_fabe_personas.mjs` (53 assertions: 11 logistic curves, N/R phase separation, determinism, confusion, collapse). No live host consumer — status stays `EXPERIMENTAL`. | **Tier 5: Research / Experimental** |
| **Moral Engine & Ethical Appraisal** | `EXPERIMENTAL` | `packages/core/src/MoralDissonanceEngine.js` | `fear-ai moral` CLI command | None (No live production game consumer) | Map-based agent moral state | **Advisory Judgments** | Research prototype; evaluateAction and guilt dynamics functional, but lacks host-attached pipeline loop. Decoupled advisory-only math proven by `tools/verification/verify_moral_dissonance.mjs` (110 assertions: Haidt vectors, Festinger rationalization, guilt half-lives, injury thresholds). No live host consumer — status stays `EXPERIMENTAL`. | **Tier 5: Research / Experimental** |

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
- **Parity Scope (three-tree honesty note)**: `verify_cross_tree_parity.mjs` intentionally certifies **Rust ↔ JS only**, because those are the two trees that implement the canonical dual-threshold 0–5 band model. The third live tree, the **Elixir + Rustler-NIF backend** (`C:\tools\03-Projects\lains Tools\lainself\fear-ai-elixir`), is a **divergent research backend, not a parity target**: its `FearAi.Core.Fear` model operates on a normalized `[0,1]` fear score with category boundaries `:calm < 0.2`, `:nervous < 0.5`, `:scared < 0.8`, `:terrified` (per-tick decay `0.95`, trauma decay `0.9995`) — no dual enter/exit thresholds and no 10-tick panic lock. This divergence is expected and is recorded in the Elixir tree's own `AGENTS.md`. Two open, externally-blocked gaps stand: the tree has **no `mix.lock`** (not a reproducible release) and **no Elixir toolchain is installed on this host** (`mix`/`elixir` not on PATH), so its build cannot be evidenced here. It is therefore excluded from the middleware release scope and is not claimed as parity-equivalent.

### 5. Engine Adapter Conformance (`tools/verification/verify_adapter_conformance.mjs`) — 123 assertions
- **Suite 1 (Handshake)**: Godot/Unity/C# emit `HANDSHAKE_REQUEST` pinned to `1.0.0`; validator accepts all three shapes, rejects major-version mismatch; server advertises `host_capabilities` + `capability_requirements`.
- **Suite 2 (Binary Wire)**: Intent/observation batch round-trip (16-byte header, 32-byte records, FEAR magic, version 2); truncated/magic/version guards throw; zero-copy reader parity; Godot binary constants match JS (`INTENT_MAP`, `BAND_MAP`).
- **Suite 3 (Capability Downgrade)**: Full caps pass `SEEK_COVER`; empty caps downgrade `SEEK_COVER`/`WARN_GROUP` $\to$ `FLEE_FROM` with `capability_downgrade` annotation; `sanitize(undefined)=null` (legacy) vs `sanitize([])=[]` (filter-all); all three adapters omit `capabilities` when empty.
- **Suite 4 (Intents & Outcomes)**: 12-entry `ACTION_INTENTS` parity across Godot/Unity/generic-C# envelope; `INTENT_OUTCOMES` (4) + `FAILURE_REASONS` (6) taxonomy; outcome validator defaults/accepts/rejects correctly; all adapters implement `report_outcome` $\to$ `/api/v1/outcome` with `INTENT_OUTCOME_ACK`; advisory-only host authority (no transform mutation).
- **C# Build**: `dotnet build packages/adapters/csharp/FearAI.Client.csproj` — 0 warnings, 0 errors (netstandard2.0 + net8.0).

### 6. Moral Dissonance Decoupling (`tools/verification/verify_moral_dissonance.mjs`) — 110 assertions
- **Haidt Vectors**: 5 foundations, 5 archetypes (weights sum 1.0), 7 transgressions (5-dim [0,1] vectors), 5 atonements; registration normalizes.
- **Festinger Rationalization**: Hand-computed dot-product (.6525 guardian×abandon); fear cap .60, order `AUTHORITY×.50`, necessity `.40`, total cap .75; unknown transgression/agent throw loudly.
- **Guilt Dynamics**: Integration `net×.80`; healthy half-life ~138.3 ticks ($\lambda=.005$), injured ~346.2 ticks (60% slower); empirical 138-tick decay ≈ half; injury at exactly 50 severe ticks with N+0.15/A−0.20/D−0.15 remodeling; sub-threshold never injures; atonement relief discrete with floor 0.
- **Compliance & Authority**: Refusal probability in [0,.95], guilt/coercion/injury/determinism verified; `auditImmutability` CLEAN, affective-only modulation (valence/arousal/dominance), transforms/HP untouched, snapshot JSON-serializable.

### 7. FABE Persona Decoupling (`tools/verification/verify_fabe_personas.mjs`) — 53 assertions
- **Curves & Bounds**: 11 logistic functions, 9-point probe grid; 256 trait corners bounded [0,1]; NaN/Inf/clamp safety; monotonicity spot-checks.
- **N/R Phase Separation**: High-N vs High-R distance >0.05; N ≈3× stronger than R on `panicThreat` (both lower threshold per shipped equation `.75 - N*.30 - R*.10`); R/N opposite signs on `recoveryTime` and `contagionPeerFear`; near-neighbor N=.45 vs .55 separates. The 3× claim is asserted **quantitatively** — the measured N:R output-delta ratio must fall in `(2.5, 4.0)` (measured 3.226; an equal-coefficient regression yields 0.538 and fails), so a silent coefficient change can no longer pass on the weaker `nDelta > rDelta` ordering alone.
- **Analytics**: Bit-identical signatures, 99-dim vectors, symmetric distance, seeded population determinism, exact-query identification, 3×5 confusion matrix (accuracy >0.5), collapse scoring; `auditImmutability` CLEAN with frozen-input safety.

### 8. Extended Host Skirmish Audit (`evidence/audit_fear_ai_connection_extended_2026-09-19.md`)
- Standalone Rust diagnostic binary (`cargo run --bin audit_fear_ai_connection`), 8 sections + profiling probe, all PASS: sensory extraction, fear math, whitelist gate, zero mutation ($\Delta X=0,\Delta Y=0,\Delta HP=0$), Alpha election/damping, Alpha Fall catastrophe (DeepRetreat + SquadPanicRegroup), extended skirmish (Section 7), latency profile (Section 8), host-sim scaling probe (Section 8B). Middleware advisory latency: mean 15µs / p95 19µs / p99 34µs (release), mean 94µs / p95 143µs / p99 177µs (debug).
- **Depth evolution**: the original 500-tick run (`evidence/audit_fear_ai_connection_500tick_2026-09-19.md`) is superseded. Section 7 now performs four things, all PASS on 2026-09-19:
  1. **Faction-configuration matrix** — 1v1, 2v2, 3v2, 4v4, 6v6, each asserting tick progress **and** verifying every unit field is finite.
  2. **2,000-tick long-horizon multi-faction skirmish** (lithodrom x3 vs terracotta x2) — tick 2000 reached, finite state verified.
  3. **Exhaustive formation-geometry stress** — 719,600 offsets across 7 formations × 5 roles × 4 rotations × 4 spacings (incl. `0.0`) × 5 unit-counts × 257 slots, all finite. Guards the 2026-09-19 `square_offset` modulo-by-zero class at follower index 1.
  4. **Live squad-path formation cycle (7d)** — real partitioned squads (24v24) cycled through all 7 formation types over 70 ticks (567 squad-ticks, largest squad 6 units), asserting finite positions. This drives the *live* `apply_squad_formation_geometry` path, not just the calculator.
- **Honesty corrections (2026-09-19)** — two printed claims were not actually enforced and are now gated:
  1. The old Section 7 printed "zero NaN drift" without checking it. Section 7 now asserts `x, y, vel_x, vel_y, hp, fear_score` finiteness on every unit in every configuration.
  2. The old Section 8 printed `"[WARN] latency exceeded"` on budget breach while the final summary still declared all sections passed. Latency is now two-tier: an **advisory p95 < 200µs target** (reported; debug p95 is genuinely noisy at 122–190µs) and an **enforced hard gate p99 < 1ms** (~6% of a 16.6ms frame) that fails the audit. The "p95 < 200µs budget" phrasing elsewhere in this ledger is therefore an advisory target, not a gate.
- **Host sim profiling (Section 8B + `evidence/host_sim_tick_profiling_2026-09-19.md`)**: the host sim tick cost is **linear in unit count**, with a ~0.3ms fixed base and ~89–112µs marginal cost per unit in release (~2.3ms base / ~1.1ms per unit in debug). The earlier ~17.2ms/tick headline was an **unoptimized debug** measurement; the same 3v2 long-horizon tick is ~1.28ms in release (~13× faster). No quadratic hotspot. This is the host simulation, distinct from the middleware advisory cost.

