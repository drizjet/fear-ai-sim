# Nightly Fold Chain Repair — 2026-10-16

**Scope:** The nightly stability-ledger job (`probe-stability` in
`.github/workflows/test.yml`) proposes each night's recorded stability artifact
for folding into `evidence/probe_stability_ledger.jsonl` by pushing a branch and
opening a pull request. Every path in that chain was exercised against a scratch
repository instead of GitHub, five defects were found, all five are fixed here,
and a new standalone probe now rehearses the chain deterministically.

## What was broken

Five independent defects sat on the same chain — any one of them turned the
nightly PR into a no-op or a failure:

1. **The repo setting that lets a workflow token open a pull request was off.**
   `can_approve_pull_request_reviews` was disabled on the repository, so
   `gh pr create` with `GITHUB_TOKEN` could never succeed. Fixed by enabling the
   setting on 2026-10-16 (re-checkable via `npm run audit:remote-state`).
2. **The workflow step passed no token to `gh`.** The fold step now carries
   `env: GH_TOKEN: ${{ github.token }}`; the step's `run:` string itself is
   unchanged, because `tools/guardian/hard-rule-9.mjs` asserts it against an
   allowlist.
3. **The `HEAD:` object-spec coordinate was built from the wrong root.** The
   script computes paths relative to the repository root (the outer
   `fear-ai-sim/` directory) while the ledger lives under `fear-ai-sim/`, so
   `git cat-file HEAD:<coord>` must prefix `$rootPrefix`. Without it the preview
   count read the wrong path. Fixed at the cat-file site.
4. **The section-3a dirty check compared against the wrong prefix.** The check
   that refuses a working tree with foreign changes matched `git status` paths
   against a coordinate missing `$rootPrefix`, so it could misname — or miss —
   the file it was refusing over. Fixed.
5. **The 3h committed-files check had the same off-by-prefix.** The check that
   the pushed commit changed only the ledger compared the same mis-built path.
   Fixed.

## The probe that now pins all of it

`tools/verification/verify_night_fold_rehearsal.mjs` builds a scratch git world
(a working checkout plus a bare `origin`), copies the real chain
(`tools/ci/open_ledger_night_pr.ps1`, `tools/verification/fold_stability_ledger.mjs`,
`stability_regression.mjs`) into it, scrubs `GH_TOKEN` / `GITHUB_SHA` /
`GITHUB_STEP_SUMMARY` from the child environment, and rehearses seven scenarios —
**29 assertions**, every one exercised through the real script with
`-NoPullRequest`:

- **first night** → exit 0; the preview counts exactly tonight's one night via
  the cat-file coordinate; the banner does not mislabel the count; the branch is
  pushed with no pull request; the folded commit reports exactly one night,
  names tonight only, and changes exactly `fear-ai-sim/evidence/probe_stability_ledger.jsonl`;
  the remote branch holds the committed night plus tonight;
- **second night merge** → `2 -> 3 night(s), 1 added tonight`, and the earlier
  ledger lines survive byte-identically;
- **re-run of a folded night** → `NOTHING WRITTEN — the ledger already holds
  every night in this artifact.`;
- **a checkout holding exactly the branch's nights** → stops clean with the
  "nothing new to review" early gate;
- **a ledger tampered with an unrelated file** → refused with exit 2, naming the
  foreign file and never the ledger, with nothing modified;
- **a remote branch carrying a night the working ledger lacks** → refused with
  exit 2 as `removes or alters`.

Each scenario resets the scratch checkout to the base commit first, because the
real job runs on a fresh clone each night — a local checkout that accumulates
earlier simulations would legitimately report a different "unmerged" set.

The PR-opening tail (`gh pr create`) is deliberately **not** rehearsed: the
probe stops at the script's `-NoPullRequest` exit, so no GitHub credentials or
network are involved anywhere in the probe.

## Recorded results

- `npm run verify:probes` → **52 probes: 51 passed, 1 declared skip, 0 failed**,
  exit 0, recorded 2026-10-16T20:50:42.078Z on Node v24.20.0 / win32; the
  rehearsal probe itself passes in 14.5 s. The count gate
  (`documented-counts-match-the-derived-counts`) passes with the ledger,
  release surface, and certification dossier updated to 52.
- `npm run guardian:check` → CLEAN; `npm run verify:release-claims` → SUCCESS;
  `npm run codegen:release-dossier:check` → OK.
- `npm run verify:hard-rule-9` → 27 of 28 checks pass in the working tree; the
  one red is `gate-inputs-are-committed`, which by design flags the new probe
  until it is committed — a fresh checkout of the commit cannot see an untracked
  file. It flips to PASS with this change's commit.

## What this record does not claim

- It does not claim the nightly job has run for real on GitHub: the rehearsal
  proves the script's decision paths against a scratch repository with
  credentials scrubbed, and the branch-push and PR-open against GitHub remain
  unexercised here.
- It does not claim the affected nights were recovered — the two artifacts that
  failed to fold before this repair (2026-09-22, 2026-09-23) are backfilled
  separately.
- One machine, one date: verdicts and durations above are properties of this
  host, not promises about CI's.
