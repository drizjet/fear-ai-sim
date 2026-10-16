# Host Feedback Bounds — 2026-10-15

**Scope:** `packages/core/src/HostFeedbackLoop.js` — the host execution-outcome
advisory loop (Frontier D/E, §208–211, §288–293) — and its two intake paths,
`POST /api/v1/outcome` and the WebSocket `INTENT_OUTCOME_REPORT` twin.

**What this record does not claim.** No taxonomy change: arbitrary host intent
types still flow (host authority), and the outcome taxonomy is untouched. No
performance claim, no host or adapter claim.

---

## 1. The defect class: host-supplied keys with no bound

The loop bounds its agent map (`MAX_AGENTS_TRACKED` 5000, oldest-first eviction)
and per-agent history (`MAX_HISTORY_PER_AGENT` 64), but three maps keyed by the
host-supplied intent-type string were unbounded:

- `rec.perIntent` (per agent) — a new stats entry per distinct string;
- `rec.unavailable` (per agent) — a new flag per distinct string with structural
  failures;
- `this.globalPerIntent` (per loop) — a new entry per distinct string,
  regardless of agent.

`ProtocolValidator.validateOutcomeReport` trims `intent_type` and slices it to
128 chars but does **not** restrict it to the 12-intent `ACTION_INTENTS`
vocabulary, and outcome reports are not gated by signing when the session names
no keyed session — so any caller could grow all three maps without limit, one
entry per report. This is the same defect class as the previously fixed
unbounded contradiction log: the one kind of structure an engine that bounds
everything else had left unbounded.

Verified before changing (premise checks, not assumptions):

- both call sites (`FearServer.js` 647 and 2456) validate through
  `validateOutcomeReport` and pass the sanitized string through;
- the maps have single write points (`ensureIntentStats`, `reportOutcome`);
- the legit vocabulary is 12 intents, so any cap sits far above real use.

---

## 2. The fix: cap, evict oldest, keep the maps consistent

- `MAX_INTENT_TYPES_PER_AGENT = 64` — a new per-agent type evicts the oldest
  tracked type (first-touch insertion order), mirroring `ensureAgentRecord`'s
  existing agent-map eviction.
- `MAX_GLOBAL_INTENT_TYPES = 512` — independent of per-agent tracking: a
  per-agent eviction leaves the global record intact, and a global eviction
  leaves per-agent records intact.
- Eviction removes the type's stats **and** its unavailability flag **together**,
  so the two per-agent maps cannot disagree and orphaned flags cannot
  accumulate.

Below the caps nothing changes: the 3-consecutive-structural-failure threshold,
transient reasons never marking unavailability, `GOAL_COMPLETED` clearing
availability, `resetAffordance`, `ACTION_INTERRUPTED` not breaking a structural
streak, and `rankIntents` steering around unavailable intents all behave exactly
as before.

---

## 3. Verification

```
node tools/verification/verify_host_feedback_bounds.mjs
  -> 38 assertions, 0 failed
```

- **Section A** — the per-agent map caps at 64, oldest-first; an evicted type
  falls back to the Laplace prior `0.5`; the global record of a per-agent
  evicted type survives; `totalReports` keeps counting.
- **Section B** — the unavailability flag is stable right up to the eviction
  point and is evicted with the stats; no orphaned flags remain; a re-reported
  evicted type does not resurrect old availability state.
- **Section C** — the global map caps at 512 with the oldest evicted; per-agent
  and agent-map state untouched by global eviction.
- **Section D** — canonical semantics unchanged below the caps (threshold,
  transient reasons, interruptions, reset, rank/fallback naming).
- **Section E** — identical report sequences produce identical summaries
  (determinism).

Regression: the full suite — **46 probes, 45 passed, 1 declared skip (no Unity
Editor), 0 failed**; repeat-3 stability clean.

## 4. Results

```
node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json
  -> 46 probes: 45 passed, 1 declared skip, 0 failed

node tools/verification/run_probe_suite.mjs --repeat 3 --json <artifact>
node tools/verification/stability_regression.mjs --fresh <artifact>
  -> OK — nothing gated

node tools/guardian/hard-rule-9.mjs --verify
  -> 28/28 once the new probe is committed (gate-inputs-are-committed)
```

Probe counts moved 45 → 46 in `docs/RELEASE_SURFACE.md`,
`docs/RELEASE_CANDIDATE_CERTIFICATION.md` and `docs/CURRENT_TRUTH_LEDGER.md`,
and the dossier roster was regenerated from the recorded run.

**Timing observation (recorded, not a defect in this tree).** The first
stability-regression run of the night — taken while the repeat-3 sweep was
still warming the machine — flagged `verify_host_provenance.mjs` at 3.6x its
September baseline and gated it. The idle rerun is green (2.7x, under the 3x
threshold; verdicts `PASSED` in every run). The probe shells out to `git -C`
against the **sibling** Pixel Pets repository (`git log --all`, `branch -a
--contains`), whose measured scale has grown since the recording — 2,913 refs,
61.6k loose objects (~9.9 GiB), `log --all` ≈ 1.0 s per call on this machine —
so its runtime tracks that repo's size, not anything in this tree. The ledger's
drift gate (needs 4 comparable nights with per-run durations) is the instrument
that will judge slow movement once enough nights carry per-run durations.

## 5. Boundaries

| System | Outcome |
|---|---|
| `HostFeedbackLoop` per-agent intent tracking | bounded at 64 types, oldest-first eviction mirroring the agent map |
| `HostFeedbackLoop` global intent tracking | bounded at 512 types, independent of per-agent tracking |
| Unavailability flags | evicted with their stats — no orphan flags, no map disagreement |
| Outcome reports (HTTP + WS) | unchanged: taxonomy strict, `intent_type` trimmed, arbitrary host types still accepted below the caps |
| Canonical loop semantics | unchanged below the caps (threshold, transients, reset, ranking, fallbacks) |
| Timing baseline (host provenance) | environment-classified observation recorded above; no code change in this tree |
