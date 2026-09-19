---
title: "Fear AI — Claim-to-Code Audit"
created: 2026-09-19
updated: 2026-09-19
type: audit
status: provisional
---

# Claim-to-Code Audit — 2026-09-19

This is a bounded claim-to-code trace for the current truth ledger. It records
what each status row actually proves; it is not a universal integration claim
and it does not certify the whole repository as RC1.

## Repository boundary

- Fear AI JS checkout: `C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim`, clean at the current documentation-only descendant of the runtime audit baseline, with counterfactual hardening at `51b6268`, transport/lifecycle hardening at `88cf80b`, real-socket reconnect evidence at `2a5e4e6`, the long-horizon lifecycle probe at `2611d6f`, protocol-abuse evidence at `57c7528`, runtime wiring at `625ce5b`, current claim-boundary reconciliation in the descendant documentation, and the current JavaScript performance baseline at `3edaf17`.
- Pixel Pets host: `C:\tools\03-Projects\lains Tools\New Master Game`, branch `codex/canonical-consolidation-2026-08-12`, currently checked out at `11582382c` with unrelated uncommitted changes. Host evidence is referenced by named commits and recorded artifacts, not by the dirty working tree.
- Elixir/NIF tree: outside this release scope; its normalized `[0,1]` model is intentionally not parity-equivalent to the Rust/JS 0–5 hysteresis model.

### JavaScript Runtime Performance Baseline — `OBSERVED_CURRENT` (not a capability certification)

- **Repository / commit:** `fear-ai-sim@3edaf17`.
- **Source / symbol:** `tools/verification/measure_runtime_performance.mjs` measures `RuntimeSimulation.tick()` under the documented default middleware configuration.
- **Actual live caller:** the measurement script constructs and drives `RuntimeSimulation` directly; it is a reproducible middleware benchmark, not a host-engine integration path.
- **Actual consumer:** release planning and capacity investigation may use the recorded baseline as one-machine observational evidence.
- **Persistence owner:** none; the run records metadata and counters but does not certify snapshot or host persistence behavior.
- **Authority boundary:** JavaScript middleware timing only; no host physics, movement, combat, inventory, or external-engine transport is included.
- **Proof artifact:** `evidence/js_runtime_performance_2026-09-19.md`.
- **Known limitation:** on the recorded Windows/Node host, the primary 100-tick run after 10 warmups produced p99 values of 0.4307 ms at 32 agents, 0.9025 ms at 128 agents, and 3.6962 ms at 512 agents; the clean-audit rerun produced 0.4226 ms, 0.8077 ms, and 4.0664 ms. These are not universal thresholds, a Rust host benchmark, or a release gate; target-environment reruns are required for capacity claims.
- **Last verified / strength:** 2026-09-19; metadata-bearing measurement with explicit machine, runtime, scale, warmup, sample, clock, and memory fields. Observational and environment-specific.

### Runtime Wiring Boundary — `OBSERVED_CURRENT` (release-scope evidence)

- **Repository / commit:** current Fear AI JS checkout; the probe is versioned with the release audit.
- **Source / symbol:** `packages/runtime/src/RuntimeSimulation.js`, `packages/runtime/src/FearServer.js`, `packages/runtime/src/DesignerDashboardServer.js`, and direct CLI entry points in `bin/fear-ai.js`.
- **Actual live caller:** a real `RuntimeSimulation` instance is registered, given an observation, and ticked; the probe also instantiates `FearServer` and an unattached dashboard.
- **Actual consumer:** the live tick returns an affective state and semantic intent; the server owns that simulation, while the dashboard consumes a simulation only after explicit attachment.
- **Persistence owner:** the core services remain owned by `RuntimeSimulation`; this probe does not replace the persistence proof.
- **Authority boundary:** wiring inspection only; no host transform, physics, combat, inventory, or external-engine behavior is exercised.
- **Proof artifact:** `tools/verification/verify_runtime_wiring.mjs`.
- **Known limitation:** the probe proves the current construction and entry-point boundary, not the semantic correctness of every optional module or its adoption by an external host. It intentionally treats optional-module construction inside `RuntimeSimulation` as a release-scope change that would require ledger review.
- **Last verified / strength:** 2026-09-19; standalone source/runtime inventory passed on the current JS checkout.

## Trace records

### Canonical Fear-Band & Panic Hysteresis — `VERIFIED_CURRENT`

