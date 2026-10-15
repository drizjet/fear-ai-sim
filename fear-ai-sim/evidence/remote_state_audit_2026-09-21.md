# The Rest Of The Remote State — 2026-09-21

**Scope:** the manual audit widened from pull-request check coverage to the three
remote facts that decide whether a green run means anything. A change to the
evidence layer, not to the middleware.

**Why it exists.** Ledger §43 closed the workflow's own reach: a
`pull_request.branches` filter is matched against a pull request's *base*, so a
stacked pull request received no jobs at all — no failure, no skip, an empty
checks list. That defect has a family, and every other member of it is remote
state that no file-reading gate can see.

---

## 1. What it asks now

| Question | Why it can make the repository's evidence a lie |
|---|---|
| Does each open pull request have **any** check run? | The §43 trap in whatever form it returns, plus anything that starves a run |
| Is **Actions** enabled, and what does `allowed_actions` permit? | A disabled workflow is a file, and `local_only` fails every `uses:` step including `actions/checkout` — arriving as a red job, not as a policy |
| Does branch protection require a **context no job produces**? | Every merge waits forever for a status nothing can report: the same absence-without-a-failure shape, one layer down |

The third one is the finding worth the tool. Contexts are **derived** from the
workflows' own job names — a job's `name:` if it sets one, otherwise the job id,
which is what GitHub uses — and compared with protection's required list, so a
rename on either side is a finding rather than a third copy written down by hand.
The reverse direction is reported as well: a job protection does *not* require is
advisory only, and the note says so, because "CI is green" and "CI blocks merges"
are different claims.

## 2. Live state of this repository

```
npm run audit:remote-state
```

- `drizjet/fear-ai-sim`, default branch `master`, job contexts it can report:
  `repository-integrity`, `probes`, `probe-stability`, `unity-editmode`
- **Actions enabled**, `allowed_actions="all"`, `sha_pinning_required=false`
- **2 open pull requests, every one with check runs**
- **No branch protection on `master`**
- **exit 0 — no findings**, with the branch-protection fact reported as a note

That last note is the honest strength of this repository's CI evidence, and it
was written down nowhere before: nothing requires these checks, so a green run is
evidence a human read and a red one does not block a merge. It is a note rather
than a finding because it is a policy choice — and a tool that fails on policy
choices is a tool people learn to ignore.

## 3. Never a silent pass, as an exit-code contract

| Code | Meaning |
|---|---|
| 0 | every item determined, nothing wrong |
| 1 | at least one FINDING |
| 2 | an item that could not be determined |

An unauditable repository and a clean one look identical from inside, so only the
first exits 0. Observed: `env PATH=/nonexistent` → `NOT PROVEN — no open pull
request was examined`, **exit 2**.

## 4. Fixture mode, so the judgement is exercised without a second repository

`--fixture <file.json>` supplies the remote answers and still reads the workflows
from disk — the half that makes the comparison real. **8/8** cases behaved as
required:

| Case | Result |
|---|---|
| healthy state | exit 0, no findings |
| a required context no job produces | exit 1, `required-context-with-no-job` |
| Actions disabled | exit 1, `actions-disabled` |
| `allowed_actions: local_only` | exit 1, `actions-local-only` |
| an open pull request with no check runs | exit 1, `pr-without-checks` |
| a selected allowlist that cannot be honoured offline | exit 2, no findings, 3 unproven |
| the Actions policy could not be read | exit 2, 1 unproven |
| the local half must derive job contexts | exit 0, **4** contexts derived |

The last one is a regression guard, and it is there because it caught a real bug.

## 5. The tool's first version failed exactly the way the tool exists to catch

It resolved the repository root as `..` from `tools/ci/` — which is `tools/`, not
the repository — so the local half found no workflow files, printed
`job contexts this repository can report: <none>`, and **still exited 0**. The
line was there to be read; the exit code was not.

Both halves are fixed: the root resolves correctly, and an empty local half is now
an explicit **NOT PROVEN** item rather than an empty set that makes every
comparison vacuously clean. A silent empty answer is the failure this audit is
about, and finding one inside the audit is the argument for the fixture matrix
existing at all.

## 6. Limits

- It reads whether checks **exist** and whether the repository **requires** them.
  It never reads their verdicts, so "has a run" is not "has a passing run".
- It is not a security, access-control or compliance claim.
- It is not a gate: it needs `gh`, a network and credentials, and its answers
  change when somebody else opens a pull request or edits a setting. It is run by
  a person. `gate-inputs-are-committed` holds it to being committed and
  `system-map-states-the-same-ci-contract` holds the map to describing it.
- Where the selected-actions allowlist cannot be honoured offline —
  `verified_allowed` depends on GitHub's own verified-creator list — the item is
  reported as NOT PROVEN rather than assumed permitted.
- Matrix jobs would append matrix values to their status context; none of this
  repository's jobs uses one, and the tool emits a note if that changes rather
  than guessing.
