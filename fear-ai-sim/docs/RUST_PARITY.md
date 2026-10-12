---
title: "FearCore / Rust Parity Matrix"
created: 2026-08-27
updated: 2026-10-12
type: parity-matrix
status: partially_verified
---

# FearCore / Rust Parity Matrix

**Status:** `PARTIALLY_VERIFIED` — canonical Rust fear model exists in sibling tree `pixel-pets/src/engine/ai/fear.rs`.
**Part 1 implementation:** `packages/core/src/FearCore.js` in *this* tree; Pixel Pets `fear.rs` is the reference model.  
**Executed Parity Measurement:** v1.1.0 (2026-10-12) via `tools/codegen/generate_rust_fear_oracle.mjs` and `tools/verification/verify_cross_tree_parity.mjs`.  
**Canonical rule:** This document distinguishes repository facts, historical claims, and executed reference behavior.  
**See also:** `docs/SYSTEM_MAP.md`, `evidence/rust_js_parity_vectors.json`, `evidence/rust_fear_oracle_results.json`.

## 1. Reference availability

### Canonical Rust fear model (sibling tree, live)

`C:\tools\03-Projects\lains Tools\New Master Game\pixel-pets\src\engine\ai\fear.rs`  
Public API: `...\engine\ai\mod.rs` (`pub mod fear`).

Observed in that file (re-measure before treating as frozen):

- `MAX_FEAR_SCORE = 5.0`
- `FearBand`: Calm → Alert → Afraid → Panicked → Routed + `BerserkOverride`
- dual-threshold enter/exit helpers
- `DEFAULT_PANIC_RECOVERY_LOCK_TICKS = 10`

Related: `advisory_validation.rs` (LLM intent is advisory; engine remains truth).

### Rust inside *this* JS repository (not the fear model)

A search of **this checkout** finds:

- `src-tauri/src/main.rs` — RNG, agent sync/tick, logging, export. Grep for `fear|panic|threshold|trauma|hysteresis|habituation` in that file is not a substitute for `fear.rs`.
- `fear-ai-tester/` — separate helper crate; do not assume it contains `FearBand`.
- Elixir NIF at `...\fear-ai-elixir\native\fear_ai_nif` — spatial/forces/diffusion/neural, **not** the Pixel Pets band machine.

**Correct claim:** no `FearBand` implementation lives in this JS repo’s Tauri crate.  
**Incorrect claim (pre-2026-09-07):** “no Rust fear model exists.” It exists in Pixel Pets.

```text
FearBand enter (Rust defaults, Pixel Pets): 0.8 / 1.4 / 3.8 / 4.6
FearBand exit (Rust defaults, Pixel Pets): 0.55 / 0.8 / 1.2 / 3.0
Panic lock: 10 ticks
```

JS `FearCore` / `packages/core` may use the same *numbers* without being bit-identical. Do not write “Rust parity” unless a cross-language fixture was actually run.

## 2. Current JavaScript evidence

| Concern | Current observation | Status |
|---|---|---|
| Primary fear state | `Brain.currentFear` is initialized and updated in `brain.js` | `CODE_VERIFIED` |
| Primary state transitions | Live reactive branch uses `currentFear * 100`; thresholds include 20, 30, 80, 70 | `CODE_VERIFIED` |
| Skilled-agent path | Behavior tree path is selected when `traits.skill > 0.4` | `CODE_VERIFIED` |
| Hysteresis module | `hysteresis.js` exists with a separate 0–1 threshold model and 10-frame minimum duration | `CODE_VERIFIED`, live wiring not established |
| Habituation module | `habituation.js` exists with stimulus-specific exposure tracking | `CODE_VERIFIED`, live wiring not established |
| Inline habituation | `brain.js` owns `exposureCount`, `habituationRate`, and `calculateHabituatedFear()` | `CODE_VERIFIED` |
| Panic lock | No authoritative live-JavaScript panic-lock contract established | `UNKNOWN` |
| Rust mapping | No verified conversion between Rust/reference units and JS units | `UNKNOWN` |

## 3. Scale inventory