- **Repository / commit:** JS `fear-ai-sim@3a56283`; Rust sibling `New Master Game@db19d1fb6` for the parity vectors.
- **Source / symbol:** JS `packages/core/src/FearCore.js::FearCore.update`; Rust `pixel-pets/src/engine/ai/fear.rs::FearState::apply_score`.
- **Actual live caller:** JS `RuntimeSimulation.tick()` → `AffectiveAgent.tick()` → `FearCore.update()`; Rust host fear-state call sites are separate from the JS runtime.
- **Actual consumer:** JS `IntentResolver` and runtime agent outputs; Rust host BrainIntent/fear consumers.
- **Persistence owner:** JS `RuntimeSimulation` agent snapshots; Rust host save state.
- **Authority boundary:** advisory affect, bands, and vectors only; neither path owns host transforms or combat.
- **Proof artifact:** `tools/verification/verify_cross_tree_parity.mjs` and `evidence/rust_js_parity_vectors.json`.
- **Known limitation:** 17 vectors establish the named threshold and lock semantics. They do not establish universal cross-runtime identity; extreme-shock transition behavior is intentionally different.
- **Last verified / strength:** 2026-09-19; direct deterministic vector execution plus static source inspection. Strong for the named vectors, bounded beyond them.

### Host Capability Negotiation — `VERIFIED_CURRENT`

- **Repository / commit:** `fear-ai-sim@3a56283`.
- **Source / symbol:** `packages/core/src/HostCapabilityNegotiator.js::HostCapabilityNegotiator`; server integration in `packages/runtime/src/FearServer.js`.
- **Actual live caller:** `FearServer` handshake path constructs the negotiator; `_applyHostContracts` filters outbound intents.
- **Actual consumer:** Godot, Unity, C#, and generic protocol adapters receive downgraded advisory envelopes.
- **Persistence owner:** connection-scoped negotiation state; no simulation snapshot ownership.
- **Authority boundary:** filters or downgrades unsupported intent capabilities; never executes movement.
- **Proof artifact:** `tools/verification/verify_adapter_conformance.mjs`, Suite 3.
- **Known limitation:** conformance is adapter-envelope evidence, not proof that an arbitrary external engine consumes every downgrade correctly.
- **Last verified / strength:** 2026-09-19; 123-assertion deterministic harness plus static adapter inspection.

### Runtime Transport, Registration & Lifecycle — `VERIFIED_CURRENT`

- **Repository / commit:** `fear-ai-sim@88cf80b`.
- **Source / symbol:** `packages/runtime/src/FearServer.js::_handleWsMessage/_routeHttpPost`, `packages/protocol/src/validator.js::validatePacingOverride`, and `RuntimeSimulation::unregisterAgent`.
- **Actual live caller:** FearServer HTTP `/api/v1/*` routes and WebSocket message dispatch; engine adapters use the protocol boundary.
- **Actual consumer:** local host clients receive validated acknowledgements, errors, and advisory outputs.
- **Persistence owner:** server-scoped `RuntimeSimulation`; explicit unregister owns cleanup of per-agent middleware state.
- **Authority boundary:** validation and lifecycle bookkeeping only; no transport path owns host transforms, physics, or combat.
- **Proof artifact:** `tools/verification/verify_server_lifecycle.mjs`, `tools/verification/verify_server_reconnect.mjs`, and `tools/verification/verify_protocol_abuse.mjs`.
- **Known limitation:** the verified contract is server-scoped state continuity: WebSocket close removes the connection from `connectedClients` but does not automatically unregister agents, and a reconnect can continue the preserved state. Per-connection agent ownership, duplicate-client arbitration, and automatic cleanup of abandoned clients are not certified. The abuse probe is bounded protocol hardening, not cryptographic or general denial-of-service security certification.
- **Last verified / strength:** 2026-09-19; deterministic dispatcher proof plus real HTTP/WebSocket probes covering pacing guards, malformed input, version rejection, snapshot failure semantics, correlation IDs, prototype-shaped traits, payload limits, explicit unregister cleanup, and reconnect continuity.

### Protocol V2 Binary Wire — `VERIFIED_CURRENT`

- **Repository / commit:** `fear-ai-sim@3a56283`.
- **Source / symbol:** `packages/protocol/src/BinaryWireProtocol.js` and `packages/protocol/src/BinaryFrameReader.js`.
- **Actual live caller:** adapter serializers and the `fear-ai stream` path; the conformance harness also imports the boundary directly.
- **Actual consumer:** host-side binary frame readers and adapter transport code.
- **Persistence owner:** wire payload only; runtime snapshot persistence is a separate contract.
- **Authority boundary:** read-only transfer of advisory records; no host-state mutation.
- **Proof artifact:** `tools/verification/verify_adapter_conformance.mjs`, Suite 2.
- **Known limitation:** the harness proves format guards, round-trip values, and reader behavior; the historical throughput figure is environment-specific and is not a universal latency guarantee.
- **Last verified / strength:** 2026-09-19; direct deterministic wire harness and static adapter inspection.

### Runtime State Snapshot & Persistence — `VERIFIED_CURRENT`

