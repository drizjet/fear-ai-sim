# Timing Epoch for the 2026-11-16 Host Step - 2026-11-18

**Scope:** the 2026-11-18 scheduled night (run `44305778081`, on `3ad2032`) went red only at
**Compare against the committed recording and extend the ledger**, and only at the drift
gate:

`DRIFT verify_counterfactual_world.mjs — recent median 238 ms vs baseline median 148 ms
(1.61x, above the probe's own p90 of 150.6 ms) over the last 2 of 5 comparable nights — GATED`

Everything else was green: **0 verdict regressions**, **0 step timing regressions**, 73 probes at
71 `PASSED` x3 and the 2 declared `PARTIAL` x3, and no probe slower than its baseline. The fold
step never ran, so no branch and no pull request were left behind.

## Why this is not a probe regression

- `git diff 9d52113..HEAD -- tools packages` is **empty**: the 11-15, 11-16 and 11-17 nights differ
  from this one only in the folded ledger line and the generated dossier.
- `tools/verification/verify_counterfactual_world.mjs` has no commit since before 2026-11-01.
- The probe's own per-night medians are `148, 121, 150` ms on 11-13..11-15, `208, 285` ms on
  11-16..11-17, and `189` ms tonight. The committed recording for it is `188, 191, 199` ms - the
  "fast" window is the outlier, not the slow one.
- The gate's complaint is arithmetically specific: a ~148 ms probe with a **151 ms p90** tripped
  because the two most recent committed nights happen to be its slowest pair.

## Why it is a host level

- The whole suite moved together. The median of per-probe medians was `115 / 103 / 120` ms on
  11-13..11-15 and `146 / 155 / 150` ms on 11-16..11-18 - a 1.25-1.35x step at 11-16 that has
  persisted for three nights.
- The movement is not confined to one family: on 11-17, 15 probes sat above 1.25x (runtime,
  trade authority, dotnet adapters, dashboard, godot stations, arbitration fuzz); tonight 3 were
  above 1.4x (`verify_trade_runtime_contracts` 1.49x, `verify_runtime_core_import_boundary` 1.45x,
  `verify_release_claim_boundaries` 1.42x) with no code change under them.
- A ratio across two host levels measures the levels. Pooling fast nights with slow ones makes
  every probe's p90 a mixture, which is exactly how a transient becomes a permanent gate trip.

## The epoch

`TIMING_EPOCHS` gains a `github-hosted` boundary at **2026-11-16**:

> first nightly at a slower host level: the suite's median of per-probe medians stepped
> 115-120 -> 146-155 ms across 11-16..11-18 with no change under tools/ or packages/

This is the mirror of the 2026-10-29 epoch (the first night at a slower level), not of the
2026-11-13 epoch (the end of a transient excursion). What it does and does not do:

- Nights before 2026-11-16 stay in the ledger and still count for **verdicts** and for the
  **flake rate**. They are not pooled into any probe's timing distribution, and the exclusion is
  counted in every report (26 earlier comparable nights).
- The drift gate re-builds from 11-16 and needs four post-epoch nights with per-run durations.
  Tonight's fold makes three (11-16, 11-17, 11-18), so the gate reports **not yet measurable** at
  the 11-19 run and can measure again at the **11-20** run. Until then no claim is made either way.
- It does not mute anything after 11-16. If the level keeps climbing, the rebuilt pool will see
  it with four nights of its own; if it reverses, a further boundary at the first fast night
  would be required, exactly as the 11-13 boundary was.

## The fold

Tonight's night was folded with the ledger tool, not by hand:

- 2026-11-18: `37 -> 38` nights, the prior 37 lines preserved byte-for-byte, `+ 73 probes,
  71 clean / 2 consistently not-passed`, all 73 with three `durationsMs`;
- ledger: **38 nights / 6,645 attempts**, still no probe ever disagreeing with itself;
- the dossier now reads **38 nights / 6,645 attempts**, Wilson **9.2%**, and its timing paragraph
  says *not yet measurable* with the new epoch explanation.

Verified before the commit:

- a simulated comparison of tonight's artifact against the new ledger exits **0**, with
  `not yet measurable: 3 comparable night(s) carry per-run durations, 4 needed` and the epoch line;
- `generate_release_dossier.mjs` exited 0 and `verify_release_claim_boundaries.mjs` exited 0 on the
  resulting tree.

## What this does not claim

- The 11-16..11-18 step is **not** shown to be permanent. Three nights is enough to stop calling
  the old fast pool a baseline, not enough to describe the new level.
- This document does not call the 2026-11-17 verdict wrong. "No probe is creeping" was a true
  statement about a four-night minimum sample; that sample is now superseded for timing.
- Drift coverage is deliberately blank until the 11-20 run, and the cost is stated in the dossier
  rather than hidden behind a green gate.
- Nothing here changes verdicts, the two declared `PARTIAL` probes, or the 9.2% Wilson bound -
  which is a bound on 6,645 attempts, not a proof of determinism.
