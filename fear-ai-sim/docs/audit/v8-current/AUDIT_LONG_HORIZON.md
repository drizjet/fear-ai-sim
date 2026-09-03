# V8 audit — long-horizon validity (candidate 79f287c)

Verdict: the world runs long without crashing; the suites cannot tell a
meaningfully dynamic world from a frozen-but-green one.

## Seed honesty (verified by manager read)

- long-horizon-5000tick: seeds [1,2,3] genuinely threaded (xorshift →
  encounterRng). Honest multi-run. But assertions are coherence-only
  (no crash/NaN, seasonChanges>0): means without variance, attacks and
  relocations logged, never gated. A frozen world passes (A5-F1, P1).
- sensitivity-500tick: seed loop variable NEVER passed to scenario
  construction (lines 102-109, 141-148) — five identical worlds, spread
  assertions measure a constant. The 5-seed claim is false (A5-F2, P1).
- scenario-differentiation: OR-of-metrics across scenarios; sharp axes
  exist only under production defaults.

## Temporal contracts (calibrated)

- ALWAYS resources/population/inventory: proven discriminating for
  corruption (pre-audit tick-213 kill of -0.4) but vacuous for stasis
  (pinned-at-0/forzen-pop pass). Mass-balance covers 30 ticks only.
  Parentage allows rootReason escape (A5-F3, P1).
- SUSTAIN drought recovery: any-epsilon uptick on a tuned fixture, no
  return-to-control, no price/population co-recovery (A5-F4, P1).
- EVENTUALLY trip termination: holds in default; immortal ARRIVED via
  malformed load (MAT-004).

## Attractors

- Grievance equilibrium (0.05·shortage+0.4·loss)/0.03 saturates ≈1.0
  under chronic shortage (comment admits 1.67 clamped); refill is
  HOLD-only (+1) with a 5-tick raid cooldown → RAID-every-6 limit cycle,
  not recovery (A5-F5, P1).
- Demography floor(pop·rate) is a no-op at canonical pop 1, so
  conservation-at-2 is conservation-by-inaction (A5-F6, merged into
  MAT-005).

## Statistics

- attacks/tick without encounter denominator; mean ms/tick and mean
  events without variance; deliveredTotal OR-axis post-hoc (A5-F7, P1).
- Three seeds are smoke, not validation. No variance, no exposure
  denominators, no seed policy anywhere.
