# Godot Showcase on a LIVE FearServer Session — 2026-09-20

**Scope:** the Godot showcase now appraises against a running `FearServer`
instead of its offline fallback, and the in-engine evidence run exercises the
real appraisal pipeline end to end.

**Row qualifier after this record:**
`VERIFIED_CURRENT (HEADLESS_IN_ENGINE + LIVE_SERVER_PIPELINE + STATION_ADVISORY_CONTRACT + FALLBACK_NUMERIC_PARITY)`

**Directly rebuts:** the previous arrangement, where the showcase *only* had the
offline fallback. `ShowcaseAgent._physics_process` called
`evaluate_local(...)` unconditionally, and the client never registered agents
against the server, so every station advisory in the showcase was produced
locally — including in a session where a server was running.

---

## 1. What was built

### 1.1 A control plane in the Godot client

`FearAIClient` (both the showcase copy and the packaged adapter copy) gained an
explicit control plane, HTTP-only and serialized one request at a time:

| Call | Purpose |
|---|---|
| `ensure_registered(agent_id, traits, position)` | idempotent agent registration |
| `add_trauma_zone(x, y, z, intensity, radius, lifetime)` | author server-side dread memory |
| `reset_server(clear_agents)` | session hygiene between live runs |
| `control_plane_idle()`, `registered_count()`, `is_agent_registered()` | observability |
| signals `agent_registered`, `agent_registration_failed`, `trauma_zone_added` | host feedback |

`server_port` now honours `FEAR_AI_PORT`, matching the conformance runners, so a
live run is never pinned to a port another local service may hold.

Data-plane ticks still choose their own transport (`use_websocket`); only the
control plane is fixed to HTTP, because registration ordering has to be
unambiguous.

### 1.2 An appraisal-source router in the agent component

`FearAgent` (showcase copy) declares:

```
enum AppraisalSource { LOCAL_FALLBACK, LIVE_SERVER }
```

`appraise(threats, social_panic_level, trauma_presence, ticks)` is the single
routed entry point. In `LIVE_SERVER` mode it returns **before** any local
evaluation, translates perceived stimuli into a protocol observation, and hands
it to the client. Band, intent, urgency, vector, heartbeat **and raw fear** are
then applied from the server's response.

Live-mode semantics, stated rather than assumed:

- one server tick per physics frame — the fallback's `ticks` argument (N
  evaluations in one call) has no live equivalent;
- habituation, contagion, trauma dread and intent resolution are computed
  server-side, so the host must not also apply them;
- `social_panic_level` and `trauma_presence` are **local-fallback-only channels**.
  Re-injecting them would double-count what the server already derives from
  registered neighbours and its own trauma zones, so live mode records them in
  `live_ignored_local_channels` instead of silently dropping them.

### 1.3 Stations publish world and perception, not fear

`station_controller.gd` no longer calls `evaluate_local` at all. Every station
publishes *world* state — agent positions, threat nodes, `set_perceived_stimuli`
lists, panic flags — and the appraisal source decides. `configure_appraisal_source()`
switches every station agent, including ones created later.

Three station-local shortcuts are now explicitly local-mode-only, each with the
live equivalent next to it:

| Station | Local-mode shortcut | Live-mode equivalent |
|---|---|---|
| 3 Crowd panic | writes `current_raw_fear = 1.0` / band `PANIC` into the agitator | holds the agitator under an acute close-range stimulus for `S3_LIVE_SEED_TICKS` frames and lets the server integrate |
| 4 Leader rally | subtracts `0.02` from each soldier's fear | nothing — the server derives suppression from the calm high-leadership leader in proximity |
| 5 Trauma dread | writes `recommended_vector` away from the dread centre | nothing — the server owns the vector; the dread itself comes from a server trauma zone |

### 1.4 A live in-engine conformance suite

`tests/godot_project/run_showcase_live_conformance.gd` constructs the **real
`StationController`**, sets `LIVE_SERVER` before its `_ready()` builds the
station agents, performs a blocking handshake for a clear diagnostic on a wrong
port, and then drives the showcase across 27 assertions in six phases. It has a
watchdog so a script error cannot hang the evidence run, and it aborts with
`no live session, so no live evidence` rather than passing.

---

## 2. Results

Reproduce with one command: `npm run godot:evidence`

```
================================================================================
LIVE IN-ENGINE GODOT EVIDENCE: 4 / 4 suites exit 0
  PASS  run_showcase_conformance.gd          13 / 13 PASSED (100%)
  PASS  run_civilization_godot_conformance.gd 3 / 3 CHECKS PASSED (100%)
  PASS  run_canonical_conformance.gd          4 / 4 FIXTURES PASSED (100%)
  PASS  run_showcase_live_conformance.gd     27 / 27 ASSERTIONS PASSED (100%)
================================================================================
```

