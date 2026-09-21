---
title: "Fear AI — Release Surface Definition (RC1)"
created: 2026-09-20
updated: 2026-09-20
type: specification
status: active
---

# Fear AI — Release Surface Definition (RC1)

This is the **binding scope boundary** for the Fear AI middleware release
candidate. It answers one question unambiguously: *what is the thing we are
releasing, and what is deliberately not part of it?*

It exists because the repository contains far more than the shippable
middleware. Optional world-simulation, analytics, and research modules are real
and partly proven, but they are **not** the product. Per `SYSTEM_MAP.md`: *Fear
AI is intelligence middleware. The host game stays authoritative … it must not
become a second game engine.*

The authoritative line-by-line status of every capability remains
`docs/CURRENT_TRUTH_LEDGER.md`. This document does not re-certify anything; it
classifies the surface.

---

## 1. In scope — the RC1 middleware contract

These are the components the release candidate is responsible for. Each is
either `VERIFIED_CURRENT` or a bounded adapter with a named caveat.

| Surface | What ships | Status |
|---|---|---|
| `packages/core` — affective core | `FearCore`, `AffectiveAgent`, `RuntimeSimulation` and the services it constructs (pacing, cadence/time discipline, trauma, core trauma, contagion, social, habituation, pending observations, scheduling) | `VERIFIED_CURRENT` |
| `packages/core` — intent/host negotiation | `IntentResolver`, `HostCapabilityNegotiator` | `VERIFIED_CURRENT` |
| `packages/runtime` — transport | `FearServer` HTTP `/api/v1/*` + WebSocket dispatcher, registration/lifecycle, snapshot endpoints | `VERIFIED_CURRENT` |
| `packages/runtime` — batched control plane | `register/batch`, `unregister/batch`, `trauma/batch` and their binary-wire twins, all bounded by `MAX_BATCH_CONTROL_ITEMS` (512) | `VERIFIED_CURRENT` — batch == singular semantics, per-entry rejections reported with indices, unusable envelopes `400` while malformed entries do not kill their siblings. One request per population instead of one per item; measured once at 256 agents going from 133.9 ms over 256 requests to 1.9 ms over one (`evidence/batch_control_plane_2026-09-20.md`, `evidence/session_bringup_2026-09-20.md`). **Not** a performance guarantee: one machine, one loopback workload, recorded with run metadata |
| `packages/runtime` — request signing | `RequestSigning` (server), `RequestSigner` (Node), and a signer in every adapter | `VERIFIED_CURRENT` — RS256 over an explicitly defined canonical byte string (`FEAR-AI-SIGN-V1`), with `off` / `preferred` (**default**) / `required` policy. Under `required` a request naming a session with a registered key must be signed, so a **leaked token alone is insufficient**; a caller that presents a broken signature is refused and **never** downgraded to the bearer path. Verification is a **pure decision** taken before any route runs, so a refusal mutates nothing, and failures are counted by reason. WebSocket connections answer a single-use server-issued challenge instead of signing every frame, so the simulation hot path is untouched (a measured **0.62 ms** per RS256 verify on the control plane only). Python, the standalone C#, Unity and Godot clients all sign the same bytes, with the Godot half proven **in-engine**  (`verify_transport_signing.mjs`, 61 assertions; `evidence/transport_signing_audit_timeline_2026-09-20.md`). **Not TLS and not confidentiality**: payloads stay plaintext, there is no per-route scoping, and the binary wire carries no session identity so it cannot be gated. The private key is no longer unencrypted when persisted — it goes into the encrypted store container below — but that protects a copied file, not a machine |
| `packages/runtime` — encrypted session store | `packages/runtime/src/EncryptedStore.js`<br>`packages/adapters/godot/fear_encrypted_store.gd`<br>`packages/adapters/unity/Runtime/FearEncryptedStore.cs` | `VERIFIED_CURRENT` — `FEAR-AI-STORE-V1`: PBKDF2-HMAC-SHA256 → AES-256-CBC with format-owned PKCS#7, plus an HMAC-SHA256 over the exact file text. The credential is absent from the file bytes; the session NAME is deliberately plaintext and authenticated; the keyring lives in a different directory tree, and **a copy of the store without it is inert**. On by default whenever persistence is on; a write that cannot get a keyring is **refused** rather than silently downgraded to plaintext. Node, Godot 4.6 **in engine** and C# (compiled and run with **no Editor**) produce **bit-identical** containers for the same inputs (`verify_store_encryption.mjs`, 46 assertions; the C#/Godot interop asserted byte for byte). The restart round trip is proven across **six engine processes** including a middleware restart, an in-place plaintext→encrypted upgrade, and a private key read back verbatim and re-imported by Node (`verify_host_token_persistence.mjs`, 44 assertions). **Protects a leaked file, not a leaked machine**: no hardware backing, no OS keystore, no per-user ACL. Python and the standalone C# client persist no session credential and are unchanged |
| `packages/runtime` — session ownership | `ClaimArbitration`, `GET /api/v1/sessions` | `VERIFIED_CURRENT` — session-scoped ownership so a reconnecting host is distinguishable from a rival claiming the same crowd; a same-session re-claim is unconditional, a non-live owner's agents are adoptable, a live owner's are refused with nothing mutated, and `claim: "takeover"` is the explicit counted opt-in. Identity separates a host-chosen **name** (`session_id`, not a credential) from a server-issued 256-bit **token** (`session_token`, hashed at rest, compared in constant time, returned once), which is what closes name guessing; ownership **survives a middleware restart** via the snapshot (hashes only) with restored sessions deliberately unbound. **Destruction is gated the same way as registration**: `unregister` (singular, batch, both transports) and a `clear_agents` reset refuse a non-owner while mutating nothing, report each refused id with the owner named and a bounded `retry_after_ms`, allow a dead owner's agents to be cleaned up as `RELEASED_OWNER_STALE`, and leave a refused reset's blockers visible. The credential has a **bounded life and a host-controlled end**: `tokenTtlMs` expiry (7 days, `0` disables) honoured once and rotated rather than refused, `rotate_token: true` to retire a credential on demand, and `POST /api/v1/session/revoke` to end a session (its agents are released but stay registered). Every refusal is explained to the dashboard, and a stranger naming a live session cannot claim, tear down, wipe, revoke, rotate, or keep that session alive (§22). Session **bookkeeping** only: **continuity, not access control** — ownership protects a live session's agents from other sessions and nothing else. Not authorization (ownership gates claims and teardowns, not reads), not authentication against a network adversary (loopback/plain transport with no TLS: whoever reads the wire reads the token), and `sessionStalenessMs` is a heuristic rather than a heartbeat. Expiry bounds a leak's useful life; it is not revocation, and a stolen token can revoke. The layer also carries a bounded **identity audit timeline** (`timeline[]` at `GET /api/ownership`: grants and refusals on one ordered stream, token-free, scoped to this process) and is exercised by a **seeded, replayable adversarial fuzzer** (`verify_fuzz_arbitration.mjs`) (`evidence/session_ownership_2026-09-20.md`, `evidence/credential_lifecycle_and_gated_destruction_2026-09-20.md`, `evidence/transport_signing_audit_timeline_2026-09-20.md`) |
| `packages/protocol` | `validator`, `BinaryWireProtocol`, `BinaryFrameReader` (Protocol V2) | `VERIFIED_CURRENT` |
| `packages/adapters/godot` | Godot 4.6 client + advisory badges | `VERIFIED_CURRENT (HEADLESS_IN_ENGINE + LIVE_SERVER_PIPELINE + STATION_ADVISORY_CONTRACT + FALLBACK_NUMERIC_PARITY)` — protocol-conformant; the nine behavioral showcase stations' advisory contracts are independently asserted by `verify_godot_stations.mjs`; the offline fallback's canonical math is pinned by `verify_godot_fallback_parity.mjs` against a module generated from the live JS core; the four conformance suites execute inside the real Godot 4.6 binary (13/13, 3/3, 4/4, 38/38 at exit 0 on the 2026-09-20 host run) via `npm run godot:evidence`; and the live-session suite drives the real showcase against a running `FearServer` with the fallback used nowhere, registering 28 agents in a single batched request (`POST /api/v1/register/batch`) rather than one round trip per agent. Live in-engine rendering, visual fidelity, and frame presentation are **not** asserted — every in-engine suite runs `--headless`. The offline fallback is a **calibrated approximation** of the server's raw-fear integration (measured divergence on sound-only stimuli: fallback 0.12 vs server 0.00) |
| `packages/adapters/unity` | Unity UPM package | `PARTIAL` (`BEHAVIOR_VERIFIED_OUTSIDE_EDITOR`, `IMPLEMENTED_NOT_EDITOR_VERIFIED`) — session identity, the batched control plane (`register/batch`, `unregister/batch`, `trauma/batch`, `404` legacy fallback, refusal reporting) and `ISessionStore` credential persistence. The control-plane files are **executed against a live `FearServer`** through a shared UnityEngine shim (`verify_unity_adapter_behavior.mjs`, 37 assertions across four OS processes), and compiled against that same shim so the two gates cannot diverge. An **EditMode test project now lives in the package** (`Tests/EditMode/`, Editor-only, `UNITY_INCLUDE_TESTS`-guarded, 41 tests over the signer's parsed SPKI DER, the credential stores against the Editor's real file system and PlayerPrefs, the encrypted store's at-rest guarantee and refusal surface, the client's defaults, and the JSON escape surface) and its fixtures are **compiled and run on this machine** against that shim plus a minimal NUnit surface, with the cases that ran and the fixtures that were found checked against counts derived from the test sources — which is how a fixture assertion that could never pass on any machine was found, and pinned. `npm run verify:unity-editor` runs them in batchmode on any machine with an Editor and **reports `SKIPPED` here** — no Editor has executed them, so the qualifier stands. MonoBehaviour lifecycle is invoked by the harness, coroutines run synchronously, the shim is not Unity's API, and `FearAgent.cs`/`FearAgentHUD.cs` are covered by no probe |
| `packages/adapters/csharp` | Generic C# client | `VERIFIED_CURRENT (COMPILE + STATIC_CONFORMANCE)` — rebuilt with `-t:Rebuild`, zero errors, in the 2026-09-20 sweep; session identity (`session_id`/`session_token`/`ClaimMode`), batched register/unregister/trauma, `404` legacy fallback, `409` distinguished from transport failure, and batching chunked at the server's cap. No live runner exists in this repository, so runtime behaviour is not exercised here |
| Designer tooling | `DesignerDashboardServer` + `fear-ai dashboard` | `VERIFIED_CURRENT` (observability only) — 11 views / 13 endpoints including `GET /api/ownership` live session ownership (read-only, `scope: SERVER_SESSION_STATE`, token-free by construction; `POST /api/ownership` is a `404`, so the tooling has no arbitration path) its **refusal drill-down** (`refusals[]`: verb, agent, caller, blocking session, countdown and a resolution sentence — a null countdown means the blocker holds a connection and has no deadline) and an **identity audit timeline** (`timeline[]`: grants *and* refusals on one ordered, bounded (100), token-free stream, each row carrying a `meaning` and a headline, scoped explicitly to this process so an empty ring after a restart is not read as "nothing happened"). `fear-ai dashboard --middleware` attaches a real `FearServer` in-process; unattached, the live views report `NO_SIMULATION_ATTACHED` / `NO_OWNERSHIP_SOURCE_ATTACHED` rather than an empty view |
| Verification | `tools/verification/*.mjs` standalone harnesses (24 `verify_*.mjs` probes — 18 runtime/protocol/behaviour, 3 Godot contract/parity/live-wiring, 1 .NET compile check, 1 Unity behaviour harness, 1 transport-signing probe, 1 arbitration fuzzer, 1 release-claim document tripwire, and the Unity Editor gate — plus 2 `measure_*.mjs` measurement harnesses) and 1 external-resource runner (`npm run godot:evidence`) | current — 24/24 probes and 4/4 in-engine suites green in the 2026-09-20 sweep; `verify_unity_editor_tests.mjs` reports `SKIPPED` rather than `PASS` (no Editor installed) and the .NET, Godot and Unity multi-process probes report `SKIPPED`, never `PASS`, when their external tools are absent |
| Measurement | `tools/verification/measure_runtime_performance.mjs` (tick cost) and `measure_session_bringup.mjs` (`npm run measure:session-bringup`, control-plane bring-up) | current — measurement artifacts, explicitly not pass/fail gates |
| Generated adapter artifact | `tests/godot_project/addons/fear_ai/fear_canonical_core.gd`, emitted by `tools/codegen/generate_godot_fallback.mjs` | current — `npm run codegen:godot-fallback:check` fails if stale |
| External-resource evidence | `tools/run-godot-inengine-evidence.mjs` (`npm run godot:evidence`) | requires the Godot binary; reports `SKIPPED` (never `PASSED`) when absent; headless only |

