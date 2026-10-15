# Binary Wire Numeric Boundary — 2026-10-15

**Scope:** the JavaScript protocol tree. Closing the non-finite audit by hardening
the last boundary it had not reached: the binary V2 wire, in **both** directions
— records Fear AI writes to a host, and records a host writes to Fear AI.

**What this record does not claim.** No probe here is an Editor, engine, host or
performance result. The float32 profile of the wire, its throughput figure, and
any adapter behaviour are explicitly outside this record's scope.

---

## 1. Why the wire is its own boundary

The V2 wire is a fixed 32-byte record layout, and `float32` represents `NaN` and
`±Infinity` as **ordinary bit patterns** — no special encoding, no sentinel, no
error. So a `setFloat32` given a non-finite number writes it faithfully, and a
host's `getFloat32` reads it back unchanged.

Both encoders accepted their float32 slots through `?? 0.0`, which rejects only
`null` and `undefined`. The value was therefore written verbatim.

### What leaked, and in which direction

**`encodeIntentBatch` — Fear AI's OUTPUT.** The three `vectorHint` components
were written straight from the record:

```js
const vx = rec.vectorHint?.x ?? 0.0;
view.setFloat32(offset + 16, vx, true);
```

A non-finite component reached the decoding host as `NaN` or `±Infinity`. This
is the direction that matters most for a middleware product: it is Fear AI
handing a host a direction it cannot use.

**`encodeObservationBatch` — host input.** `position.x/y/z`, `threatDistance` and
`threatIntensity` were written the same way, and the decoder handed them back
intact — a complete round trip with the value preserved.

**What was already correct.** `floatToUint16` (`health`, `energy`, `fear`,
`anger`, `dominance`, `urgency`) maps `NaN` to `0` and clamps `±Infinity` into
`[0, 1]`. It was pinned as-is rather than "fixed" — an audit that reports
correct code as a defect is its own kind of dishonesty.

---

## 2. The fix

One module-scope helper, applied to the raw float32 slots only:

```js
function wireFiniteOr(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
}
```

A non-finite field is **unknown** and falls back to the sentinel that field
**already uses for an absent value**, so an absent field and a non-finite field
are now indistinguishable on the wire — which is the correct outcome, since they
carry the same information:

| Field | Fallback | Rationale |
|---|---|---|
| `vectorHint.x/y/z` | `0.0` | no direction; matches the zero vector `IntentResolver._normalizeVector` emits for the same input |
| `position.x/y/z` | `0.0` | the origin, matching `ProtocolValidator._sanitizePosition` |
| `threatDistance` | `999.0` | this field's existing "no threat reported" sentinel |
| `threatIntensity` | `0.0` | no sensory input |

The change is a **strict no-op for finite inputs**: `wireFiniteOr(v, fb)` returns
`v` exactly when `Number.isFinite(v)`, and the prior `v ?? fb` also returned `v`
exactly whenever `v` was not null/undefined. They differ only for non-finite
values — which is precisely the defect.

---

## 3. A false alarm worth recording

The first measurement pass read **every four bytes** of an encoded frame as a
float32 and reported `urgency = Infinity` producing a `NaN` on the wire. That was
an artifact of the measurement, not a defect: the record layout is mixed
`uint16`/`uint8`/`float32`, so the scan was reading the *urgency* quantized
slots and neighbouring bytes as though they were one float32. Re-measuring
through the real `decodeIntentBatch` — the only authoritative check, since that
is what a host actually calls — showed urgency was fine all along, because
`floatToUint16` had always guarded it.

The lesson generalizes to the whole audit: read the value the way the consumer
reads it. Scanning raw bytes finds patterns that do not exist and misses ones
that do.

---

## 4. A second near-miss: the 4-decimal quantizer

The regression check initially reported `position.z = 1e-9` failing to round-trip.
That is **pre-existing, documented behaviour, not a defect**:
`decodeObservationBatch` quantizes every float32 with `.toFixed(4)`, so `1e-9`
decodes as `0`. It is a deliberate precision decision in a wire format, and it
was asserted rather than changed.

---

## 5. Verification

```
node tools/verification/verify_wire_numeric_boundary.mjs
  -> 81 assertions, 0 failed
  -> stable across 3 consecutive runs
```

- **Section A is a control.** It pins that `??` really passes `NaN` through, and
  that a `float32` slot really round-trips `NaN` and `Infinity` unchanged — so a
  passing probe cannot be a vacuous "this always worked".
- **Sections B and C** sweep both encoders: three vector axes, three position
  axes, `threatDistance` and `threatIntensity` × `{NaN, Infinity, -Infinity}`,
  plus non-numeric values (`'north'`, `{}`, `[]`, `true`), asserting every
  decoded value the **host** receives is finite and is the documented sentinel.
- **Section D** pins `floatToUint16`'s existing correct behaviour for `NaN`,
  `Infinity`, `-Infinity`, normal and out-of-range inputs.
- **Section E** is the regression guard: six observation cases and four intent
  cases must round-trip **unchanged**, with expectations quantized to four
  decimals the way the decoder quantizes, plus an explicit-zero case proving `0`
  survives rather than being replaced by a fallback.
- **Section F** pins determinism and that a **mixed batch** guards every record,
  not only the first — a per-record guard that only fired on index 0 would pass
  a single-record test.

Regression: adapter conformance, Godot live pipeline, Godot stations, compound
collisions, persistence round-trip, server lifecycle and reconnect, fuzz
arbitration, long-horizon lifecycle, host-token persistence, and the three
hygiene probes from the preceding tranches all still pass.

## 6. Results

```
node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json
  -> 44 probes: 42 passed, 1 declared skip (no Unity Editor), 0 failed
  -> verify_release_claim_boundaries.mjs failed until the dossier was regenerated,
     which is documented behaviour for a stale roster

node tools/guardian/hard-rule-9.mjs --verify
  -> 28/28 once the new probe is committed (gate-inputs-are-committed)
```

Probe counts moved 43 → 44 in `docs/RELEASE_SURFACE.md`,
`docs/RELEASE_CANDIDATE_CERTIFICATION.md` and `docs/CURRENT_TRUTH_LEDGER.md`,
and the dossier roster was regenerated from the recorded run.

## 7. The audit is now closed on this class

Every numeric boundary in the shipped tree has been swept and either fixed or
pinned as already-correct:

| Boundary | Outcome |
|---|---|
| Host JSON over HTTP (`register`, `register/batch`) | fixed — non-finite position |
| Binary wire frame → server state | fixed — non-finite position |
| Per-tick observations (threats, sounds, velocity, energy, health) | already guarded |
| Per-tick world context (contagion, trauma, pacing, leader) | fixed — non-finite |
| All 44 `ProtocolValidator` entry points | already guarded (12 clamp sites audited) |
| Binary wire encode, both directions | fixed — non-finite float32 slots |
| `floatToUint16` quantized fields | already correct, pinned |
| Cardiac / psychoacoustic math | already finite |
| Adapters (GDScript, C#, Python, Rust) | no RNG, no numeric defaults |
