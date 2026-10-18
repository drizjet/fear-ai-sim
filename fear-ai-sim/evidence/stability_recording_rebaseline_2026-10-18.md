# Stability Recording Re-baseline and the Stranded Night Seven — 2026-10-18

**Scope:** the nightly stability job went red on scheduled run `39111788675`
(04:00 UTC cron, queued to 08:31Z, on `4e1bf3c`) for a *baseline* reason, not a
probe reason. The committed recording (`evidence/probe_stability_report.json`, 52
probes, Node v20.20.2, 2026-10-16T22:20:15Z) predates the D2B-era roster growth to
60, and the fold refused the night for that mismatch. This record re-baselines the
recording to that run's own 60-probe pass, folds the night it stranded into the
ledger, and states what none of that proves.

## The refusal that was not a regression

The night's own steps, from run `39111788675`:

- repeats: `60 probes: 58 passed, 2 passed with declared skips, 0 failed` — clean,
  and uniform across all three attempts each;
- comparison: `OK — nothing gated (60 probes compared, 8 suite drift note(s), 8
  timing comparison(s) skipped as incomparable)` — zero verdict regressions;
- the red step was the fold alone:
  `REFUSED — artifact entry 7 names 8 probe(s) absent from the committed recording
  ... Folding them would change every other probe's denominators from a suite that
  is not the recorded one.` (exit 2). The refusal fires before anything is pushed,
  so no review branch and no pull request were left behind — this is the guard
  working as designed, not a failed run to retry.

The eight probes new since the recording — `verify_all_systems_runtime.mjs`,
`verify_evidence_seed_idempotency.mjs`, `verify_quarantine_reach.mjs`,
`verify_runtime_real_browser.mjs`, `verify_scenario_differentiation.mjs`,
`verify_simulation_contracts.mjs`, `verify_trade_chain_causal_edges.mjs`,
`verify_trade_runtime_contracts.mjs` — were all `NEW / tonight PASSED, PASSED,
PASSED` in the suite drift, and all eight skipped timing as `notComparable` for the
same reason: a recording that does not name a probe cannot base anything on it.

## The re-baseline

The recording is now the run's own fresh repeated run (the `probe-stability-report`
artifact of `39111788675`): 60 probes, Node v20.20.2 / win32, **58 PASSED and 2
PARTIAL** (declared skips: `verify_unity_editor_tests.mjs` and
`verify_cross_tree_parity.mjs`), uniform across all three attempts each.

Why this is a re-baseline and not "re-record until green":

- the gate only fires on `PASSED → not-PASSED`; nothing was converted from
  not-passed to passed. The two PARTIAL rows stay PARTIAL, and the dossier renders
  them;
- it is the environment the nightly job itself runs in. A baseline only one machine
  can satisfy is a gate that can only go red — and here the runner is the only
  machine that *can* satisfy it: this checkout's machine has the sibling host tree,
  so `verify_cross_tree_parity.mjs` passes here (suite 59/1/0) and skips on the
  runner. A locally made recording would record that probe PASSED and every future
  CI night would compare `PASSED → PARTIAL` and go red on a "lost proof" that was
  never the runner's to hold. The recording must be the runner's own pass.
- the run remains the evidence; this file only describes what was done with it.

## The fold

Dry-run first: `nights: 6 -> 7`, `attempts: 612 -> 792`, the prior six lines
preserved byte-for-byte, `+ 2026-10-18T08:38:55.103Z  v20.20.2 / win32  up to 3x
60 probes`, `verdicts: 58 clean, 2 consistently not-passed`, `no probe disagreed
with itself on this night`. `--write` applied it.

- Seven nights and 792 attempts in, still no probe has ever disagreed with itself;
  the 95% Wilson upper bound on any one probe's flake rate falls from 39.0% to
  **35.4%** — a smaller bound, still not a proof of determinism.
- The eight D2B-era probes enter the cross-night record for the first time: only
  tonight's line names them, and it names them clean.
- Five of the seven nights carry no per-run durations (they predate the 2026-10-16
  `ledgerEntry()` fix), so the pooled drift analysis still excludes them and stays
  honestly *not yet measurable*: *"a drift needs 4 comparable nights that carry
  per-run durations, and 1 of 4 do; 3 carry no per-run durations and are excluded
  rather than treated as zero."* Nights from tonight onward enter the pool; this
  fold does not change the gate's answer yet, only its future.

## Gates after the change

- `npm run verify:release-claims` → SUCCESS.
- `npm run codegen:release-dossier` regenerated the dossier (60 of 60 repeated,
  7 nights / 792 attempts, drift still INSUFFICIENT); `--check` → OK.
- A simulated comparison against the artifact's own report
  (`stability_regression.mjs --fresh <artifact report> --recording <re-baselined
  recording> --append-history <temp>`) → exit 0, `OK — nothing gated (60 probes
  compared)`.
- `verify_night_fold_rehearsal.mjs` → 29/29 assertions (the fold machinery, on the
  repository shape that broke in September).
- `npm run guardian:check` → CLEAN; `npm run verify:hard-rule-9` → 28/28.

## What this record does not claim

- It does not claim determinism or flakiness of any probe. Seven nights, 792
  attempts and zero observed disagreements still bound any probe's flake rate at
  35.4% (95% Wilson), not at zero.
- It does not claim the next scheduled run will be green as a whole. It claims the
  comparison that run performs has no verdict regression to report against the
  re-baselined recording — because the recording *is* the previous run's own pass —
  and that the fold now accepts the night. The run remains the evidence.
- It does not claim the host-tree proof of `verify_cross_tree_parity.mjs` on CI.
  The re-baseline makes its PARTIAL the recorded baseline for a hostless runner; on
  a machine with the host tree the probe still proves what it always did.
- It does not claim the drift gate works. It claims the pool now accumulates
  duration-carrying nights and the gate stays honestly *not yet measurable* until
  four comparable ones exist.
