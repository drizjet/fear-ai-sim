# Godot Showcase Station-Level Advisory Verification — 2026-09-20

**Artifact**: `tools/verification/verify_godot_stations.mjs` (`npm run verify:godot-stations`)
**Result**: 142 assertions PASS, 6 documented divergences pinned as tripwires *(at the time of this record)*
**Superseded in part**: all six divergences (§6) were subsequently **resolved** on 2026-09-20 by bringing the showcase's offline fallback onto the canonical contract — see `evidence/godot_divergence_resolution_2026-09-20.md`. The probe now runs **163 assertions** and asserts the resolutions instead of pinning the divergences.
**Status promoted**: `Godot 4.6 Multi-Station Showcase` — `PARTIAL` → `VERIFIED_CURRENT (STATION_ADVISORY_CONTRACT)`
**Method**: standalone deterministic Node probe. No test runner (Hard Rule 9). No Godot binary required.

---

## 1. Why this probe exists

The ledger previously held the Godot showcase row at `PARTIAL` for one reason:
"the current proof registry does not independently assert every visual station's
behavior."

The only existing station check was `tests/godot_project/run_showcase_conformance.gd`,
which has two structural limitations:

1. It requires a live Godot binary, so it cannot run in the ordinary audit sweep.
2. It evaluates every station against the showcase's **own local fallback
   implementation** (`tests/godot_project/addons/fear_ai/fear_agent.gd`), so it
   shares that implementation's assumptions and cannot independently assert
   behavior against the canonical model.

This probe closes that gap without Godot. It parses the station table and the
per-station stimulus constants out of the showcase source, then reproduces each
station's advisory property on the **canonical JS core** (`AffectiveAgent`,
`FearCore`, `HabituationSystem`, `EncounterConsequenceEngine`) and against the
**live** `FearServer`.

## 2. What is derived from source (never hardcoded)

- The ten-entry `STATIONS` table (ids, names, positions) parsed from
  `station_controller.gd`, then asserted against the recorded names, so a
  rename, addition, or removal fails the probe instead of silently
  invalidating the documentation.
- Each station's declared personality tuple, parsed from its own
  `_create_agent(...)` calls in `_init_station_N`.
- Each station's declared thresholds and couplings (habituation curve,
  contagion `0.85`, rally radius `220.0` and step `0.02`, dread radius `90.0`
  and gradient, reroute threshold `0.70`, stance ladder `220/140/70` with
  tension `0.5`, escort suppression `0.90`/`0.35`, rumor factor `1.25`, chain
  threshold `0.60`), each asserted to still exist in the source.

A trait-mapping note: the showcase's `fear_baseline` fills the same resting-weight
role as the canonical `fear` trait, so it maps there; `neuroticism`, `resilience`,
and `leadership` map directly.

## 3. Per-station assertions (Part B)

| Station | Advisory property asserted on the canonical core |
|---|---|
| 1 Threat Appraisal | Fear crosses the escape threshold (>0.6) within 15 sustained frames; band escalates above CALM/ALERT; intent is avoiding; the vector points away from the threat |
| 2 Sound Habituation | Repeated identical stimulus damps monotonically and burst 5 < burst 1 |
| 3 Crowd Panic Cascade | Contagion coupling raises peer fear above the cascade threshold (>=0.35) and is monotone in group panic |
| 4 Leader Rally | Leader presence suppresses follower fear under threat |
| 5 Trauma Zone | Dread clears the re-activation threshold (>0.50); urgency clears a meaningful floor and tracks proximity; re-activation is monotone in proximity |
| 6 Caravan Reroute | The declared reroute rule resolves RIVER_DETOUR at 0.85 and HIGHLAND_PASS at 0.05; the canonical ambush produces a positive corridor danger signal |
| 7 Faction Stance | The declared ladder resolves UNAWARE / OBSERVE / WARN / POSTURE / SKIRMISH / NEGOTIATE correctly, including tension sensitivity at mid range |
| 8 Trade & Escorts | Escorts suppress merchant fear; regional mass is conserved at 300g |
| 9 Fog-of-War | Informed outpost exceeds the inform threshold (>0.60) while the fogged capital stays decoupled (<=0.05) and never reaches the informed band; the courier rumor mobilizes the capital above fog level; the rumor intensity clamps at 1.0 |

## 4. Station 10 chain contract (Part C)

- Structural: `apply_station_10_chain` exists; it reads `links.ROUTE_DANGER.danger`;
  it flags link-down **before** every refusal (asserted count-for-count, not
  spot-checked); and it holds last state while the link is down rather than
  inventing advisories.