| Location | Observed unit/range | Conversion | Status |
|---|---:|---|---|
| `Brain.currentFear` | generally treated as normalized 0–1 | none consistently declared | `CODE_VERIFIED` usage, contract unresolved |
| Live reactive transition local `f` | 0–100 | `f = currentFear * 100` | `CODE_VERIFIED` |
| `hysteresis.js` | 0–1 | none | `CODE_VERIFIED`, module reachability unresolved |
| `emotions.js` fear | 0–1 model | separate emotion system | `CODE_VERIFIED`, ownership unresolved |
| Historical Rust/FearBand claim | 0–5-like values reported | mapping not verified | `UNKNOWN` |

## 4. Required source evidence

Before locking parity, locate and record:

- the Rust type/function name;
- the source file and commit/version;
- the declared fear unit/range;
- state enum/order;
- transition function;
- entry thresholds;
- exit thresholds;
- panic lock storage and tick update;
- behavior at exact boundaries;
- behavior for invalid/out-of-range input;
- tests or fixtures that establish expected outputs.

If any item cannot be located, leave it `UNKNOWN` and do not fill it from a design document.

## 5. Proposed test-vector format

The following is the required format, not yet an assertion that the values are correct:

```js
{
  source: 'rust-reference-or-UNKNOWN',
  inputScale: 'UNKNOWN-until-source-read',
  currentState: 'CALM',
  fear: 0,
  tick: 0,
  expectedState: 'UNKNOWN',
  expectedLockUntil: 'UNKNOWN'
}
```

Once source evidence exists, add table-driven cases for:

- every exact entry boundary;
- immediately below and above every boundary;
- every exact exit boundary;
- band-by-band escalation;
- band-by-band recovery;
- panic lock ticks 0, 1, 9, 10, and 11;
- repeated threshold oscillation;
- invalid numeric inputs;
- deterministic sequences.

## 6. Divergence matrix (Executed Reference Parity, v1.1.0)

Executed measurement against real host `pixel-pets/src/engine/ai/fear.rs` (commit `db19d1fb6` / `d25ac1625`):

