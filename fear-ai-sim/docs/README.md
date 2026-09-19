---
title: "Docs index — what to read"
created: 2026-09-07
updated: 2026-09-19
type: navigation
status: active
---

# Docs index

Read in this order:

| Order | File | Why |
|---|---|---|
| 1 | [`SYSTEM_MAP.md`](SYSTEM_MAP.md) | Three trees, product goal, stale list |
| 2 | [`../AGENTS.md`](../AGENTS.md) | Rules for agents in this repo |
| 3 | [`CANONICAL_PROTOCOL_V1.md`](CANONICAL_PROTOCOL_V1.md) | Plug-in wire contract |
| 4 | [`ENGINE_INTEGRATION_GUIDE.md`](ENGINE_INTEGRATION_GUIDE.md) | Adapters + honest gates |
| 5 | [`RUST_PARITY.md`](RUST_PARITY.md) | Rust `fear.rs` is in Pixel Pets, not Tauri |
| 6 | [`PROVENANCE.md`](PROVENANCE.md) | How to label evidence |
| 7 | [`BEHAVIORAL_EVALUATION_FRAMEWORK.md`](BEHAVIORAL_EVALUATION_FRAMEWORK.md) | FABE; keep negative findings |

For the current release decision, read [`CURRENT_TRUTH_LEDGER.md`](CURRENT_TRUTH_LEDGER.md), [`CLAIM_TO_CODE_AUDIT_2026-09-19.md`](CLAIM_TO_CODE_AUDIT_2026-09-19.md), and [`RELEASE_CANDIDATE_CERTIFICATION.md`](RELEASE_CANDIDATE_CERTIFICATION.md) together. They are the authoritative current claim surfaces.

Everything else in this folder is **sim-era, closed-world, or dated**. Useful as history. Not the plug-in mission.

The following documents are explicitly historical-superseded and must not be used as current release certification: `CUSTOM_ENGINE_INTEGRATION_SPEC.md`, `NEW_MASTER_GAME_INTEGRATION_AUDIT_DOSSIER.md`, `NEW_MASTER_GAME_LOGIC_ANALYSIS_DOSSIER.md`, `NEW_MASTER_GAME_ROUND2_DEEP_CLAIMS_AUDIT.md`, `FAILURE_AND_LIFECYCLE_MATRIX.md`, `evidence/manual-source-code-audit-dossier.md`, and the `audit/v8-current/` candidate records. `evidence/middleware-progress-evidence.json` is a historical progress ledger with an explicit non-certification scope.

Do not start from `PART_1_EXECUTION_PROMPT.md`, `BADAI_MASTER_PLAN.md`, `BASELINE.md`, or `ARCHITECTURE.md` unless the user asked for that historical slice.

**Unreal:** deferred, adapter kept (`packages/adapters/unreal/`) so Unreal games can connect later. Not current work. Not required for Unity. Do not delete the plugin.
