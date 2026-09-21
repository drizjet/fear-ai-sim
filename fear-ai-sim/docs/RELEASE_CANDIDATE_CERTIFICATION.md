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
- Fear AI: `C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim` (runtime audit baseline: `625ce5b`; current working tree is clean and later claim-boundary commits are documentation-only descendants)
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
| Release-claim document boundaries | `node tools/verification/verify_release_claim_boundaries.mjs` | PASS (current scope markers present; superseded certification records explicitly historical) |
| Compound collisions | `node tools/verification/verify_compound_collisions.mjs` | PASS (60-unit + 300-unit dispersal recovery, confined attractor + leader break, famine conservation, bit-exact replay) |
| Dashboard endpoints | `node tools/verification/verify_dashboard_endpoints.mjs` | PASS (13 endpoints, 11 tabs, attached read-only inspect, and live session ownership: attached/unattached states distinguished, `POST /api/ownership` is a `404`, refusals visible, the **refusal drill-down** explained with verb, agent, caller, blocker and a bounded countdown — including the `null`-vs-`0` distinction between a blocker holding a socket and one already past its window — the credential sanitiser drift-tested in both directions, and the **identity audit timeline** (`timeline[]`: grants and refusals on one ordered, bounded, token-free stream scoped to this process, with a refused row's headline asserted identical to the drill-down's and a 204-decision flood proving the ring is bounded to 100 and trims the correct end) |
| World counterfactual engine | `node tools/verification/verify_counterfactual_world.mjs` | PASS (determinism, source/factual isolation, macro + settlement-only divergence, no-op and invalid-input guards) |
| Server lifecycle & protocol guards | `node tools/verification/verify_server_lifecycle.mjs` | PASS (HTTP/WS pacing validation, WS snapshot errors, correlation IDs, explicit unregister cleanup, **ownership-gated destruction** across singular/batch/WebSocket teardown and `clear_agents` reset with nothing mutated on refusal and `RELEASED_OWNER_STALE` for a dead owner's agents, **credential lifetime** — requested rotation retires the old token immediately, an expired credential is honoured once and replaced rather than locking its own host out, revocation needs the credential and leaves released agents registered — and the **refusal drill-down**, including a 60-refusal flood that cannot grow the bounded log) |
| Real WebSocket reconnect | `node tools/verification/verify_server_reconnect.mjs` | PASS (real listener, close/reconnect continuity, continued tick, explicit retirement) |
| Protocol abuse boundaries | `node tools/verification/verify_protocol_abuse.mjs` | PASS (malformed input, version rejection, connection recovery, prototype-shaped traits, HTTP 413, WebSocket 1009, **and a hostile host holding only a live session's name**: it may not claim that session's agents, tear one down, wipe the world, revoke the session or rotate its credential, the owner's credential survives untouched, and name-spamming cannot hold an idle session live) |
| Cross-tree parity | `node tools/verification/verify_cross_tree_parity.mjs` | PASS (17/17 boundary vectors bit-identical) |
| Adapter conformance (new) | `node tools/verification/verify_adapter_conformance.mjs` | PASS (210 assertions; C# handshake advertises `engine=CSharp`; Suite 5 sweeps the whole adapter tree for non-canonical fear-band vocabulary; Suite 6 asserts control-plane parity across all four clients — session identity present *and attached at the claim site*, batched register/unregister/trauma, a `404` legacy fallback, refusal/rejection reporting, and each adapter's declared batch cap parsed and compared against the server's constant; Suite 7 pins the **credential-on-teardown** contract per adapter with bounded source windows, drift-tested by stripping the token line and watching it fail) |
| .NET adapters compile | `node tools/verification/verify_dotnet_adapters_compile.mjs` | PASS on the 2026-09-20 host run (17 checks: the Unity control-plane files compile outside the editor against the **shared** UnityEngine shim — the same shim the behaviour probe runs — the standalone C# client is rebuilt with `-t:Rebuild`, and **the Unity EditMode tests are compiled** against the shim plus a minimal NUnit surface, so they are not shipped unread by a compiler where no Editor exists; the report states that they are compiled and *not executed*; reports `SKIPPED`, never `PASS`, when `dotnet` is absent) |
| Unity adapter behaviour (new) | `node tools/verification/verify_unity_adapter_behavior.mjs` | PASS on the 2026-09-20 host run (21 probe assertions across **three OS processes**; the unmodified adapter is executed against a live `FearServer` through the shared UnityEngine shim: one-request batched registration, refusal accounting for a tokenless rival on both claim and teardown, the owner's own teardown/trauma unrefused, the credential written to a real file, and a **new process loading that credential being GRANTED its crowd** with zero refusals; server-side tallies and the absence of the credential in the ownership listing are asserted too) |
| Host token persistence (new) | `node tools/verification/verify_host_token_persistence.mjs` | PASS on the 2026-09-20 host run (19 probe assertions across **three Godot 4.6 processes** plus a middleware restart: 9/13/12 in-engine checks; the credential is written at issue time, the store holds the session name and a 64-hex credential, a restarted host is `GRANTED` rather than refusory or adopted, a tokenless rival is refused a claim *and* a teardown, a credential hashed in a **previous server process** still proves continuity while a tokenless claim on the restored session is `ADOPTED`, and the reset gate refuses then permits a world wipe around another live session) |
| Session identity tokens & ownership across a restart | `node tools/verification/verify_server_lifecycle.mjs` | PASS (token issued once and hashed at rest, token rotation on adoption and takeover, refusal naming the live owner, counted token mismatch, batched single-identity path, snapshot round-trip **including ownership**, and a dedicated restart section: ownership and affective state survive, a kept token is recognised as a plain grant, a host without one adopts, restored sessions read unbound) |
| Moral dissonance (new) | `node tools/verification/verify_moral_dissonance.mjs` | PASS (110/110 assertions) |
| FABE personas (new) | `node tools/verification/verify_fabe_personas.mjs` | PASS (53/53 assertions) |
| Godot station advisory contract | `node tools/verification/verify_godot_stations.mjs` | PASS (169 assertions; station table derived from source, the nine behavioral station advisories reproduced on the canonical JS core, the station-10 live chain contract, the advisory-only boundary, and the six previously pinned divergences asserted as resolved) |
| Godot fallback numeric parity | `node tools/verification/verify_godot_fallback_parity.mjs` | PASS (37 assertions; generated artifact byte-current, fallback delegates, band/hysteresis/panic-lock sweep, habituation curve, intent urgency and investigate gates all reproduced from the shipped GDScript's declared constants) |
| Godot live in-engine conformance | `node tools/run-godot-inengine-evidence.mjs` | PASS on the 2026-09-20 host run (Godot 4.6 real binary, `--headless`; 13/13 showcase stations, 3/3 civilization checks, 4/4 canonical fixtures and the live-session showcase suite against a `FearServer` the runner starts on a verified-free port; all four suites exit 0) |
| Godot live-server pipeline (in-engine) | `run_showcase_live_conformance.gd` via `npm run godot:evidence` | PASS (38 assertions; the real `StationController` on a live `FearServer` session — 28/28 agents registered **in 1 batch request with 0 individual round trips**, 3 trauma zones in **1** request, teardown in **1** request, 0 dropped observations, `local_evaluations == 0` across every agent, server-authored escalation, an 8-agent contagion cascade, server trauma dread, ≈2,000 advisories applied) |
| Godot live-pipeline wiring | `node tools/verification/verify_godot_live_pipeline.mjs` | PASS (128 assertions; control-plane registration, batched teardown/trauma and session identity, mode router, full-advisory application, station live guards, runner wiring, credential persistence at issue time, and the credential-on-teardown contract) |
| Transport signing (new) | `node tools/verification/verify_transport_signing.mjs` | PASS on the 2026-09-20 host run (61 assertions: the 15-case decision matrix; the live policy behaviour of `off`/`preferred`/`required` including a **leaked token alone being refused** under `required` with nothing mutated and a presented-but-broken signature **never** downgraded to the bearer path; the WebSocket single-use challenge; snapshot continuity with the public key present and no private material or token; **Python and the Godot adapter in-engine** each signing the same bytes against a real server and never being refused; a **measured** 0.62 ms per RS256 verify on the control plane only. Not TLS, not confidentiality, and the binary wire carries no session identity so a key cannot gate it) |
| Arbitration fuzz (new) | `node tools/verification/verify_fuzz_arbitration.mjs` | PASS (16 assertions; **seeded and replayable** — the seed is printed, the same seed reproduces the identical trace and a different one does not; 4,500 operations across three seeds against the arbitration object with an injected clock plus 240 against the live HTTP control plane; refusal-inertness, stranger-cannot-reach-a-live-crowd, credential-is-not-a-name, ownership conservation after *every* operation, and revoked-credentials-are-worthless; the fuzzer drift-tests **itself** by requiring the checks to fire on a deliberately broken and a half-applied release) |
| Unity EditMode Editor gate (new) | `node tools/verification/verify_unity_editor_tests.mjs` | **SKIPPED** on this machine (no Unity Editor installed), exit 0, stating that the tests were neither compiled nor run here. The tests themselves are compiled by the `verify_dotnet_adapters_compile.mjs` row above. With an Editor present the runner assembles a throwaway project taking the package as a local `file:` dependency, lists it in `testables`, runs `-batchmode -runTests -testPlatform EditMode`, and fails on a red test, a missing results file, or **zero tests executed**. `FEAR_AI_UNITY_REQUIRED=1` turns the skip into a failure. **This row does not promote the Unity adapter** — no Editor has executed these tests |
| Batch control plane (register / unregister / trauma) | `node tools/verification/verify_server_lifecycle.mjs` | PASS (batch == singular semantics, 64-agent crowd, per-entry rejection with indices, duplicate collapse, envelope `400`s, over-limit rejected not truncated, binary-wire twins) |
| Session ownership & reconnect arbitration | `node tools/verification/verify_server_reconnect.mjs` | PASS over real loopback WebSockets (rival refused with nothing mutated, abandoned connection's agents *and* ownership survive and read detached, same-session reconnect re-adopts without duplication, `takeover` counted, teardown releases ownership) |
| Session bring-up measurement | `npm run measure:session-bringup` | MEASURED (256 agents: 133.9 ms over 256 requests → 1.9 ms over one; 512: 289.0 ms → 12.7 ms). Not a gate; one machine, one workload |
| Host skirmish audit | `cargo run --manifest-path pixel-pets/Cargo.toml --bin audit_fear_ai_connection` | PASS — reproduced 2026-09-20 from a **clean checkout of host commit `6867da9f4`** (offline build 50.15 s, exit 0, all 8 sections pass, zero mutation `ΔX=ΔY=ΔHP=0`, p99 `188 µs`). `6867da9f4` landed the one previously missing module (`persistence_restore.rs`) on `codex/canonical-consolidation-2026-08-12`, which already carried the formation-geometry safeguard. See `evidence/host_clean_commit_reproduction_2026-09-20.md` |
| Host provenance reconciliation | `node tools/verification/verify_host_provenance.mjs` | PASS (re-derives the divergent-lineage root cause read-only; gracefully records a skip when the sibling checkout is unavailable) |
| C# adapter build | `dotnet build packages/adapters/csharp/FearAI.Client.csproj` | Recorded 0 warnings, 0 errors in the Phase 1 evidence; not rerun in this audit |

Current JS evidence: **24 standalone verification probes — 18 runtime/behaviour Node harnesses (including the multi-process probes `verify_unity_adapter_behavior.mjs` and `verify_host_token_persistence.mjs` and the new `verify_transport_signing.mjs` and `verify_fuzz_arbitration.mjs`), 3 Godot source probes (`verify_godot_stations.mjs`, `verify_godot_fallback_parity.mjs`, `verify_godot_live_pipeline.mjs`), 1 release-claim document tripwire, 1 host-provenance reconciliation probe, and the Unity Editor gate — with zero failures in this audit.** One of them, `verify_unity_editor_tests.mjs`, reports `SKIPPED` rather than `PASS` because no Unity Editor is installed here; its exit code stays 0 by design, and it is not counted as a pass anywhere. The metadata-only performance measurement (`measure_runtime_performance.mjs`) is counted separately, because it is not a pass/fail gate. The Godot **live in-engine** evidence is separate from all of these: it requires the external Godot binary and is captured by `run-godot-inengine-evidence.mjs`, which runs four suites including the live-session showcase. Host diagnostic and C# build results remain recorded external evidence, not fresh clean-worktree results here.

---

## 2. Phase proofs

### Phase 1 — Engine Adapter Verification & Conformance Hardening
- `dotnet build` on `FearAI.Client.csproj` (netstandard2.0 + net8.0): **0 warnings, 0 errors**.
- Static audit of Godot (`fear_ai_client.gd`, `fear_agent.gd`, `fear_types.gd`) and Unity (`FearAIClient.cs`, `FearAgent.cs`, `Runtime/FearTypes.cs`) against Canonical Protocol V1: handshake `HANDSHAKE_REQUEST/1.0.0`, `BATCH_TICK_REQUEST` with omitted-when-empty `capabilities` (legacy preservation), opt-in `peers`, `INTENT_OUTCOME_REPORT` → `/api/v1/outcome` → `INTENT_OUTCOME_ACK`, binary V2 constants (magic `0x52414546`, v2, 16/32 bytes, intent/band maps), advisory-only motors.
- Harness `verify_adapter_conformance.mjs` (210 assertions, Suites 1–7) passes 100%. Suite 7 was added when teardown became ownership-gated on the server, because that change silently required every adapter to send its **credential** with a teardown and none of them did: a name-only teardown is refused as a stranger's request, so honest hosts were locked out of retiring their own crowds until the gap was closed in all four clients. Suite 5 sweeps every adapter tree (Godot, Unity, C#, Rust/Kotlin trees, wire type enums, HUD palettes) for non-canonical fear-band vocabulary. Suite 6 was added this campaign and holds all four clients to one control-plane contract — session identity that is actually attached at the claim site, batched register/unregister/trauma, a `404` legacy fallback, refusal and rejection reporting, and the duplicated 512-item cap parsed out of each language and compared against the server's constant, so a limit change cannot silently desynchronise the clients.

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
- **The session-ownership contract is bookkeeping, not a security boundary.** `packages/runtime/src/ClaimArbitration.js` makes a reconnecting host distinguishable from a rival claiming the same crowd, and it makes a refused claim a no-op. It is **not** authorization: ownership gates claims rather than reads, and a tick is served whether or not the caller owns the agent. Identity is split deliberately: a `session_id` is a host-chosen *name* that is not a credential, while a server-issued 256-bit `session_token` — hashed at rest, compared in constant time, returned once — is what proves continuity, which closes the name-guessing path a name alone left open. That is still **not** authentication against a network adversary: the server is loopback-bound plain HTTP/WebSocket with no TLS, so anyone who can read the wire can read a token, and tokens have no expiry, rotation policy or revocation endpoint. Ownership now **survives a middleware restart** (it rides in the snapshot as hashes, never raw tokens), with restored sessions deliberately unbound so a restored session can never block the host it belongs to — an ownership snapshot is therefore not liveness. `sessionStalenessMs` remains a heuristic rather than a heartbeat. See §20 of the ledger and `evidence/session_ownership_2026-09-20.md`.
- **Batching is a structural claim, not a performance guarantee.** A population of ≤ 512 control items costs one request instead of one per item; the recorded bring-up figures are one machine's numbers for one loopback workload, taken with run metadata so they can be re-taken rather than believed. See `evidence/session_bringup_2026-09-20.md`.
- The ledger uses `SCENARIO_VERIFIED` for optional standalone/reference-world capabilities. `VERIFIED_CURRENT` is reserved for the explicitly bounded current service/tool contracts that meet the stronger row-level evidence standard, and controlled qualifiers narrow it further: `HOST_DIAGNOSTIC_CLEAN_COMMIT` for the Pixel Pets host row, and `HEADLESS_IN_ENGINE` + `LIVE_SERVER_PIPELINE` + `STATION_ADVISORY_CONTRACT` + `FALLBACK_NUMERIC_PARITY` for the Godot showcase row. Each qualifier names a distinct evidence kind — live execution, live middleware pipelining, source-level contract, and numeric parity — so none of them silently upgrades into another.
- The dashboard `/api/causal` endpoint remains explicitly separate: it exercises `CausalEventGraph`, not `WorldCounterfactualEngine`. `Godot 4.6 Multi-Station Showcase` carries `VERIFIED_CURRENT (HEADLESS_IN_ENGINE + LIVE_SERVER_PIPELINE + STATION_ADVISORY_CONTRACT + FALLBACK_NUMERIC_PARITY)`: `verify_godot_stations.mjs` independently asserts each station's advisory contract on the canonical JS core, `verify_godot_fallback_parity.mjs` pins the offline fallback's numbers against a module generated from the live JS core, and `run-godot-inengine-evidence.mjs` executes four conformance suites inside the real Godot 4.6 binary — including `run_showcase_live_conformance.gd`, which drives the real `StationController` against a live `FearServer` and asserts that every advisory the showcase acted on was server-authored with the fallback used nowhere (`local_evaluations == 0` across all 28 agents). `verify_godot_live_pipeline.mjs` (128 assertions) keeps that live path from rotting at source level. The boundary is exact: every in-engine suite runs `--headless`, so no rendering, visual-fidelity, frame-presentation, Editor, or host-game claim is made, and the evidence runner reports `SKIPPED` rather than `PASSED` when no Godot binary is installed.
- **The fallback is a calibrated approximation, and the record says so.** The live run measured a real divergence: the showcase's station-2 sound stimulus yields fallback fear `0.12` and server fear `0.00`, because the server gates a sound-only tick on `fearInput > 0.15`, scales perceived threat by DDA pacing intensity (0.2 in `EXPOSITION`), and applies a 0.6 sound weight, while the fallback has none of those. `FALLBACK_NUMERIC_PARITY` therefore covers the band/hysteresis/panic-lock machinery, the habituation curve, and intent urgency/gates — not the raw-fear integration stack. A host needing the fallback to match server fear values must run the server. See `evidence/godot_live_pipeline_2026-09-20.md`.
- The live path also closed six real defects that no source-level probe had seen: a JSON-transport client that never registered agents and therefore silently produced no advisories at all; control requests dropped when the HTTP transport was busy; all 28 showcase agents sharing one server-side identity (`agent`) and receiving each other's advisories; live state application omitting `affective_state.raw_fear`; stations writing fear state the server owned; and demo stations 1 and 4 unable to perceive their own threat nodes at the showcase's ~350-unit scene scale against a 20-unit default threat radius. The six showcase-local divergences that the station probe had pinned as tripwires are now resolved (the offline fallback speaks the canonical band/intent vocabulary with canonical habituation and integration, the duplicate adapter copy is vocabulary-consistent, the Godot-side runner is de-staled, and the station-6 reroute threshold is calibrated to the canonical chain hazard) — see `evidence/godot_divergence_resolution_2026-09-20.md` and `evidence/godot_inengine_evidence_2026-09-20.md`.
- Per-connection ownership and duplicate-client arbitration are now **certified for cooperating processes**: a session binds to a socket only on proof of its token (`bindIfProven`), a socket close detaches every session bound to it without touching agent state, and a rival naming a live session is refused per entry with the owner named. The residual limits are exact: a `session_id` is caller-declared (so this is not authentication), the transport is unencrypted loopback, `sessionStalenessMs` is a heuristic, and **automatic cleanup of an abandoned WebSocket's agents is still not performed** — a dropped owner's agents survive by design and become adoptable only once the session is not live. Note what this does and does not combine with: the persisted credential is now encrypted at rest (§28), but the **wire** is still plaintext, so a reader on the transport still sees a token, and encrypting a file does nothing about that.
- The station-level probe also repaired a real showcase defect it surfaced: station 6 declared `reset_station_6()` in the controller but had no reset case in `main.gd`'s dispatch, so the caravan station could not be reset from the showcase UI.
- Godot **rendering, visual fidelity, and frame presentation remain unverified**. The in-engine evidence is real execution evidence — the three suites run inside the Godot 4.6 binary, not a simulation of one — but every suite runs `--headless`, so nothing asserts that a station *looks* correct. Unity's Editor gap is unchanged by this: Godot's in-engine run is the standalone binary, not the Editor, and no Editor-mode claim is made for either engine.
- The in-engine runner is not an independent oracle for station semantics. It evaluates stations against the showcase's own fallback; independence comes from `verify_godot_stations.mjs` (canonical JS core) and `verify_godot_fallback_parity.mjs` (numeric parity against the generated module). The in-engine run proves the GDScript executes and its assertions hold in the engine; the probes prove those assertions are the right ones.
- The current JS harnesses pass, but the release gate remains open while external-host clean-worktree provenance and remaining live-wiring boundaries are reconciled.

---

## 3. Known gaps / non-blocking items (unchanged policy)
- **Release surface (RC1)**: the release candidate is the in-scope middleware contract defined in `docs/RELEASE_SURFACE.md` — core affective SDK, protocol, runtime transport, adapters, and designer tooling. Tier 2 optional modules (`PackCoordinationEngine`, `EconomicFeedbackSystem`, `EpistemicBeliefEngine`, `InformationPropagationEngine`, `SettlementMigrationSystem`), Tier 3 analytics beyond the dashboard (`WorldCounterfactualEngine`), the standalone world-sim/research tail, the Tier 5 research models (FABE, Moral), the Elixir tree, and the deferred Unreal adapter are **explicitly out of scope**: they ship as separate standalone tools or remain research. `verify_runtime_wiring.mjs` (code) and `verify_release_claim_boundaries.mjs` (document) enforce the boundary.
- **Unity UPM**: `PARTIAL (BEHAVIOR_VERIFIED_OUTSIDE_EDITOR, IMPLEMENTED_NOT_EDITOR_VERIFIED)` — package declared, protocol-conformant by static audit + harness, and the control-plane files now both **compile and run** outside the editor: `verify_unity_adapter_behavior.mjs` executes the unmodified adapter against a live `FearServer` in two OS processes (batched registration, refusal accounting on claim *and* teardown, credential-on-teardown, and a restarted process `GRANTED` its crowd from the persisted credential), and `verify_dotnet_adapters_compile.mjs` compiles the same files against the same shim so the two gates cannot diverge. What remains is Editor-only, and it is real: `Awake` is invoked by the harness rather than by the engine, coroutines run to completion synchronously instead of across frames, the shim is this repository's implementation of Unity's surface rather than Unity's own API (a signature that differs from the real one would pass here and fail in the editor), and `FearAgent.cs`/`FearAgentHUD.cs` are covered by neither probe. Live Unity Editor verification still requires the editor GUI (external resource). Not blocking.
- **Host credential persistence**: persistence is still off by default, but the store is **no longer a plaintext bearer credential**. The credential **and** the private signing key are written as an authenticated, encrypted container (`FEAR-AI-STORE-V1`) keyed from a keyring kept in a **different directory tree**, on by default for any host that turns persistence on, in every adapter that can persist one. A write that cannot reach a keyring is **refused** rather than silently downgraded. Verified for Godot (six engine processes, including a middleware restart, an in-place plaintext→encrypted upgrade, and a private key read back verbatim) and Unity (four processes, the store written by the real adapter and read back by both the adapter and the Node reference); the C# container is compiled and executed with no Editor and produces a **bit-identical** file. The C# and Python **clients** still have no cross-process persistence run, because neither persists a session credential at all. **Residual limit**: this defeats a leaked **file**, not a leaked **machine** — anyone who can read both the store and the keyring can decrypt it, and there is no hardware backing, no OS keystore and no per-user ACL. Not blocking.
- **Unreal Engine 5**: `DEFERRED` per owner policy. Not blocking.
- **Tier 5 FABE/Moral**: `EXPERIMENTAL` — math certified advisory-only; no live host consumer; human evaluation blocked. Not blocking.
- **Middleware latency**: advisory p95 19µs / p99 34µs (release) and p95 143µs / p99 177µs (debug). Debug p95 is genuinely noisy (observed 122–199µs), so the certification gate is the enforced **p99 < 1ms** (~6% of a frame); the 200µs p95 figure is an advisory target, not a gate.
- **Current JS runtime baseline**: `evidence/js_runtime_performance_2026-09-19.md` records 0.4307/0.9025/3.6962 ms p99 at 32/128/512 agents on one Windows/Node host. This is middleware-only and must be rerun on the target environment; it does not replace the separately recorded host timing evidence or create a universal performance gate.
- **Host sim tick cost** (profiled in `evidence/host_sim_tick_profiling_2026-09-19.md`): **linear in unit count** (~0.3ms fixed base + ~89–112µs/unit in release; ~2.3ms + ~1.1ms/unit in debug). The earlier ~17.2ms/tick headline was an unoptimized **debug** measurement; release is ~1.28ms/tick (~13× faster) for the same 3v2 long-horizon run. No quadratic hotspot. This is the host simulation, not the middleware.
- **Persistence attachment boundary**: serialized middleware state does not include host-owned identity-architecture objects; a host must reattach them before claiming attached identity parity. This does **not** apply to the session credential, which is now host- persisted by the client itself (`ISessionStore` in Unity, the store in the Godot client) and restores ownership across a middleware restart via the snapshot's `token_hash` values. Ownership is **continuity, not access control**, and a stolen token can revoke, rotate, or be used until it expires — expiry bounds a leak's useful life rather than revoking it.
- **Dashboard causal boundary**: `/api/causal` verifies `CausalEventGraph`, not `WorldCounterfactualEngine`; the direct world-fork engine is proven separately and is not claimed as a dashboard wrapper.
- **Reconnect ownership boundary**: reconnect identity continuity is proven for the server-scoped model, and a socket can now be **bound to a proven session** (`bindIfProven`), so a connection is no longer identified by a name alone. Disconnect-driven retirement remains deliberately **not** claimed: a dropped socket detaches the connection and preserves the agents, and nothing retires them automatically. A `session_id` is still caller-declared, so a client that knows a live session's name can attempt a claim — it is refused, because the credential is what the server checks.
- **Host provenance gap (resolved 2026-09-20)**: the earlier clean rebuild failed because the named evidence commit `f3f5e8d25` declared `mod persistence_restore` without committing the module, which lived only on the unmerged `reconcile/dirty-canonical-2026-09-16` lineage that lacked the `formation_geometry.rs` safeguard. That one missing file was landed as host commit `6867da9f4`, and the diagnostic was rebuilt and run from a clean checkout of that commit (offline, exit 0, all 8 sections pass). The Pixel Pets row is promoted to `VERIFIED_CURRENT (HOST_DIAGNOSTIC_CLEAN_COMMIT)`, bounded to the committed diagnostic scope — not a universal host-game or multi-engine certification. The checkout's other unrelated uncommitted changes remain out of scope.

Human evaluation remains **BLOCKED / NOT EXECUTED** for the experimental FABE research, and the overall RC1 gate remains open.

---

## 4. Reproduction

```bash
# Fear AI repo
node tools/verification/verify_persistence_roundtrip.mjs
node tools/verification/verify_long_horizon_lifecycle.mjs
node tools/verification/verify_compound_collisions.mjs
node tools/verification/verify_runtime_wiring.mjs
node tools/verification/verify_release_claim_boundaries.mjs
node tools/verification/verify_host_provenance.mjs
node tools/verification/verify_dashboard_endpoints.mjs
node tools/verification/verify_counterfactual_world.mjs
node tools/verification/verify_server_lifecycle.mjs
node tools/verification/verify_server_reconnect.mjs
node tools/verification/verify_protocol_abuse.mjs
node tools/verification/verify_cross_tree_parity.mjs
node tools/verification/verify_adapter_conformance.mjs
node tools/verification/verify_moral_dissonance.mjs
node tools/verification/verify_fabe_personas.mjs
node tools/verification/verify_dotnet_adapters_compile.mjs
node tools/verification/verify_unity_adapter_behavior.mjs
node tools/verification/verify_host_token_persistence.mjs   # needs the Godot binary; SKIPPED, never PASSED, without it
node tools/verification/measure_runtime_performance.mjs
"/mnt/c/Program Files/dotnet/dotnet.exe" build "C:\\tools\\03-Projects\\lains Tools\\lainself\\fear-ai-sim\\fear-ai-sim\\packages\\adapters\\csharp\\FearAI.Client.csproj"

# Host repo (Linux headless; targeted diagnostic only; needs cargo)
cargo run --bin audit_fear_ai_connection
```

All twenty-five JS verification probes in `tools/verification/` were rerun in this audit through `npm run verify:probes` (`tools/verification/run_probe_suite.mjs`); the roster below is **generated from that run's own JSON summary**, so it cannot describe a run it did not have. The runner quotes each skip as NOT PROVEN rather than counting it as a pass. That suite is now the `probes` CI job (`windows-latest`, `npm run verify:probes`). CI also runs a nightly `probe-stability` job (`npm run verify:probe-stability`, every probe repeated up to three times, `FLAKY` counted as a failure) and a `unity-editmode` job (`npm run verify:unity-editor`) that is **inert until a runner is provisioned with an Editor** (`UNITY_EDITOR_AVAILABLE`), and that sets `FEAR_AI_UNITY_REQUIRED=1` so a missing Editor is a failure there rather than a skip. While that variable is unset the Unity row below stands exactly as reported: **no Editor has executed those tests.** 
<!-- GENERATED:PROBE-ROSTER:BEGIN -->
<!-- Generated by tools/codegen/generate_release_dossier.mjs from
     evidence/probe_suite_report.json. Do not edit by hand: run the generator,
     or `--check`. Drift fails the release-claim probe. -->

### Probe roster (recorded run, generated)

**Recorded 2026-09-21T03:53:53.386Z — 25 probes, 24 passed, 1 passed with declared skips, 0 failed, on Node v24.19.0 / win32.**
This is a **recorded** run of the same suite CI re-runs (`npm run verify:probes`, the `probes`
job, `windows-latest`), taken from `evidence/probe_suite_report.json`. A row marked
**PASSED WITH DECLARED SKIPS** is *not* a pass: it is a probe that reported, in its own words,
that part of its claim had no evidence on this machine. Rows marked FAILED would be listed
here too — the roster renders whatever happened rather than only what succeeded.

| Probe | Verdict | Assertions | Its own last line |
|---|---|---|---|
| `verify_adapter_conformance.mjs` | PASSED | 210 | SUCCESS: All 210 adapter conformance assertions PASSED. |
| `verify_compound_collisions.mjs` | PASSED | — | ALL CROSS-SYSTEM COMPOUND COLLISION TESTS PASSED CLEANLY. |
| `verify_counterfactual_world.mjs` | PASSED | — | SUCCESS: WorldCounterfactualEngine verification passed. |
| `verify_cross_tree_parity.mjs` | PASSED | — | SUCCESS: All 17 cross-tree parity vectors PASSED bit-identically! |
| `verify_dashboard_endpoints.mjs` | PASSED | — | Server stopped cleanly. |
| `verify_dotnet_adapters_compile.mjs` | PASSED | — | SUCCESS: both .NET adapters and the Unity EditMode tests compile (17 checks). |
| `verify_fabe_personas.mjs` | PASSED | 53 | SUCCESS: All 53 FABE persona assertions PASSED. |
| `verify_fuzz_arbitration.mjs` | PASSED | 16 | SUCCESS: 16 fuzz-arbitration assertions passed. |
| `verify_godot_fallback_parity.mjs` | PASSED | 37 | SUCCESS: All 37 Godot fallback parity assertions PASSED. |
| `verify_godot_live_pipeline.mjs` | PASSED | 128 | SUCCESS: All 128 Godot live-pipeline wiring assertions PASSED. |
| `verify_godot_stations.mjs` | PASSED | 169 | SUCCESS: All 169 Godot station-level assertions PASSED. |
| `verify_host_provenance.mjs` | PASSED | — | SUCCESS: Host provenance root cause and resolution re-derived. |
| `verify_host_token_persistence.mjs` | PASSED | 44 | SUCCESS: 44 host persistence assertions passed across 6 separate engine processes. |
| `verify_long_horizon_lifecycle.mjs` | PASSED | — | SUCCESS: Long-horizon runtime lifecycle verification passed. |
| `verify_moral_dissonance.mjs` | PASSED | 110 | SUCCESS: All 110 moral dissonance assertions PASSED. |
| `verify_persistence_roundtrip.mjs` | PASSED | — | SUCCESS: All persistence, migration, and reset tests PASSED! |
| `verify_protocol_abuse.mjs` | PASSED | — | SUCCESS: Protocol abuse verification passed. |
| `verify_release_claim_boundaries.mjs` | PASSED | — | SUCCESS: Release-claim document boundaries are explicit. |
| `verify_runtime_wiring.mjs` | PASSED | — | SUCCESS: Runtime wiring boundary verification passed. |
| `verify_server_lifecycle.mjs` | PASSED | — | SUCCESS: Fear Server lifecycle and protocol verification passed. |
| `verify_server_reconnect.mjs` | PASSED | — | SUCCESS: Real WebSocket reconnect verification passed. |
| `verify_store_encryption.mjs` | PASSED | 46 | SUCCESS: 46 encrypted-store assertions passed. |
| `verify_transport_signing.mjs` | PASSED | 61 | SUCCESS: 61 transport-signing assertions passed. |
| `verify_unity_adapter_behavior.mjs` | PASSED | 37 | SUCCESS: 37 Unity behavioural assertions passed across 4 separate processes. |
| `verify_unity_editor_tests.mjs` | PASSED WITH DECLARED SKIPS | — | SKIPPED: no Unity Editor found on this machine. |

**Not proven on the recorded machine — the probe said so itself, and it is neither a
pass nor a failure:**

- `verify_unity_editor_tests.mjs` — SKIPPED: no Unity Editor found on this machine.

Probes that state no assertion count print `—` in that column: the number is absent
rather than invented, and each probe's own last line is quoted beside it.
<!-- GENERATED:PROBE-ROSTER:END -->

<!-- GENERATED:PROBE-DETERMINISM:BEGIN -->
<!-- Generated by tools/codegen/generate_release_dossier.mjs from
     evidence/probe_stability_report.json. Do not edit by hand: run the generator,
     or `--check`. Drift fails the release-claim probe. -->

### Determinism (recorded repeated run, generated)

**Recorded 2026-09-21T04:11:51.206Z — up to 3× per probe, on Node v24.19.0 / win32.**
Engine: FEAR_AI_GODOT not set — in-engine probes fall back to their own engine discovery

This is **repeatability on that machine at that date, not determinism in general**. `--repeat 3` bounds the observation: a defect that fires once in ten will usually survive three runs, so the value here is catching the expensive kind — intermittency frequent enough to be seen, which is exactly the kind that teaches a reader to re-run until green. A probe that repeated cleanly is still only a probe that repeated cleanly; repetition does not create evidence it did not have.

**Repeatable on the recorded machine: 25 of 25 repeated probes gave the same verdict on every run** — 24 of them proving their claim, and 1 reporting a declared skip on every run. Both are repeatable; only the first is proof, because repeating a skip does not turn it into a pass. The probes in the second group are named under *Repeatable but still not proven* below.

| Probe | Runs | Verdicts | Assertions | Total time |
|---|---|---|---|---|
| `verify_adapter_conformance.mjs` | 3 | 3× PASSED | 210 | 0.2s |
| `verify_compound_collisions.mjs` | 3 | 3× PASSED | — | 0.2s |
| `verify_counterfactual_world.mjs` | 3 | 3× PASSED | — | 0.4s |
| `verify_cross_tree_parity.mjs` | 3 | 3× PASSED | — | 0.1s |
| `verify_dashboard_endpoints.mjs` | 3 | 3× PASSED | — | 0.6s |
| `verify_dotnet_adapters_compile.mjs` | 3 | 3× PASSED | — | 9.0s |
| `verify_fabe_personas.mjs` | 3 | 3× PASSED | 53 | 0.2s |
| `verify_fuzz_arbitration.mjs` | 3 | 3× PASSED | 16 | 34.3s |
| `verify_godot_fallback_parity.mjs` | 3 | 3× PASSED | 37 | 0.2s |
| `verify_godot_live_pipeline.mjs` | 3 | 3× PASSED | 128 | 0.2s |
| `verify_godot_stations.mjs` | 3 | 3× PASSED | 169 | 0.5s |
| `verify_host_provenance.mjs` | 3 | 3× PASSED | — | 2.5s |
| `verify_host_token_persistence.mjs` | 3 | 3× PASSED | 44 | 16.6s |
| `verify_long_horizon_lifecycle.mjs` | 3 | 3× PASSED | — | 0.8s |
| `verify_moral_dissonance.mjs` | 3 | 3× PASSED | 110 | 0.1s |
| `verify_persistence_roundtrip.mjs` | 3 | 3× PASSED | — | 0.4s |
| `verify_protocol_abuse.mjs` | 3 | 3× PASSED | — | 0.9s |
| `verify_release_claim_boundaries.mjs` | 3 | 3× PASSED | — | 1.3s |
| `verify_runtime_wiring.mjs` | 3 | 3× PASSED | — | 0.5s |
| `verify_server_lifecycle.mjs` | 3 | 3× PASSED | — | 0.9s |
| `verify_server_reconnect.mjs` | 3 | 3× PASSED | — | 0.6s |
| `verify_store_encryption.mjs` | 3 | 3× PASSED | 46 | 4.6s |
| `verify_transport_signing.mjs` | 3 | 3× PASSED | 61 | 4.9s |
| `verify_unity_adapter_behavior.mjs` | 3 | 3× PASSED | 37 | 6.0s |
| `verify_unity_editor_tests.mjs` | 3 | 3× PARTIAL | — | 0.1s |

The `Runs` column can be lower than the repeat count: a disagreement ends that probe early, because a verdict that already differs needs no further samples.

**No probe disagreed with itself across the recorded runs.** That is a statement about these 25 probes on this machine over up to 3 attempts each, not about determinism in general, and not about any machine but the recorded one.

**Every probe in the recorded single run also appears in the repeated run**, so no probe in the roster above is left without a repetition result.

**Across the ledger of recorded repeated runs (2 night(s), 150 probe attempts):**

No probe has ever disagreed with itself in the ledger. That is a statement about 150 recorded attempts across 2 repeated run(s), and over that many clean night(s) the 95% Wilson upper bound on any one probe's flake rate is still **65.8%** — which is the honest reason to keep extending the ledger: the same clean result over more nights is a smaller number, and none of them is a proof of determinism. A probe that has never disagreed may still be broken.

**Timing — no probe is 3x slower than its baseline** (drawn from earlier nights on the same platform and Node major).

**Timing drift — not yet measurable:** a drift needs 4 comparable nights that carry per-run durations, and 0 of 1 do; 1 predates per-run duration recording and is excluded rather than treated as zero. A probe that creeps 10% a night never trips a step threshold, which is why the check pools per-run samples instead of comparing single totals — and it stays silent until there is a history worth calling a distribution.

**Every probe in the roster appears in the ledger**, so no probe is left without a cross-night result.

**Repeatable but still not proven** — these probes gave the same answer every time, and that answer was that part of their claim had no evidence on this machine:

- `verify_unity_editor_tests.mjs` — SKIPPED: no Unity Editor found on this machine.
<!-- GENERATED:PROBE-DETERMINISM:END -->

The four in-engine Godot suites were also rerun via `npm run godot:evidence`; the additional measurement command recorded metadata and the baseline above. Host and C# results above are recorded evidence from named prior runs. No `cargo test` / `npm test` / Jest was used (Hard Rule 9). `npm test` and `npm run lint:evidence` are both retired entry points that refuse with a non-zero exit by design (9); the evidence ledger is a closed 2026-09-06 record and `npm run evidence:report` is a report, not a verdict.

---

## 5. Authority & provenance
- Ledger: `docs/CURRENT_TRUTH_LEDGER.md` v1.3.3-PROVISIONAL (authoritative row-level mapping).
- Evidence: `evidence/audit_fear_ai_connection_extended_2026-09-19.md`, `evidence/host_sim_tick_profiling_2026-09-19.md`, `evidence/host_rebuild_attempt_2026-09-19.md`, `evidence/host_provenance_reconciliation_2026-09-20.md`, `evidence/host_union_reproduction_2026-09-20.md`, `evidence/host_union_change_2026-09-20.patch`, `evidence/host_clean_commit_reproduction_2026-09-20.md`, `evidence/js_runtime_performance_2026-09-19.md`, `evidence/rust_js_parity_vectors.json`.
- Harness sources: `tools/verification/*.mjs` (15 current runtime/behaviour proofs, the release-claim document tripwire, the host-provenance reconciliation probe, and the metadata-only performance measurement named above), plus the shared Unity engine shim and its harness in `tools/verification/unity/` and the phase-driven in-engine scenario `tests/godot_project/run_session_persistence.gd`.
- Host fixes: `pixel-pets/src/bin/audit_fear_ai_connection.rs`, `pixel-pets/src/engine/formation_geometry.rs`, `pixel-pets/src/overlay_audio.rs` (commit `91af8f957`); audit extended to the faction matrix + 2,000-tick + formation-stress pass in `e2090880a`; latency gate + live squad-path stress + tick scaling probe in `f3f5e8d25`; missing persistence module landed to make a clean checkout build in `6867da9f4`.
- Superseded records: `docs/CUSTOM_ENGINE_INTEGRATION_SPEC.md`, `docs/NEW_MASTER_GAME_INTEGRATION_AUDIT_DOSSIER.md`, `docs/NEW_MASTER_GAME_LOGIC_ANALYSIS_DOSSIER.md`, `docs/NEW_MASTER_GAME_ROUND2_DEEP_CLAIMS_AUDIT.md`, `docs/FAILURE_AND_LIFECYCLE_MATRIX.md`, and `evidence/manual-source-code-audit-dossier.md` are historical and must not be used to promote the current provisional verdict. `evidence/middleware-progress-evidence.json` is a dated progress ledger, not a current release authority.
