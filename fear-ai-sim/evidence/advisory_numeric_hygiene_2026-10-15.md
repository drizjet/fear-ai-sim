# Advisory Numeric Hygiene — 2026-10-15

**Scope:** the JavaScript tree only. A manual, line-by-line pass over the advisory
numeric surfaces found one repeated defect class — an input that is *absent*
being conflated with an input that is *zero* or *non-finite* — in eight places
across six modules. Each is fixed at the root cause and pinned by one new
standalone probe, `tools/verification/verify_advisory_numeric_hygiene.mjs`.

**What this record does not claim.** No probe here is an Editor, engine, host or
performance result. None of the findings is a control-plane vulnerability: the
HTTP/WebSocket validator already neutralises every one of them on the sanctioned
path, and that is stated precisely per finding rather than as a blanket. The
economic findings are pinned at the operator level and the repaired formula, not
by replaying a recorded wrong price, because a zero-priced commodity is a latent
rather than a demonstrated market state.

---

## 1. The defect class

`||` defaults and `!== undefined` gates both answer "is this value present?"
with "is this value truthy?" — and zero, like `''` and `false`, is legitimate.
So one idiom quietly rewrote two different questions into one answer:

| Shape | Reads `0` as | Reads `null` as |
|---|---|---|
| `value \|\| N` | `N` | `N` |
| `value !== undefined && value < N` | `< N` (adjacent!) | `< N` (adjacent!) |
| `value ?? N` | `0` (present) | `N` (absent) |

The first two conflate; the third does not. Every fix below moves a site from a
conflating shape to a non-conflating one — never by changing a threshold, and in
each case the finite-input behaviour is bit-identical to before.

---

## 2. Findings

### A. `IntentResolver._normalizeVector` — non-finite coordinate became `null` on the wire

`Number(v.x) || 0` does not reject `±Infinity` (`Infinity || 0` **is** `Infinity`).
The magnitude became `Infinity`, `Infinity / Infinity` is `NaN`, `toFixed(4)`
preserves it, and `JSON.stringify` writes `NaN` as **`null`**.

Reproduced before the fix: a threat at `x: Infinity` produced
`vector_hint: {"x":null,"y":0,"z":0}` — in memory *and* on the wire, so the host
received an advisory axis it could not use. Fixed: a non-finite component is
*unknown* and contributes `0`, so the emitted vector is always a real number.
The accessor also became `v?.x` so a `null` vector throws instead of spreading
`NaN` into three axes.

### B. `IntentResolver` PANIC escape gate — `null` distance read as "extremely close"

`threat.distance !== undefined && threat.distance < 1.5` let `null` satisfy the
first clause and then coerce to `0 < 1.5`. A threat whose distance the host did
**not** compute was treated as **adjacent**, so every panicking agent collapsed
into `DESPERATE_FLAIL` (low conscientiousness) or `CONFRONT_THREAT` (high
conscientiousness) instead of `FLEE_FROM`.

This one was also an **internal inconsistency**, which is the more serious half:
`AffectiveAgent.js:377` reads the same `null` as "absent, default 10" via `?? 10`,
and `ProtocolValidator._sanitizeStimulus` coerces it to `10` — three
implementations, three readings of one number. That is the defect class
`FearCore.isPanicClass` was created to retire, and it had survived in a fourth
place.

Fixed by exporting one named predicate, `isThreatAdjacent(threat)`
(`Number.isFinite(distance) && distance < ADJACENT_THREAT_DISTANCE`), replacing
the inline literal. The comment's "< 2 units" also disagreed with the code's
`1.5`; both now agree.

### C. `DiagnosticExplainabilityInspector` — a co-located threat explained as 10 units away

`const dist = t.distance || 10.0` (and the same for sounds). A distance of `0` —
which the server can legitimately send, because `_sanitizeStimulus` allows
`Math.max(0, distance)` — fell back to 10, understating that threat's sensory
weight from `1.0000` to `0.6667`.

**This is the one finding reachable through the live control plane**, because a
distance of `0` is a value the sanitiser produces rather than rejects. Fixed
with `??`.

Scope note stated so the probe cannot over-claim: the distance-attenuated weight
is internal to `explainAgentDecision` — it only decides which attribution
factors fire, and the public `threat_attribution[].weight` is a categorical `1`
for any sensed threat. The probe therefore pins what *is* publicly observable
(a co-located threat is sensed and attributed, and nothing non-finite escapes)
plus the operator-level invariant directly, and does **not** claim a public
weight change it cannot see.

### D. `EconomicFeedbackSystem` — a zero-target commodity was priced as if in deficit

`const target = market.targetStockpiles[comm] || 1.0`. For a commodity a
settlement deliberately does **not** want (target `0`), the `1.0` fabricated a
supply **deficit** whenever stock was under one unit and pushed that commodity's
price **up** — price signals for goods nobody wants.

Fixing the conflation exposed a second, related hazard that the original code had
been masking: with `stock === target === 0` the surplus branch evaluates
`0 / 0`, which is `NaN`, and `Math.max(0.2, NaN)` is `NaN`. A zero-target
commodity would have priced itself to `NaN` and poisoned every downstream quote.
The divisor is therefore guarded, and an explicit zero target rests on the
documented `0.2x` price floor as permanent surplus.

Two further sites in the same module had the conflating shape with different
consequences:

- `totalPlunderValue += stock * (market.prices[comm] || 10.0)` — a commodity
  priced `0` was valued at `10/unit`, overstating plunder.
