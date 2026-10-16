# Stability Ledger Backfill — 2026-10-16

**Scope:** The nightly fold chain's five defects (see
`evidence/night_fold_chain_repair_2026-10-16.md`) meant two recorded nights were
uploaded but never folded into `evidence/probe_stability_ledger.jsonl`. This
record folds them from the surviving CI artifacts and states what that does and
does not prove.

## The two nights

Both were recorded by the `probe-stability` job (Node v20.20.2 / win32, up to 3×
each probe, 25 probes) and uploaded as the `probe-stability-report` artifact of
the run that could not fold them:

| night | run | artifact content |
| --- | --- | --- |
| 2026-09-22T09:15:13.747Z | `35709020687` | `evidence/probe_stability_ledger.jsonl` — 3 lines: the two known nights plus this one |
| 2026-09-23T09:15:37.733Z | `35841559662` | same shape, with this night as the third line |

Both night lines report **24 probes PASSED and `verify_unity_editor_tests.mjs`
PARTIAL on all three repeats** — the declared "no Unity Editor on the runner"
skip, identical to the skip this machine reports today, not a hidden failure.

## The fold

`npm run fold:stability-ledger -- --from <artifact ledger> --write`, dry-run
first for each night. The fold tool deduplicated against the two nights the
working ledger already held (the artifacts' first two lines matched byte for
byte), so each artifact contributed exactly one night. Step by step:

- dry run, Sep 22 artifact: `artifact nights: 3 | already present: 2 | new: 1` → folded
- dry run, Sep 23 artifact: `artifact nights: 3 | already present: 2 | new: 1` → folded

## Recorded result

The ledger now holds **4 nights / 300 attempts**, 2 → 3 → 4 across the two
folds, and after each fold the tool re-reported the history it preserved: the
previously committed lines are byte-for-byte unchanged, and **no probe has ever
disagreed with itself** across all four nights. `verify_unity_editor_tests.mjs`
is the only probe that has ever been not-passed, and only as its own declared
skip.

Two honest caveats the tool itself printed and this record repeats rather than
hides:

- the three appended nights carry a single duration per probe rather than
  per-run durations, so they are **excluded from the pooled percentile/drift
  analysis** (they still count toward the flake rate);
- the flake-rate gate needs **≥ 5 nights** and this backfill reaches **4**, so
  that gate remains undecided — the next genuinely folded night decides it.

Gates after the change: `verify:hard-rule-9` 28/28 PASS, `verify:release-claims`
SUCCESS, `codegen:release-dossier` regenerated and `:check` OK.

## What this record does not claim

- It does not claim the nightly chain works. These nights were folded **by hand
  from surviving artifacts**; whether the job can fold tonight on its own is
  what the rehearsal probe in the chain repair change proves, not this.
- It does not claim the two nights would have folded at the time. They did not —
  that is the defect this backfill is cleaning up after.
- The PARTIAL verdicts are the runner's declared skip, not evidence about the
  Unity Editor tests themselves.
