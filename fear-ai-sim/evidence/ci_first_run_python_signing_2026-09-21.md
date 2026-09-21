# The First Real CI Run — 2026-09-21

**Scope:** what the first CI run that could actually pass found, why the failure
named no cause, and the two-sided fix. Nothing here verifies the middleware; it is
about whether the unattended path proves what it says it proves.

## Why this run was the first

Every recorded run before it failed (`gh run list`: the 2026-09-17 pushes, and the
open pull request — each red in about twenty seconds), because the committed
workflow still ran a Jest matrix and a Codecov upload against a runner and a script
that had both been deleted. Until the toolchain and the rewritten workflow were
committed, the gate ran only on this machine.

The push of `64d306a` therefore produced the first real signal from the unattended
path:

- `repository-integrity` (ubuntu-latest) — **success**: `npm test` refuses, the
  integrity gate reports **24/24**, `guardian:check` is `CLEAN`. The retirement
  surface is intact on a machine that has never seen this repository.
- `probes` (windows-latest) — **failure**: 23 passed, 1 declared skip, **1 failed**.
  The single failure was `verify_transport_signing.mjs`, in section 6.

## What it found

```
  * the Python client enabled signing with a generated key — ... | SIGNED 0 REFUSALS 0 REASON
VERIFICATION FAILURE: FAIL: the Python client enabled signing with a generated key
```

The job **declares** it has that runtime — `FEAR_AI_EXPECT_PROVEN:
store_encryption,host_token_persistence,transport_signing` — and the workflow's own
comment says the runner image provides `python`. It does. What it does not provide
is the **`cryptography` wheel** the Python adapter needs to build an RSA key, and
nothing installed it. The adapter knew: it sets `signing_error = "request signing
needs the 'cryptography' package"` and returns `False`. That diagnosis was in a
variable nobody printed, so five checks failed reading as *"the Python adapter is
broken"* — the most expensive possible reading of a missing package.

Reproduced locally, without touching the runner, by putting a stub `cryptography`
package on `PYTHONPATH` that raises on import: the probe then printed exactly the
runner's output, header and failure and nothing in between.

## The fix, in both directions

**The probe now reports an environment limitation as one.** The generated script
prints the adapter's own `SIGNING_ERROR`, and when the backend is missing the
Python subsection is reported as a declared **SKIP with the adapter's words** —
matching how this section already treats an absent interpreter or engine.
Under-claiming is the safe direction for evidence, and the Godot in-engine half
still runs, so the two halves are now reported separately rather than as a block.
A missing package is not a claim failure; a *broken* adapter still fails.

**The runner now actually has the runtime it declares.** Both Windows jobs install
`python -m pip install --no-input cryptography==50.0.1`, pinned because the
evidence is a signature this wheel produced, and the command joined CI's `run:`
allowlist as the workflow's own rule requires. The integrity gate then derives the
requirement from the declarations rather than repeating it:
`python-signing-backend-is-pinned-where-it-is-declared` counts the jobs that
declare `transport_signing` proven and requires at least that many pinned installs
— so a job cannot declare a runtime it does not install, and the gate does not have
to be edited when a job is added. Gate total: **25 checks**.

The two halves compose: CI declares the runtime, so a skip on the runner is a
**failure** (that is what `FEAR_AI_EXPECT_PROVEN` means), and the skip branch
exists for every machine that has not declared it.

## Proven

- Local run with the backend present: **61 assertions**, exit 0, unchanged.
- Local run with the backend hidden (`PYTHONPATH` stub): **55 assertions**, exit 0,
  `* Python signing: SKIPPED (this interpreter has no 'cryptography' package)`
  followed by the adapter's own sentence, and the Godot half still passing.
- The runner's failure was reproduced exactly by that stub *before* the fix, which
  is what makes the cause a finding rather than a guess.
- `npm run verify:hard-rule-9` → **25/25**; `verify:release-claims`,
  `codegen:release-dossier:check` and `codegen:maturity-map:check` all exit 0.

## Stated limits

The pin is a **version** pin, not a digest pin like the engine's: the wheel is
fetched from PyPI at run time, so this evidence depends on PyPI continuing to serve
`cryptography==50.0.1` for the runner's Python. The number of assertions a green run
reports now depends on whether the backend is present (61 vs 55), which is visible
in the count and on the skip line but is a difference a reader has to notice. And
this is one CI outcome on one commit: the nightly job, the ledger fold and the
ledger pull request have still never executed anywhere but in a local rehearsal —
the next scheduled run is the first test of those.
