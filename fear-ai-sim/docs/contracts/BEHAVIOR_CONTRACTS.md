---
title: "Behavior Contracts — Fear AI"
created: 2026-08-29
updated: 2026-10-18
type: contract-registry
status: active
---

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
- 2026-10-18 — V4 MOVEMENT C2 (exact-once tick phase): TRADE.RUNTIME.AUTHORITATIVE_PATH
  and TRADE.RUNTIME.NO_DOUBLE_EXECUTION formalized as the at-least-once + at-most-once
  pair and rebound from retired Jest sources to the living probe
  `tools/verification/verify_trade_runtime_contracts.mjs` (call-site tripwire strengthened
  from presence to exact cardinality; tickHistory delta asserted exactly +1 per call).
  Both entries remain PENDING_AUDIT pending independent review. Protected-test migration
  filed as `docs/guardian/change-proposals/T-RUNTIME-001-migration-to-probes.json`;
  the protected manifest itself was not edited.
- 2026-10-18 — V4 MOVEMENT E2 (evidence idempotency race + production ledger isolation):
  EVIDENCE.SEED.IDEMPOTENT closed its concurrent race (read-check-append now runs inside an
  exclusive ledger-lock critical section; the probe gains a K-process concurrent same-claim
  section) and EVIDENCE.SEED.TEST_ISOLATION enforced the CLOSED canonical ledger in code
  (buildReceipt refuses canonical appends by default, explicitly, and from test processes
  even with `allowClosedLedgerWrite`; the promised `NODE_ENV=test` fallback is now actually
  implemented; the jest-era `runTestReceipt` helper is a loud retirement stub). Both
  entries rebound from retired Jest sources to the living probe
  `tools/verification/verify_evidence_seed_idempotency.mjs`; real-source mutation
  MUT-EVID-001 re-anchored to the lock-wrapped block and killed (receipt
  `docs/guardian/mutation-receipts/MUT-EVID-001-1792292235781.json`). Both entries remain
  PENDING_AUDIT pending independent review. Protected-test migration filed as
  `docs/guardian/change-proposals/T-EVID-001-migration-to-probes.json`; the protected
  manifest itself was not edited.
- 2026-10-18 - V4 MOVEMENT D2 (real-browser boot and tick): new contract
  `RUNTIME.REAL_BROWSER.BOOT_AND_TICK` added, asserting that the Vite-built runtime
  boots a populated simulation in a real headless Chrome and that its DOM counters
  keep advancing across observation windows (zero error-level logs), closing the
  jsdom-shim gap recorded by `evidence/seed-runtime-verification.mjs`. Real-source
  mutation MUT-RUNTIME-003 (the frame loop is no longer rescheduled) is killed by
  `tools/verification/verify_runtime_real_browser.mjs` (receipt
  `docs/guardian/mutation-receipts/MUT-RUNTIME-003-1792293664153.json`). The entry
  remains PENDING_AUDIT pending independent review. No protected-manifest entry
  existed for this surface, so none was edited; the new-contract proposal is filed
  as `docs/guardian/change-proposals/MOVEMENT-D2-real-browser-boot-and-tick.json`.
