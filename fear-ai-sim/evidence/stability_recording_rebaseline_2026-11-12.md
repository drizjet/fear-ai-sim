# Stability Recording Re-baseline and the Stranded Night Thirty-Two - 2026-11-12

**Scope:** the nightly stability job went red on scheduled run `43215277011`
(04:00 UTC cron, queued to 12:08Z, on `76a0cd7`) for a *baseline* reason, not a
probe reason. The committed recording (`evidence/probe_stability_report.json`, 60
probes, Node v20.20.2, 2026-10-18T08:38:55Z) predates the Round 11 / host-IPC /
asset-gate merges that grew the suite to 73, and the fold refused the night for
that mismatch. This record re-baselines the recording to that run's own 73-probe
pass, folds the night it stranded into the ledger, and states what none of that
proves.

## The refusal that was not a regression

The night's own steps, from run `43215277011` on `76a0cd7`:

- probes: `success` (12:09:02 -> 12:13:40) - 73 probes recorded, 71 `PASSED` x3
  and 2 `PARTIAL` x3 (the declared skips `verify_cross_tree_parity.mjs` and
  `verify_unity_editor_tests.mjs`), uniform across all three attempts each;
- comparison: `OK - nothing gated (73 probes compared, 13 suite drift note(s), 13
  timing comparison(s) skipped as incomparable)` - zero verdict regressions, no
  probe slower than its baseline;
- the red step was the fold alone:
  `REFUSED - artifact entry 32 names 13 probe(s) absent from the committed recording
  ... Folding them would change every other probe's denominators from a suite that
  is not the recorded one.` (exit 2). The refusal fires before anything is pushed,
  so no review branch and no pull request were left behind - this is the guard
  working as designed, not a failed run to retry.

The thirteen probes new since the recording:

- `verify_cycle22_world_journal_tamper.mjs`
- `verify_cycle22_world_trade_authority.mjs`
- `verify_entrypoint_assets.mjs`
- `verify_epistemic_route_boundary.mjs`
- `verify_faction_route_boundary.mjs`
- `verify_host_contract_fallback_boundary.mjs`
- `verify_k16_wire_compatibility.mjs`
- `verify_macro_route_dispatch_boundary.mjs`
- `verify_moral_route_boundary.mjs`
- `verify_persona_route_boundary.mjs`
- `verify_runtime_core_import_boundary.mjs`
- `verify_world_trade_authority.mjs`
- `verify_ws_pack_dispatch_contract.mjs`

They were all `NEW / tonight PASSED, PASSED, PASSED` in the suite drift, and all
thirteen skipped timing as `notComparable` for the same reason: a recording that
does not name a probe cannot base anything on it. They arrived through merged pull
requests (#63, #65, #66, #67) whose own CI was green, not through a change made on
the runner.

## The re-baseline

The recording is now the run's own fresh repeated run (the `probe-stability-report`
artifact of `43215277011`): 73 probes, Node v24.22.2 / win32, **71 PASSED and 2
PARTIAL** (declared skips: `verify_unity_editor_tests.mjs` and
`verify_cross_tree_parity.mjs`), uniform across all three attempts each.

Why this is a re-baseline and not "re-record until green":

- the gate only fires on `PASSED -> not-PASSED`; nothing was converted from
  not-passed to passed. The two PARTIAL rows stay PARTIAL, and the dossier renders
  them;
- it is the environment the nightly job itself runs in. A baseline only one machine
  can satisfy is a gate that can only go red - and here the runner is the only
  machine that can satisfy it: this checkout's machine has the sibling host tree,
  so `verify_cross_tree_parity.mjs` passes here and skips on the runner. A locally
  made recording would record that probe PASSED and every future CI night would
  compare `PASSED -> PARTIAL` and go red on a "lost proof" that was never the
  runner's to hold. The recording must be the runner's own pass.
- the run remains the evidence; this file only describes what was done with it.

## The fold

Dry-run first: `nights: 31 -> 32`, `attempts: 5112 -> 5331`, the prior thirty-one
lines preserved byte-for-byte, `+ 2026-11-12T12:19:29.954Z  v24.22.2 / win32  up to
3x  73 probes`, `verdicts: 71 clean, 2 consistently not-passed`, `no probe
disagreed with itself on this night`. `--write` applied it; the release dossier was
regenerated and `verify_release_claim_boundaries.mjs` passed before the commit.

- Thirty-two nights and 5,331 attempts in, still no probe has ever disagreed with
  itself; the 95% Wilson upper bound on any one probe's flake rate falls from
  11.0% to **10.7%** - a smaller bound, still not a proof of determinism.
- The thirteen new probes enter the cross-night record for the first time: only
  tonight's line names them, and it names them clean.
- The pooled drift analysis now judges 46 probes over **14 comparable nights** and
  still reports no probe creeping; the five earliest nights carry no per-run
  durations and stay excluded rather than guessed at.
- Timing comparison against the recording is **not** claimed for the thirteen new
  probes on this night (skipped as incomparable), and the recording's Node major
  changed from the last re-baseline (v20.20.2 -> v24.22.2). The nightly runner has
  reported Node v24 since 2026-10-30 (v24.22.1, then v24.22.2 from 2026-11-02);
  the recording is now the same major.

## What this does not prove

- A ledger that never disagrees with itself is a bound on a sample, not
  determinism; 10.7% is an upper bound at 32 nights, not a guarantee.
- The two declared skips remain unproven on this host: `verify_cross_tree_parity`
  (needs the sibling tree) and the Unity Editor GUI.
- Thirteen probes have exactly one night of evidence. Their clean result is a
  first observation, not a stability record.
- Quiet post-epoch nights still do not prove the 2026-10-29 host step cannot
  return.
