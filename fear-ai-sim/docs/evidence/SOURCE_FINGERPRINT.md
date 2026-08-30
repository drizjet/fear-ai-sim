# SOURCE-STATE FINGERPRINT

EVID-2026-08-28-EVIDENCE-STATUS-LINTER

## What is a fingerprint?

Every evidence row in `EVIDENCE_LEDGER.jsonl` binds to a
`sourceState` object. That object includes:

* `head` — the git HEAD commit hash at evidence-creation time
  (or `'no-git'` if the repository has no `.git` directory).
* `dirty` — whether `git status --porcelain` returned non-empty
  (i.e. whether there are uncommitted changes).
* `fingerprint` — a sha256 over a canonical JSON of `head`,
  `dirty`, and the file hashes of every file in
  `fingerprintFiles`.
* `fingerprintFiles` — the relative paths (forward-slash
  separated) of every file whose content was hashed.

The fingerprint is **deterministic and cheap**. Two audits of
the same source state produce the same hash. A change to any
fingerprinted file produces a different hash.

## When does evidence go stale?

The audit runner (`scripts/audit-evidence.mjs`) re-derives the
fingerprint at audit time and compares it to the recorded
fingerprint. The comparison rule is:

* If the re-derived `fingerprint` exactly matches the recorded
  `fingerprint` → `FRESH`.
* If the recorded `fingerprint` is missing or the recorded
  `fingerprintFiles` set has changed → `STALE`.
* If the recorded `dirty: false` and the live `dirty: true`
  → `STALE`.
* If the recorded `head` and the live `head` differ → `STALE`.
* If the recorded row has no `fingerprint` field at all →
  `INCOMPLETE` (the row is not yet wired to the fingerprint
  system; this is the initial state for migrated rows).

A `STALE` evidence row is excluded from the maturity
derivation: the `maturityGate` requires `freshness: 'FRESH'`
or `freshness: 'ADMISSIBLE'` to count a dimension as met.

## When does evidence contradict?

A `CONTRADICTED` row is one that the audit cannot validate:
the `freshness` is `FRESH` (so the source matches) but the
row's `knownContradictions` array contains row IDs of active
contradictions. The `audit-evidence.mjs` runner reports the
row as `CONTRADICTED` and exits non-zero, signaling that
the build should be blocked.

## What does an agent do with a STALE row?

The agent does NOT silently re-validate. The row is *replaced*
or *amended* with a new row that:

1. binds to the new source-state fingerprint;
2. re-runs the verification command (so `commandResults` is
   fresh);
3. records the prior row ID in the `note` field of the new row.

The `audit-evidence.mjs` runner keeps the old row in the
ledger (it is append-only) but does not use it for maturity
derivation.

## What does an agent do with an INCOMPLETE row?

INCOMPLETE means the row was migrated from the old
`DOMAIN_MATURITY.md` table and has not yet been bound to a
source-state fingerprint. The agent's job is to write a
follow-up row (a "real" evidence record) for the same domain
with the fingerprint populated and the verification command
recorded. The migrated row remains as a "this domain was
declared" anchor; the real evidence row does the work.

## Fingerprint determinism

`computeSourceFingerprint` is deterministic up to:

* `git status --porcelain` being deterministic for the same
  working tree;
* file hashes being sha256 of the file contents;
* the file path being normalized to forward-slash separated.

It is NOT deterministic across platforms if the working tree
has different line endings, but line endings are part of the
file content, so this is a feature not a bug.
