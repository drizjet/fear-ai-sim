# Non-Finite Agent Position — 2026-10-15

**Scope:** the JavaScript tree. A continuation of the non-finite audit found that
`AffectiveAgent`'s constructor options and the agent-registration path used the
same `?? fallback` shape on host-reported coordinates, with a consequence the
previous tranche did not have: **this one is reachable through the live HTTP and
binary control plane**, and the corruption is permanent.

**What this record does not claim.** No probe here is an Editor, engine, host or
performance result. The findings are confined to input validation and state
hygiene; nothing here certifies the adapters, the host authority boundary, or
any performance figure.

---

## 1. The defect

### A. Registration position was never validated

`ProtocolValidator.validateRegisterAgent` returned:

```js
initial_position: raw.initial_position || { x: 0, y: 0, z: 0 },
```

which passes the object through **untouched**. Every other host-reported number
in that validator is coerced — traits to a clamped `[0,1]`, stimuli through
`_sanitizeStimulus`, context through an allowlist — but `initial_position` was
the one raw object crossing the boundary.

JSON carries a non-finite number as an out-of-range magnitude:

```js
JSON.parse('1e400')   // Infinity
```

so a host needed no special syntax, only a large number.

### B. It then reached stored state permanently

`RuntimeSimulation.registerAgent` assigned the coordinate with:

```js
agent.x = options.initial_position.x ?? agent.x;
```

and `AffectiveAgent.tick` only overwrites a coordinate when it is **finite**:

```js
if (typeof observations.x === 'number' && Number.isFinite(observations.x)) this.x = observations.x;
```

So once a coordinate was non-finite, **nothing could ever repair it**. Reproduced
end-to-end through the real validator and simulation before the fix:

```
POST body -> validateRegisterAgent -> registerAgent -> tick
  x = 1e400  ->  agent.x = Infinity  (persisted through 25 further ticks)
```

### C. The snapshot then silently discarded the position

This is the part that made it more than cosmetic. `getState()` serializes the
agent, `JSON.stringify` writes `Infinity` as **`null`**, and `setState`'s own
`?? ` then keeps the current value rather than restoring anything:

- the wire payload carried `x: null`;
- a restore produced **no** position at all, with no error.

A host that saved and reloaded its world would find an agent whose position had
vanished, reported by a path that returns success.

### D. The binary wire was the easiest path of all

`FearServer`'s binary-observation branch assigned coordinates straight off a
decoded frame:

```js
agent.x = rec.position.x;
```

`decodeObservationBatch` yields raw `float32` bit patterns, and `NaN` and
`±Infinity` are ordinary float32 values — no large-number trick required.

---

## 2. The fix

Three layers, because the defect crossed two boundaries and skipping either would
have left the other open.

**1. The control-plane gate** — `ProtocolValidator._sanitizePosition`, applied in
`validateRegisterAgent`. `validateRegisterBatch` delegates per-entry to
`validateRegisterAgent`, so the batched route was fixed by the same change
rather than needing a parallel one. A non-finite coordinate is **unknown** and
falls back to the origin, matching the file's existing `_sanitizeStimulus`
convention. Absent, `null`, string and array inputs still fall back exactly as
before.

**2. The simulation boundary** — `RuntimeSimulation.registerAgent` keeps the
agent's existing coordinate when the reported one is not finite. This is
deliberately **per-axis**: a position of `{ x: Infinity, y: 2, z: 3 }` keeps
`y` and `z`, because rejecting the whole object would silently drop two valid
coordinates to fix one bad one.

**3. The binary-wire branch** — `FearServer`'s `agent.x = rec.position.x` is
guarded on the same per-axis rule. The guard is applied after the decode, since
that path never passes through `ProtocolValidator` at all.

**4. The core constructor** — `AffectiveAgent`'s `options.x/y/z/energy/health/
morale` were the same `?? N` shape and were guarded with the `finiteOr` helper
introduced in the preceding tranche. These are not reachable from the control
plane (`FearServer` passes only `name` and `initial_position`), but they are the
direct core-embedding path and belong to the same defect class.

---

## 3. Verification

```
node tools/verification/verify_nonfinite_position_hygiene.mjs
  -> 113 assertions, 0 failed
  -> stable across 3 consecutive runs
```

- **Section A is a control.** It pins that `JSON.parse('1e400')` really is
  `Infinity`, that `JSON.stringify` really writes it as `null`, and that
  `Infinity ?? 0` really passes it through — so a passing probe cannot be a
  vacuous "we always passed".
- **Section B** sweeps all three axes × `{NaN, Infinity, -Infinity}` through the
  real `validateRegisterAgent`, asserting the result is finite and exactly
  `{x, y, z}`, plus absent/null/string/array fallbacks, plus a no-`agent_id`
  rejection, plus four finite positions surviving **byte-identical**.
- **Section C** proves the batched route is covered, since it delegates.
- **Section D** asserts `registerAgent` never writes a non-finite coordinate
  **and** that a bad axis does not discard its good siblings, and that a
  partial position fills only the axes it names.
- **Section E** sweeps the constructor options and asserts both the stored field
  and every downstream `affective_state` field stay finite.
- **Section F** crafts a **real** binary frame with `encodeObservationBatch`,
  decodes it with `decodeObservationBatch`, and drives `registerAgent` from the
  decoded record — the same sequence the server performs.
- **Section G** asserts the position is still finite after 25 further ticks, that
  `getState()` is finite, that the serialized snapshot carries no `NaN`/`null`
  coordinate, and that a snapshot round-trip restores a usable position.
- **Section H** pins finite behaviour, including that an explicit origin `0`
  survives.
- **Section I** pins determinism and that the host-supplied object is not
  mutated.

Regression: persistence round-trip, long-horizon lifecycle, server lifecycle,
protocol abuse, adapter conformance, fuzz arbitration, reconnect, compound
collisions, host-token persistence and Godot fallback parity all still pass.

## 4. Results

```
node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json
  -> 43 probes: 41 passed, 1 declared skip (no Unity Editor), 0 failed
  -> verify_release_claim_boundaries.mjs failed until the dossier was regenerated,
     which is the documented behaviour for a stale roster rather than a defect

node tools/guardian/hard-rule-9.mjs --verify
  -> 28/28 once the new probe is committed (gate-inputs-are-committed)
```

Probe counts were moved 42 → 43 in `docs/RELEASE_SURFACE.md`,
`docs/RELEASE_CANDIDATE_CERTIFICATION.md` and `docs/CURRENT_TRUTH_LEDGER.md`,
and the dossier roster regenerated from the recorded run.

## 5. One correction worth recording

The first draft of this probe used `{}` as its "absent initial_position" case.
That correctly failed `validateRegisterAgent` for a missing `agent_id`, and the
probe crashed reading `value` off an invalid result. The test data was wrong, not
the validator — the registration validator has always required `agent_id`. The
case now supplies one and asserts the rejection separately.
