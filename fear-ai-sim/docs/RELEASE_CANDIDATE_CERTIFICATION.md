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
- Host: `C:\tools\03-Projects\lains Tools\New Master Game` (branch `codex/canonical-consolidation-2026-08-12`, commit `91af8f957`)
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
| Adapter conformance (new) | `node tools/verification/verify_adapter_conformance.mjs` | PASS (122/122 assertions) |
| Moral dissonance (new) | `node tools/verification/verify_moral_dissonance.mjs` | PASS (110/110 assertions) |
| FABE personas (new) | `node tools/verification/verify_fabe_personas.mjs` | PASS (53/53 assertions) |
| Host skirmish audit | `cargo run --bin audit_fear_ai_connection` | PASS (8/8 sections; 500-tick multi-faction; zero mutation; p95 199µs) |
| C# adapter build | `dotnet build packages/adapters/csharp/FearAI.Client.csproj` | 0 warnings, 0 errors |

Total: **7 Node harnesses + 1 Rust diagnostic binary + 1 dotnet build — zero failures.**

---

## 2. Phase proofs

### Phase 1 — Engine Adapter Verification & Conformance Hardening
- `dotnet build` on `FearAI.Client.csproj` (netstandard2.0 + net8.0): **0 warnings, 0 errors**.
- Static audit of Godot (`fear_ai_client.gd`, `fear_agent.gd`, `fear_types.gd`) and Unity (`FearAIClient.cs`, `FearAgent.cs`, `Runtime/FearTypes.cs`) against Canonical Protocol V1: handshake `HANDSHAKE_REQUEST/1.0.0`, `BATCH_TICK_REQUEST` with omitted-when-empty `capabilities` (legacy preservation), opt-in `peers`, `INTENT_OUTCOME_REPORT` → `/api/v1/outcome` → `INTENT_OUTCOME_ACK`, binary V2 constants (magic `0x52414546`, v2, 16/32 bytes, intent/band maps), advisory-only motors.
- New harness `verify_adapter_conformance.mjs` (122 assertions, Suites 1–4) passes 100%.

### Phase 2 — Tier 5 Research Decoupling & Standalone Verification
- `MoralDissonanceEngine.js` audited: Haidt 5-vector dot product (hand-verified .6525), Festinger caps (fear .60, order `AUTH×.50`, necessity .40, total .75), guilt integration `net×.80`, half-lives 138.3/346.2 ticks, injury at exactly 50 severe ticks with remodeling deltas, atonement floor 0, compliance deliberation, `auditImmutability` CLEAN with transforms/HP untouched.
- `FunctionalPersonaSignatures.js` audited: 11 logistic curves bounded [0,1] over 256 trait corners; N/R phase separation (N 3× R on `panicThreat` per shipped equation; opposite signs on `recoveryTime`/`contagionPeerFear`); near-neighbor N=.45/.55 separates; bit-identical determinism; seeded populations; confusion matrix; collapse scores; frozen-input safety.
- New harnesses `verify_moral_dissonance.mjs` (110) and `verify_fabe_personas.mjs` (53) pass 100%. Tier 5 stays `EXPERIMENTAL` (no live host consumer) — decoupled math certified, integration explicitly out of scope.

### Phase 3 — Sibling Host Engine Deep Integration & Skirmish Stability
- Bridge audit (`fear_ai_bridge.rs` → `submit_brain_intent_json` → `advisory_validation` → whitelist → `BrainDirector→GoapPlanner`): observation extraction (40.0px, allies 1, enemies 2), fear math (Calm 0.391/BPM 69 vs Routed 5.0/BPM 180/arrhythmia), BrainIntent JSON accepted with bias 0.840, zero mutation (ΔX=ΔY=ΔHP=0), Alpha election (veteran_01) with damping (2.0→1.328), Alpha Fall (DeepRetreat + SquadPanicRegroup + speech).
- Extended audit binary to **500 ticks, multi-faction** (lithodrom ×3 vs terracotta ×2): tick 500 reached, ~11.9ms/tick, no NaN drift; 1000-iter latency mean ~102µs, p95 199µs (<200µs budget, sub-millisecond per-agent).
- Root-cause fixes (committed in host repo `91af8f957`): `formation_geometry::square_offset` ring≥1 safeguard (modulo-by-zero found only by the 500-tick run), `overlay_audio` `#[cfg(windows)]` gating so Linux headless diagnostics compile.
- Proof recorded: `evidence/audit_fear_ai_connection_500tick_2026-09-19.md`.

### Phase 4 — Truth Ledger Finalization (this dossier)
- Ledger bumped `1.2.0` → `1.3.0-CERTIFIED`: every `VERIFIED_CURRENT` row now cites its proof script; Tier 5 rows cite decoupled harnesses while retaining `EXPERIMENTAL`; host row cites new sibling commit + evidence file + safeguards.
- Full suite re-run sequentially on 2026-09-19: zero failures (table above).

---

## 3. Known gaps / non-blocking items (unchanged policy)
- **Unity UPM**: `PARTIAL (IMPLEMENTED_NOT_EDITOR_VERIFIED)` — package declared, protocol-conformant by static audit + harness; live Unity Editor verification still requires the editor GUI (external resource). Not blocking.
- **Unreal Engine 5**: `DEFERRED` per owner policy. Not blocking.
- **Tier 5 FABE/Moral**: `EXPERIMENTAL` — math certified advisory-only; no live host consumer; human evaluation blocked. Not blocking.
- **Audit binary latency p95 199µs**: within <200µs budget but with 1µs margin on this run (prior run 141µs). Sub-millisecond per-agent budget holds comfortably (max 824µs single outlier < 16.6ms frame). Monitor, do not gate.

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
- Evidence: `evidence/audit_fear_ai_connection_500tick_2026-09-19.md`, `evidence/rust_js_parity_vectors.json`.
- Harness sources: `tools/verification/*.mjs` (7 files).
- Host fixes: `pixel-pets/src/bin/audit_fear_ai_connection.rs`, `pixel-pets/src/engine/formation_geometry.rs`, `pixel-pets/src/overlay_audio.rs` (commit `91af8f957`).
