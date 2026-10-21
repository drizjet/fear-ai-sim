# Stability timing comparability — execution environment, 2026-10-21

## What failed

Workflow-dispatch run `39544249181` on `master` (`ca25bde`) ran the nightly
`probe-stability` path on **Node 24.22.0 / win32** for the first time. All 60
probes were stable and passed (`58 passed`, `2 passed with declared skips`,
`0 failed`), but `verify:stability-regression` exited 1:

```text
SLOWER  verify_dotnet_adapters_compile.mjs
        3.2x slower than 2 comparable night(s) (8356 ms -> 26998 ms) - GATED
```

The two baseline nights were `2026-09-21` entries recorded on the **local
machine** with Node v24.19.0. The fresh run was on a **GitHub-hosted runner**.
The probe had not regressed: its three per-run durations were
`10425, 8717, 7856` ms, a normal cold-then-warm .NET build sequence. The
comparison was measuring two different machines.

## Why the existing rule admitted it

`timingComparison()` filtered baselines with `comparable()`, which required only
the same `platform` and Node major. Those fields do not identify the machine.
The Codex/system-map wording said the baseline was "same platform and Node major
only" and described a cross-machine ratio as the thing being avoided; the code
did not implement that distinction.

This was latent while CI ran Node 20: the Node 24 fresh run had no Node 24
baseline and timing was skipped as incomparable. Moving CI to Node 24 made the
local Node 24 ledger entries eligible, exposing the false gate.

## Change

- `tools/verification/run_probe_suite.mjs` records an `environment` field:
  `RUNNER_ENVIRONMENT` when present (`github-hosted` / `self-hosted`), otherwise
  `github-actions` when `GITHUB_ACTIONS=true`, otherwise `local`.
- `ledgerEntry()` carries that field into each JSONL night.
- `comparable()` requires the same environment whenever either side declares
  one. A night that declares an environment is never compared with one that does
  not, or with a night from another environment.
- Historical entries that predate the field remain comparable to each other, so
  old reports and the generated dossier do not silently change meaning.
- The console, JSON comparison, system map, and truth ledger now state the
  environment condition.

No baseline number was edited and no failed run was folded into the ledger.

## Verification

- Re-ran the comparison against the failed run's own report with
  `environment: github-hosted` and the repository ledger:
  exit 0, **0 slower**, **60 timing comparisons skipped as incomparable**, and
  the appended ledger entry carried `environment: github-hosted`.
- A real local `--only verify_dashboard_endpoints --repeat 2` run reported
  `environment: local`.
- `npm run verify:hard-rule-9` — **28/28**.
- `npm run guardian:check` — **CLEAN**.
- `npm run verify:release-claims` — **SUCCESS**.

## Boundary

This change makes the gate refuse to compare what it cannot identify; it does
not prove the .NET probe is fast. A same-environment baseline must accumulate
from the next Node 24 CI run onward. The failed run's artifact remains evidence
of the false gate, not a recorded probe regression. No release asset, tag, or
package was changed.
