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

- Fear AI JS checkout: `C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim`, clean at `3a56283` during this audit.
- Pixel Pets host: `C:\tools\03-Projects\lains Tools\New Master Game`, branch `codex/canonical-consolidation-2026-08-12`, checked out at `d8ec1715c` with unrelated uncommitted changes. Host evidence is referenced by named commits and recorded artifacts, not by the dirty working tree.
- Elixir/NIF tree: outside this release scope; its normalized `[0,1]` model is intentionally not parity-equivalent to the Rust/JS 0–5 hysteresis model.

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

- **Repository / commit:** `fear-ai-sim@3a56283` plus the current uncommitted hardening changes being audited.
- **Source / symbol:** `packages/runtime/src/RuntimeSimulation.js::saveSnapshot/loadSnapshot` and component `getState/setState` methods.
- **Actual live caller:** `FearServer` snapshot routes and CLI `fear-ai stepper` checkpoint flow.
- **Actual consumer:** a new or contaminated `RuntimeSimulation` instance after rehydration.
- **Persistence owner:** `RuntimeSimulation` owns top-level state; agents and component serializers own nested state.
- **Authority boundary:** snapshot loading restores middleware state only; host-owned identity architecture attachments are not serialized.
- **Proof artifact:** `tools/verification/verify_persistence_roundtrip.mjs`.
- **Known limitation:** V1 cannot recreate fields that did not exist; the migration initializes documented defaults. Identity architecture objects still require host reattachment.
- **Last verified / strength:** 2026-09-19; canonical full-state comparisons at +1/+10/+100 ticks, custom configuration, queued observations, prior contagion output, dirty state, V1 defaults, and reset semantics.

### Multi-Agent Pack Coordination — `VERIFIED_CURRENT`

- **Repository / commit:** `fear-ai-sim@3a56283`.
- **Source / symbol:** `packages/core/src/PackCoordinationEngine.js::PackCoordinationEngine`.
- **Actual live caller:** `bin/fear-ai.js` `pack` command, reference scenarios, and the compound-collision harness; it is not imported by `RuntimeSimulation`.
- **Actual consumer:** scenario/CLI tactical intent reports and host-applied vector hints.
- **Persistence owner:** pack fields on the scenario/agent state where the caller supplies them.
- **Authority boundary:** emits advisory formation/vector data; host owns geometry, physics, and collisions.
- **Proof artifact:** `tools/verification/verify_compound_collisions.mjs` plus direct CLI/reference evidence.
- **Known limitation:** this is an optional standalone tactical module, not automatic middleware-session coordination.
- **Last verified / strength:** 2026-09-19; deterministic collision scenario plus static caller trace.

### Economic Feedback & Pathology — `VERIFIED_CURRENT`

- **Repository / commit:** `fear-ai-sim@3a56283`.
- **Source / symbol:** `packages/core/src/EconomicFeedbackSystem.js::EconomicFeedbackSystem` and `SettlementMigrationSystem` scenario consumers.
- **Actual live caller:** `bin/fear-ai.js` economy/migration commands and `EmergentSystemCollisionHarness`; not `RuntimeSimulation`.
- **Actual consumer:** closed-world market, migration, and famine scenario models.
- **Persistence owner:** scenario world systems and their snapshot/reporting paths.
- **Authority boundary:** advisory pressure and analytics; host owns inventory and world mutation.
- **Proof artifact:** Scenario 2 in `tools/verification/verify_compound_collisions.mjs`.
- **Known limitation:** the observed scenario has bounded prices, conserved population, and finite values. That evidence cannot support a universal guarantee against every economic pathology.
- **Last verified / strength:** 2026-09-19; one deterministic compound scenario plus static wiring inspection.

### Epistemic Belief & Rumor Diffusion — `VERIFIED_CURRENT`

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

### External Host Integration — `VERIFIED_CURRENT`

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

- `Causal Counterfactual World Forks` is `PARTIAL`: the dashboard verifier exercises `CausalEventGraph`, not `WorldCounterfactualEngine`; a dedicated world-fork proof is still required.
- `Godot 4.6 Multi-Station Showcase` is `PARTIAL`: adapter conformance is proven, but the current proof registry does not assert every visual station.
- Unity remains `PARTIAL` until a real Unity Editor host is available.
- Unreal remains `DEFERRED` by owner policy.
- FABE and Moral Dissonance remain `EXPERIMENTAL`; human evaluation is not executed.
