# BEHAVIOR CONTRACTS — Fear AI

EVID-2026-08-29-CONTRACTS-REGISTRY

This document is the **durable authority** for Fear AI's load-bearing behavioral contracts.
Every contract has a stable `contractId`, a preconditions list, a causal mechanism, a forbidden
shortcut, and a revision history.

**Per Guardian V3 §2 (Movement A):** contracts are reconstructed from the strongest available
sources in this priority order:

1. constitutional / specification text (the master prompt + per-movement directives)
2. previously accepted test-change governance (`docs/evidence/TEST_CHANGES.jsonl`)
3. previously accepted behavior-contract artifact (this file, once populated)
4. prior strong tests and their comments
5. canonical architecture documentation
6. current implementation only as evidence of what exists — never as authority for what should exist

If sources conflict, the contract records `CONTRACT_CONFLICT`. If intent cannot be resolved,
the contract records `UNKNOWN`. We never silently choose the current implementation.

**Status field meanings:**
- `PENDING_AUDIT`: contract candidate, awaiting fresh independent auditor review
- `ACCEPTED`: auditor-confirmed, tests pass, evidence bound to current source state
- `WEAKENED_CONTESTED`: implementation was changed to make a test pass, contract is disputed
- `CONTRACT_CONFLICT`: sources disagree, worker may not pick the current implementation
- `UNKNOWN`: intent cannot be resolved from available sources

---

## How to read this registry

Each contract entry is also present in `BEHAVIOR_CONTRACTS.json` (machine-readable). The JSON
file is the source of truth for automated tools; this file is the human companion.

A test that exercises a contract must:

1. Name the `contractId` it is testing (in a comment above the test).
2. Use the exact forbidden-shortcut pattern when asserting a behavioral property.
3. Be paired with a planted-defect verification (see Movement B).
4. Bind its evidence to the current source-state fingerprint (see Movement D §D3).

A test that cannot satisfy (1)–(4) is not admissible evidence for that contract.

---

## Contract index (v1)

| ContractId | Domain | Status |
|---|---|---|
| TRADE.CATMOUSE.OBSERVATION_DRIVES_REROUTE | trade/cat-and-mouse | PENDING_AUDIT |
| TRADE.CHAIN.ORDERED_CAUSAL_SEQUENCE | trade/causal-chain | PENDING_AUDIT |
| TRADE.RUNTIME.AUTHORITATIVE_PATH | trade/runtime | PENDING_AUDIT |
| TRADE.RUNTIME.NO_DOUBLE_EXECUTION | trade/runtime | PENDING_AUDIT |
| TRADE.SCENARIO.NATURAL_NO_ATTACKS | trade/scenario | PENDING_AUDIT |
| TRADE.SCENARIO.DIFFERENTIATION | trade/scenario | PENDING_AUDIT |
| TRADE.CATMOUSE.LEGAL_OBSERVATION_ONLY | trade/cat-and-mouse | PENDING_AUDIT |
| EVIDENCE.SEED.IDEMPOTENT | evidence/seed | PENDING_AUDIT |
| EVIDENCE.SEED.TEST_ISOLATION | evidence/seed | PENDING_AUDIT |
| EVIDENCE.LINT.PRODUCER_NOT_AUTHORITY | evidence/lint | PENDING_AUDIT |
| MIGRATION.DRIVEN_BY_RECENT_GRIEVANCE | demography/migration | PENDING_AUDIT |

(Full entries with rationale, mechanism, forbidden shortcut, evidence pointers, and revision
history will be added in the next slice — this initial registry establishes the schema and
the audit-trail structure required by Guardian V3 §2.)

---

## Revision history

- 2026-08-29 — Initial registry created. 11 contract candidates extracted from the 6 test
  files flagged by Guardian V3 §1. Status is PENDING_AUDIT for all entries pending fresh
  independent review. No contract has been accepted into durable state yet.
