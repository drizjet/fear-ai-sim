# Godot Live In-Engine Evidence & Derived Fallback — 2026-09-20

**Scope:** live execution evidence for the Godot 4.6 adapter/showcase row, plus the
generated-artifact work that removes the showcase's hand-copied constants.

**Status of the row after this record:**
`VERIFIED_CURRENT (HEADLESS_IN_ENGINE + STATION_ADVISORY_CONTRACT + FALLBACK_NUMERIC_PARITY)`

**Directly rebuts:** the previous row qualifier `STATION_ADVISORY_CONTRACT` alone,
whose own boundary text said *"not a live Godot run"*. It is a live Godot run now.

---

## 1. What was missing, and what changed

Before this record, three gaps sat under the Godot row:

1. **No live in-engine assertion.** `verify_godot_stations.mjs` asserts each
   station's advisory contract on the canonical JS core by parsing
   `station_controller.gd`, but it never executes GDScript. The in-engine runner
   (`run_showcase_conformance.gd`) existed but was treated as unusable because it
   evaluates stations against the showcase's *own* fallback implementation.
2. **The fallback was hand-copied.** `fear_agent.gd` reimplemented canonical band,
   habituation, intent, and urgency constants by hand, with no mechanism to detect
   drift from the JS core. Vocabulary equality had been proven; numeric equality
   had not.
3. **The in-engine run was not reproducible.** `run_canonical_conformance.gd`
   hardcoded `127.0.0.1:8765` with no override.

All three are addressed below.

---

## 2. Environment

| Item | Value |
|---|---|
| Godot binary | `C:\tools\02-Dev\godot\Godot_v4.6-stable_win64_console.exe` |
| Godot version | 4.6-stable |
| Mode | `--headless` (no window, no frames presented) |
| Project | `tests/godot_project` |
| Node | local repo Node on Windows |
| FearServer port | `8791`, verified free before spawn |
| Host port 8765 | **occupied by an unrelated local service** (see §5) |

---

## 3. Derived fallback — one authored source for the constants

`tools/codegen/generate_godot_fallback.mjs` reads the live JavaScript core and emits
`tests/godot_project/addons/fear_ai/fear_canonical_core.gd`:

| Generated from | Source of truth |
|---|---|
| Core band enter/exit thresholds, panic lock | `packages/core/src/FearCore.js` |
| Habituation max / rate / novelty ramp | `packages/core/src/HabituationSystem.js` |
| Intent urgency slope, investigate gates | `packages/core/src/IntentResolver.js` |
| Distance attenuations, integration ramp | `packages/core/src/AffectiveAgent.js` |

- `npm run codegen:godot-fallback` writes the artifact.
- `npm run codegen:godot-fallback:check` fails if the checked-in artifact is stale.
- The showcase fallback `fear_agent.gd` now **preloads** this module and declares
  no canonical numbers of its own.

### Drift guard verification (negative test)

The guard was proven to fire rather than assumed to work: a generated constant was
perturbed by hand, and **both** the currency check (Part A) and the parity sweep
(Part C) failed. The artifact was then regenerated and both passed again.

---

## 4. Results

### 4.1 Static / numeric probes (no Godot required)

| Probe | Command | Result |
|---|---|---|
| Godot station-level advisory contract | `npm run verify:godot-stations` | **PASS — 169 assertions, 0 failures** |
| Godot fallback numeric parity | `npm run verify:godot-fallback-parity` | **PASS — 37 assertions, 0 failures** |
| Adapter conformance (incl. canonical vocabulary sweep) | `node tools/verification/verify_adapter_conformance.mjs` | **PASS — 131 assertions, 0 failures** |

The parity probe asserts, independently of the GDScript's honesty about itself:

- **Part A** — the checked-in `fear_canonical_core.gd` is byte-identical to a fresh
  generation from the live JS core.
- **Part B** — the fallback delegates and holds no local canonical numbers.
- **Part C** — a `FearCore` configured from the numbers the *shipped GDScript
  declares* reproduces the canonical core's band sequence **step for step** across a
  fine up/down fear sweep, hysteresis and the 10-tick panic lock included.
- **Part D** — a `HabituationSystem` configured from the GDScript's declared
  constants reproduces the canonical dampening curve across stimulus types and burst
  counts.
- **Part E** — the declared urgency constants and investigate gates equal what
  `IntentResolver` returns for the same band, fear, and openness.

### 4.2 Live in-engine suites (real Godot 4.6 binary)

