---
title: "Fear AI / BadAI — Decision Register"
created: 2026-08-26
updated: 2026-10-12
type: decision-register
status: active
---

> Sim-era decision log. Product navigation: `SYSTEM_MAP.md`. A decision here does not override host-authority or the three-tree map.

# Fear AI / BadAI — Decision Register

**Status:** Active  
**Version:** 1.0  
**Date:** 2026-08-26  
**Related protocol:** `docs/PROVENANCE.md`

This register records decisions that affect behavior, architecture, compatibility, research interpretation, or project identity. It preserves rejected alternatives and the evidence used.

## Status values

```text
OPEN
PROPOSED
APPROVED
REJECTED
SUPERSEDED
BLOCKED
```

## Decision template

```markdown
## DEC-XXXX — Short title

- Date:
- Status:
- Owner:
- Affected parts:
- Question:
- Context:
- Options:
  1. ...
  2. ...
- Recommendation:
- Decision:
- Evidence/source IDs:
- Assumptions:
- Rejected alternatives and why:
- Compatibility impact:
- Required tests:
- Revisit condition:
- Follow-up work:
```

## Initial register

## DEC-0001 — Canonical fear scale

- Date: 2026-10-12
- Status: APPROVED
- Owner: Project owner
- Affected parts: 1, 2, 3, 4, 6, 11
- Question: What scale is canonical inside the JavaScript simulation, and how does it map to any Rust/reference scale?
- Context: Existing documents describe multiple scales and thresholds. The canonical reference implementation is `pixel-pets/src/engine/ai/fear.rs`.
- Options:
  1. Use a normalized internal `0–1` scale with explicit adapters.
  2. Use the existing live JavaScript scale.
  3. Use a reference/Rust scale internally and adapt at boundaries.
- Recommendation: Option 3 (Option C): Use the reference/Rust scale internally (`0.0–5.0+`) and adapt to `0–1` at boundary interfaces.
- Decision: APPROVED (Option C). The reference/Rust scale (`0.0–5.0+`) is the canonical internal fear scale for bands, thresholds, and hysteresis: Calm (`< 0.5`), Alert (`0.5 .. 1.5`), Afraid (`1.5 .. 3.0`), Panicked (`3.0 .. 4.6`), Routed (`4.6+`). External host game interfaces and engine adapters communicate via normalized `[0, 1]` values adapted at the boundary using explicit table-driven conversions and clamping.
- Evidence/source IDs: `pixel-pets/src/engine/ai/fear.rs`, `evidence/rust_js_parity_vectors.json`, `docs/RUST_PARITY.md`.
- Assumptions: Adapters map normalized inputs to the canonical scale.
- Rejected alternatives and why: Option 1 rejected because it creates artificial truncation against canonical Rust bands. Option 2 rejected because hardcoded 4.2 scale without boundary specification causes divergence.
- Compatibility impact: Adapters continue to accept `0..1` normalized values and convert via explicit conversion functions. Internal FearCore dynamics adhere to canonical Rust threshold boundaries.
- Required tests: Table-driven conversion tests and cross-tree parity vectors in `verify_cross_tree_parity.mjs`.
- Revisit condition: None.
- Follow-up work: Document conversion table in `docs/RUST_PARITY.md` and add conversion verification assertions to `verify_cross_tree_parity.mjs`.

## DEC-0002 — Fear transition ownership

- Date: 2026-10-12
- Status: APPROVED
- Owner: Project owner
- Affected parts: 2, 3
- Question: Should transitions be owned by a revived `hysteresis.js` module, a new FearCore module, or remain embedded in `brain.js`?
- Context: One authoritative transition owner is required; duplicate threshold systems are unsafe.
- Recommendation: Use a dedicated FearCore transition contract and migrate existing behavior behind tests.
- Decision: APPROVED. `FearCore` (`packages/core/src/FearCore.js` / `fearcore.js`) is the authoritative owner of fear state transitions. Legacy inline mutations in `brain.js` have been eliminated; `Brain.decide()` delegates state evaluation directly to `this.fearCore.update()` and reads `fearResult.state`. Confirmed in runtime and verified via deterministic probes.
- Evidence/source IDs: EVID-2026-08-27-BRAIN-FEARCORE-AUTHORITY, commit 47240c396, verify_cross_tree_parity.mjs.
- Compatibility impact: Brain state matches FearCore state exactly. Panic-lock semantics are preserved without interference from legacy inline state mutations.
- Required tests: State transition table, no skipped state, exact entry/exit boundaries, panic lock (covered by verify_cross_tree_parity.mjs and probe suite).
- Revisit condition: None.