| Godot | Value |
|---|---|
| Version / binary | 4.6-stable, `C:\tools\02-Dev\godot\Godot_v4.6-stable_win64_console.exe` |
| Mode | `--headless` (no window, no frames presented) |
| FearServer | started by the runner on a port verified free, torn down afterwards |
| Showcase agents registered | 28 |

### Live suite assertions (27/27)

| Phase | Assertion | Measured |
|---|---|---|
| 0 | Showcase built every station agent in live mode | 28 agents |
| 0 | Every station agent appraises through the live server | all |
| 1 | Client registered every station agent before the data plane flowed | 28/28, 0 failures |
| 1 | No observation dropped for an unregistered agent | 0 |
| 2 | Scout escalated on a server-authored advisory | raw_fear 0.300, band ALERT |
| 2 | Scout did not evaluate the offline fallback | `local_evaluations = 0` |
| 2 | Server band is canonical vocabulary | ALERT |
| 2 | Agent still reports advisory-only movement | `advisory_only = true` |
| 3 | Server keeps a sound-only observation informational | peak 0.0000 |
| 3 | Fallback and server diverge on the same sound, quantified in-run | fallback 0.1200 vs server 0.0000 |
| 4 | Agitator reached PANIC under sustained live stimulus | peak 1.000 |
| 4 | Server contagion dragged neighbours above CALM | peaks 1.00 × 8 |
| 4 | Cascade computed by the server, not the fallback | local 0, server 512 |
| 5 | Host authored a trauma zone on the server | added 1 |
| 5 | Veteran caught dread from the server's trauma memory | raw_fear 0.286, band ALERT |
| 5 | Local-only dread channel recorded, not silently dropped | `["trauma_presence"]` |
| 6 | No agent anywhere used the offline fallback | `local_evaluations = 0` |
| 6 | Every showcase agent received a server advisory | 28/28 |
| 6 | Advisories in volume | ~2,000 applications |
| 6 | Registration count matches the agent count | 28/28 |

---

## 3. Defects this surfaced and fixed

None of these were visible before the live path was built. They are the reason
the live path was worth building rather than assuming.

**D-L1 — The live path did not exist.** `ShowcaseAgent._physics_process` called
`evaluate_local(...)` unconditionally on every frame, so even with a server
running and a `FearAIClient` autoload present, every advisory in the showcase
came from the local fallback. Fixed by routing through `appraise()`.

**D-L2 — The client never registered agents.** There was no `/api/v1/register`
call anywhere in `FearAIClient`. `RuntimeSimulation.queueObservation` gates on
`agents.has(id)` and `/api/v1/tick` does not auto-register (only the binary-wire
path does), so a JSON-transport client produced **no advisories at all** and
looked exactly like a server that returns nothing. This also made the packaged
transport-only adapter unusable over JSON. Fixed by the control plane.

**D-L3 — Control requests were dropped when the transport was busy.**
`HTTPRequest.request()` can return `ERR_BUSY` while a previous response settles.
The first implementation popped the queue *before* the request, so a busy
transport silently discarded registrations. Fixed by popping only after
`request()` succeeds; `verify_godot_live_pipeline.mjs` asserts that ordering.

**D-L4 — All 28 showcase agents shared the id `"agent"`.** `_init()` builds the
fear component before a station can assign `agent_name`, and
`_init_fear_component()` only synced identity/traits/source inside the
`if fear_component == null` branch. Every agent therefore registered as the
single server-side agent `agent` and received **each other's** advisories — 28
agents with identical fear, band, and intent. Fixed by syncing identity, traits
and appraisal source on every call; the probe asserts the sync happens *after*
`add_child`.

**D-L5 — Live state application omitted raw fear.** `_on_state_received` read
band, intent, urgency, heartbeat and vector from the server response but not
`affective_state.raw_fear`, so in live mode the host's fear value stayed pinned
at `0.0` while the band moved. Fixed.

**D-L6 — Stations wrote fear state that the server owned.** Stations 3, 4 and 5
wrote `current_raw_fear` / `current_fear_band` / `recommended_vector` directly.
In live mode that is the host overriding the affect model it asked for. Fixed
with explicit local-mode guards and live equivalents (see §1.3).

**D-L7 — Demo stations 1 and 4 could never perceive their own threats.**
`FearAgent.sight_range` defaults to **20 units** and the showcase scenes are laid
out at a **~350-unit** scale, so the area scan never fired: station 1's predator
closed to 40 units and station 4's platoon threat sat 50–120 units away, both
outside the radius. Those interactive stations were inert. Fixed by publishing
host-authored perception measured from real positions — the same pattern
stations 8 and 9 already used — which also avoids a large global sight range
bleeding perception across adjacent station boxes.

---

