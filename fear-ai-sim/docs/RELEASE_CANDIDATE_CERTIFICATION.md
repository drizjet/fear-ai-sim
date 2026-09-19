---
title: "Fear AI — Release Candidate Certification Dossier"
created: 2026-09-19
updated: 2026-09-19
type: certification
status: active
---

# Fear AI — Release Candidate Certification Dossier

**Version**: 1.1.2-PROVISIONAL (ledger `1.3.2-PROVISIONAL`)
**Date**: September 19, 2026
**Campaign**: Continuous Closure Phases 1–4 (Muse Spark / OpenCode)
**Repositories**:
- Fear AI: `C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim` (release audit baseline: `625ce5b`; current checkout is clean)
- Host: `C:\tools\03-Projects\lains Tools\New Master Game` (branch `codex/canonical-consolidation-2026-08-12`, commits `91af8f957` → `e2090880a` → `f3f5e8d25`)
**Standard**: Reconciled Evidence Protocol — Hard Rule 9 (zero automated test runners; static review + standalone deterministic proofs only).
**Invariants**: Host retains 100% authority over transforms, physics, collision, damage, inventory. Fear AI emits strictly non-mutating advisory intents and affective states.

---

## 1. Verdict

**RELEASE CANDIDATE: PROVISIONAL / NOT CERTIFIED** — the named JavaScript harnesses pass in the current checkout, but the claim-to-code audit found scope mismatches that prevent final RC1 certification. Passing a bounded harness is evidence for that scenario; it is not proof that every repository subsystem is live-integrated or universally safe.