**The release claim is:** a deterministic, advisory affect-and-intent middleware
layer with validated protocol adapters, bounded persistence, lifecycle handling,
and an observability dashboard. The host engine retains authority over
movement, physics, combat, damage, inventory, and world mutation.

---

## 2. Out of scope — standalone modules, tools, and research

These are **not** part of the RC1 contract. They must not be described as
runtime services, and no release claim may depend on them being automatically
available in a `RuntimeSimulation` session. They remain reachable through their
own explicit CLI/scenario entry points, labelled as standalone.

| Module / surface | Why out of scope | How it remains available |
|---|---|---|
| `PackCoordinationEngine` | Tactical world-sim; not constructed by `RuntimeSimulation` | `fear-ai pack`, reference/collision scenarios |
| `EconomicFeedbackSystem` | Economic world-sim; host owns inventory/world mutation | `fear-ai economy`, collision harness |
| `SettlementMigrationSystem` | Demographic world-sim | `fear-ai migration` |
| `EpistemicBeliefEngine` | Belief/perception simulation; the core consumes host-reported danger, it does not compute rumor internally | `fear-ai epistemic-fog`, scenario paths |
| `InformationPropagationEngine` | Rumor-diffusion simulation | `fear-ai rumor` |
| `WorldCounterfactualEngine` / `FrontierValleySimulation` | Analytics tool over a reference world | `fear-ai counterfactual-world` |
| Standalone world-sim tail (`FactionGovernanceSystem`, `CoalitionDiplomacyEngine`, trade chains, memory consolidation, trauma crystallization, Pareto frontier, streaming buffers, …) | Research sandbox exposed through ~60 CLI commands | individual `fear-ai <command>` paths |
| `FunctionalPersonaSignatures` (FABE) | Research; decoupled math proven, no live host consumer, human evaluation blocked | `fear-ai fabe-world` / `persona` |
| `MoralDissonanceEngine` | Research; advisory math proven, no live host consumer | `fear-ai moral` |
| `packages/adapters/unreal` | `DEFERRED` by owner policy | present so an Unreal host *can* connect later |
| Elixir + Rust NIF tree | Divergent research backend; no `mix.lock`, no toolchain on this host | separate repository, excluded |

