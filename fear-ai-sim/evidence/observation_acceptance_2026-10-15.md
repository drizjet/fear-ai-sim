# Observation Acceptance — 2026-10-15

**Scope:** the observation-intake surfaces of the shipped JS tree — the runtime
receipt contract (`RuntimeSimulation.queueObservation`), the HTTP route
`POST /api/v1/observation`, and the WebSocket verb `OBSERVATION_DISPATCH`.

**What this record does not claim.** No claim about the *quality* or effect of an
accepted observation (that is affective-math territory, pinned elsewhere). No
claim about the binary wire's `OBSERVATION_BATCH` frame type, which takes a
separate path (it auto-registers unknown agents by design and never went through
the JSON validator). The probe runs on the machine that runs it.

---

## 1. The finding: an acceptance claim with nothing behind it

Manual line-by-line audit of `packages/runtime/src/FearServer.js`:

- **HTTP `POST /api/v1/observation`** validated the body, called
  `simulation.queueObservation(...)` and unconditionally answered
  `200 {status: 'QUEUED', agent_id}` — while `queueObservation` **silently
  dropped** observations for unknown agents (an early-return with no return
  value). A host could send observations for an agent id the server never
  registered, receive `QUEUED` forever, and there was no observable difference
  anywhere. The repo's own convention says the opposite: 17+ sites in
  `RuntimeSimulation` throw `UNKNOWN_AGENT` for unknown ids, the faction route
  answers `404` + `AGENT_NOT_FOUND`, and `ERROR_CODES.AGENT_NOT_FOUND` exists.
- **WebSocket `OBSERVATION_DISPATCH` was dead**: schema-validated
  (`validator.js` → `validateObservation`, which requires `agent_id`), but
  `validateIncomingMessage`'s branch for this one type returned a value
  **without `type`** — unlike every other branch, whose value carries its own
  canonical type constant. The dispatcher switches on `validated.value.type`, so
  every dispatch fell to the default case and answered
  `ERROR_RESPONSE "Unhandled message type: undefined"`. Observations sent over
  JSON WebSocket were never queued — they were never even routed.

Both were hidden behind probes that touched the surfaces without asserting their
outcome: `verify_server_lifecycle.mjs` has dispatched an `OBSERVATION_DISPATCH`
for a registered agent since it was written and asserted **nothing** about the
dispatch's effect (the assertions after it were about unregistration), so the
dead verb stayed green. The first draft of *this* tranche's probe caught it by
asserting the one thing nobody had: what a dispatch is supposed to do.

## 2. The fix (root cause, three edits)

- `RuntimeSimulation.queueObservation` now returns a receipt:
  `{ queued: true }` for a registered agent, `{ queued: false, reason:
  'UNKNOWN_AGENT' }` for an unknown one, mutating nothing on refusal. No throw —
  the bulk paths (`batchTick`, the load path) keep their documented
  best-effort advisory semantics and ignore the receipt.
- The HTTP route reads the receipt: refusal → `404 { error: "Unknown agent:
  <id>", code: AGENT_NOT_FOUND, agent_id }`; acceptance → the previous
  `200 {status: 'QUEUED'}`. The `400 VALIDATION_FAILED` schema guard is
  unchanged.
- The WS case reads the receipt: refusal →
  `_sendWsError(ws, "Unknown agent: ...", AGENT_NOT_FOUND, correlationId)`;
  acceptance stays fire-and-forget (no ack frame), which is the verb's existing
  contract.
- The validator fix is the one-liner with the long comment: the
  `OBSERVATION_DISPATCH` branch injects `type: MESSAGE_TYPES.OBSERVATION_DISPATCH`
  into the validated value (the house pattern every other branch already
  follows), instead of changing `validateObservation`'s shared output shape,
  which the HTTP path stores as the observation itself.

## 3. The probe, pinned

`tools/verification/verify_observation_acceptance.mjs` — 29 assertions, four
sections, no network listener:

- **Section A — receipt contract**: unknown → `{queued:false, UNKNOWN_AGENT}`
  and no `pendingObservations` entry; known → `{queued:true}` and the stored
  observation is the submitted one; a repeat coalesces last-wins; a refusal for
  another agent never clobbers a queued entry.
- **Section B — batchTick semantics**: a mixed known/unknown batch ticks and
  returns outputs (no throw), the unknown never lands in the pending map, and
  the tick consumes the registered observation.
- **Section C — HTTP honesty**: unknown → `404 AGENT_NOT_FOUND` with the
  offending id echoed and nothing queued (previously `200 QUEUED`); known →
  `200 QUEUED` + queued; missing `agent_id` → `400 VALIDATION_FAILED` (guard
  unchanged); register → unregister → observation → `404` (stale-id case).
- **Section D — WS honesty**: known -> no frame at all (fire-and-forget is
  preserved) + queued; unknown -> `ERROR_RESPONSE` with `AGENT_NOT_FOUND` and
  the correlation `message_id` preserved + not queued; stale (registered then
  unregistered) -> error frame.

## 4. A near-miss class, recorded again

Section D's first run failed its fire-and-forget assertion against what looked
like correct code — the frame it saw was the `"Unhandled message type:
undefined"` default, i.e. the probe tripped over the dead verb rather than a
false positive. Recorded because the failure mode that hid both defects is the
same one recorded in the determinism and wire-numeric tranches from the other
side: an assertion that touches a surface without asserting its outcome passes
whether or not the surface works, and only an assertion about the *effect*
distinguishes them.

## 5. Verification

```
node tools/verification/verify_observation_acceptance.mjs
  -> 29 assertions, 0 failed
  -> stable across 3 consecutive runs
```

Regression: the full suite — **48 probes, 47 passed, 1 declared skip (no Unity
Editor), 0 failed**; repeat-3 stability **OK — nothing gated**; the validator
change left every existing probe green (including `verify_server_lifecycle.mjs`,
`verify_wire_numeric_boundary.mjs`, and the protocol-abuse probe).

## 6. Results

```
node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json
  -> 48 probes: 47 passed, 1 declared skip, 0 failed

node tools/verification/run_probe_suite.mjs --repeat 3 --json <artifact>
node tools/verification/stability_regression.mjs --fresh <artifact>
  -> OK — nothing gated

node tools/guardian/hard-rule-9.mjs --verify
  -> 28/28 once the new probe and edits are committed (gate-inputs-are-committed)
```

Probe counts moved 47 → 48 in `docs/RELEASE_SURFACE.md`,
`docs/RELEASE_CANDIDATE_CERTIFICATION.md` and `docs/CURRENT_TRUTH_LEDGER.md`,
and the dossier roster was regenerated from the recorded run
(`2026-10-16T14:15:29.502Z — 48 probes, 47 passed, 1 passed with declared
skips, 0 failed, on Node v24.20.0 / win32`).

## 7. Boundaries

| Surface | Outcome |
|---|---|
| `queueObservation` receipt | accepted vs refused is observable; refusal mutates nothing; pinned by Section A |
| HTTP `/api/v1/observation` | unknown id → 404 AGENT_NOT_FOUND; accepted → 200 QUEUED; schema guard unchanged; pinned by Section C |
| WS `OBSERVATION_DISPATCH` | reachable (was dead — validator dropped `type`); known → fire-and-forget + queued, unknown/stale → error frame with correlation; pinned by Section D |
| Bulk paths (`batchTick`, load) | best-effort advisory semantics unchanged, receipt ignored by design; pinned by Section B |
| Binary `OBSERVATION_BATCH` frame | separate path, auto-registers by design — untouched, unclaimed here |
| Observation effect/quality | not claimed — acceptance is all this tranche pins |
