---
title: "Fear AI — Release Candidate Certification Dossier"
created: 2026-09-19
updated: 2026-09-19
type: certification
status: active
---

# Fear AI — Release Candidate Certification Dossier

**Version**: 1.0.0-RC (ledger `1.3.0-CERTIFIED`)
**Date**: September 19, 2026
**Campaign**: Continuous Closure Phases 1–4 (Muse Spark / OpenCode)
**Repositories**:
- Fear AI: `C:\tools\03-Projects\lains Tools\lainself\fear-ai-sim\fear-ai-sim` (master: `d6f3253` + this dossier)
- Host: `C:\tools\03-Projects\lains Tools\New Master Game` (branch `codex/canonical-consolidation-2026-08-12`, commits `91af8f957` → `e2090880a` → `f3f5e8d25`)
**Standard**: Reconciled Evidence Protocol — Hard Rule 9 (zero automated test runners; static review + standalone deterministic proofs only).
**Invariants**: Host retains 100% authority over transforms, physics, collision, damage, inventory. Fear AI emits strictly non-mutating advisory intents and affective states.

---

## 1. Verdict

**RELEASE CANDIDATE: CERTIFIED** — all `VERIFIED_CURRENT` ledger rows map to live deterministic proofs; full suite passes with zero failures on 2026-09-19.

| Proof | Command | Result (2026-09-19) |
|---|---|---|
| Persistence round-trip | `node tools/verification/verify_persistence_roundtrip.mjs` | PASS (bit-exact 1/10/100-tick parity, V1 migration + 50-tick parity, soft/hard reset) |
| Compound collisions | `node tools/verification/verify_compound_collisions.mjs` | PASS (60-unit + 300-unit dispersal recovery, confined attractor + leader break, famine conservation, bit-exact replay) |
| Dashboard endpoints | `node tools/verification/verify_dashboard_endpoints.mjs` | PASS (12 endpoints, 10 tabs, attached read-only inspect) |
| Cross-tree parity | `node tools/verification/verify_cross_tree_parity.mjs` | PASS (17/17 boundary vectors bit-identical) |
| Adapter conformance (new) | `node tools/verification/verify_adapter_conformance.mjs` | PASS (123/123 assertions; C# handshake advertises `engine=CSharp`) |
| Moral dissonance (new) | `node tools/verification/verify_moral_dissonance.mjs` | PASS (110/110 assertions) |
| FABE personas (new) | `node tools/verification/verify_fabe_personas.mjs` | PASS (53/53 assertions) |
| Host skirmish audit | `cargo run --bin audit_fear_ai_connection` | PASS (8/8 sections + profiling probe; 1v1–6v6 matrix + 2,000-tick multi-faction + 719,600-offset formation stress + live squad-path cycle; zero mutation; advisory p95 19µs release / 143µs debug, hard p99 gate <1ms) |
| C# adapter build | `dotnet build packages/adapters/csharp/FearAI.Client.csproj` | 0 warnings, 0 errors |

Total: **7 Node harnesses + 1 Rust diagnostic binary + 1 dotnet build — zero failures.**

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

### Phase 4 — Truth Ledger Finalization (this dossier)
- Ledger bumped `1.2.0` → `1.3.0-CERTIFIED`: every `VERIFIED_CURRENT` row now cites its proof script; Tier 5 rows cite decoupled harnesses while retaining `EXPERIMENTAL`; host row cites new sibling commit + evidence file + safeguards.
- Full suite re-run sequentially on 2026-09-19: zero failures (table above).

---

## 3. Known gaps / non-blocking items (unchanged policy)
- **Unity UPM**: `PARTIAL (IMPLEMENTED_NOT_EDITOR_VERIFIED)` — package declared, protocol-conformant by static audit + harness; live Unity Editor verification still requires the editor GUI (external resource). Not blocking.
- **Unreal Engine 5**: `DEFERRED` per owner policy. Not blocking.
- **Tier 5 FABE/Moral**: `EXPERIMENTAL` — math certified advisory-only; no live host consumer; human evaluation blocked. Not blocking.
- **Middleware latency**: advisory p95 19µs / p99 34µs (release) and p95 143µs / p99 177µs (debug). Debug p95 is genuinely noisy (observed 122–199µs), so the certification gate is the enforced **p99 < 1ms** (~6% of a frame); the 200µs p95 figure is an advisory target, not a gate.
- **Host sim tick cost** (profiled in `evidence/host_sim_tick_profiling_2026-09-19.md`): **linear in unit count** (~0.3ms fixed base + ~89–112µs/unit in release; ~2.3ms + ~1.1ms/unit in debug). The earlier ~17.2ms/tick headline was an unoptimized **debug** measurement; release is ~1.28ms/tick (~13× faster) for the same 3v2 long-horizon run. No quadratic hotspot. This is the host simulation, not the middleware.

No `BLOCKED` items remain in the Fear AI release path.

---

## 4. Reproduction

```bash
# Fear AI repo
node tools/verification/verify_persistence_roundtrip.mjs
node tools/verification/verify_compound_collisions.mjs
node tools/verification/verify_dashboard_endpoints.mjs
node tools/verification/verify_cross_tree_parity.mjs
node tools/verification/verify_adapter_conformance.mjs
node tools/verification/verify_moral_dissonance.mjs
node tools/verification/verify_fabe_personas.mjs
"/mnt/c/Program Files/dotnet/dotnet.exe" build "C:\\tools\\03-Projects\\lains Tools\\lainself\\fear-ai-sim\\fear-ai-sim\\packages\\adapters\\csharp\\FearAI.Client.csproj"

# Host repo (Linux headless; needs cargo)
cargo run --bin audit_fear_ai_connection
```

All commands exit 0. No `cargo test` / `npm test` / Jest used anywhere (Hard Rule 9).

---

## 5. Authority & provenance
- Ledger: `docs/CURRENT_TRUTH_LEDGER.md` v1.3.0 (authoritative row-level mapping).
- Evidence: `evidence/audit_fear_ai_connection_extended_2026-09-19.md`, `evidence/host_sim_tick_profiling_2026-09-19.md`, `evidence/rust_js_parity_vectors.json`.
- Harness sources: `tools/verification/*.mjs` (7 files).
- Host fixes: `pixel-pets/src/bin/audit_fear_ai_connection.rs`, `pixel-pets/src/engine/formation_geometry.rs`, `pixel-pets/src/overlay_audio.rs` (commit `91af8f957`); audit extended to the faction matrix + 2,000-tick + formation-stress pass in `e2090880a`; latency gate + live squad-path stress + tick scaling probe in `f3f5e8d25`.