A module leaves this list only by changing the code, not the prose — see §3.

---

## 3. How this boundary is enforced

The scope is not maintained by good intentions. It is checked:

- **Code boundary** — `tools/verification/verify_runtime_wiring.mjs` asserts that
  `RuntimeSimulation` constructs **none** of the optional modules, and that each
  optional module still has an explicit CLI/scenario entry point. It is a
  deliberate tripwire: if a future change wires one into the core constructor,
  the probe fails and the ledger and this document must be revisited rather than
  silently inheriting a broader claim.
- **Document boundary** — `tools/verification/verify_release_claim_boundaries.mjs`
  asserts this document exists with its in-scope and out-of-scope sections, lists
  the named out-of-scope modules, and is referenced by the truth ledger.

### Change policy — how a module joins the RC surface

A module moves from §2 to §1 only when **all** of the following hold:

1. It is wired into `RuntimeSimulation` as an explicit **opt-in** service (never
   auto-constructed, never mutating host state);
2. A standalone deterministic verifier proves the opt-in path and the unchanged
   default path;
3. Its ledger row is promoted with bounded evidence;
4. `verify_runtime_wiring.mjs`'s negative tripwire and this document are updated
   in the same change.

Until then it ships as a separate tool, if at all.

---

## 4. What this does not do

