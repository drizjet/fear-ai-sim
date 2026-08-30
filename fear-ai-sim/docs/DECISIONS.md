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

- Date: 2026-08-26
- Status: OPEN
- Owner: Project owner
- Affected parts: 1, 2, 3, 4, 6, 11
- Question: What scale is canonical inside the JavaScript simulation, and how does it map to any Rust/reference scale?
- Context: Existing documents describe multiple scales and thresholds. No mapping should be treated as final without authoritative source and runtime evidence.
- Options:
  1. Use a normalized internal `0–1` scale with explicit adapters.
  2. Use the existing live JavaScript scale.
  3. Use a reference/Rust scale internally and adapt at boundaries.
- Recommendation: Keep the choice OPEN until the authoritative reference implementation is inspected; then select one internal scale and make all conversions explicit.
- Decision: Not yet made.
- Evidence/source IDs: Repository inspection and existing BadAI specification; exact IDs to be added during Part 0.
- Assumptions: None accepted.
- Rejected alternatives and why: None yet.
- Compatibility impact: Potentially affects brain state transitions, metrics, UI, replay, and downstream decision scores.
- Required tests: Table-driven conversion and threshold parity tests.
- Revisit condition: Reference implementation becomes available or current live behavior is fully characterized.
- Follow-up work: Create `docs/RUST_PARITY.md` during Part 3.

## DEC-0002 — Fear transition ownership

- Date: 2026-08-26
- Status: PROPOSED
- Owner: Project owner
- Affected parts: 2, 3
- Question: Should transitions be owned by a revived `hysteresis.js` module, a new FearCore module, or remain embedded in `brain.js`?
- Context: One authoritative transition owner is required; duplicate threshold systems are unsafe.
- Recommendation: Use a dedicated FearCore transition contract and migrate existing behavior behind tests.
- Decision: Proposed by Part 1 preparation: `fearcore.js` is the isolated transition contract. The legacy `brain.js` path remains unchanged until parity evidence and compatibility tests are complete.
- Required tests: State transition table, no skipped state, exact entry/exit boundaries, panic lock.
- Revisit condition: Part 0 import/runtime map is complete.

## DEC-0003 — Habituation ownership

- Date: 2026-08-26
- Status: OPEN
- Owner: Project owner
- Affected parts: 2, 3
- Question: Should habituation remain inline, become stimulus-aware, or support both through a compatibility adapter?
- Context: Historical materials describe stimulus-specific habituation while current implementation status needs verification.
- Recommendation: Decide only after current runtime path and tests are mapped.
- Required tests: repeated stimulus, novel stimulus, cap, decay, deterministic replay.

## DEC-0004 — Planner/executor boundary

- Date: 2026-08-26
- Status: OPEN
- Owner: Project owner
- Affected parts: 4, 5
- Question: Which system selects intent, which system plans, and which system executes?
- Recommendation: Affordance/prerequisite/utility selects intent; GOAP/HTN plans; behavior tree/FSM executes.
- Required tests: planner invocation, prerequisite preservation, interrupted action, failed action, trace completeness.

## DEC-0005 — BadAI identity relationship

- Date: 2026-08-26
- Status: OPEN
- Owner: Project owner
- Affected parts: all
- Question: Is BadAI a rename, successor, experimental branch, or separate product?
- Recommendation: Treat BadAI as a proposed successor architecture while preserving Fear AI as lineage and current repository identity until an owner-approved rename is made.
- Required tests: Documentation and package identity consistency after a decision.

## DEC-0006 — Knowledge database ownership

- Date: 2026-08-26
- Status: OPEN
- Owner: Project owner
- Affected parts: 1, 5, 12
- Question: Is the knowledge database a developer-only evidence archive, a bundled research asset, or a future application feature?
- Recommendation: Keep it as a developer/research asset first; define a versioned read API before bundling it into runtime.
- Required tests: Read-only integrity, schema version, export/re-import compatibility.
