# A Pull Request Could Get No Checks At All, Silently — 2026-09-21

**Scope:** the CI trigger, the integrity check that now guards it, and a manual
audit for the half of the problem no file can show. It is a change to the
*verification and delivery* layer, not to the middleware.

**How it was found.** Not by a failing check. While opening a pull request for the
work recorded in ledger §38–§42, the pull request page showed **no jobs at all** —
and looked exactly like one whose checks were still queueing.

---

## 1. The defect removed checks instead of failing them

`.github/workflows/test.yml` declared:

```yaml
on:
  push:
    branches: [ main, master ]
  pull_request:
    branches: [ main, master ]
```

`pull_request.branches` is matched against a pull request's **base** branch, not
its head. So a pull request opened against another branch — which is exactly what
a stacked change looks like — received **no jobs at all**: no failure, no skipped
job, no check run, an empty checks list, and a page indistinguishable from a slow
one. Every other CI defect in this repository's history produced a red run. This
one produced silence, and there is no signal in it for a human to notice.

There is a second reason it stayed quiet: retargeting a pull request's base does
not re-fire the workflow either, because `edited` is not one of the default
`pull_request` activity types. That was discovered while repairing the first
problem, and it is why the repair is a **widening** rather than a re-run: the
trigger is unfiltered, so the commit is checked when the pull request opens or
synchronizes, on whatever base it was opened against.

## 2. The fix, and the check that makes it hold

- `pull_request:` is now a bare, unfiltered trigger — every base branch, every
  default activity type.
- `push` keeps `branches: [main, master]`, so a feature branch is reviewed once
  rather than built twice. The widening is only affordable while that holds, so
  both halves are asserted together.
- `every-pull-request-gets-a-run` is the twenty-eighth integrity check. It rejects
  `branches`, `branches-ignore`, `paths`, `paths-ignore` and `types` narrowing, an
  inline value on the key, a repository with no `pull_request` trigger at all, and
  a `push` trigger that has lost its branch restriction.

**It reads every workflow file, and that is not a precaution.** The first version
of the check inspected the first `on:` block it could find. The mutation matrix
caught it: a *second* workflow file narrowing `pull_request` passed the check that
exists to forbid exactly that. A pull request's checks are the union of what every
workflow decides, so the check now reads the union.

### Drift matrix 8/8, every restore byte-identical by SHA-256

| Case | Result |
|---|---|
| control — unmutated tree | green |
| branch filter re-added under `pull_request` | fired — "narrowed by branches … receives NO RUN" |
| `paths` filter added | fired — naming `paths` |
| `types` filter added | fired — naming `types` |
| `pull_request` trigger deleted outright | fired — "no workflow declares a `pull_request` trigger" |
| `pull_request` given an inline value | fired — "carries an inline value" |
| `push` filter dropped | fired — "would also build every feature-branch push" |
| **a second workflow file narrows `pull_request`** | fired — naming the twin file |

The seventh is the one that matters: it edits no prose and adds a file the
repository did not have, which is how this defect would actually arrive. Each
failure names the file and the key.

The throwaway harness sat at the project root rather than under `tools/`, and in
that it recorded a small lesson of its own: the gate walks `tools/` to prove its
own inputs are committed, so a throwaway there would have failed that check in
every case and made the matrix unreadable. It deleted itself on exit.

## 3. The half no file can show, named rather than implied

Actions disabled on the repository, a workflow GitHub refuses to parse, a branch
protection rule that replaced the checks, a required check that no longer exists —
all of them are remote state, and all of them read from outside like "checks are
slow". No gate can close that by reading files, so it is a **manual-audit** step
instead of a false claim of coverage:

```
npm run audit:pr-ci-coverage          # human-readable
npm run audit:pr-ci-coverage --json
```

It asks whether each open pull request has at least one check run, and exits **2**
— never 0 — when it cannot tell, because an unauditable repository and a clean one
are the same thing from inside it. Observed here:

- live: **2 open pull requests, every one with checks, exit 0**
- `env PATH=/nonexistent`: `NOT PROVEN — no open pull request was examined`, **exit 2**

It is not a probe: it needs `gh`, a network and credentials, and its answer changes
when somebody else opens a pull request. A gate that fails because of another
person's pull request is a gate people learn to ignore. Its own output states its
scope: it reads whether checks **exist**, never their verdicts, so "has a run" is
not "has a passing run".

## 4. Found on the way: the counts check could not read a bare total

Updating the ledger header exposed a hole in the check written to prevent exactly
this. The header said `reports **27** integrity checks` while the run was `28`, and
`documented-counts-match-the-derived-counts` **passed**, because it matched only
the `N/N` form: the number was written bare, with markdown emphasis between the
digits and `integrity checks`. A count the check cannot see is the drift it exists
to prevent, so it now strips emphasis and reads both shapes the documents actually
use.

Drift matrix 5/5, restores byte-identical: the control green; a wrong bare total
(`27 integrity checks`) firing with "claims 27 integrity checks and this run has
28"; a wrong fraction (`27/27`) firing; a probe count off by one firing; and the
boundary sentence mutated to no longer match, which fired because history was then
read as current (`25, 25, … probes`, `24/24`, `19/19`) — the correct failure, and
the mutation removed only the first of the phrase's two occurrences.

The header's total from the previous CI run is deliberately written in **words**
("all 27 of the checks that existed then") rather than as a fraction. A historical
total in the same shape as a current one is what the check should refuse, not what
it should be taught to skip.

---

## 5. Standing and limits

`npm run verify:hard-rule-9` → **PASSED — 28/28** once the new audit tool is
committed (before that, `gate-inputs-are-committed` names it, correctly).
`npm run verify:probes` is unchanged at **28 probes: 27 passed, 1 declared skip, 0
failed** — no probe was added or modified by this change.

Stated limits:

- The new check asserts the workflow's **reach**, not that a run happened. The
  audit tool covers "has a run"; neither covers "had a *useful* run".
- GitHub's own semantics are taken on trust: that a bare `pull_request:` means all
  bases and all default activity types. The evidence for that here is the fixed
  workflow itself — the pull request for this very change is the first one based
  on the default branch after the fix, and its run is what proves the trigger still
  parses and still fires.
- Nothing here is a security or access-control claim. A trigger filter that starved
  checks did not weaken the repository's secrecy; it removed its evidence.