## DEC-0003 — Habituation ownership

- Date: 2026-10-12
- Status: APPROVED
- Owner: Project owner
- Affected parts: 2, 3
- Question: Should habituation remain inline, become stimulus-aware, or support both through a compatibility adapter?
- Context: Historical materials describe stimulus-specific habituation while current implementation status needs verification.
- Options:
  1. `HabituationSystem` (`packages/core/src/HabituationSystem.js`) is the canonical production owner for middleware runtime (`AffectiveAgent`, `RuntimeSimulation`).
  2. Inline habituation inside `Brain` / agent state machine.
  3. Revive standalone quarantined `habituation.js`.
- Recommendation: Option 1 (Option A): `HabituationSystem` is the canonical middleware owner.
- Decision: APPROVED (Option A). `HabituationSystem` (`packages/core/src/HabituationSystem.js`) is the canonical production owner of habituation for the middleware runtime (`AffectiveAgent`, `RuntimeSimulation`). It provides stimulus-specific exposure tracking, recovery decay, and snapshot persistence. In the standalone research sim agent (`brain.js`), `Brain.calculateHabituatedFear()` remains an inline utility. The legacy standalone `habituation.js` remains quarantined as `RETAIN_OPTIONAL` with zero production callers.
- Evidence/source IDs: `packages/core/src/HabituationSystem.js`, `config/quarantined-modules.json`, `evidence/middleware-progress-evidence.json`.
- Compatibility impact: Eliminates duplicate habituation paths in middleware. Snapshot serialization (`save-v1-frozen.json`) remains stable.
- Required tests: Habituation tests in adapter conformance and deterministic probe suite (`verify_adapter_conformance.mjs`, `verify_persistence_roundtrip.mjs`).
- Revisit condition: None.

## DEC-0004 — Planner/executor boundary

- Date: 2026-10-12
- Status: APPROVED
- Owner: Project owner
- Affected parts: 4, 5
- Question: Which system selects intent, which system plans, and which system executes?
- Recommendation: Affordance/prerequisite/utility selects intent; GOAP/HTN plans; behavior tree/FSM executes.
- Decision: APPROVED. Affordance and prerequisite utility evaluation selects agent intent; GOAP/HTN constructs plan sequences; Behavior Tree / FSM handles action execution and motor primitive dispatch. Host games remain authoritative over physics, path execution, and motor actuation.
- Evidence/source IDs: `packages/core/src/IntentResolver.js`, `packages/core/src/HostCapabilityNegotiator.js`.
- Required tests: Planner invocation, prerequisite preservation, interrupted action, failed action, trace completeness.
- Revisit condition: None.

## DEC-0005 — BadAI identity relationship

- Date: 2026-10-12
- Status: APPROVED
- Owner: Project owner
- Affected parts: all
- Question: Is BadAI a rename, successor, experimental branch, or separate product?
- Recommendation: Treat BadAI as a proposed successor architecture while preserving Fear AI as lineage and current repository identity until an owner-approved rename is made.
- Decision: APPROVED. BadAI is designated as the proposed successor architecture for extended multi-agent research. Fear AI remains the formal product lineage and current repository identity. No breaking renames or package rebrands are permitted on the frozen RC1 surface.
- Evidence/source IDs: `docs/SYSTEM_MAP.md`, `docs/RELEASE_SURFACE.md`.
- Required tests: Documentation and package identity consistency across all adapters and runtime manifests.
- Revisit condition: Explicit owner authorization of next-generation product rebrand.

## DEC-0006 — Knowledge database ownership

- Date: 2026-10-12
- Status: APPROVED
- Owner: Project owner
- Affected parts: 1, 5, 12
- Question: Is the knowledge database a developer-only evidence archive, a bundled research asset, or a future application feature?
- Recommendation: Keep it as a developer/research asset first; define a versioned read API before bundling it into runtime.
- Decision: APPROVED. `fear_ai_knowledge.db` is designated as a developer and research offline archive asset. It is not bundled into the production middleware runtime or required for agent tick evaluation. Production runtime state is backed exclusively by `FearSessionStore` and `FearEncryptedStore`.
- Evidence/source IDs: `packages/runtime/src/FearSessionStore.js`, `docs/RELEASE_SURFACE.md`.
- Required tests: Read-only integrity, schema version, export/re-import compatibility.
- Revisit condition: Future post-RC1 feature proposal introducing runtime knowledge graph queries.
