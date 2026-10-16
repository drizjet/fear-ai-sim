# Non-Finite World Context — 2026-10-15

**Scope:** the JavaScript core. A first-principles audit of how
`AffectiveAgent.tick` reads its world-context inputs found that four of them
were read with `?? fallback`, which rejects only `null` and `undefined` and
therefore lets `NaN` through. The consequence was not confined to the tick that
delivered it: the poisoned value landed in **stored agent state**, where it
survived into later ticks and rode the snapshot, breaking the determinism
invariant rather than merely producing one bad number.

**What this record does not claim.** No probe here is an Editor, engine, host or
performance result. This is **not a control-plane defect**:
`ProtocolValidator` allowlists its context keys and drops all four affected
keys entirely, so a server never delivers them. It is a core-embedding finding
only, and the probe pins that separation rather than leaving it implied.

---

## 1. The defect

`AffectiveAgent.tick` opened with:

```js
let traumaDread = context.traumaDread ?? 0.0;
const pacingIntensity = context.pacingIntensity ?? 1.0;
const contagionFear = context.contagionFear ?? 0.0;
const leaderCalm = context.leaderCalm ?? 0.0;
```

`??` tests for nullish, not for finite. `NaN` is neither, so it passes.

What made this more than cosmetic is what sits downstream. Every clamp in the
affective pipeline is built from `Math.max` / `Math.min`, and **those propagate
`NaN`**:

```
Math.max(0, Math.min(1.0, NaN)) === NaN          // the clamp does not clamp
Math.max(0, Math.min(1.0, Infinity)) === 1       // Infinity IS clamped
```

So there was no backstop. `NaN` reached `totalPerceivedThreat`, which feeds
`currentDominance` — a field **stored on the agent** and included in
`getState()` / `setState()` and the runtime snapshot.

Reproduced before the fix:

| Host input | Escaped to | Persisted on agent |
|---|---|---|
| `context.contagionFear = NaN` | `affective_state.dominance`, `debug_trace.perception_breakdown.contagion_weighted`, `…total_perceived_threat` | `currentDominance = NaN` |
| `context.traumaDread = NaN` | `affective_state.dominance`, `…trauma_weighted`, `…total_perceived_threat` | `currentDominance = NaN` |
| `context.pacingIntensity = NaN` | `affective_state.dominance`, `…sensory_weighted`, `…total_perceived_threat` | `currentDominance = NaN` |
| `context.leaderCalm = Infinity` | `debug_trace.perception_breakdown.leader_calm_weighted` | — (no clamp guards this expression at all) |

`leaderCalm` needs its own note: it is used as a bare product,
`leaderCalm * 0.7 * agreeablenessMod`, with **no clamp anywhere**, so
`Infinity` escaped even though a clamp would have caught it. That is why the
fix guards all four rather than only the three that produced `NaN`.

### Why the persistence is the serious half

`currentDominance` is part of the agent's serialized state. Two consequences
follow from one poisoned tick:

1. **The agent stays poisoned.** A later clean tick inherits
   `currentDominance = NaN` and the `Math.max/min` clamps cannot repair it, so
   the agent is permanently degraded rather than recovering next frame.
2. **Determinism is lost, not just accuracy.** `NaN !== NaN`, so a snapshot
   comparison against a restored twin disagrees even when both were produced by
   the same input stream. The repo's determinism claim is about bit-exact
   reproduction, and a poisoned agent fails it in a way no clamp can detect.

## 2. The fix

One module-scope helper, one rule:

```js
const finiteOr = (value, fallback) => (Number.isFinite(value) ? value : fallback);
```

applied to all four reads. A non-finite context value is **unknown** and is
dropped to its neutral default; a finite one passes through untouched. This is
the same rule `ProtocolValidator.clamp01Finite` already applies on the
control-plane path, and the same one `safeDt`, `reportedDanger` and the
`energy`/`health` reads already use inside this very method — the file was
internally inconsistent about its own convention, which is the recurring
defect class of this audit.

`traumaDread` is a `let` because the trauma-engine and trauma-zone readbacks
fold into it by `max()`; the initial value still has to arrive finite for that
merge to mean anything, so it is guarded at the read rather than left on `??`.

## 3. Verification

```
node tools/verification/verify_nonfinite_context_hygiene.mjs
  -> 218 assertions, 0 failed
  -> stable across 3 consecutive runs
```

The probe is organized so that fixing is distinguishable from never having
looked:

- **Section A is a control.** It asserts that the shipped `?? fallback` shape
  really does leak all three non-finite values, and — correcting the natural
  assumption — that `Math.max/min` clamp `Infinity` but **not** `NaN`, and that
  `Infinity` escapes a bare product. Without this control, a passing probe
  would be vacuous: it could not distinguish a fix from a bug that never
  existed.
- **Sections B–D sweep every numeric key** on `context` (12 keys) and
  `observations` (6 keys) with `NaN`, `Infinity` and `-Infinity`, plus nested
  threat/sound coordinates and `dt`, asserting nothing non-finite reaches the
  advisory payload, the serialized payload, or persistent agent state.
- **Section E** asserts the poison does not survive into the next clean tick —
  the property that made this worth fixing.
- **Section F** asserts an agent never exposed to a non-finite context is
  unaffected by one that was.
- **Section G** pins finite behaviour: each finite context value must produce
  output byte-identical to an explicitly-defaulted twin. This is what makes the
  fix safe to land on a deterministic core.
- **Section I** pins the control-plane separation, so this record cannot be
  misread as a security finding.

Two probe-authoring corrections are recorded because they were nearly shipped
as false alarms: the twins in section G initially differed only in `agent_id`
(`AffectiveAgent` derives its fallback RNG from construction order, so
comparisons need a matched id and seed), and the section A control originally
asserted that a clamp catches `Infinity`, which it does.

## 4. Audited and found already guarded

Recorded so the next pass does not repeat it. Every one of these was swept
with `NaN` and `±Infinity` and produced **no** leak:

- `traits.*` — `sanitizeTrait` returns the default for `NaN` and clamps
  `±Infinity` through its `> 1` / `< 0` comparisons.
- `observations.x/y/z`, `velocity.*` — guarded with `Number.isFinite`.
- `observations.energy`, `observations.health` — guarded with `Number.isFinite`
  before clamping.
- `threats[].intensity`, `sounds[].intensity` — guarded with
  `Number.isFinite(...) && >= 0`.
- `threats[].distance`, `sounds[].distance` — guarded with
  `Number.isFinite(...) && > 0`, with a finite positional fallback.
- `dt` — guarded with `typeof === 'number' && Number.isFinite && >= 0`.
- `context.reportedDanger` — guarded by the `??`-plus-`Math.max/min` pair added
  in the preceding tranche.

## 5. Results

```
node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json
  -> 42 probes: 40 passed, 1 declared skip (no Unity Editor), 0 failed

node tools/guardian/hard-rule-9.mjs --verify
  -> 28/28 once the new probe is committed
```

Probe counts were moved from 41 to 42 in `docs/RELEASE_SURFACE.md`,
`docs/RELEASE_CANDIDATE_CERTIFICATION.md` and `docs/CURRENT_TRUTH_LEDGER.md`,
and the dossier roster was regenerated from the recorded run, so the documents
stay derived from the recording rather than asserted beside it.
