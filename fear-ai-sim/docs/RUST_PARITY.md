# FearCore / Rust Parity Matrix

**Status:** `PARTIALLY_VERIFIED` — no authoritative Rust fear model exists in the current repository  
**Part 1 implementation:** `fearcore.js` isolated adapter integrated into the reactive `brain.js` path; special states remain legacy-owned  
**Date:** 2026-08-27 (updated: see EVID-2026-08-27-RUST-PARITY-AUDIT)  
**Phase:** Part 1  
**Canonical rule:** This document distinguishes repository facts, historical claims, and unverified reference behavior.

## 1. Reference availability

A repository search found Rust files at:

- `src-tauri/src/main.rs`
- `src-tauri/src/engine.rs` (path listed for reference; not present in the current checkout)
- `.tmp_test/main.rs` (path listed for reference; not present in the current checkout)
- `fear-ai-tester/src/main.rs` (path listed for reference; not present in the current checkout)

The current checkout contains **only** `src-tauri/src/main.rs` (543 lines). A direct grep for `fear|panic|threshold|trauma|hysteresis|habituation` against that file returns **zero matches**. The Rust side implements: `RngState` (random number generation), `sync_agents_to_rust` / `tick_rust_engine` (agent sync and tick), logging (`start_logging_session`, `log_frame_data`, `stop_logging_session`), export (`export_trajectories_jsonl`, `export_summary_csv`, `export_features_binary`, `compress_exports`, `list_exports`, `open_export_directory`), dataset validation, and system info.

**No Rust fear model exists in the current repository.** The historical "0–5" threshold values listed below are not verified by any Rust source; they are `DOCUMENTED_CLAIM` only, and the canonical JS-side owner is `FearCore` in `fearcore.js`. The Part 1 implementation is therefore not "Rust parity" — it is the documented BadAI target, with Rust parity parked until an authoritative Rust fear model is introduced.

```text
FearBand enter: 0.8 / 1.4 / 3.8 / 4.6
FearBand exit: 0.55 / 0.8 / 1.2 / 3.0
Panic lock: 10 ticks
```

These values must not be treated as JavaScript implementation requirements until the authoritative source and units are identified.

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

## 6. Divergence matrix

| Behavior | JavaScript current path | Reference target | Resolution |
|---|---|---|---|
| Fear scale | normalized value then local 0–100 conversion | not source-verified | inspect Rust/reference source |
| Calm escalation | can move to ALERT/ANXIOUS based on 20/30 after conversion | unknown | add source vector |
| Panic escalation | threshold 80 after conversion | unknown | add source vector |
| Panic recovery | threshold 70 after conversion; no verified lock | claimed 10-tick lock, source unknown | resolve source and implement tests |
| Hysteresis owner | embedded in `brain.js` for live path | unknown | make one owner explicit |
| Habituation owner | inline `brain.js` path | stimulus-aware module exists separately | decide after call-graph evidence |
| Skilled path | behavior tree gate at skill > 0.4 | unknown | preserve until DecisionCore migration tests |

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

`fearcore.js` now provides an isolated normalized FearCore contract using the documented target thresholds currently available in project records:

- `CALM → ALERT` at `0.8`;
- `ALERT → ANXIOUS` at `1.4`;
- `ANXIOUS → PANIC` at `3.8`;
- recovery thresholds `0.55`, `0.8`, and `1.2`;
- a ten-tick panic lock;
- no skipped intermediate bands;
- finite-input sanitization.

These defaults are explicitly **not claimed to be Rust parity**. They are an isolated, tested contract pending authoritative Rust source evidence. The reactive `brain.js` path now delegates CALM/ALERT/ANXIOUS/PANIC transitions to FearCore. Special states such as HIDE, RECOVER, FREEZE, AGGRESSIVE, and PRESENCE_BREAK remain Brain-owned compatibility behavior and require separate migration tests. FearCore now records bounded decision traces for every update, including input fear, threshold, previous/current state, transition reason, and panic-lock status. Replay frames persist each sampled agent's `fearTrace`, and the inspector can display the historical trace during playback.

## 9. Current conclusion

Part 1 is prepared and has a tested isolated contract, but it is not yet behaviorally complete. The repository has enough evidence to build the parity harness and document divergence. It does **not** yet justify selecting a Rust-to-JavaScript mapping or rewriting the live transition logic. The next safe action is authoritative Rust/reference inspection followed by table-driven vectors.

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