- **Repository / commit:** `fear-ai-sim@5b53907` for the persistence hardening and `51b6268` for the counterfactual audit follow-up.
- **Source / symbol:** `packages/runtime/src/RuntimeSimulation.js::saveSnapshot/loadSnapshot` and component `getState/setState` methods.
- **Actual live caller:** `FearServer` snapshot routes and CLI `fear-ai stepper` checkpoint flow.
- **Actual consumer:** a new or contaminated `RuntimeSimulation` instance after rehydration.
- **Persistence owner:** `RuntimeSimulation` owns top-level state; agents and component serializers own nested state.
- **Authority boundary:** snapshot loading restores middleware state only; host-owned identity architecture attachments are not serialized.
- **Proof artifact:** `tools/verification/verify_persistence_roundtrip.mjs` and `tools/verification/verify_long_horizon_lifecycle.mjs`.
- **Known limitation:** V1 cannot recreate fields that did not exist; the migration initializes documented defaults. Identity architecture objects still require host reattachment. The 5,000-tick probe covers the named RuntimeSimulation configuration and does not certify arbitrary custom subsystems or external host identity ownership.
- **Last verified / strength:** 2026-09-19; canonical full-state comparisons at +1/+10/+100 ticks, custom configuration, queued observations, prior contagion output, dirty state, V1 defaults, reset semantics, 5,000-tick bounded lifecycle, registration churn, finite snapshots, and post-load continuation.

### Multi-Agent Pack Coordination — `SCENARIO_VERIFIED`

- **Repository / commit:** `fear-ai-sim@3a56283`.
- **Source / symbol:** `packages/core/src/PackCoordinationEngine.js::PackCoordinationEngine`.
- **Actual live caller:** `bin/fear-ai.js` `pack` command, reference scenarios, and the compound-collision harness; it is not imported by `RuntimeSimulation`.
- **Actual consumer:** scenario/CLI tactical intent reports and host-applied vector hints.
- **Persistence owner:** pack fields on the scenario/agent state where the caller supplies them.
- **Authority boundary:** emits advisory formation/vector data; host owns geometry, physics, and collisions.
- **Proof artifact:** `tools/verification/verify_compound_collisions.mjs` plus direct CLI/reference evidence.
- **Known limitation:** this is an optional standalone tactical module, not automatic middleware-session coordination.
- **Last verified / strength:** 2026-09-19; deterministic collision scenario plus static caller trace.

### Economic Feedback & Pathology — `SCENARIO_VERIFIED`

- **Repository / commit:** `fear-ai-sim@3a56283`.
- **Source / symbol:** `packages/core/src/EconomicFeedbackSystem.js::EconomicFeedbackSystem` and `SettlementMigrationSystem` scenario consumers.
- **Actual live caller:** `bin/fear-ai.js` economy/migration commands and `EmergentSystemCollisionHarness`; not `RuntimeSimulation`.
- **Actual consumer:** closed-world market, migration, and famine scenario models.
- **Persistence owner:** scenario world systems and their snapshot/reporting paths.
- **Authority boundary:** advisory pressure and analytics; host owns inventory and world mutation.
- **Proof artifact:** Scenario 2 in `tools/verification/verify_compound_collisions.mjs`.
- **Known limitation:** the observed scenario has bounded prices, conserved population, and finite values. That evidence cannot support a universal guarantee against every economic pathology.
- **Last verified / strength:** 2026-09-19; one deterministic compound scenario plus static wiring inspection.

### Epistemic Belief & Rumor Diffusion — `SCENARIO_VERIFIED`

- **Repository / commit:** `fear-ai-sim@3a56283`.
- **Source / symbol:** `EpistemicBeliefEngine`, `InformationPropagationEngine`, and `AnticipatoryFearEngine` in `packages/core/src`.
- **Actual live caller:** `bin/fear-ai.js` `epistemic-fog` and scenario/harness paths; the engines are not automatically constructed by `RuntimeSimulation`.
- **Actual consumer:** scenario observers and host-provided `observations.reportedDanger`; `AffectiveAgent` consumes the reported field, not an implicit rumor-engine bridge.
- **Persistence owner:** the invoking scenario's rumor/belief records.
- **Authority boundary:** advisory perception bias only; host owns world truth.
- **Proof artifact:** scenario/reference evidence and the dashboard memory surfaces; no claim is made that the optional engines are core-runtime automatic.
- **Known limitation:** “Fear AI calculates rumor internally” and “host reports rumor-derived danger” are distinct contracts; the current core path supports the latter unless a scenario explicitly wires the former.
- **Last verified / strength:** 2026-09-19; static import/caller inspection and bounded scenario evidence.

### Designer Workbench Dashboard — `VERIFIED_CURRENT`

