# EVIDENCE SCHEMA

The Fear AI evidence system has three append-only JSONL ledgers:

- `EVIDENCE_LEDGER.jsonl` — one row per evidence record.
- `CONTRADICTIONS.jsonl` — one row per known contradiction.
- `TEST_CHANGES.jsonl` — one row per test change after a slice.

All rows share the structural envelope:

```json
{
  "rowId": "<uuid>",
  "createdAt": "<ISO 8601 timestamp>",
  "actor": "agent | human | migration-script",
  "note": "free-form human annotation (optional)"
}
```

## EVIDENCE_LEDGER.jsonl row shape

```json
{
  "rowId": "...",
  "createdAt": "...",
  "evidenceId": "EVID-2026-08-28-...-...",
  "claimId": "C-<n>",
  "domain": "territory | factions | relationships | ... (matches DOMAIN_MATURITY.md)",
  "claim": "the specific claim being evidenced",
  "dimension": "SPECIFIED | CODE_EXISTS | UNIT_VERIFIED | LIVE_PRODUCER | LIVE_CONSUMER | CONSEQUENCE_VERIFIED | INTEGRATION_VERIFIED | DETERMINISM_VERIFIED | CHECKPOINT_VERIFIED | FORK_VERIFIED | COUNTERFACTUAL_VERIFIED | MULTI_SEED_SMOKE | LONG_HORIZON_VERIFIED | STATISTICALLY_VERIFIED | RUNTIME_VERIFIED | VISUAL_VERIFIED | PERFORMANCE_VERIFIED | REPRODUCED_INDEPENDENTLY | LIMITATIONS_DOCUMENTED",
  "sourceState": {
    "head": "<git rev-parse HEAD or 'no-git'>",
    "dirty": <bool>,
    "fingerprint": "<sha256 of relevant files>",
    "fingerprintFiles": ["path1", "path2"]
  },
  "files": ["<absolute or repo-relative path>"],
  "tests": ["<jest test file or test name>"],
  "commands": [
    {
      "command": "node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand tests/territory-vertical-slice.test.js",
      "cwd": "C:/tools/03-Projects/lains Tools/lainself/fear-ai-sim/fear-ai-sim",
      "timeoutMs": 60000,
      "exitCode": 0,
      "durationMs": 437
    }
  ],
  "commandResults": [
    { "commandIndex": 0, "ok": <bool>, "summary": "<short text>", "outputDigest": "<sha256 or first 200 chars>" }
  ],
  "runtimeEvidence": "<optional base64 or path>",
  "scenarioEvidence": "<optional scenario id or file path>",
  "statisticalEvidence": {
    "claim": "<e.g. 'mean time to first RAID < 200 ticks'>",
    "metric": "<formula>",
    "denominator": "<e.g. 'eligibleAmbushOpportunities'>",
    "seeds": <int>,
    "precisionTarget": "<±0.05 or similar>",
    "precisionMet": <bool>,
    "result": "SUPPORTED | NOT_SUPPORTED | INCONCLUSIVE"
  },
  "knownContradictions": ["<rowId of contradiction rows>"],
  "limitations": ["<free-form strings>"],
  "producer": "agent | human | test-runner"
}
```

## CONTRADICTIONS.jsonl row shape

```json
{
  "rowId": "...",
  "createdAt": "...",
  "domain": "territory | ...",
  "claim": "the documentation claim that is contradicted",
  "evidence": "the actual implementation/observation that contradicts it",
  "severity": "HIGH | MEDIUM | LOW",
  "active": <bool>,
  "cap": "SPECIFIED | CODE_EXISTS | UNIT_VERIFIED | LIVE_CONSUMER"
}
```

A `HIGH` severity contradiction caps the domain's maturity at `CODE_EXISTS` (it does not block the domain's existence, only the LIVE promotion). A `MEDIUM` severity caps at `UNIT_VERIFIED`. A `LOW` severity caps at `LIVE_CONSUMER`.

`active: false` rows are kept for the audit trail but do not cap maturity.

## TEST_CHANGES.jsonl row shape

```json
{
  "rowId": "...",
  "createdAt": "...",
  "testFile": "tests/...",
  "testName": "<string>",
  "originalContract": "the old assertion / fixture",
  "newContract": "the new assertion / fixture",
  "classification": "IMPLEMENTATION_DEFECT | TEST_DEFECT | SPECIFICATION_DEFECT | FIXTURE_DEFECT | NONDETERMINISM_DEFECT | DATA_DEFECT",
  "justification": "<free-form>",
  "constitutionalRequirement": "<which constitutional / directive section>",
  "weakensOriginal": <bool>,
  "reviewer": "agent | human",
  "reviewStatus": "PENDING | APPROVED | REJECTED"
}
```

`weakensOriginal: true` rows are flagged for human review (an autonomous agent must not silently weaken a test to make it pass; the row is still kept for the audit trail but the linter warns).

## Source-state fingerprint

Every evidence row binds to a `sourceState.fingerprint` (sha256) computed over the listed `fingerprintFiles` plus a `dirty: <bool>` flag (whether the git worktree has uncommitted changes at evidence time). The linter re-derives the fingerprint and reports `STALE` if any file changed or the dirty flag flipped.

## Maturity derivation

The `maturityGate({ domain, ledger, contradictions })` function in `evidence/maturity.mjs` reads the ledger rows for the domain, looks for the highest dimension that is fully evidenced (with passing `commandResults` and no `active` contradiction), and returns the label. It is **derived** — humans and agents cannot directly promote a row without writing the evidence.