| Proof | Command | Result (2026-09-19) |
|---|---|---|
| Persistence round-trip | `node tools/verification/verify_persistence_roundtrip.mjs` | PASS (canonical full-state 1/10/100-tick parity, custom state, queued observations, V1 defaults + 50-tick parity, soft/hard reset) |
| Long-horizon runtime lifecycle | `node tools/verification/verify_long_horizon_lifecycle.mjs` | PASS (5,000 ticks, registration churn, bounded caches/trauma/social state, finite snapshots, post-load continuation) |
| JavaScript runtime performance metadata | `node tools/verification/measure_runtime_performance.mjs` | OBSERVED (two metadata-bearing 100-tick runs after 10 warmups; primary p99 0.4307/0.9025/3.6962 ms and clean-audit rerun 0.4226/0.8077/4.0664 ms at 32/128/512 agents; not a pass/fail gate) |
| Runtime wiring boundary | `node tools/verification/verify_runtime_wiring.mjs` | PASS (core live tick path, optional-module exclusion from `RuntimeSimulation`, explicit CLI/scenario entry points, FearServer ownership, dashboard attachment boundary) |
| Compound collisions | `node tools/verification/verify_compound_collisions.mjs` | PASS (60-unit + 300-unit dispersal recovery, confined attractor + leader break, famine conservation, bit-exact replay) |
| Dashboard endpoints | `node tools/verification/verify_dashboard_endpoints.mjs` | PASS (12 endpoints, 10 tabs, attached read-only inspect) |
| World counterfactual engine | `node tools/verification/verify_counterfactual_world.mjs` | PASS (determinism, source/factual isolation, macro + settlement-only divergence, no-op and invalid-input guards) |
| Server lifecycle & protocol guards | `node tools/verification/verify_server_lifecycle.mjs` | PASS (HTTP/WS pacing validation, WS snapshot errors, correlation IDs, explicit unregister cleanup) |
| Real WebSocket reconnect | `node tools/verification/verify_server_reconnect.mjs` | PASS (real listener, close/reconnect continuity, continued tick, explicit retirement) |
| Protocol abuse boundaries | `node tools/verification/verify_protocol_abuse.mjs` | PASS (malformed input, version rejection, connection recovery, prototype-shaped traits, HTTP 413, WebSocket 1009) |
| Cross-tree parity | `node tools/verification/verify_cross_tree_parity.mjs` | PASS (17/17 boundary vectors bit-identical) |
| Adapter conformance (new) | `node tools/verification/verify_adapter_conformance.mjs` | PASS (123/123 assertions; C# handshake advertises `engine=CSharp`) |
| Moral dissonance (new) | `node tools/verification/verify_moral_dissonance.mjs` | PASS (110/110 assertions) |
| FABE personas (new) | `node tools/verification/verify_fabe_personas.mjs` | PASS (53/53 assertions) |
| Host skirmish audit | `cargo run --bin audit_fear_ai_connection` | Recorded PASS in sibling evidence at named commits; not rerun against the current dirty host checkout during this audit |
| C# adapter build | `dotnet build packages/adapters/csharp/FearAI.Client.csproj` | Recorded 0 warnings, 0 errors in the Phase 1 evidence; not rerun in this audit |

Current JS evidence: **13 Node verification harnesses — zero failures in this audit — plus 1 metadata-only performance measurement.** Host diagnostic and C# build results remain recorded external evidence, not fresh clean-worktree results here.

---

## 2. Phase proofs

### Phase 1 — Engine Adapter Verification & Conformance Hardening
- `dotnet build` on `FearAI.Client.csproj` (netstandard2.0 + net8.0): **0 warnings, 0 errors**.
- Static audit of Godot (`fear_ai_client.gd`, `fear_agent.gd`, `fear_types.gd`) and Unity (`FearAIClient.cs`, `FearAgent.cs`, `Runtime/FearTypes.cs`) against Canonical Protocol V1: handshake `HANDSHAKE_REQUEST/1.0.0`, `BATCH_TICK_REQUEST` with omitted-when-empty `capabilities` (legacy preservation), opt-in `peers`, `INTENT_OUTCOME_REPORT` → `/api/v1/outcome` → `INTENT_OUTCOME_ACK`, binary V2 constants (magic `0x52414546`, v2, 16/32 bytes, intent/band maps), advisory-only motors.
- New harness `verify_adapter_conformance.mjs` (123 assertions, Suites 1–4) passes 100%.

### Phase 2 — Tier 5 Research Decoupling & Standalone Verification
- `MoralDissonanceEngine.js` audited: Haidt 5-vector dot product (hand-verified .6525), Festinger caps (fear .60, order `AUTH×.50`, necessity .40, total .75), guilt integration `net×.80`, half-lives 138.3/346.2 ticks, injury at exactly 50 severe ticks with remodeling deltas, atonement floor 0, compliance deliberation, `auditImmutability` CLEAN with transforms/HP untouched.
- `FunctionalPersonaSignatures.js` audited: 11 logistic curves bounded [0,1] over 256 trait corners; N/R phase separation (N 3× R on `panicThreat` per shipped equation; opposite signs on `recoveryTime`/`contagionPeerFear`); near-neighbor N=.45/.55 separates; bit-identical determinism; seeded populations; confusion matrix; collapse scores; frozen-input safety.
- New harnesses `verify_moral_dissonance.mjs` (110) and `verify_fabe_personas.mjs` (53) pass 100%. Tier 5 stays `EXPERIMENTAL` (no live host consumer) — decoupled math certified, integration explicitly out of scope.

### Phase 3 — Sibling Host Engine Deep Integration & Skirmish Stability
- Bridge audit (`fear_ai_bridge.rs` → `submit_brain_intent_json` → `advisory_validation` → whitelist → `BrainDirector→GoapPlanner`): observation extraction (40.0px, allies 1, enemies 2), fear math (Calm 0.391/BPM 69 vs Routed 5.0/BPM 180/arrhythmia), BrainIntent JSON accepted with bias 0.840, zero mutation (ΔX=ΔY=ΔHP=0), Alpha election (veteran_01) with damping (2.0→1.328), Alpha Fall (DeepRetreat + SquadPanicRegroup + speech).
- Extended audit binary beyond the original 500-tick run. Section 7 now runs a **1v1/2v2/3v2/4v4/6v6 faction-configuration matrix**, a **2,000-tick multi-faction skirmish** (tick 2000 reached, finite state verified), a **719,600-offset exhaustive formation-geometry stress** (7 formations × 5 roles × 4 rotations × 4 spacings incl. `0.0` × 5 unit-counts × 257 slots), and a **live squad-path formation cycle** (24v24 partitioned squads cycled through all 7 formations over 70 ticks, largest squad 6 units).
- **Two honesty corrections**: (a) the pre-extension Section 7 *printed* "zero NaN drift" without asserting it — it now asserts finiteness of `x, y, vel_x, vel_y, hp, fear_score` on every unit in every configuration; (b) Section 8 previously only printed `[WARN]` on a latency budget breach while the summary still declared all sections passed — latency is now gated (advisory p95 <200µs target, enforced hard p99 <1ms).
- Root-cause fixes (committed in host repo `91af8f957`): `formation_geometry::square_offset` ring≥1 safeguard (modulo-by-zero found by the 500-tick run and now regression-guarded by the 719,600-offset stress), `overlay_audio` `#[cfg(windows)]` gating so Linux headless diagnostics compile.
- Proof recorded: `evidence/audit_fear_ai_connection_extended_2026-09-19.md` (supersedes `evidence/audit_fear_ai_connection_500tick_2026-09-19.md`).

### Phase 4 — Truth Ledger Reconciliation (reopened)
- Ledger moved to `1.3.2-PROVISIONAL` and now records the JS/host repository boundary, bounded evidence language, the expanded persistence contract, explicit claim-to-code traces, and a distinct standalone-scenario status in `docs/CLAIM_TO_CODE_AUDIT_2026-09-19.md`.
- `WorldCounterfactualEngine` is now `SCENARIO_VERIFIED` for the bounded `FrontierValleySimulation` and direct CLI/engine path after `51b6268` added world-summary divergence detection, explicit input/target guards, and `verify_counterfactual_world.mjs`; it is not an automatic `RuntimeSimulation` service or dashboard wrapper.
- Runtime transport/lifecycle is now `VERIFIED_CURRENT` for the bounded HTTP/WS dispatcher and explicit unregister path after `88cf80b` added finite pacing validation, truthful WebSocket snapshot errors, validation-error correlation IDs, and stale-state cleanup.
- A real-listener probe at `2a5e4e6` verifies the intended reconnect contract: socket close removes the transport connection but preserves server-scoped agent state, which a reconnect can continue ticking; explicit unregister retires it.
- The 5,000-tick lifecycle probe at `2611d6f` verifies bounded RuntimeSimulation state under repeated transient registration/removal and post-load continuation; this strengthens, but does not universalize, long-horizon claims.
- The protocol-abuse probe at `57c7528` verifies bounded malformed-input handling and payload limits across real HTTP/WebSocket listeners; it is protocol hardening evidence, not cryptographic or universal denial-of-service certification.
- The JavaScript runtime measurement records two one-machine middleware runs: primary p99 0.4307/0.9025/3.6962 ms and clean-audit rerun 0.4226/0.8077/4.0664 ms at 32/128/512 agents after the documented warmup. It is observational capacity evidence, not a universal threshold, Rust host benchmark, or release gate.
- The runtime wiring probe verifies the current scope boundary: core services are constructed by `RuntimeSimulation`, optional world/research modules are not, their direct CLI/scenario paths are explicit, `FearServer` owns the runtime, and the dashboard requires explicit attachment. This is a scope tripwire, not optional-module or external-host certification.
- The ledger now uses `SCENARIO_VERIFIED` for optional standalone/reference-world capabilities and `PARTIAL (RECORDED_HOST_EVIDENCE)` for Pixel Pets because its evidence is tied to a dirty sibling checkout. `VERIFIED_CURRENT` is reserved for the explicitly bounded current service/tool contracts that meet the stronger row-level evidence standard.
- The dashboard `/api/causal` endpoint remains explicitly separate: it exercises `CausalEventGraph`, not `WorldCounterfactualEngine`. `Godot 4.6 Multi-Station Showcase` remains `PARTIAL` until station-level proof is linked.
- Per-connection ownership, duplicate-client arbitration, and automatic cleanup of abandoned WebSocket agents remain uncertified; the verified contract is server-scoped persistence plus explicit unregister.
- The current JS harnesses pass, but the release gate remains open while external-host clean-worktree provenance and remaining live-wiring boundaries are reconciled.

---

## 3. Known gaps / non-blocking items (unchanged policy)
- **Unity UPM**: `PARTIAL (IMPLEMENTED_NOT_EDITOR_VERIFIED)` — package declared, protocol-conformant by static audit + harness; live Unity Editor verification still requires the editor GUI (external resource). Not blocking.
- **Unreal Engine 5**: `DEFERRED` per owner policy. Not blocking.
- **Tier 5 FABE/Moral**: `EXPERIMENTAL` — math certified advisory-only; no live host consumer; human evaluation blocked. Not blocking.
- **Middleware latency**: advisory p95 19µs / p99 34µs (release) and p95 143µs / p99 177µs (debug). Debug p95 is genuinely noisy (observed 122–199µs), so the certification gate is the enforced **p99 < 1ms** (~6% of a frame); the 200µs p95 figure is an advisory target, not a gate.
- **Current JS runtime baseline**: `evidence/js_runtime_performance_2026-09-19.md` records 0.4307/0.9025/3.6962 ms p99 at 32/128/512 agents on one Windows/Node host. This is middleware-only and must be rerun on the target environment; it does not replace the separately recorded host timing evidence or create a universal performance gate.
- **Host sim tick cost** (profiled in `evidence/host_sim_tick_profiling_2026-09-19.md`): **linear in unit count** (~0.3ms fixed base + ~89–112µs/unit in release; ~2.3ms + ~1.1ms/unit in debug). The earlier ~17.2ms/tick headline was an unoptimized **debug** measurement; release is ~1.28ms/tick (~13× faster) for the same 3v2 long-horizon run. No quadratic hotspot. This is the host simulation, not the middleware.
- **Persistence attachment boundary**: serialized middleware state does not include host-owned identity-architecture objects; a host must reattach them before claiming attached identity parity.
- **Dashboard causal boundary**: `/api/causal` verifies `CausalEventGraph`, not `WorldCounterfactualEngine`; the direct world-fork engine is proven separately and is not claimed as a dashboard wrapper.
- **Reconnect ownership boundary**: reconnect identity continuity is proven for the server-scoped model; disconnect-driven retirement, per-connection ownership, and duplicate-client arbitration are not certified.
- **Clean provenance gap**: the sibling host checkout is dirty at the time of this audit, so its named evidence commits are retained but not treated as a fresh clean-worktree certification.

Human evaluation remains **BLOCKED / NOT EXECUTED** for the experimental FABE research, and the overall RC1 gate remains open.

---

## 4. Reproduction

```bash
# Fear AI repo
node tools/verification/verify_persistence_roundtrip.mjs
node tools/verification/verify_long_horizon_lifecycle.mjs
node tools/verification/verify_compound_collisions.mjs
node tools/verification/verify_runtime_wiring.mjs
node tools/verification/verify_dashboard_endpoints.mjs
node tools/verification/verify_counterfactual_world.mjs
node tools/verification/verify_server_lifecycle.mjs
node tools/verification/verify_server_reconnect.mjs
node tools/verification/verify_protocol_abuse.mjs
node tools/verification/verify_cross_tree_parity.mjs
node tools/verification/verify_adapter_conformance.mjs
node tools/verification/verify_moral_dissonance.mjs
node tools/verification/verify_fabe_personas.mjs
node tools/verification/measure_runtime_performance.mjs
"/mnt/c/Program Files/dotnet/dotnet.exe" build "C:\\tools\\03-Projects\\lains Tools\\lainself\\fear-ai-sim\\fear-ai-sim\\packages\\adapters\\csharp\\FearAI.Client.csproj"

# Host repo (Linux headless; targeted diagnostic only; needs cargo)
cargo run --bin audit_fear_ai_connection
```

The thirteen JS verification commands were rerun in this audit and exited 0; the additional measurement command recorded metadata and the baseline above. Host and C# results above are recorded evidence from named prior runs. No `cargo test` / `npm test` / Jest was used (Hard Rule 9).

---

## 5. Authority & provenance
- Ledger: `docs/CURRENT_TRUTH_LEDGER.md` v1.3.2-PROVISIONAL (authoritative row-level mapping).
- Evidence: `evidence/audit_fear_ai_connection_extended_2026-09-19.md`, `evidence/host_sim_tick_profiling_2026-09-19.md`, `evidence/js_runtime_performance_2026-09-19.md`, `evidence/rust_js_parity_vectors.json`.
- Harness sources: `tools/verification/*.mjs` (13 current release proofs plus the metadata-only performance measurement named above).
- Host fixes: `pixel-pets/src/bin/audit_fear_ai_connection.rs`, `pixel-pets/src/engine/formation_geometry.rs`, `pixel-pets/src/overlay_audio.rs` (commit `91af8f957`); audit extended to the faction matrix + 2,000-tick + formation-stress pass in `e2090880a`; latency gate + live squad-path stress + tick scaling probe in `f3f5e8d25`.
- Superseded records: `docs/CUSTOM_ENGINE_INTEGRATION_SPEC.md`, `docs/NEW_MASTER_GAME_INTEGRATION_AUDIT_DOSSIER.md`, and `docs/FAILURE_AND_LIFECYCLE_MATRIX.md` are historical and must not be used to promote the current provisional verdict.