| ID | Behavior | Rust Canonical (`fear.rs`) | JavaScript (`FearCore.js`) | Parity Status / Resolution |
|---|---|---|---|---|
| **Core** | Alert / Afraid≡Anxious / Panic | Enter: 0.8, 1.4, 3.8<br>Exit: 0.55, 0.8, 1.2 | Enter: 0.8, 1.4, 3.8<br>Exit: 0.55, 0.8, 1.2 | **EXACT PARITY MATCH** |
| **Core** | Panic Lock Duration | 10 ticks | 10 ticks | **EXACT PARITY MATCH** |
| **Core** | NaN / Non-finite sanitization | Sanitizes to 0.0 | Sanitizes to 0.0 | **EXACT PARITY MATCH** |
| **B1** | Locked Panic Hold | Lock holds ONLY while `score >= exit.afraid (0.8)`. Below 0.8 (e.g. 0.0 or 0.79), exits to Calm/Alert | Holds lock at ANY score (`panicLocked = tickCount < panicLockedUntil`) | **DECLARED DIVERGENCE B1**: Rust allows low-stimulus escape; JS hard-locks. VEC-12 corrected in v1.1.0. |
| **B3** | Exit Cascade from Panicked | Cascades `Panicked -> Calm/Alert/Afraid` in a single evaluation based on score | Steps down strictly 1 band per update (`PANIC -> ANXIOUS` only) | **DECLARED DIVERGENCE B3**: Rust score-driven multi-band exit vs JS stepped ladder (VEC-17). |
| **B4** | Exit from Afraid/Anxious | `Afraid` at `score < exit.alert (0.55)` drops directly to `Calm` | `ANXIOUS` at `score < 0.8` steps to `ALERT` first | **DECLARED DIVERGENCE B4**: Rust skips Alert on low score vs JS stepped ladder (VEC-18). |
| **B5** | Entry Jump from Alert | `Alert` at `score >= 3.8` jumps directly to `Panicked` (or `Routed`) in 1 eval | `ALERT` steps to `ANXIOUS` first (1-band-per-tick ladder) | **DECLARED DIVERGENCE B5**: Rust multi-band jump vs JS stepped ladder (VEC-19). |
| **B6** | Entry Jump from Calm | `Calm` at `score >= 4.6` jumps to `Routed` (or `Panicked` at 3.8) in 1 eval | `CALM` steps to `ALERT` only (1-band-per-tick ladder) | **DECLARED DIVERGENCE B6**: Documented in VEC-15B. |
| **B7** | Lock Clock & Sparse Ticks | Lock is tied to host `eval_tick` (`recovery_lock_until = eval_tick + 10`). If `eval_tick == None`, **no lock is armed** | Internal `tickCount` counts `update()` calls. Always arms lock. | **DECLARED DIVERGENCE B7**: In sparse evaluation (e.g. evaluated at tick 10 then 25), Rust lock expires while JS remains locked. |
| **B8** | Lock Re-Arming | Only arms on `!is_panicked() -> is_panicked()` (Panicked -> Routed does not re-arm) | Re-arms a fresh 10-tick lock on every re-entry into `PANIC` from extended bands | **DECLARED DIVERGENCE B8**: Validated in observation suite. |
| **B9** | Input Score Clamping | Clamps `raw_score` to `[0.0, 5.0]` (`MAX_FEAR_SCORE`) | Floors at `0` only; preserves unbounded value (e.g. `fear: 999`) in trace | **DECLARED DIVERGENCE B9**: Band transitions agree; stored fear traces diverge. |
| **B10** | Berserk vs Aggressive | `BerserkOverride` is absorbing (cannot exit once set; ignores score) | `AGGRESSIVE` is an extended band; exits to Calm/Alert/Anxious/Panic when anger drops | **DECLARED DIVERGENCE B10**: Validated in observation suite. |
| **B11** | Routed Band | 5th core band `Routed` (`enter 4.6`, `exit 3.0`) | 4 core bands; Routed handled at higher middleware layers via `IntentResolver` | **DECLARED DIVERGENCE B11**: Documented in VEC-15A / VEC-15B. |
| **Scale** | Input Scale & Max Feeder | Unbounded ratio clamped to `[0.0, 5.0]` | Normalized `[0, 1]` scaled by `FEAR_SCALE = 4.2` (+ `panicBias * 4.2`) | **FINDING C / DEC-0001**: Maximum raw fear in JS feeds 4.2 (< Routed 4.6); Routed reachable only via panic bias. |

## 7. Part 1 implementation guardrails

No behavior-changing FearCore patch should be described as parity until:

1. source evidence is attached or the reference is explicitly unavailable;
2. scale conversion is named and tested;
3. state transitions are table-driven;
4. panic-lock semantics are tested at exact boundaries;
5. existing regression tests are updated intentionally;
6. fixed-seed behavior is reproducible;
7. the decision register records the choice and rejected alternatives.

## 8. Part 1 implementation record

`packages/core/src/FearCore.js` provides the isolated FearCore contract using the exact matching core thresholds:

- `CALM → ALERT` at `0.8`;
- `ALERT → ANXIOUS` at `1.4`;
- `ANXIOUS → PANIC` at `3.8`;
- recovery thresholds `0.55`, `0.8`, and `1.2`;
- a ten-tick panic lock;
- finite-input sanitization.

As of v1.1.0 (2026-10-12), the Rust reference model (`fear.rs`) is directly executed via `tools/codegen/generate_rust_fear_oracle.mjs`, producing `evidence/rust_fear_oracle_results.json`. The verification probe `tools/verification/verify_cross_tree_parity.mjs` executes both sides and asserts:
1. Exact threshold matrix equality;
2. Byte-level freshness of `fear.rs` and scenario definitions;
3. 22 boundary vectors with strict divergence declaration enforcement (15 agree, 7 declared divergences);
4. Automated verification of observations B7 through B10.

## 9. Current conclusion

Cross-tree threshold parity is **proven and executed**, not merely claimed. The 7 behavioral divergences (B1, B3, B4, B5, B6, B11) and 4 operational divergences (B7, B8, B9, B10) are formally characterized, measured, and locked into automated verification. The next steps for DEC-0001 (fear scale normalization) and DEC-0002 (transition ownership) are grounded on verified code execution rather than speculative documentation.

## 10. Live fear producers and consumers (Part 1 inventory)