- It does not delete or deprecate any module; everything stays in the tree.
- It does not certify the in-scope items beyond their existing ledger rows.
- It does not change the overall release verdict, which remains
  `RELEASE CANDIDATE: PROVISIONAL / NOT CERTIFIED` in
  `docs/RELEASE_CANDIDATE_CERTIFICATION.md`.
- It does not secure the transport. The server is loopback-bound plain HTTP and
  WebSocket with no TLS: a session token defeats *name guessing*, and does
  nothing about someone reading the wire. Enabling remote access does not add
  transport security.
- **Request signing authenticates requests and makes them non-replayable; it is
  not confidentiality.** A host can register an RSA-2048 public key and sign its
  control-plane requests, so a **leaked token alone stops being sufficient**
  under `--signature-policy=required` (the default is `preferred`, which refuses
  a presented-but-invalid signature and never degrades to the bearer path, while
  leaving a host that does not sign working exactly as before). Payloads remain
  **plaintext**: a wire reader still sees every observation, advisory and agent
  id, and still learns the public key, which is harmless. What it can no longer
  do is *act as* the host. A persisted private key is no longer written in the
  clear — it goes into the encrypted store container below — but signing is still
  off by default, because turning it on commits a host to keeping a private key.
  The **binary wire carries no session identity at
  all**, so a key cannot gate it — stated rather than implied. There is no
  per-route scoping, and this is not a security certification
  (`evidence/transport_signing_audit_timeline_2026-09-20.md`).
