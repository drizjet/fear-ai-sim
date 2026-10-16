# Backpressure Failure Telemetry — 2026-10-15

**Scope:** `packages/core/src/AdaptiveBudgetBackpressureController.js` — the
failure path of `processBatch`, its frame report, cumulative telemetry, and the
`fear-ai budget` CLI surface that prints them (`bin/fear-ai.js`).

**What this record does not claim.** No claim about scheduler quality,
frame-time accuracy, or the priority math. The isolation contract itself —
a throwing `tickRunner` must not stop the batch or crash the frame — is
unchanged and is the reason the defect could hide; this tranche only makes the
failure *visible and honestly counted*. Async work is out of scope:
`tickRunner` is invoked synchronously and its rejection surface is not part of
this contract.

---

## 1. The finding

Manual line-by-line audit of the error-path sweep. `processBatch` executed each
queued agent's `tickRunner` inside a `try/catch` whose comment said
"Defensive isolation: error in one agent does not crash batch" — correct — but
after the `catch` the code continued to `queue.delete(...)`,
`processedCount++`, `this.metrics.totalProcessed++` for **every** item,
throwing or not. There was no failure counter anywhere: not in the frame report,
not in `getTelemetry()`, not in the CLI output. Consequences:

- A host reading `processedCount` / `totalProcessed` sees an update that threw
  as indistinguishable from one that succeeded.
- A permanently failing agent cycles silently forever: its queue entry is
  cleared each frame, so its starvation score resets on re-enqueue and nothing
  ever reports that its updates never land.
- The CLI printed `Processed Agents: N / numAgents` with the same lie.

This was the only silent-miscounting site in the whole error-path sweep (19
files with `catch` in `packages/*/src`; every other site is fail-closed and
structured, documented isolation, or visibly recorded).

## 2. The fix

- `processBatch`: the `catch` now increments a batch-local `failedCount` and
  `metrics.totalTickFailures`; `processedCount++` / `totalProcessed++` moved
  **into the `try`**, so they count only successful updates. The queue entry is
  still cleared in both outcomes (unchanged dequeue semantics), so a failure
  cannot loop the same entry within one batch.
- The frame report gains `failedCount` (both on the main path and the
  empty-queue early return, which now carries `failedCount: 0`), and stays
  frozen; `getTelemetry()` gains `totalTickFailures`.
- The CLI prints the failure line (`Failed Agent Updates: N`) next to the
  processed count, and the `--json` output carries the new fields through the
  existing report/telemetry passthrough.
- No behavioural change for healthy hosts: with zero failures every number the
  surface printed before is unchanged (`processedCount` = dequeued-and-succeeded
  = dequeued), and the priority math, coalescing, capacity drops, and
  degradation-mode selection are untouched.

## 3. The probe, pinned

`tools/verification/verify_backpressure_failure_telemetry.mjs` — 25 assertions,
five sections, no network, no server:

- **Section A** — a throwing tick: `processBatch` does not throw; the report
  says `processedCount: 0, failedCount: 1`; the queue entry is cleared; the
  cumulative counters split the same way.
- **Section B** — a mixed batch (ok, throw, ok): `processedCount: 2,
  failedCount: 1`, remaining depth 0, each healthy runner invoked exactly once
  with its own telemetry untouched.
- **Section C** — the empty-queue early return keeps its shape and now carries
  `failedCount: 0` (0 ms, `FULL_FIDELITY`).
- **Section D** — the frame report stays frozen, the recorded `frameHistory`
  entry carries the failure, and cumulative counters add correctly across a
  failing batch followed by a healthy one.
- **Section E** — success-only batches (zero failures), coalescing still counts
  (`COALESCED`, no duplicate entry), and `validateHostAuthorityInvariant`
  still passes.

## 4. Verification

```
node tools/verification/verify_backpressure_failure_telemetry.mjs
  -> 25 assertions, 0 failed
  -> stable across 3 consecutive runs
```

Regression: the full suite — **49 probes, 48 passed, 1 declared skip (no Unity
Editor), 0 failed**; repeat-3 stability **OK — nothing gated**.

## 5. Results

```
node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json
  -> 49 probes: 48 passed, 1 declared skip, 0 failed

node tools/verification/run_probe_suite.mjs --repeat 3 --json <artifact>
node tools/verification/stability_regression.mjs --fresh <artifact>
  -> OK — nothing gated

node tools/guardian/hard-rule-9.mjs --verify
  -> 28/28 once the new probe and edits are committed (gate-inputs-are-committed)
```

Probe counts moved 48 → 49 in `docs/RELEASE_SURFACE.md`,
`docs/RELEASE_CANDIDATE_CERTIFICATION.md` and `docs/CURRENT_TRUTH_LEDGER.md`,
and the dossier roster was regenerated from the recorded run
(`2026-10-16T14:22:24.555Z — 49 probes, 48 passed, 1 passed with declared
skips, 0 failed, on Node v24.20.0 / win32`).

## 6. Boundaries

| Surface | Outcome |
|---|---|
| Throwing `tickRunner` (one agent) | batch completes; entry cleared; counted as failure only; pinned by Sections A–B |
| `processedCount` / `totalProcessed` | count successful updates only; pinned by Sections A–D |
| `failedCount` / `totalTickFailures` | new, additive; pinned by Sections A–D |
| Empty-queue early return | shape preserved, `failedCount: 0` added; pinned by Section C |
| Healthy path (zero failures) | every previously printed number identical; pinned by Section E |
| `fear-ai budget` CLI | prints the failure line; JSON passthrough carries the new fields |
| Retry policy for failed agents | **not changed** — the entry is still dropped, not re-queued; out of scope here |
| Async rejections | not covered — `tickRunner` is invoked synchronously |