- Live: a loopback `FearServer` `POST /api/v1/advisory/chain` returns 200
  `ADVISORY_CHAIN_RESPONSE` with `unbroken: true`, every canonical `CHAIN_LINKS`
  entry present, a bounded `ROUTE_DANGER.danger` in `(0, 1]`, and a boolean
  `checks` map — i.e. the JSON shape the station parses is the shape the server
  emits. A non-integer seed is rejected with 400.

## 5. Advisory-only boundary (Part D)

- The **packaged** adapter (`packages/adapters/godot/fear_agent.gd`) takes its
  band and intent from server state and owns no local evaluator: it is a
  transport component.
- The **showcase host** script owns the motor (`move_and_slide()`), applies the
  advisory vector itself, and does not silently attach the opt-in
  `FearSteering2D` motor.
- The fear component performs no host physics mutation (no `move_and_slide`, no
  `velocity =`, no `global_position =`).

## 6. Pinned divergences (tripwires, not passes) — **RESOLVED 2026-09-20**

> **Superseded.** The six divergences below were recorded, asserted exactly, and
> **not** presented as verified compliance at the time of this record. They were
> then all resolved by bringing the showcase's offline fallback onto the
> canonical contract (2026-09-20). The probe, ledger §15, `docs/SYSTEM_MAP.md`,
> the RC dossier, and the claim audit were updated together, exactly as this
> section required. The divergence table is retained as the history of what was
> wrong; the authoritative current state is
> `evidence/godot_divergence_resolution_2026-09-20.md`.

| Id | Divergence |
|---|---|
| **D1** | The showcase's offline fallback emits non-canonical vocabulary: band `FEAR` where the canonical set uses `ANXIOUS`; intent `INVESTIGATE` where the canonical set uses `INVESTIGATE_SOUND`; and `urgency` aliased to raw fear instead of resolved by `IntentResolver`. `FEAR` also appears in no canonical band set and in no `fear_types.gd` enum entry. |
| **D2** | Habituation magnitude: the showcase damps to 0.128 by burst 4 (its `H(n)` curve), the canonical system to 0.687 (max habituation 0.60 with a novelty ramp). Both are monotone; the magnitudes differ. |
| **D3** | The fallback snaps to a **static per-frame fear target** (`if step >= 1.0`), while the canonical core integrates sustained exposure with a per-tick ramp. Station thresholds such as station 9's `>=0.25` and station 2's `<=0.25` are therefore showcase-local magnitudes; this probe asserts direction and ordering rather than those constants. |
| **D4** | Two divergent `fear_agent.gd` copies exist: the packaged server-driven adapter and the showcase-local one carrying `evaluate_local` and the `FEAR`/`INVESTIGATE` vocabulary. The packaged path is canonical and the showcase path is offline-only, but the duplication is a drift hazard. |
| **D5** | `run_showcase_conformance.gd` declares 13 suites and a header claiming "7 behavioral stations" against the controller's 10 stations (9 behavioral + the chain monitor). The Godot-side runner is stale relative to the controller and cannot run without a Godot binary. |
| **D6** | The station-6 demo reroute threshold (0.70) is **above** the danger the canonical valley chain assigns to its own ambush (0.50). A host feeding real `POST /api/v1/advisory/chain` output into that rule would keep the Highland Pass. The 0.70 trigger is a showcase-local demo value, not a value calibrated to the canonical chain scale. |

## 7. Defect found and repaired

The probe's UI-dispatch coverage check (derived from the station table) surfaced a
real defect: `main.gd`'s `reset_current_station()` `match` block covered stations
1, 2, 3, 4, 5, 7, 8, 9, 10 but **not 6**, even though `station_controller.gd`
declares a working `reset_station_6()`. The caravan station's trigger worked while
its reset was unreachable from the showcase UI.

Repaired with a single dispatch line (`6: station_controller.reset_station_6()`)
in the showcase-only test project. The defect is the reason the dispatch coverage
assertion exists rather than being a spot check; no runtime or middleware behavior
changed.

## 8. Scope boundary

This probe asserts station advisory **contracts and boundaries** only:

- It is **not** a live Godot run. Rendering, in-engine frames, frame timing, and
  visual fidelity are not asserted.
- It does **not** certify the engine, the host game, any external integration, or
  the showcase's own tuning values.
- The Godot-side runner remains the in-engine check and still requires a Godot
  binary.

The promoted row's qualifier (`STATION_ADVISORY_CONTRACT`) exists to carry exactly
that boundary; the overall release verdict is unchanged at
`PROVISIONAL / NOT CERTIFIED`.