The P0 audit (EVID-2026-08-27-BRAIN-DETERMINISM / EVID-2026-08-27-BRAIN-DUAL-OWNERSHIP) revealed that the live production path involves **multiple owners of fear-related state** writing the same fields from independent code paths. This inventory records the current ownership, scale, and call graph for every live producer/consumer.

### 10.1 Live producers (writers)

| Owner | Field | Unit/range | Source of value | Live? |
|---|---|---|---|---|
| `brain.js:342` | `Brain.currentFear` | 0–1 | `Math.max(prev * 0.95, habituatedThreat * traits.fear)` | yes |
| `brain.js:346–352` | `Brain.currentAnger` | 0–1 | dominance-based ramp | yes |
| `brain.js:558` | `Brain.currentFear` | 0–1 | energy-deficit spike | yes (low-energy path) |
| `agent.js:261` | `Brain.currentFear` | 0–1 | tribal fear injection | yes |
| `agent.js:314` | `Brain.currentFear` | 0–1 | external event `e.fear` | yes |
| `agent.js:368` | `Brain.currentFear` | 0–1 | tribal-fear floor | yes |
| `agent.js:431` | `Brain.currentFear` | 0–1 | trauma-level floor | yes |
| `learningagent.js:597` | `Brain.currentFear` | 0–1 | tribal fear injection (duplicate of agent.js:261) | yes |
| `learningagent.js:630` | `Brain.currentFear` | 0–1 | external event `e.fear` (duplicate of agent.js:314) | yes |
| `learningagent.js:686` | `Brain.currentFear` | 0–1 | tribal-fear floor (duplicate of agent.js:368) | yes |
| `agent.js:357` | `Agent.emotions.fear` | 0–1 | `= brain.currentFear` | yes |
| `agent.js:358` | `Agent.emotions.anger` | 0–1 | `= brain.currentAnger` | yes |
| `agent.js:312, 339–343` | `Agent.emotions.energy/hunger/thirst/boredom` | various | decay / drain | yes |
| `brain.js:375, 395` | `Brain.currentFear` | 0–1 | presence-break decay | yes |
| `brain.js:530, 546` | `Brain.currentFear` | 0–1 | recovery / freeze-path | yes |

**Findings:**

- `Brain.currentFear` has **at least 6 live writers** across `brain.js` and `agent.js`, with `learningagent.js` adding 3 more duplicates of the agent.js paths. This is a real multi-writer finding, beyond the dual-ownership finding inside `brain.js` itself.
- `Agent.emotions` is a plain object (declared inline at `agent.js:23`), **not** an instance of `emotions.js#EmotionSystem`. The `emotions.js` module (458 lines) is therefore dead code — its `EmotionSystem` class is never instantiated in the production reach. Confirmed by grep: no `import` of `emotions.js` exists outside `tests/phase3.test.js`.

### 10.2 Live consumers (readers)

| Consumer | Field | Use | Live? |
|---|---|---|---|
| `agent.js:228` | `Brain.currentFear` | arousal composite for maxSpeed / behavior | yes |
| `agent.js:350` | `Brain.currentFear` | fear-delta observer | yes |
| `agent.js:362` | `Brain.currentFear` | high-gamma arousal (0–100 scale) | yes |
| `agent.js:391` | `Brain.currentFear` | courage threshold | yes |
| `agent.js:419–420, 431` | `Brain.currentFear`, `Brain.state` | trauma-level update | yes |
| `agentactions.js:182–184` | `agent.brain.currentFear` | GOAP flee cost scaling | yes |
| `agentactions.js:203` | `agent.brain.currentFear` | social willingness | yes |
| `agentactions.js:280` | `agent.brain.currentFear` | family-defense gate | yes |
| `learningagent.js:557, 672, 681, 732` | `Brain.currentFear` | (duplicates of agent.js consumers) | yes |
| `replay.js`, `dashboard.js`, `metrics.js`, `databridge.js` | `Brain.currentFear` | telemetry, export, replay | yes |
| `feardatacollector.js`, `feardatagen.js` | `Brain.currentFear` | training data generation | yes |
| `panicchains.js`, `quantuminspired.js`, `adaptivelearning.js`, `autobalancer.js` | `Brain.currentFear` | downstream ML / behavior subsystems | yes |
| `main.js`, `physicsworker-manager.js` | `Brain.currentFear` | UI / worker IPC | yes |

