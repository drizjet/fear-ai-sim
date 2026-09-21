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
- **Known limitation:** the verified contract is server-scoped state continuity: WebSocket close removes the connection from `connectedClients` but does not automatically unregister agents, and a reconnect can continue the preserved state. Per-connection agent ownership, duplicate-client arbitration, and automatic cleanup of abandoned clients are not certified. The abuse probe is bounded protocol hardening, not cryptographic or general denial-of-service security certification. Request signing (`verify_transport_signing.mjs`) narrows one specific hole — a **leaked token is insufficient** under `--signature-policy=required`, and a presented-but-invalid signature is never downgraded to the bearer path — but it is **not TLS and not confidentiality**: payloads remain plaintext, a wire reader still sees everything and learns the (harmless) public key, the binary wire carries no session identity at all so a key cannot gate it, there is no per-route scoping, and — superseding the earlier "a persisted private key is unencrypted" — the persisted credential and private key are now written as an authenticated, encrypted container keyed from a keyring kept in a different directory tree, which defeats a leaked **file** but not a leaked **machine** (see the store entry below). The seeded arbitration fuzzer (`verify_fuzz_arbitration.mjs`) is single-threaded and sequential, driven one decision at a time the way the server drives arbitration, so it says nothing about concurrency or timing.
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
- **Source / symbol:** `packages/runtime/src/DesignerDashboardServer.js::DesignerDashboardServer`, `attachSimulation` / `attachOwnership`, and endpoint handlers.
- **Actual live caller:** `bin/fear-ai.js` `dashboard` command; `fear-ai dashboard --middleware [--middleware-port]` additionally starts a `FearServer` in-process and attaches **both** its simulation and its claim arbitration.
- **Actual consumer:** browser designers and read-only middleware telemetry clients.
- **Persistence owner:** attached `RuntimeSimulation`; dashboard itself is session-only.
- **Authority boundary:** observation and inspection only; attached inspection must not mutate the simulation.
- **Proof artifact:** `tools/verification/verify_dashboard_endpoints.mjs`.
- **Known limitation:** seven surfaces are deterministic vignettes, two are live reference simulations, and only `/api/sim/inspect` and `/api/ownership` are attached live state. HTTP success is not evidence of a production host attachment. The ownership view is explicitly typed as read-only server session state (`POST /api/ownership` is a `404`), and it renders no token material: the credential sanitiser strips token-keyed string/container fields while deliberately preserving derived flags such as `has_token`, and the probe drift-tests it in both directions. The **identity audit timeline** is no exception and no more than it claims: it is a per-process ring (bounded to 100, `timeline_scope: 'THIS_PROCESS'`), it is **not part of a snapshot**, so an empty ring after a restart must not be read as "nothing happened", and it is a diagnostic rather than a durable or tamper-evident audit log. It carries names, ids, outcomes and fingerprints only — never a token, a signature or a key body.
- **Last verified / strength:** 2026-09-20; 13-endpoint semantic harness over 11 tabs with attached read-only inspection plus live session ownership (attached/unattached states distinguished, refusal visibility, read-only enforcement, credential sanitiser drift-tested for both over- and under-stripping), the refusal drill-down, and the identity audit timeline (7 ordered grant/refusal rows asserted newest-first and token-free, the oldest grant asserting its **proof**, a credential-proven grant distinguished from a fresh name claim, a refused row's headline asserted identical to the drill-down's, and a 204-decision flood proving the ring is bounded to 100 and trims the correct end).

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

### External Host Integration — `VERIFIED_CURRENT` (`HOST_DIAGNOSTIC_CLEAN_COMMIT`)

