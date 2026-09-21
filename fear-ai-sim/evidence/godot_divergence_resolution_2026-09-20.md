# Godot Showcase Divergence Resolution — 2026-09-20

**Artifact**: `tools/verification/verify_godot_stations.mjs` (`npm run verify:godot-stations`)
**Result**: 166 assertions PASS, 6 pinned divergences asserted as **resolved**
**Supersedes the "pinned as tripwires" state of**: `evidence/godot_station_verification_2026-09-20.md` §6
**Method**: standalone deterministic Node probe. No test runner (Hard Rule 9). No Godot binary required.

---

## 1. What changed

The 2026-09-20 station-level probe promoted the Godot showcase row to
`VERIFIED_CURRENT (STATION_ADVISORY_CONTRACT)` but pinned six showcase-local
divergences from the canonical contract as tripwires. This change resolves all
six by bringing the showcase's **offline fallback** onto the canonical contract
and flipping the probe from "assert the divergence exists" to "assert the
divergence is closed".

The mechanism is deliberately the one the record described: the fallback now
speaks the canonical band and intent vocabulary, mirrors the canonical
habituation and fear-integration math, and every downstream consumer of that
vocabulary was updated in the same change.

## 2. Files changed

| File | Change |
|---|---|
| `tests/godot_project/addons/fear_ai/fear_agent.gd` | Offline fallback rewritten onto the canonical contract: canonical band state machine + habituation mirror + integration ramp + canonical intents |
| `tests/godot_project/showcase_agent.gd` | `INVESTIGATE` → `INVESTIGATE_SOUND` (and moves **toward** the sound, matching canonical vector semantics); band badge `FEAR` → `ANXIOUS` |
| `tests/godot_project/addons/fear_ai/fear_agent_hud_2d.gd` | Band palette collapsed to the canonical four (`CALM/ALERT/ANXIOUS/PANIC`); numeric fallback aligned to the canonical raw-fear boundaries |
| `packages/adapters/godot/fear_agent_hud_2d.gd` | Same (kept byte-identical to the addon copy) |
| `tests/godot_project/addons/fear_ai/fear_steering_2d.gd` | Band check `FEAR` → `ANXIOUS`; intent `match` restricted to canonical `ACTION_INTENTS` |
| `packages/adapters/godot/fear_steering_2d.gd` | Same (kept byte-identical to the addon copy) |
| `tests/godot_project/station_controller.gd` | Station 2 reads canonical habituation from the component; station 6 threshold is the named constant `S6_REROUTE_DANGER := 0.50`; station 9 keeps feeding the rumor so the ramp can settle; header corrected to 10 stations |
| `tests/godot_project/run_showcase_conformance.gd` | Header/suite list corrected; station-1 band vocabulary canonical; station-6 threshold 0.50; stations driven with explicit tick counts |
| `tests/godot_project/addons/fear_ai/examples/quickstart_2d.gd` | Offline demo drops the old fractional `step` argument (the 4th parameter is now a tick count); one canonical tick per physics frame |
| `packages/adapters/godot/examples/quickstart_2d.gd` | Same (kept identical to the addon copy) |
| `packages/adapters/godot/README.md` | Corrected the inaccurate claim that the packaged adapter "supports offline `evaluate_local()` fallback": it is transport-only |
| `tools/verification/verify_godot_stations.mjs` | Part D rewritten to assert the canonical vocabulary and the six resolutions; assertion count 142 → 166 |

The packaged `packages/adapters/godot/fear_agent.gd` is **unchanged**: it is the
transport-only adapter and owns no local evaluator. The six resolutions do not
touch it, which the probe still asserts.

## 3. Divergence-by-divergence resolution

### D1 — non-canonical band/intent vocabulary
The fallback no longer emits `FEAR` or `INVESTIGATE`, and no longer aliases
`urgency` to raw fear. It now:

- runs a canonical core-band state machine with the FearCore enter/exit
  hysteresis (enter `ALERT 0.8`, `ANXIOUS 1.4`, `PANIC 3.8`; exit `CALM 0.55`,
  `ALERT 0.8`, `ANXIOUS 1.2`) on the scaled fear (`raw_fear × 4.2`, matching
  `AffectiveAgent._fearScale`) with a 10-tick panic lock;
- emits only `CALM/ALERT/ANXIOUS/PANIC`;
- resolves urgency per canonical `IntentResolver` values
  (`CAUTIOUS_EXPLORE 0.10`, `IDLE_VIGILANT 0.30`, `INVESTIGATE_SOUND` from the
  openness slope, `FLEE_FROM 0.65` at ANXIOUS, `FLEE_FROM min(1, 0.75 + fear×0.25)`
  at PANIC).

**Guard**: the probe now collects every ALL-CAPS double-quoted literal in the
fallback and asserts each is a canonical band, a canonical intent, or a known
stimulus type. A stray `FEAR` or `INVESTIGATE` fails the probe.