- The pathology auditor's `targetStockpiles[comm] || 100.0` and
  `BASE_COMMODITY_PRICES[comm] || 10.0` thresholds. Here honouring a bare `0`
  would make the ratio vacuous (`stock > 0` for everything), so these two keep a
  floor — `Math.max(1.0, …)` and `Math.max(0.01, …)` — which removes the
  conflation while keeping the runaway and infinite-wealth tests meaningful.

Note that the same field previously had **two** different fallbacks, `1.0` in
`_updateMarketPrices` and `100.0` in the auditor. They serve different roles
(a pricing reference versus a pathology threshold), so they were **not**
unified into one number; the conflation was removed at each site instead.

### E. `StreamingFrameBuffer` and `TraumaCrystallizationEngine` — configuration of `0` was swallowed

Four host policies could not be expressed, each silently replaced by its default:

| Site | Swallowed value | Meaning |
|---|---|---|
| `ChunkAssembler.staleSequenceThreshold` | `0` | purge only frames strictly behind the latest completed sequence |
| `ChunkAssembler.maxPendingFrames` | `0` | buffer no incomplete frames |
| `JitterPlaybackBuffer.targetDelayTicks` | `0` | play frames through with no delay |
| `JitterPlaybackBuffer.maxBufferSize` | `0` | never hold a frame |
| `TraumaCrystallizationEngine.sensitizationWindowTicks` (constructor **and** `setState`) | `0` | no vulnerable consolidation window at all |

All fixed with `??`, so absent/null still falls back and an explicit `0` passes.

`PacketChunker`'s `options.mtu || DEFAULT_MTU_BYTES` was **deliberately left
alone**: an MTU of `0` is out of domain and would send the chunker into an
infinite loop, so the `||` there is a guard rather than a conflation.

### F. Cosmetic

`PsychoacousticSynthesizer`'s comment claimed the low-pass reaches "1,800 Hz"
while the code floors at `1200` (the raw formula reaches `1000`). Corrected, with
a note that the deeper `PsychoacousticEngine` behind `fear-ai audio` models a
`250` Hz floor with wall occlusion — **two deliberate surfaces, not two readings
of one number**, so `SYSTEM_MAP`'s "250–20000 Hz" claim is accurate as written
and was left untouched.

`SituationStrengthProfiler`'s `threatDistance || 10` and
`CivilizationSimulationSystem`'s `Number(distance) || 100` were the same
conflating shape and were fixed on the same terms.

---

## 3. What was audited and found clean

Recorded so the next pass does not repeat it:

- **Determinism.** Zero `Math.random()` under `packages/`; zero RNG across every
  adapter (GDScript, C#, Python, Rust). All 27 `Date.now()` / `performance.now()`
  hits traced to observability and metadata — encrypted-store record stamps,
  request-signing timestamps, dashboard event timestamps, the jitter buffer's
  `receivedTime` arrival stamp, and benchmark elapsed-time instrumentation. None
  feeds affective math or snapshot parity.
- **`Math.log` / `Math.sqrt` hazards.** `PerceptionRobustnessEngine`'s Box-Muller
  rejects `u === 0` before `Math.log(u)`, and
  `EmergentSystemCollisionHarness`'s Shannon entropy floors each activity at
  `0.01` before the `log`, so neither can produce `NaN`. Both are already
  correct and were left unchanged.
- **Duplicated panic-class literals.** A sweep for a fourth `PANIC` literal
  found none; `BinaryWireProtocol.WIRE_PANIC_ONSET_NORMALIZED` correctly derives
  `3.8 / 4.2` from the same constants.
- **Adapters.** No falsy-zero numeric defaults in any adapter tree.
- **Cardiac telemetry.** Both psychoacoustic modules compute
  `60 + effectiveStress * 120` clamped to `[55, 185]`, agreeing with the
  documented 60–180 BPM envelope and with each other.

---

## 4. Verification

```
node tools/verification/verify_advisory_numeric_hygiene.mjs
  -> 128 assertions passed, 0 failed.
  -> stable across 3 consecutive runs (identical verdicts)

node tools/verification/run_probe_suite.mjs --json evidence/probe_suite_report.json
  -> 41 probes: 40 passed, 1 passed with declared skips, 0 failed

node tools/guardian/hard-rule-9.mjs --verify
  -> 28/28 once the new probe is committed (gate-inputs-are-committed)
```

The probe asserts, per section: non-finite coordinates never produce `NaN` or
`null` in the advisory payload across every band; an unknown distance is not
adjacent while a known one still escalates exactly as before; the real explainer
senses a co-located threat and emits nothing non-finite; the repaired price
formula stays finite and never raises the price for a zero target; the real
pathology auditor returns its `{ healthy, pathologies }` shape with no
`NaN`/`Infinity`/`undefined` in any description; an explicit `0` survives each
configuration fallback while absent still defaults; and determinism, intent
vocabulary and host non-mutation hold across the tranche.

**Regression evidence.** The patched `IntentResolver` was compared against an
in-line copy of the original pre-fix implementation across 8 vector cases and
all 27 adjacency-gate combinations, with **zero** differences — which is why
every source-reading codegen anchor and the Godot fallback-parity probe still
pass unchanged. The recorded suite run above was taken after the fixes and is
the basis of the refreshed dossier roster.

The probe roster and determinism section in
`docs/RELEASE_CANDIDATE_CERTIFICATION.md` were regenerated from that run
(`npm run codegen:release-dossier`), and the probe counts in
`docs/RELEASE_SURFACE.md`, `docs/RELEASE_CANDIDATE_CERTIFICATION.md` and
`docs/CURRENT_TRUTH_LEDGER.md` were moved from 40 to 41 to stay derived from the
recording rather than asserted beside it.