- Host-side persistence is no longer a plaintext bearer credential, and it is
  worth being exact about what changed. The credential **and** the private
  signing key are written as an authenticated, encrypted container
  (`FEAR-AI-STORE-V1`), keyed from a keyring kept in a **different directory
  tree**, on by default for any host that turns persistence on, in every adapter
  that can persist one. So a copied save folder, a support bundle or a backup
  carries nothing usable: the store is inert without the keyring. `verify_store_encryption.mjs`
  asserts the credential and key are absent from the file **bytes** and that
  Node, Godot and C# all produce a **bit-identical** container for the same
  inputs; `verify_host_token_persistence.mjs` proves the round trip across six
  engine processes, including a middleware restart and a private key read back
  verbatim. **What this does not do** is survive a leaked machine: anyone who can
  read both the store and the keyring can decrypt it, there is no hardware
  backing and no per-user ACL, and the adapters set no file mode on Windows
  because there is no mode to set there. Persistence is still off by default, and
  expiry, rotation and revocation still bound how long a leaked token is useful
  rather than undoing a leak (`evidence/session_store_encryption_2026-09-20.md`).
- It does not close the Unity Editor gap. The Unity control plane is now
  **executed** against a live server outside the Editor, which is strictly
  stronger than compiling it and strictly weaker than running it in the engine:
  MonoBehaviour lifecycle, frame scheduling and the shim's fidelity to Unity's
  real API remain unverified, and `FearAgent.cs`/`FearAgentHUD.cs` are covered by
  neither probe. An EditMode test project now exists in the package and its
  fixtures are **compiled and executed** on this machine — 41 cases over 5
  fixtures, run against the UnityEngine and NUnit shims with the cases that ran
  and the fixtures that were found both checked against counts derived from the
  test sources, so a fixture body that can never pass is caught without an Editor
  — and `npm run verify:unity-editor` will run them in batchmode on any machine
  with an Editor. But **no Editor has executed them here**, so
  `verify_unity_editor_tests.mjs` reports `SKIPPED`, and running a fixture against
  a shim is not running it in Unity: the Unity row keeps `IMPLEMENTED_NOT_EDITOR_VERIFIED`
  (`evidence/unity_editmode_fixtures_run_outside_editor_2026-09-21.md`).
- It does not generalize to every engine. Godot and Unity are the trees with
  executed evidence; Unreal is deferred and the other adapter trees are
  compile- and conformance-checked only.