### 10.3 Orphan / test-only files

| File | Lines | Imports in production | Imports in tests | Verdict |
|---|---:|---|---|---|
| `fearcore.js` | 134 | `brain.js:4` | `tests/fearcore.test.js` | **PRODUCTION_OWNER** (canonical fear-band transitions; 0–1 scale) |
| `hysteresis.js` | 292 | none | `tests/hysteresis-determinism.test.js`, `tests/phase3.test.js` | **TEST_ONLY** (now rng-deterministic but not wired into the live path) |
| `emotions.js` | 458 | none | `tests/phase3.test.js` | **DEAD** (EmotionSystem never instantiated; agent uses inline plain-object emotions) |
| `habituation.js` | 271 | none | `tests/phase3.test.js` | **DEAD** (Brain has its own inline habituation in `calculateHabituatedFear` and `recordExposure`) |

### 10.4 Scale conversions

| Location | Observed | Stated scale |
|---|---|---|
| `Brain.currentFear` (canonical) | 0–1 | normalized |
| `Brain.currentAnger` | 0–1 | normalized |
| `Brain.currentDominance` | 0–1 (initial 0.5) | normalized |
| `agent.js:362` (`highGammaArousal`) | `30 + currentFear * 70` (0–100) | display scale, derived |
| Historical Rust/FearBand claim (in `fearcore.js` defaults) | 0–5-like (e.g. `0.8 / 1.4 / 3.8 / 4.6` enter) | not source-verified (see §1) |
| Inline `brain.js` reactive path local `f` | `currentFear * 100` (0–100) | legacy; mixed-scale risk |

**Finding:** `brain.js` mixes 0–1 and 0–100 scales in the same file. The legacy reactive path converts `currentFear` to 0–100 (line 392: `const f = this.currentFear;` — note the variable name suggests an old 0–100 intent), then compares against 0–100 thresholds. The `FearCore` path uses 0–1 thresholds. The two systems are not equivalent even when normalized. Per the master plan, the legacy path must be preserved until DecisionCore migration is tested, but the scale mixing is a known risk.

### 10.5 Migration priority

1. **`emotions.js`** — DELETE (dead code; `EmotionSystem` never instantiated; `Agent.emotions` is a plain object). Low risk: no production callers.
2. **`habituation.js`** — DECIDE: either integrate the richer per-stimulus exposure model into `Brain.calculateHabituatedFear` and `recordExposure`, or DELETE (the inline implementation in `brain.js` already does habituation). Either is valid; the inline version is simpler and tested.
3. **`hysteresis.js`** — DECIDE: `FearCore` is the production owner. Either (a) DELETE `hysteresis.js` and migrate the meaningful band-specific tests into `tests/fearcore.test.js`, or (b) keep `hysteresis.js` as a richer test fixture (the 7-state model is more expressive than `FearCore`'s 4-state model, but the extra states are not live).
4. **`Brain.currentFear` multi-writer** — REFACTOR: make `Brain` the sole writer. `agent.js` and `learningagent.js` should call `brain.setFear(value, reason)` instead of writing `brain.currentFear` directly. This is the single most impactful cleanup because it removes the silent-override pattern that lets `agent.js` and `learningagent.js` race against `brain.js`'s own dynamics.
5. **`Brain.state` dual-ownership** (already pinned by the new test): REFACTOR the inline state machine to consult `FearCore` first, then apply the legacy transitions (HIDE/FREEZE/AGGRESSIVE/RECOVER/PRESENCE_BREAK) as derived bands.

Each of these is a coherent slice. The smallest coherent first step is **(1)** and **(3)**: delete the dead modules. The next is **(4)**: the multi-writer fix, which is the actual P0.

### 10.6 Status of this inventory

`CODE_VERIFIED` for every entry. The test-only and dead-code verdicts are based on the same import-graph grep that was used for the Phase 3 reach audit. The migration is parked as P0/P1 work for the next autonomous sessions per the master plan's phase sequence.