- **Repository / commit:** sibling `New Master Game@6867da9f4` (clean-checkout diagnostic reproduction) on `codex/canonical-consolidation-2026-08-12`; historical recorded evidence at `f3f5e8d25` in `evidence/audit_fear_ai_connection_extended_2026-09-19.md`.
- **Source / symbol:** `pixel-pets/src/engine/ai/fear_ai_bridge.rs::FearAiBridge::tick_unit_advisory`; audit binary `pixel-pets/src/bin/audit_fear_ai_connection.rs`.
- **Actual live caller:** Pixel Pets diagnostic/host path calls `FearAiBridge::tick_unit_advisory`.
- **Actual consumer:** host whitelist and `BrainDirector` → `GoapPlanner` advisory path.
- **Persistence owner:** Pixel Pets host save matrix, not Fear AI JS.
- **Authority boundary:** bridge reads host observations and submits advisory JSON; host owns transforms, HP, physics, and combat.
- **Proof artifact:** `evidence/host_clean_commit_reproduction_2026-09-20.md`, `evidence/host_union_change_2026-09-20.patch`, `evidence/host_union_reproduction_2026-09-20.md`, `evidence/host_provenance_reconciliation_2026-09-20.md`, `evidence/audit_fear_ai_connection_extended_2026-09-19.md`, `evidence/host_sim_tick_profiling_2026-09-19.md`, the historical rebuild record `evidence/host_rebuild_attempt_2026-09-19.md`, and the read-only probe `tools/verification/verify_host_provenance.mjs`.
- **Known limitation:** the promotion is bounded to the committed host diagnostic. The 2026-09-20 provenance work established that the original evidence split across two unmerged lineages (`f3f5e8d25` declared `mod persistence_restore` without committing the module; the module lived only on `reconcile/dirty-canonical-2026-09-16`, which lacked `formation_geometry.rs`). The one missing module was landed as host commit `6867da9f4` on `codex/canonical-consolidation-2026-08-12`, and the diagnostic was rebuilt and run from a clean checkout of that commit (offline, exit 0, all 8 sections pass, zero mutation `ΔX=ΔY=ΔHP=0`). This certifies the committed diagnostic scope only: it is not a universal host-game or multi-engine certification, does not cover Unity/Unreal, does not establish per-connection ownership, and does not adopt the diagnostic binary's own production banner. The `reconcile/dirty-canonical-2026-09-16` lineage still carries a duplicate module for a future merge to reconcile.
- **Last verified / strength:** 2026-09-20; clean checkout of the landed host commit builds offline and the diagnostic passes all 8 sections. Strong for the committed diagnostic scope, bounded beyond it.

## Credential lifetime, gated destruction, and host-side persistence

- **Destruction is now arbitrated like registration.** `unregister` (singular, batch and both WebSocket routes) and a `clear_agents` reset are ownership-gated (`authorizeTeardown`, `authorizeReset`), which they were not: any client could previously delete any crowd, making every claim rule beside the point. A refusal mutates nothing, names the owner, and carries a bounded `retry_after_ms`; an agent whose owner is no longer live is removable and reported as `RELEASED_OWNER_STALE` — the same window in which it is already adoptable, so cleanup grants an attacker nothing adoption did not. A reset additionally refuses while *another* live session owns agents, and a middleware restart is the deliberate way past a live owner's objection because restored sessions are unbound.
- **A stranger can no longer hold a session alive.** An earlier revision refreshed the incumbent's `lastSeen` on a refusal. Nothing a stranger sends can *shorten* that window (it is a function of the incumbent's own silence), so the refresh could only ever extend it — a denial of service where repeating a name pins a crowd to a credential its own owner may no longer hold. Liveness now moves on proven traffic only. Proven on the clock in `verify_protocol_abuse.mjs`.
- **The credential has a lifetime and a host-controlled end**, and every refusal is explained to a designer through the dashboard's drill-down rather than only counted. See the ledger's §22 for the full rule set.
- **Host persistence is the host's job, and it is now tested as one.** `verify_host_token_persistence.mjs` runs the Godot client in **three separate engine processes** with one store file between them and restarts the middleware in the middle; `verify_unity_adapter_behavior.mjs` does the Unity equivalent in two processes. Both assert that a restarted host is `GRANTED` its crowd rather than refused or adopted, which only means anything because the previous session is still live on the server and a name-only claim would have been refused.
- **Not claimed:** ownership is **continuity, not access control** — it protects a live session's agents from other sessions and nothing else, with no transport security behind it; expiry bounds a leak's useful life rather than revoking it; a stolen token can revoke; the refusal log is a bounded diagnostic, not an audit trail. The credential store is **no longer plaintext** — it is an authenticated, encrypted container written by default whenever persistence is on, with the keyring in a separate directory tree, so a copied file is inert — but it is still **opt-in**, and the encryption does not change the fact that anyone who can read both the store and the keyring on the same machine can decrypt it. A shared machine remains a shared credential; what changed is that a shared **folder** no longer is.