## 4. Divergence measured, not hidden: sound-only stimuli

The showcase's station-2 stimulus (a `SOUND` entry, intensity 0.85, distance 30)
produces **fear 0.12 in the fallback** and **fear 0.00 on the server**. This is a
real behavioural difference, and the live suite measures both sides in the same
run:

- The server gates a sound-only tick on `fearInput > 0.15` and multiplies
  perceived threat by the DDA pacing intensity, which sits at **0.2** in the
  `EXPOSITION` phase. The strongest possible sound — habituated 1.0 × attenuation
  1.0 × the server's 0.6 sound weight — still lands far below that gate while
  pacing is low. Sounds are *informational* at low pacing unless the agent is
  already frightened by a threat, contagion, or dread.
- The fallback has neither the pacing filter nor the 0.6 sound weight, and its
  "active" gate is satisfied by the mere presence of a stimulus, so it builds
  fear from a sound the server treats as ambient.

Consequences, stated plainly:

- `FALLBACK_NUMERIC_PARITY` covers the band/hysteresis/panic-lock machinery,
  the habituation curve, and intent urgency/gates — **not** the raw-fear
  integration stack. The fallback is a calibrated approximation of
  `AffectiveAgent`'s full modulation stack, not a bit-exact mirror.
- A host that needs the fallback to match the server's fear values must run the
  server. The fallback exists so the demo runs without one.

---

## 5. What this record does NOT prove

- **No rendering, visual-fidelity, or frame-presentation claim.** Every suite
  runs `--headless`. Nothing here asserts that a station *looks* right.
- **Not an Editor claim.** This is the standalone binary.
- **Not host-game certification.** The showcase is a test surface, not a game.
- **Not server-semantics certification.** The live suite proves that the
  advisories the showcase acts on came from the server, that the host did not
  silently substitute its own fallback, and that the server produced escalation,
  contagion and dread. It does not re-derive the server's math; that is the
  parity and cross-tree probes' job.
- **Not an independent oracle for station semantics.** The live run drives the
  showcase's own stations. Independence comes from
  `verify_godot_stations.mjs` (canonical JS core) and
  `verify_godot_fallback_parity.mjs` (numeric parity against the generated
  module).
- **Station 2's sound channel is covered as a measured divergence**, not as a
  damping assertion. The server's `+0.05`-per-tick integration floor and its
  pacing multiplier make a clean live habituation-vs-fear comparison
  unobservable through that channel; server-side habituation math is covered by
  the parity probe and the canonical fixtures.
- **Registration is serialized**, one agent per control round trip, because
  `HTTPRequest` carries one request at a time. A 28-agent showcase needs a few
  hundred physics frames to register. A batch-register endpoint would remove
  that cost; it does not exist yet.

---

## 6. Reproduce

```bash
npm run verify:godot-live-pipeline     # 50 wiring assertions, no Godot needed
npm run verify:godot-stations          # 169 assertions, no Godot needed
npm run verify:godot-fallback-parity   # 37 assertions, no Godot needed

npm run godot:evidence                 # live Godot 4.6, headless, 4 suites
#   includes the live showcase session against a server the runner starts itself
```

To drive the live path by hand: start `node packages/runtime/bin/fear-ai-server.js
--port <free port>`, then run the project with `FEAR_AI_PORT=<free port>` set.

---

## 7. Artifact inventory

| Artifact | Kind |
|---|---|
| `tests/godot_project/run_showcase_live_conformance.gd` | live in-engine suite (new) |
| `tools/verification/verify_godot_live_pipeline.mjs` | wiring probe, 50 assertions (new) |
| `tests/godot_project/addons/fear_ai/fear_ai_client.gd` | control plane (modified) |
| `packages/adapters/godot/fear_ai_client.gd` | control plane (modified) |
| `tests/godot_project/addons/fear_ai/fear_agent.gd` | appraisal router (modified) |
| `packages/adapters/godot/fear_agent.gd` | registers before reporting (modified) |
| `tests/godot_project/showcase_agent.gd` | routes + perception publishing (modified) |
| `tests/godot_project/station_controller.gd` | mode-aware stations (modified) |
| `tools/run-godot-inengine-evidence.mjs` | live suite wired in (modified) |
| `tools/verification/verify_godot_stations.mjs` | D4 assertion updated (modified) |

`Hard Rule 9`: standalone deterministic probes and manual-audit evidence
capture. No test runner was introduced or used.

---

## 8. Verdict

The Godot showcase now runs on the real appraisal pipeline: agents register,
observations cross the wire, `FearCore`/`IntentResolver`/contagion/trauma run
server-side, and the advisory the host acts on is server-authored. The host
retains the motor, and the fallback remains available for a serverless demo.

The release verdict is unchanged: **RC PROVISIONAL / NOT CERTIFIED**.