### D2 — habituation magnitude
The station-local `H(n) = min(1, n × 0.25)` damp is gone. The fallback mirrors
`HabituationSystem.getEffectiveFear` exactly (`maxHabituation 0.60`,
`habituationRate 0.08`, `noveltyBoost 0.15`, `recoveryRatePerTick 0.0005`, per
stimulus type decay multipliers), and station 2 feeds the raw burst and reads
`get_habituation_level("SOUND", "sound_pulse")`.

The probe asserts the fallback's constants equal the canonical
`DEFAULT_HABITUATION_CONFIG` and that the canonical SOUND curve damps burst 4 to
**0.687** (the magnitude the old showcase curve got "wrong" at 0.128).

### D3 — static snap vs canonical ramp
The `if step >= 1.0: current_raw_fear = target_fear` snap is gone, along with
the `target_fear` expression entirely. The fallback integrates exactly like
`AffectiveAgent`:

```
fear_input = (max_perceived + social*0.6 + dread*0.8) * (0.4 + fear_baseline*0.8)
active ? current_raw_fear = min(1, max(current_raw_fear + 0.05, fear_input))
       : current_raw_fear = max(0, current_raw_fear * decay_rate)
```

with the canonical decay rate `clamp(0.92 + neuroticism×0.05 − (resilience−0.5)×0.08, 0.75, 0.98)`.
Distances use the canonical attenuations (`1/(1+d×0.05)` for threats,
`1/(1+d×0.08)` for sounds). One-shot callers (the Godot-side runner) pass an
explicit tick count, so a single frame cannot stall a station; the live showcase
callers tick once per physics frame, which is the canonical cadence — station 9
was reworked to keep feeding the delivered rumor so its ramp can settle. The two
`examples/quickstart_2d.gd` demo copies, which had passed a fractional
`delta * 3.5` as the 4th argument (the old `step`), were updated to drop it and
tick once per physics frame (guarded with `has_method("evaluate_local")` so the
same example also runs against the packaged transport-only adapter); the probe
now asserts no showcase caller passes a fractional step where a tick count is
expected, so an `int`-typed parameter can never receive a float.

### D4 — duplicate `fear_agent.gd` copies
The duplication remains (a showcase build needs an offline path), but the
divergence that made it a hazard — vocabulary drift — is gone:

- both copies declare the same canonical defaults (`CALM`, `IDLE_VIGILANT`);
- the showcase copy carries a header documenting that it is the showcase-only
  offline fallback whose local appraisal mirrors the canonical core, and that the
  packaged copy is transport-only;
- the packaged copy still owns no `evaluate_local`;
- the shared HUD and steering copies are byte-identical between the two trees and
  now reference only canonical band and intent names;
- the packaged adapter README no longer claims the packaged `FearAgent` "supports
  offline `evaluate_local()` fallback" (it does not — it is transport-only); the
  probe asserts the README states the transport-only boundary.

### D5 — stale Godot-side runner
`run_showcase_conformance.gd` now describes its 13 suites (with the header no
longer claiming "7 behavioral stations"), asserts station 1 against canonical
bands, uses the 0.50 station-6 threshold, and drives sustained scenarios with
explicit tick counts. The controller header was corrected to 10 stations as well.

**Not executed**: this runner still requires a Godot binary, which is not
installed on the audit host, so the edit is source-level and asserted
structurally by the probe — not by an in-engine run.

### D6 — station-6 reroute threshold
The demo threshold is now the named constant `S6_REROUTE_DANGER := 0.50`, equal
to the hazard the canonical valley chain assigns to its own high-way ambush
(`EncounterConsequenceEngine`: `HIGHWAY_AMBUSH` / `COMBAT_ENGAGEMENT` →
`danger 0.5`). A host feeding real `POST /api/v1/advisory/chain` output into the
station rule now reroutes; the clear route (0.05) still keeps the Highland Pass.
The Godot-side runner's station-6 threshold and the display tint were updated to
the same constant.

## 4. Verification

```
$ node tools/verification/verify_godot_stations.mjs
SUCCESS: All 166 Godot station-level assertions PASSED.
Pinned divergences resolved: 6 (D1, D2, D3, D4, D5, D6)
```

Full sweep: all **16** standalone Node harnesses in `tools/verification/`
(`verify_*.mjs`) pass, zero failures, including the release-claim document
tripwire and the runtime-wiring tripwire. No test runner was used (Hard Rule 9).

## 5. Scope boundary

Unchanged from the station-level probe: this asserts station advisory
**contracts and boundaries** only. It is **not** a live Godot run — rendering,
in-engine frames, frame timing, and visual fidelity are not asserted. The
Godot-side runner remains the in-engine check and still requires a Godot binary.
The promoted Godot row keeps the `STATION_ADVISORY_CONTRACT` qualifier, and the
overall release verdict remains `PROVISIONAL / NOT CERTIFIED`.