Reproduce with a single command: `npm run godot:evidence`

```
================================================================================
LIVE IN-ENGINE GODOT EVIDENCE: 3 / 3 suites exit 0
  PASS  run_showcase_conformance.gd      13 / 13 PASSED (100%)
  PASS  run_civilization_godot_conformance.gd   3 / 3 CHECKS PASSED (100%)
  PASS  run_canonical_conformance.gd     4 / 4 FIXTURES PASSED (100%)
================================================================================
```

All three suites exited **0**.

**`run_showcase_conformance.gd` — 13 / 13 stations, exit 0**

| Station | In-engine result |
|---|---|
| 1 Individual Fear & Threat Appraisal | Raw Fear=0.76, Band=ANXIOUS, Intent=FLEE_FROM |
| 2 Ambiguous Sound & Habituation | Burst 1 Fear=0.12 → Burst 4 Fear=0.10 (damped 19.2%) |
| 3 Crowd Panic Cascade | Agitator Panic=1.00 cascaded to 4 peers (Mean Fear=0.79) |
| 4 Leader Rally Dynamics | Heroic rally suppressed fear 0.80 → 0.35 (−45.0%) |
| 5 Trauma Zone Re-activation | Dread zone at 20.0px → Flashback Fear=0.84, BPM=159 |
| 6 Trade Caravan Danger Reroute | Highland Pass Danger=0.85 → rerouted to RIVER_DETOUR |
| 7 Faction Stance Interaction | Border 60.0px, Tension=0.80 → Bilateral Stage=SKIRMISH |
| 8 Regional Trade & Ambush Escorts | Mass conserved 300.0g, escort suppression 0.73 → 0.62 |
| 9 Multi-Observer Fog-of-War & Rumor | Decoupled (Outpost 1.00 vs Capital 0.00) → courier rumor mobilizes capital |
| 10 Valley Advisory Chain Monitor | Chain applied (danger=0.50); link-down holds last state |
| 11 Identity Blend Observatory | Coward flee=1.00 urgency=0.80 vs brave flee=0.42 urgency=0.62 |
| 12 Trauma Feed Observatory | One episode in 210 terror ticks; floor=0.25 offset=0.18 dread=0.20 |
| 13 Vault Seal/Restore Observatory | trust=0.70, trauma floor=0.26 round-trip exact, identity gate holds |

Note that station 2 now reports a **19.2%** damping, and station 1 reports band
`ANXIOUS`. Both are the canonical curve and the canonical band set. Before the
divergence resolution this station reported a 0.128-by-burst-4 local damp and a
non-canonical `FEAR` band.

**`run_civilization_godot_conformance.gd` — 3 / 3, exit 0**

| Check | In-engine result |
|---|---|
| 1 Multi-Agent Squad Rally Directives | Dist=14.14m (<35m), RallyDir=(−0.71, −0.71) |
| 2 Trade Caravan Dynamic Danger Rerouting | HighlandPass danger=0.85 → RiverDetour |
| 3 5-Tier Cognitive LOD Boundaries | d0=15.0m, d1=50.0m, d2=120.0m, d3=400.0m, d4=1200.0m |

**`run_canonical_conformance.gd` — 4 / 4 fixtures, exit 0, against a live `FearServer`**

| Fixture | In-engine result |
|---|---|
| 1 Calm Baseline (`calm.json`) | Band=CALM, Arousal=0.0000 (<0.35), Intent=CAUTIOUS_EXPLORE |
| 2 Sudden Threat Escalation (`sudden-threat.json`) | Band=PANIC, Intent=FLEE_FROM, Urgency=1.00, Heartbeat=180BPM |
| 7 Spatial Trauma Memory Dread (`trauma.json`) | RawFear=1.0000 (>0.25), Band=PANIC |
| 8 Snapshot Save/Load Continuity (`save-load.json`) | Baseline=0.000000, Restored=0.000000, Δ=0.000000 (<0.001) |

---

## 5. Finding: port contention masqueraded as an auth failure

The first in-engine attempt against the live server printed:

```
[FAIL] Handshake rejected: { "error": "unauthorised" }
```

This was **not** a Fear AI defect and not an auth problem. Port `8765` was held by
an unrelated local service (HTTP `401 Unauthorized`, `cache-control: no-store`),
which answers any POST on that path with `{"error":"unauthorised"}`. The Fear AI
server was never reached.

**Fix (two parts):**

