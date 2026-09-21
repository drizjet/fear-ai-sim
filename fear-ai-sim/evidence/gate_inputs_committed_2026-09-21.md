# The Gate Ran Green On A Tree Nothing Could Reproduce — 2026-09-21

**Scope:** one new integrity check, added because the repository was in the state
that check exists to catch. Nothing here verifies the middleware; it changes
whether a green result can be reproduced from a commit by someone else.

## What was actually true

On 2026-09-21 the working tree passed everything: `npm test` refused with exit 9,
`verify:hard-rule-9` reported 22/22, `guardian:check` reported `CLEAN`,
`verify:release-claims` succeeded and the probe suite ran 25 probes with 24 passes
and one declared skip. Every one of those results was produced by a file that was
not in any commit.

- `HEAD` was `1d4902d` (2026-09-20 11:15, documentation only); `master` was
  **40 commits ahead of `origin/master`** (last fetch 2026-09-03).
- **49 tracked files modified** (+9,895 / −382) and **66 untracked paths**
  (22,112 lines).
- Among the untracked: `tools/guardian/hard-rule-9.mjs` — the file `npm test`
  executes — the whole probe roster, the codegen generators, both CI scripts, and
  the product source the newest work added: `RequestSigning.js`, `RequestSigner.js`,
  `EncryptedStore.js`, `ClaimArbitration.js`, the Unity EditMode test project, and
  three per-adapter signing/encryption files.

The consequence is not "uncommitted work", which is normal; it is that **a fresh
clone of `master` could not run its own CI**. The workflow's first step is
`npm run verify:hard-rule-9`, whose implementation did not exist in that commit,
and the probe job would have proven nothing because the probes were not there
either. A green result that no clone can reproduce is not evidence of anything,
which is the standard this repository applies everywhere else.

## The check

`tools/guardian/hard-rule-9.mjs` gained two checks (22 → 24):

- **`gate-inputs-are-committed`** — every file under `tools/`, every path named by
  an allowlisted CI command or by the npm script that command runs, and the two
  record files the nightly chain reads without ever naming them on a command line
  (`evidence/probe_stability_report.json`, `evidence/probe_suite_report.json`) must
  exist at `HEAD`. A file that is untracked **and gitignored** is reported with the
  different remedy it needs (a `.gitignore` change, not a `git add`). A path CI
  names that no file backs is deliberately *not* reported here: that step fails
  loudly on its own, and this check is about files that exist only on one machine.
  Violations are printed in full rather than truncated to a count, because fixing
  this means committing a specific set of files.
- **`ci-npm-scripts-resolve`** — every `npm run <script>` in the workflow names a
  script `package.json` declares. The allowlist compares command *text*, so it
  cannot tell `verify:probes` from a typo of it; that step would fail on the runner
  for a reason no local run of the gate would ever show.

On this tree the check fired with **28 files** — `tools/**` (25), the ledger
`evidence/probe_stability_ledger.jsonl` (named by the nightly comparison command),
and the two recordings. That is the finding, stated by the gate rather than by a
reader.

## Proof it is not decorative

Drift-tested, each case required to fire and each restore verified byte-identical
by hash (`tools/guardian/zzz_throwaway_gate_input_drift.mjs`, 13/13, deleted in the
same session):

1. an untracked file under `tools/` is listed;
2. the same file with a matching `.gitignore` line is reported as gitignored, and
   still listed — a different remedy, so a different sentence;
3. removing both restores the previous verdict line **exactly**;
4. removing the map sentence that states this contract makes
   `system-map-states-the-same-ci-contract` fail, and the restore is byte-identical.

## The fix, and what it costs

The files were committed (seven thematic commits, listed in the response), after
which the check passes — the state the next reader sees. Two limits are stated
rather than hidden:

- The check is a **static** closure: it covers `tools/**`, paths named on CI
  command lines, and the two recordings. A dependency a probe resolves at runtime
  (a fixture it loads by convention, a module under `packages/` it imports) is not
  derived from the command text and is not required by this check.
- `evidence/heavy-suites.json` is deliberately gitignored and is not part of the
  chain, which is why the whole record tree is not walked. Walking it would demand
  committing an ignored artifact and produce a gate that cannot pass — the defect
  §29 exists to catch.
