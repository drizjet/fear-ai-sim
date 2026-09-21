# The Nightly Night Becomes a Reviewed Change — 2026-09-21

**Scope.** One change to the nightly determinism job: the night it measures is proposed as a
reviewed pull request instead of waiting for a human to download an artifact and fold it in.
This record covers what was built, the four defects the work exposed, what was verified, and
what remains unproven. It does not touch the middleware, the ledger's contents, or the
dossier's numbers.

## Why

`evidence/probe_stability_ledger.jsonl` is the record that makes an intermittency rarer than
the repeat count visible, and its bound is its own argument: **one clean night bounds a
probe's flake rate at 79.3%, five nights at 43.4%**. The nightly job appended its night and
uploaded the ledger, but CI cannot commit, so the night entered the record only when a person
remembered to download an artifact and run `npm run fold:stability-ledger`. A record that
grows on remembrance bounds nothing.

The step cannot simply commit to the default branch: the ledger is the denominator of every
rate this repository reports and the release dossier quotes its numbers, so a night entering
the record changes published evidence. So the machine prepares the change — a branch, a
commit holding exactly two files, and the verification that the change cannot land red — and a
human reviews and merges it.

## What was built

`tools/ci/open_ledger_night_pr.ps1` (`-Execute`; a dry run by default), called from the
`probe-stability` job on a scheduled run of the default branch only, with `contents: write`,
`pull-requests: write` and `actions: write` scoped to that job alone.

- **Machine-owned, cumulative, leased.** The script reads the nights already waiting on
  `ci/stability-ledger` *at the ref* and folds tonight onto their union, so an unmerged night
  is never lost when the next one arrives. The branch is therefore rebased onto the current
  default branch each night, which needs a rewrite, which is why the push is
  `--force-with-lease`: the one way this could destroy evidence — a person editing the branch
  by hand — is refused instead of overwritten.
- **It cannot land red.** The commit holds exactly `evidence/probe_stability_ledger.jsonl`
  and `docs/RELEASE_CANDIDATE_CERTIFICATION.md` (`git show --name-only` asserted, and a commit
  with anything else is refused before the push), and the dossier is regenerated in the same
  commit with `verify_release_claim_boundaries.mjs` required to exit 0 on the tree that is
  about to be committed.
- **It refuses rather than guesses**, on: other modified tracked files; a HEAD that is not the
  commit the run started from; a review branch that exists remotely but cannot be fetched
  (rebuilding it would drop the nights already on it); a working ledger that removes or alters
  a recorded line; and a fold that would lose a night the default branch holds.
- **Merging is the review.** The pull request carries the night table, tonight's run outcome
  (including a red run and its failing probes), what the comparison to the committed recording
  said, what was checked before the push, and what the numbers do **not** prove.

## Four defects the work exposed

1. **A shell does not read the ledger faithfully.** The engine note in every night contains an
   em dash, and PowerShell decodes a native command's stdout with the console's code page
   rather than as UTF-8 — so a night read through `git show` was not the night on disk. It
   surfaced as the fold's own append-only check refusing a fold, which is the benign version of
   the bug: the same decoding sat on the path that *restores the branch's ledger*, where it
   would have written mangled bytes into the authority record. Fixed architecturally: the fold
   tool gained `--into-ref` (append to the ledger as committed at a ref) and `--require-ref`
   (refuse unless every night there survives), reads both with `execFileSync` (UTF-8), and the
   PowerShell script handles only paths, refs, exit codes and the tool's JSON report.
2. **Windows 8.3 short paths versus git's canonical root.** PowerShell spells a long temp
   parent as `BADANA~1` while `git rev-parse --show-toplevel` reports the long form, so a legal
   ledger path looked like it was outside the repository. Both sides are now canonicalized
   (`realpathSync.native`, falling back through the parent for a ledger that does not exist
   yet).
3. **An unattended write needs its own guarantees.** The fold now copies every night already
   in the record as the exact line it had (only new nights are serialized), stages the result,
   verifies the bytes that landed — line count, every pre-existing line present, every line
   parseable — and only then renames it over the record. A half-written ledger would not look
   like a bad write; it would look like a suite regression.
4. **A check satisfied by a comment can never fail.** The first version of the three new
   integrity checks was asserted against the raw workflow, and the workflow's header explains
   the same gate, the same `-Execute` and the same scopes in prose — so removing the actual
   configuration left the gate green. Found by mutating each of the three and *requiring* the
   gate to fire. They now assert against the comment-stripped workflow, as the allowlist check
   already did.

Two smaller ones, both found by running rather than reading: the `fold` tool's `-Execute`
preview counted the tool's file-level additions rather than the nights the pull request adds
(so a first night's commit message read "fold 0 night(s)"), and the preview treated an
untracked ledger — its first night, which CI creates — as having nothing new.

## Verification

- **The fold tool's write path: 16/16** in a throwaway harness. One night preserves the
  existing lines byte-for-byte; a re-fold of the same artifact is a no-op; an unknown probe is
  refused *and the record is byte-identical afterwards*; a two-night artifact lands in
  `recordedAt` order with the originals still first and still unchanged.
- **The nightly script's git half: 24/24** against throwaway repositories with a bare remote.
  The first night creates the branch, commits only the ledger and pushes; a later night from a
  fresh checkout of the default branch unions with the unmerged night (3 → 4 nights, all four
  present and byte-identical), lands a commit that descends from the default branch through a
  `--force-with-lease` push, and the lease path is exercised for real because the new commit is
  not a fast-forward of the old one. The four refusals fire and leave the checkout unchanged
  (no commit, nothing pushed), and a checkout with no new night exits 0 saying so.
- **The integrity gate: 22/22** (was 19), with three new checks each proved by mutation — the
  schedule/default-branch gate, the `-Execute` flag, and the `actions: write` scope — and
  every restore byte-identical by SHA-256.
- `npm run guardian:check` → `CLEAN`; `npm run verify:release-claims` → SUCCESS with three new
  assertions (the tool's two ref flags, and that the nightly step is a dry run unless told
  otherwise, stops rather than rebuilding a branch it could not read, and reads the ledger by
  ref).

## Limits, stated plainly

- **Nothing here has run on `windows-latest`.** The rehearsal used throwaway local
  repositories and a bare remote; `gh pr create`, `gh pr edit` and `gh workflow run` were
  **not** executed, because there is no authenticated remote and this work must not push. The
  first scheduled run is the first real test of the step, and the branch/PR mechanics are
  proven only as far as a local git remote can prove them.
- **The dispatch cannot be observed from here.** It exists because a `GITHUB_TOKEN` push
  triggers no workflows, so the pull request would otherwise report no checks at all; if it
  fails, the script warns and records that the pull request shows no checks rather than
  pretending otherwise.
- **The step assumes the scheduled run's checkout is the default branch tip.** It asserts
  `HEAD == GITHUB_SHA` and refuses otherwise, but it does not itself verify which branch the
  default is — the workflow's `if:` does that, and the integrity gate asserts the `if:`.
- **The record still holds two nights.** This change makes nights accumulate; it does not add
  any, and the flake-rate bound remains 65.8% until nights are merged.
- **A night that is proposed but not merged is not in the record.** The pull request is the
  review, and an unmerged branch is a backlog — visible, cumulative, and still unmerged.