1. `run_canonical_conformance.gd` now resolves its port from `FEAR_AI_PORT`, then
   `-- --port=<n>`, then the 8765 default, and prints an explicit hint when a
   foreign service answers the handshake:
   `[HINT] A non-FearServer process may be holding 127.0.0.1:8765. Set FEAR_AI_PORT ...`
2. `tools/run-godot-inengine-evidence.mjs` verifies a port is free before spawning
   its FearServer, sets `FEAR_AI_PORT` for the canonical suite, and tears the server
   down afterwards. It received `401` on 8765 during this campaign only because it
   had not yet been given a free port; with port selection in place, all three
   suites pass unattended.

Both behaviours are pinned by the release-claim tripwire so they cannot be reverted
silently.

---

## 6. What this record does NOT prove

Stated plainly, because the temptation to over-read a green in-engine run is real:

- **No rendering, visual-fidelity, or frame-presentation claim.** Every suite runs
  `--headless`. Nothing here asserts that a station *looks* correct on screen. The
  row's `HEADLESS_IN_ENGINE` qualifier exists for precisely this reason.
- **Not an Editor claim.** This is the standalone binary, not the Godot Editor
  (which is what Unity still lacks, and it is not claimed here for Godot either).
- **Not host-game certification.** The showcase project is a test surface, not a
  shipped game. No host integration or gameplay-equivalence claim follows.
- **The in-engine runner is not an independent oracle for station semantics.** It
  still evaluates stations against the showcase's own fallback. Independence comes
  from `verify_godot_stations.mjs` (canonical JS core) and
  `verify_godot_fallback_parity.mjs` (numeric parity against the generated module),
  not from the in-engine run itself. The in-engine run proves the GDScript
  *executes* and its assertions *hold in the engine*; the probes prove those
  assertions are the *right* ones.
- **The parity proof covers declared math, not GDScript execution.** Part A–E read
  constants and reproduce semantics in JS. They cannot catch a GDScript-side
  arithmetic slip in the fallback's own integration loop; the in-engine run is what
  covers execution.
- **`SKIPPED` ≠ `PASSED`.** On a machine with no Godot binary,
  `run-godot-inengine-evidence.mjs` exits 0 with `SKIPPED` and says explicitly that
  no evidence was captured. It never reports in-engine coverage it did not obtain.

---

## 7. Reproduce

```bash
npm run verify:godot-fallback-parity   # 37 assertions, no Godot needed
npm run verify:godot-stations          # 169 assertions, no Godot needed
npm run codegen:godot-fallback:check   # fails if the generated module is stale

npm run godot:evidence                 # live Godot 4.6, headless, 3 suites
# override the binary if yours is elsewhere:
#   FEAR_AI_GODOT=/path/to/godot node tools/run-godot-inengine-evidence.mjs
```

---

## 8. Artifact inventory

| Artifact | Kind |
|---|---|
| `tools/codegen/generate_godot_fallback.mjs` | generator (new) |
| `tests/godot_project/addons/fear_ai/fear_canonical_core.gd` | generated artifact (new) |
| `tools/verification/verify_godot_fallback_parity.mjs` | numeric parity probe (new) |
| `tools/run-godot-inengine-evidence.mjs` | live in-engine evidence runner (new) |
| `tests/godot_project/run_canonical_conformance.gd` | port override + hint (modified) |
| `tests/godot_project/addons/fear_ai/fear_agent.gd` | delegates to generated module (modified) |
| `packages/adapters/unity/Runtime/FearAgentHUD.cs` | canonical band palette (modified) |
| `tools/verification/verify_adapter_conformance.mjs` | adapter-wide band-vocabulary sweep (extended) |
| `tools/verification/verify_release_claim_boundaries.mjs` | Godot claim tripwires (extended) |
| `.gitignore` | ignores Godot import cache and `.uid` sidecars |

`Hard Rule 9`: all of the above are standalone deterministic probes or manual-audit
evidence capture. No test runner was introduced or used.

---

## 9. Verdict

The Godot row moves from *"a source-level contract probe that is explicitly not a
live run"* to *"live headless in-engine execution, backed by a source-level contract
probe and numeric parity against a generated artifact"*. That is a real promotion,
and it is bounded: the engine executes and its assertions hold, the constants have
one authored source, and nothing about rendering, visual fidelity, or host gameplay
is claimed.

The release verdict is unchanged: **RC PROVISIONAL / NOT CERTIFIED**.