## Downgraded or excluded claims

- The dashboard's `/api/causal` endpoint remains a separate `CausalEventGraph` vignette; it is not evidence that the dashboard exposes `WorldCounterfactualEngine`.
- WebSocket reconnect continuity is proven as server-scoped persistence. Per-connection ownership **is** now claimed for cooperating processes (a session binds to a socket only on proof of its token, and a socket close detaches it), but **disconnect-driven agent retirement is still intentionally not claimed**: an abandoned owner's agents survive by design and become adoptable only once the session is not live.
- **Control plane and session ownership (RC1 transport additions).** Registration, teardown and trauma authoring all batch under one bound (`MAX_BATCH_CONTROL_ITEMS`, 512) across HTTP and the binary wire, with envelope-level `400`s separated from per-entry rejections. The batched control plane is proven structurally by `verify_server_lifecycle.mjs` and measured once by `npm run measure:session-bringup` (256 agents: 133.9 ms over 256 requests → 1.9 ms over one) — a structural claim about request counts, **not** a performance guarantee, and one machine's figures for one loopback workload (`evidence/batch_control_plane_2026-09-20.md`, `evidence/session_bringup_2026-09-20.md`). Session ownership (`packages/runtime/src/ClaimArbitration.js`, consulted on claim paths only, never on the tick hot path) closes the ledger's open host/session contract: a reconnecting host is distinguishable from a rival claiming the same crowd, a refused claim mutates nothing and is reported per entry with the live owner named, an abandoned connection's agents **and** ownership survive while the session reads `attached: false`, and `claim: "takeover"` is the explicit, counted way to displace a live owner. `verify_server_reconnect.mjs` proves all of it over real loopback WebSockets. This is session **bookkeeping**, not authorization or authentication: ownership gates claims rather than reads, the transport is plain loopback with no TLS, and staleness is a heuristic rather than a heartbeat (`evidence/session_ownership_2026-09-20.md`). A caller naming no session keeps byte-identical legacy behaviour and records no ownership at all.
- **The persisted credential and signing key are encrypted at rest.** The store is a `FEAR-AI-STORE-V1` container: PBKDF2-HMAC-SHA256 into two labelled keys, AES-256-CBC with the PKCS#7 applied **by the format rather than by the library**, and an HMAC-SHA256 over the exact file text, checked before anything is decrypted. The credential and the private key are absent from the file **bytes**; the session NAME is plaintext **on purpose** (it is not a credential, and it answers "which host is this?" for a stray store) and is inside the MAC, so it cannot be edited. The keyring lives in a user-scoped configuration path, **not** the game's data tree, and a copy of the store without it is inert. Encryption is on by default for any host that already turned persistence on; a write with no usable keyring is **refused and reported** rather than silently downgraded, and only an environment with no keyring path at all can reach the explicit `allow_plaintext` opt-out (`PLAINTEXT_BY_REQUEST`). Legacy plaintext stores are read, reported `PLAINTEXT_LEGACY` and rewritten encrypted **in place** on the next credential issue. **Verified:** Node, Godot 4.6 **in engine** and the C# container (compiled and run with **no Editor**) produce **bit-identical** containers for the same inputs, and a wrong passphrase, an edited field, a flipped ciphertext byte, truncation, a foreign version, a downgraded cipher and a newline in the name are each refused for a reported reason (`verify_store_encryption.mjs`, 46 assertions). The restart round trip is proven across **six engine processes** including a middleware restart, with the private key read back verbatim and re-imported by the Node reference (`verify_host_token_persistence.mjs`, 44 assertions), and the Unity adapter writes and restores both halves in `verify_unity_adapter_behavior.mjs` (37 assertions, 4 processes). **Not claimed:** this protects a leaked **file**, not a leaked **machine** — both files together still decrypt, and there is no TPM, no OS keystore and no per-user ACL; Python and the standalone C# client persist no session credential and are unchanged; and it is not confidentiality on the wire.
- **Session identity tokens and ownership across a restart.** The earlier formulation — that a `session_id` was the claimant's only identity and that sessions did not outlive the process — is superseded. Identity now separates a host-chosen **name** (not a credential; anyone who has seen it can write it down) from a server-issued **256-bit token** returned exactly once, stored only as a SHA-256 hash, and compared in constant time, so naming a live session no longer inherits its crowd and neither the sessions route nor a snapshot can leak a credential. A matching token is recognised regardless of liveness (the reconnect path, including across a middleware restart); a claimed-but-not-live name is adopted with a **new** token and the old one retired; a claimed-and-live name is refused with nothing mutated, and a mismatched token is a distinct counted refusal rather than a silent fall-through. Batches resolve identity **once per request** and then arbitrate per agent, because a new session's token is minted during identity resolution and only reaches the host in the response. Ownership rides in the snapshot as `sessions` (hashes only), filtered to agents the snapshot actually restored, and every restored session starts **unbound** so a restored session can never block the host it belongs to — which also means an ownership snapshot is not liveness. `verify_server_lifecycle.mjs` covers issuance, rotation, refusal, mismatch, the batched single-identity path, the snapshot round-trip including ownership, and a dedicated restart section; `verify_server_reconnect.mjs` proves the contract over real loopback WebSockets. **Not claimed:** this is not authentication against a network adversary (unencrypted loopback transport), and tokens are bearer credentials. The credential now has a bounded life and a host-controlled end — `tokenTtlMs` expiry (7 days by default) that is honoured **once** and rotated rather than refused, `rotate_token: true` to retire a credential on demand, and `POST /api/v1/session/revoke` — but expiry bounds how long a leaked token is useful rather than undoing the leak, and a stolen token can revoke.
- `Godot 4.6 Multi-Station Showcase` is `VERIFIED_CURRENT (HEADLESS_IN_ENGINE + LIVE_SERVER_PIPELINE + STATION_ADVISORY_CONTRACT + FALLBACK_NUMERIC_PARITY)`: adapter conformance is proven, and `tools/verification/verify_godot_stations.mjs` derives the station table from `station_controller.gd` and independently asserts each behavioral station's advisory contract on the canonical JS core, plus the station-10 chain contract and the advisory-only boundary. Three stronger artifacts now sit alongside it: `tools/verification/verify_godot_fallback_parity.mjs` (37 assertions) pins the offline fallback's **numbers**, not just its vocabulary, against `fear_canonical_core.gd` — a module that `tools/codegen/generate_godot_fallback.mjs` derives from the live JS core, so the constants have one authored source; `tools/run-godot-inengine-evidence.mjs` (`npm run godot:evidence`) executes four conformance suites inside the real Godot 4.6 binary against a `FearServer` it starts on a verified-free port — the 2026-09-20 host run returned 13/13 showcase stations, 3/3 civilization checks, 4/4 canonical fixtures and 38/38 live-session assertions at exit 0; and `tools/verification/verify_godot_live_pipeline.mjs` (128 assertions) keeps the live path from rotting into dead code. This row previously carried no live-run evidence, and the showcase previously had no live mode at all — `ShowcaseAgent` evaluated the local fallback on every frame while the client never registered agents, so a JSON-transport client silently produced no advisories. Both are now real and asserted, and six concrete defects fell out of the work (see §17 of the ledger and `evidence/godot_live_pipeline_2026-09-20.md`). The six showcase-local divergences from the canonical contract that the probe originally pinned as tripwires are resolved — canonical band/intent vocabulary in the offline fallback, canonical habituation and fear integration, a vocabulary-consistent duplicate adapter copy, a de-staled Godot-side runner, and a station-6 reroute threshold calibrated to the canonical chain hazard (see `evidence/godot_divergence_resolution_2026-09-20.md`). **What remains outside the claim**: every in-engine suite runs `--headless`, so this is an execution claim, not a rendering, visual-fidelity, frame-presentation, Editor, or host-game claim — see `evidence/godot_inengine_evidence_2026-09-20.md`.
- Unity remains `PARTIAL` until a real Unity Editor host is available, but its control plane is no longer only *read*: `tools/verification/verify_unity_adapter_behavior.mjs` **executes** the unmodified adapter against a live `FearServer` in three separate OS processes, through a shared UnityEngine shim (`tools/verification/unity/UnityEngineShim.cs`) that performs real HTTP, real JSON and real storage. That proves batched registration, refusal accounting on both claim and teardown, credential-on-teardown, request signing, and that a new process loading the persisted credential is `GRANTED` its crowd; `verify_dotnet_adapters_compile.mjs` compiles the same files against the same shim, so the compile gate and the behaviour gate cannot diverge. An **EditMode test project now exists in the package** (`packages/adapters/unity/Tests/EditMode/`, Editor-only and `UNITY_INCLUDE_TESTS`-guarded) covering the signer's hand-built SPKI DER **parsed structurally**, the credential stores against the Editor's real file system and PlayerPrefs, the client's defaults, and the JSON escape surface with a `JsonUtility` round trip. Those fixtures are **compiled AND run** here (against the same shim plus a minimal NUnit surface whose assertions are real implementations, not no-ops), through `tools/verification/unity/NUnitTestRunner.cs`, with the number of cases that ran and the fixtures that were found both checked against counts derived from the test sources — which is how a test body that could never pass on any machine was found rather than discovered on the day an Editor is first installed. `npm run verify:unity-editor` executes them in a real Editor on any machine that has one, and reports `SKIPPED` here, so no Editor has run them. The adapter's lifecycle **bodies** are driven rather than declared untestable: `UnityLifecycle` runs `Awake` then `OnEnable`, `Start` once then `Update`, and `OnDisable` then `OnDestroy` on destruction, in Unity's order, with that order asserted on an instrumented component before it is used on the adapter — so `OnEnable`, `Start`, `Update`, `OnDisable` and `OnDestroy` on `FearAIClient` are no longer shipped unexecuted. What remains unverified is therefore Editor-only and is stated, not implied: WHEN Unity calls the lifecycle relative to `AddComponent`, a scene load or a frame boundary, coroutines running to completion synchronously instead of across frames, the shim being this repository's implementation of Unity's surface rather than Unity's own API, and `FearAgent.cs`/`FearAgentHUD.cs` being covered by no probe. Every probe that needs an external tool reports `SKIPPED`, never `PASS`, when it is absent; `verify_unity_editor_tests.mjs` can be made strict with `FEAR_AI_UNITY_REQUIRED=1`, which is what a machine that has an Editor should set.
- **Engine-adapter control-plane parity** is claimed for all four clients, and bounded per client rather than in aggregate: Godot (reference), Python, the standalone C# client and the Unity adapter each carry session identity attached at the claim site, batched register/unregister/trauma, a `404` legacy fallback, and refusal/rejection reporting, with the duplicated 512-item cap parsed out of each language and asserted equal to the server's constant (`verify_adapter_conformance.mjs` Suite 6). Python is live-verified against a real `FearServer` (`--self-check`, 17 checks, one round trip per verb, a name-only rival refused, a proven token reconnecting) and **Godot** and **Unity** are now behaviour-verified across process restarts (`verify_host_token_persistence.mjs`, three engine processes plus a middleware restart; `verify_unity_adapter_behavior.mjs`, two OS processes). The C# client is compile-verified and statically conformance-checked with no live runner in this repository, so its runtime behaviour is not exercised here. **Destruction requires the credential too**: teardown is ownership-gated, and every adapter must send its token with it — a gap that existed in all four clients until the Godot in-engine run found it, now pinned per adapter by Suite 7, drift-tested by stripping the token line.
- Unreal remains `DEFERRED` by owner policy.
- FABE and Moral Dissonance remain `EXPERIMENTAL`; human evaluation is not executed.
- Pack, economic, epistemic, and world-simulation modules remain optional scenario/CLI surfaces unless an explicit `RuntimeSimulation` wiring path is documented and proven.
- `SCENARIO_VERIFIED` is intentionally narrower than `VERIFIED_CURRENT`: it records a proven standalone or reference-world path without implying automatic runtime construction or external-host adoption.