- **Repository / commit:** `fear-ai-sim@3a56283`.
- **Source / symbol:** `packages/runtime/src/DesignerDashboardServer.js::DesignerDashboardServer`, `attachSimulation`, and endpoint handlers.
- **Actual live caller:** `bin/fear-ai.js` `dashboard` command.
- **Actual consumer:** browser designers and read-only middleware telemetry clients.
- **Persistence owner:** attached `RuntimeSimulation`; dashboard itself is session-only.
- **Authority boundary:** observation and inspection only; attached inspection must not mutate the simulation.
- **Proof artifact:** `tools/verification/verify_dashboard_endpoints.mjs`.
- **Known limitation:** seven surfaces are deterministic vignettes, two are live reference simulations, and only `/api/sim/inspect` is an attached middleware session. HTTP success is not evidence of a production host attachment.
- **Last verified / strength:** 2026-09-19; 12-endpoint semantic harness with attached read-only inspection.

### Causal Counterfactual World Forks — `SCENARIO_VERIFIED`

- **Repository / commit:** `fear-ai-sim@51b6268`.
- **Source / symbol:** `packages/core/src/WorldCounterfactualEngine.js::WorldCounterfactualEngine` and `FrontierValleySimulation::fork/getState/setState`.
- **Actual live caller:** `bin/fear-ai.js` `counterfactual-world` command; direct engine callers can supply the same `FrontierValleySimulation` contract.
- **Actual consumer:** causal ATE report, first-divergence dimensions, and CLI scenario output; this is an observability/analytics path, not a host mutation path.
- **Persistence owner:** in-memory simulation state cloned by `FrontierValleySimulation.fork()`; no external host identity attachments are claimed.
- **Authority boundary:** the engine mutates only the counterfactual clone and emits advisory analytics; the source simulation and host state remain outside the mutation boundary.
- **Proof artifact:** `tools/verification/verify_counterfactual_world.mjs`.
- **Known limitation:** the proof is bounded to the `FrontierValleySimulation` summary fields and direct CLI/engine path. `DesignerDashboardServer` `/api/causal` constructs `CausalEventGraph`, a separate deterministic vignette, and is not presented as a dashboard wrapper for this world-fork engine.
- **Last verified / strength:** 2026-09-19; deterministic report replay, source/factual-branch isolation, macro and settlement-only effects, no-op invariance, and invalid-input/target guards.

### External Host Integration — `PARTIAL (RECORDED_HOST_EVIDENCE)`

- **Repository / commit:** sibling `New Master Game@f3f5e8d25` and descendants recorded in `evidence/audit_fear_ai_connection_extended_2026-09-19.md`.
- **Source / symbol:** `pixel-pets/src/engine/ai/fear_ai_bridge.rs::FearAiBridge::tick_unit_advisory`; audit binary `pixel-pets/src/bin/audit_fear_ai_connection.rs`.
- **Actual live caller:** Pixel Pets diagnostic/host path calls `FearAiBridge::tick_unit_advisory`.
- **Actual consumer:** host whitelist and `BrainDirector` → `GoapPlanner` advisory path.
- **Persistence owner:** Pixel Pets host save matrix, not Fear AI JS.
- **Authority boundary:** bridge reads host observations and submits advisory JSON; host owns transforms, HP, physics, and combat.
- **Proof artifact:** `evidence/audit_fear_ai_connection_extended_2026-09-19.md` and `evidence/host_sim_tick_profiling_2026-09-19.md`.
- **Known limitation:** evidence is tied to named sibling commits; the current sibling working tree is dirty and was not rebuilt in this audit.
- **Last verified / strength:** recorded 2026-09-19; strong bounded diagnostic evidence, not a clean-worktree universal-host certification.

## Downgraded or excluded claims

- The dashboard's `/api/causal` endpoint remains a separate `CausalEventGraph` vignette; it is not evidence that the dashboard exposes `WorldCounterfactualEngine`.
- WebSocket reconnect continuity is proven as server-scoped persistence; disconnect-driven agent retirement and per-connection ownership are intentionally not claimed.
- `Godot 4.6 Multi-Station Showcase` is `PARTIAL`: adapter conformance is proven, but the current proof registry does not assert every visual station.
- Unity remains `PARTIAL` until a real Unity Editor host is available.
- Unreal remains `DEFERRED` by owner policy.
- FABE and Moral Dissonance remain `EXPERIMENTAL`; human evaluation is not executed.
- Pack, economic, epistemic, and world-simulation modules remain optional scenario/CLI surfaces unless an explicit `RuntimeSimulation` wiring path is documented and proven.
- `SCENARIO_VERIFIED` is intentionally narrower than `VERIFIED_CURRENT`: it records a proven standalone or reference-world path without implying automatic runtime construction or external-host adoption.
