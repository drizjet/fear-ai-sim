# Stability Recording Re-baseline and the Stranded Night Five — 2026-10-16

**Scope:** the nightly comparison gate went red on `workflow_dispatch` run
`38974633915` for a *baseline* reason, not a probe reason. The committed recording
(`evidence/probe_stability_report.json`, 25 probes, Node v24.19.0, 2026-09-21) no
longer matches the suite it is compared against (52 probes, Node v20.20.2 on the
runner), and `verify_cross_tree_parity.mjs` — which since 2026-10-12 executes the
real host `fear.rs` — cannot prove itself on a runner without the host tree. This
record re-baselines the recording to that run's own 52-probe pass, folds the night
it stranded into the ledger, records the per-run-durations writer defect the
exclusion exposed, and states what none of that proves.

## The regression that was not a defect

From `probe_stability_comparison.json` of run `38974633915` (job `probe-stability`
= `117220990302`):

- one verdict regression: `verify_cross_tree_parity.mjs` — recording `PASSED, PASSED,
  PASSED`, tonight `PARTIAL, PARTIAL, PARTIAL`;
- the recording predates both the roster growth and the host-oracle change: 25
  probes against tonight's 52, and `9d3aa26` (2026-10-12, "execute real host fear.rs
  via rust oracle") plus `24893c5` (2026-10-13, wire panic onset) made the probe
  require the sibling host tree the runner does not have. Its PARTIAL is the declared
  skip, three times over — deterministic, not intermittent;
- 27 of tonight's probes had no counterpart in the recording at all, and the timing
  gate had zero comparable baselines (v24 recording vs v20 runner);
- the fold then refused the night for the same mismatch — `artifact entry 5 names 27
  probe(s) absent from the committed recording` — because a probe name a recording
  does not know rewrites every denominator.

## The re-baseline

The recording is now the run's own fresh repeated run (the `probe-stability-report`
artifact of `38974633915`): 52 probes, Node v20.20.2 / win32, **50 PASSED and 2
PARTIAL** (declared skips: `verify_unity_editor_tests.mjs` and
`verify_cross_tree_parity.mjs`), uniform across all three attempts each.

Why this is a re-baseline and not "re-record until green":

- the gate only fires on `PASSED → not-PASSED`; nothing was converted from
  not-passed to passed. The two PARTIAL rows stay PARTIAL, and the dossier renders
  them.
- it is the environment the nightly job itself runs in. A baseline only one machine
  can satisfy is a gate that can only go red.
- on this machine, which *does* have the host tree, `verify_cross_tree_parity.mjs`
  passes — the suite at the same tree reports 51 passed, 1 declared skip, 0 failed.
  A host-present machine exceeding the recording is the direction the gate does not
  gate by design.

## The fold

`npm run fold:stability-ledger -- --from <artifact ledger>` dry-run first:
`nights: 4 -> 5`, `attempts: 300 -> 456`, the prior four lines preserved
byte-for-byte, `+ 2026-10-16T22:20:15.513Z  v20.20.2 / win32  up to 3x  52 probes`,
`no probe disagreed with itself on this night`. `--write` applied it. With five
nights the flake-rate gate's **≥ 5-night** condition is met for the first time; zero
nights have ever disagreed, so the measured rate is 0 and nothing is gated.

## The per-run-durations defect the exclusion exposed

The fold prints "this night carries no per-run durations, so it is excluded from the
pooled percentile/drift analysis (but counted for the flake rate)". So did every
previous fold — five nights of five. The drift gate (`durationDrift`) needs ≥ 4
comparable nights carrying per-run durations, so it could never leave *not yet
measurable*.

That exclusion was being read as "the runner did not record them yet". It was not:

- the stranded run's own fresh report carries `durationsMs` per probe (`[50821, 4479,
  4098]` for the first probe);
- the 2026-09-22 and 2026-09-23 artifacts' reports carry them (25 probes each);
- even the old committed recording carried them.

`ledgerEntry()` in `tools/verification/stability_regression.mjs` dropped the array
when it serialized each night — every night, back to the first. The gate's message
compounded it, calling each duration-less night one that "predated per-run duration
recording": true at most for the first night, wrong for the rest.

Fixed in the same change:

- `ledgerEntry()` now carries `durationsMs` when the report has it;
- the gate's message, the dossier generator's rendering and the map now say "carry
  no per-run durations" — the observed fact — instead of a cause nobody had
  established.

Proof, a simulated comparison against a four-night copy of the ledger
(`--fresh <artifact report> --recording <re-baselined recording> --append-history
<temp>`):

- exit 0, `OK — nothing gated (52 probes compared)`, zero regressions, every verdict
  matching its recording verdict;
- the appended night line names all **52** probes with `durationsMs` arrays;
- drift still reports INSUFFICIENT honestly (`0 comparable night(s) carry per-run
  durations, 4 needed`), because the pool is formed from *prior* nights and the five
  recorded ones carry none; nights from the next scheduled run onward enter it.

## Gates after the change

- `npm run verify:probes` → 52 probes: 51 passed, 1 declared skip, 0 failed, exit 0.
- `npm run codegen:release-dossier` regenerated; `npm run verify:release-claims` →
  SUCCESS.
- the simulated `stability_regression` run above → exit 0.

## What this record does not claim

- It does not claim determinism or flakiness of any probe. Five nights, 456 attempts
  and zero observed disagreements still bound any probe's flake rate at 43.4%
  (95% Wilson), not at zero.
- It does not claim tonight's scheduled run will be green. It claims the comparison
  that run performs has no verdict regression to report against the re-baselined
  recording, because the recording *is* that run's own pass. The run remains the
  evidence.
- It does not claim the host-tree proof of `verify_cross_tree_parity.mjs` on CI. The
  re-baseline makes its PARTIAL the recorded baseline for a hostless runner; on a
  machine with the host tree the probe still proves what it always did.
- It does not claim the drift gate works. It claims the writer no longer drops the
  samples the gate needs, and that the gate stays honestly *not yet measurable*
  until prior nights carry them.
