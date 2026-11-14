# Timing Epoch for the 2026-11-11/12 Host Excursion - 2026-11-13

**Scope:** two scheduled nights went red on the same drift verdict. Run `43420189009`
(2026-11-13, on `3a52ad1`) and run `43588844580` (2026-11-14, on `3a52ad1`) both
failed only at **Compare against the committed recording**, with identical numbers:

`DRIFT verify_store_encryption.mjs — recent median 5697 ms vs baseline median 3467 ms
(1.64x, above the probe's own p90 of 5165 ms) over the last 2 of 15 comparable nights — GATED`

Nothing else was red: **0 verdict regressions**, **0 step timing regressions**, 73
probes at 71 `PASSED` x3 and 2 `PARTIAL` x3 (the declared skips), and no probe slower
than its baseline. The fold step never ran, so no branch and no pull request were
left behind.

## Why the same two nights were judged twice

`durationDrift()` pools the ledger **as committed**, and the fold step is what would
have extended it. A red gate therefore skips the only write that could advance the
window: the last two committed nights stay 2026-11-11 and 2026-11-12, and every new
night re-judges them. The 11-13 run's own `verify_store_encryption` durations were
`2858, 2790, 2765` ms and the 11-14 run's were `4010, 3242, 2349` ms - both at the
pooled baseline - but neither could enter the pool because neither night was foldable.
The verdict was a property of which nights the frozen window held, exactly the failure
mode documented for run `41299959705` on 2026-11-01.

## The evidence that the level moved without the code moving

- 2026-11-10 (median `2071` ms) and 2026-11-11 (median `5841` ms) ran commits
  `678d417` and `119783b`, whose only diff is the folded ledger line and two lines of
  the release dossier - **no executable code changed**, and the probe jumped 2.8x.
- 2026-11-12 (median `4868` ms) and 2026-11-13 (median `2790` ms) ran `76a0cd7` and
  `3a52ad1`, whose only diff is this repository's 2026-11-12 re-baseline evidence and
  dossier - **no executable code changed**, and the probe fell 1.75x.
- `tools/verification/verify_store_encryption.mjs` and the
  `packages/runtime/src/EncryptedStore.js` it imports were not modified in
  `119783b..HEAD`.
- The excursion was narrow: other probes' per-night medians did not move with it
  (median of per-probe medians 177/155 ms on 11-11/11-12 vs 115-207 ms across the
  surrounding week), and the drift gate named one probe, not a family.

This is a host-throughput excursion, not a code regression, and it reversed.

## The epoch

`TIMING_EPOCHS` gains a `github-hosted` boundary at **2026-11-13**:

> a two-night host excursion (11-11, 11-12) on code shared with fast nights either
> side; the pooled history before 11-13 mixes levels rather than describing one

What it does, and does not do:

- Nights before 2026-11-13 stay in the ledger and still count for **verdicts** and
  for the **flake rate**. They are not pooled into any probe's timing distribution;
  the exclusion is counted in every report (23 earlier comparable nights).
- The drift gate re-builds from 11-13 and needs four post-epoch nights with per-run
  durations before it can gate again. Until then it reports **not yet measurable**,
  which is the honest state rather than a green claim.
- It is not an epoch for a new (slower) level: it marks the end of a transient one.
  If the excursion returns, the gate sees it as post-epoch evidence and can gate it
  normally; the epoch does not mute anything after 11-13.

## The fold

The two stranded nights were folded in ledger order with the fold tool, not by hand:

- 2026-11-13: `32 -> 33` nights, the prior 32 lines preserved byte-for-byte,
  `+ 73 probes, 71 clean / 2 consistently not-passed`, all 73 with 3 `durationsMs`;
- 2026-11-14: `33 -> 34` nights, the prior 33 lines preserved byte-for-byte, same
  shape;
- ledger: **34 nights / 5,769 attempts**, still no probe ever disagreeing with itself;
  the dossier now reads **34 nights / 5,769 attempts**, Wilson **10.2%**, and its
  timing paragraph says *not yet measurable* with the epoch explanation.

Verified before the commit:

- a simulated comparison with the 11-14 artifact against the new ledger exited **0**,
  with `not yet measurable: 2 comparable night(s) carry per-run durations, 4 needed`
  and the epoch line - i.e. the next scheduled run no longer latches on the frozen
  window;
- `generate_release_dossier.mjs` exited 0 and
  `verify_release_claim_boundaries.mjs` exited 0 on the resulting tree.

## What this does not claim

- The 2026-11-11/12 nights were **not** a code regression, and this document does not
  call them a false alarm either: the probe genuinely measured 1.6x for two nights.
  It says the pooled history could not distinguish a host level from a code path.
- The epoch does not prove the host pool is now stable, and the 11-11/12 excursion may
  recur. It only prevents a transient two-night level from being treated as the
  permanent baseline, and prevents the red gate from freezing the ledger forever.
- Drift coverage is reduced for the next two nights (four post-epoch nights are
  needed). That cost is stated in the dossier rather than hidden.
- Nothing here changes the verdicts, the flake bound, or the two declared skips; the
  10.2% Wilson figure is a bound on a sample, not a proof of determinism.
