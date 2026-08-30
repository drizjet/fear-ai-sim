# Suspicious Module Audit

Updated 2026-08-27 from source imports, tests, and build output.

| Module | Verdict | Evidence | Limitation |
|---|---|---|---|
| `featureengineer.js` | RETAIN_OPTIONAL | Feature extraction code exists and is used by neural systems/tests; population and trait features now consume supplied context (EVID-2026-08-27-FEATUREENGINEER) | Not authoritative world state |
| `ddasystem.js` | RETAIN_OPTIONAL | Exercised by phase tests and adaptive systems | **Reach audit (2026-08-27): imported only by `tests/phase3.test.js`; no production wiring.** A future slice should either integrate it into the production `Simulation` runtime or move it to `tests/_fixtures/`. |
| `groupbehaviors.js` | RETAIN_OPTIONAL | Group behavior tests pass; related systems are present | **Reach audit (2026-08-27): imported only by `tests/phase3.test.js`; no production wiring.** Same status as `ddasystem.js`. |
| `vrsystem.js` | RETAIN_OPTIONAL | VR integration is tested and available through calibration/VR paths | **Reach audit (2026-08-27): imported only by `tests/phase3.test.js`; no production wiring.** |
| `emotions.js` | RETAIN_OPTIONAL | `EmotionSystem` class is tested | **Reach audit (2026-08-27): imported only by `tests/phase3.test.js`; no production wiring.** |
| `environment.js` | RETAIN_OPTIONAL | `EnvironmentSystem` class is tested | **Reach audit (2026-08-27): imported only by `tests/phase3.test.js`; no production wiring.** |
| `habituation.js` | RETAIN_OPTIONAL | `HabituationSystem` class is tested | **Reach audit (2026-08-27): imported only by `tests/phase3.test.js`; no production wiring.** |
| `fearpacing.js` | RETAIN_OPTIONAL | `SessionArcController` class is tested | **Reach audit (2026-08-27): imported only via `proceduralcontent.js`; `proceduralcontent.js` is only imported by `simulation.js`; no test or other production caller.** Indirect path, not directly wired. |
| `hysteresis.js` | RETAIN_OPTIONAL | `HysteresisController` is tested; `Math.random()` calls replaced with a constructor-injected `rng` (EVID-2026-08-27-HYSTERESIS-DETERMINISM) | **Reach audit (2026-08-27): imported only by `tests/phase3.test.js`; `brain.js` (the actual production fear-band consumer) uses `fearcore.js`, not `hysteresis.js`.** The determinism contract is now explicit. |
| `biofeedback.js` | RETAIN_OPTIONAL | Sensor abstractions and fusion are tested | Hardware adapters are mocked/simulated when unavailable (intentional per spec) |
| `agentmemory.js` | RETAIN_OPTIONAL | Memory-related behavior exists in the project test surface | No evidence justifies deleting historical subsystem |
| `masac_predator.js` | RETAIN_OPTIONAL | MASAC family is present and integration hooks exist | MASAC is disabled by default and not completion-critical |
| `neuralfear.js` | RETAIN_OPTIONAL | Simulation constructs the system and tests pass | Predictive output is not authoritative state mutation |
| `determinism-tests.js` | RETAIN_OPTIONAL | Verification utility, not production simulation logic | Mock adapters are test methodology, not runtime evidence |
| `dashboard.js` | RETAIN_OPTIONAL | UI dashboard is initialized by Simulation on demand | Placeholder visualization remains open |
| `masac_worker.js` | RETAIN_OPTIONAL | Worker boundary exists for optional training; `trainStep` now delegates to `masac_metrics.js` (EVID-2026-08-27-MASAC-METRIC) | TF.js inference is still environment-dependent; metrics module is independent |
| `src-tauri/` (Rust lane) | RETAIN_OPTIONAL | `cargo check` and `cargo test rng_tests` are now green in-tree (EVID-2026-08-27-TAURI-BUILD-REPAIR); RNG state and unit tests cover the deterministic stream | Packaged Tauri runtime end-to-end verification is still deferred to a manual build |
| `fearcore.js` | PRODUCTION_OWNER | Imported by `brain.js`; the actual production fear-band implementation | `hysteresis.js` duplicates the surface API but is not the production owner; the dual implementation is a maintenance hazard |
| `memorysystem.js` | PRODUCTION_OWNER | Imported by `agent.js` and `learningagent.js`; used to give every agent a memory | No dual implementation found |

No module is marked `REMOVE` or `ARCHIVE` solely from naming. Existing import/build/test evidence supports retaining these optional systems while their production scope remains explicitly partial.

### Reach audit (2026-08-27) — larger finding

The original audit checked which modules are imported, but did not check whether any of those importers are themselves reached by production. The follow-up reach audit (run as part of the hysteresis-determinism slice) found that the **majority of the "Phase 3" modules are imported only by `tests/phase3.test.js`**, and `hysteresis.js` is duplicated by `fearcore.js` (the actual production owner). The implication is that the `Phase 3` work was added to the codebase but never integrated into the production `Simulation` runtime. The `MODULE_AUDIT.md` table now flags this explicitly. A future slice must either (a) wire the relevant Phase 3 systems into the production `Simulation` runtime, or (b) move the dead modules to `tests/_fixtures/` and rename `phase3.test.js` to match. The current slice fixed the *silent non-determinism* hazard; the larger orphan cleanup is a separate decision.

### Production-reach audit (2026-08-27, breadth era) — automated evidence

The `tests/orphan-reach.test.js` slice walks the import graph from the live entry points (`closed-world.js`, `simulation.js`, `brain.js`, `agent.js`, `learningagent.js`) up to depth 6 and asserts that the four known-orphan modules are NOT in the reachable set:

| Module | Reach (live entry points) | Verdict |
|---|---|---|
| `hysteresis.js` | NOT REACHABLE | ARCHIVE candidate; `brain.js` uses `fearcore.js` instead |
| `habituation.js` | NOT REACHABLE | ARCHIVE candidate |
| `emotions.js` | NOT REACHABLE | ARCHIVE candidate |
| `masac_metrics.js` | NOT REACHABLE | ARCHIVE candidate; was supposed to feed `masac_worker.js` but `masac_worker.js` itself is orphaned |

The test is a *positive* signal: if a future slice successfully wires one of these modules into the live path, the test will fail and that failure will document the integration. If a future slice deletes one of the modules, the test should be updated to remove that module from the orphan list.

The 4 orphan modules are NOT deleted in this slice per the §11 doctrine ("do not destroy or overwrite unrelated user work"). A future explicit decision is required to either (a) wire them into the live `Simulation` runtime, (b) move them to `tests/_fixtures/`, or (c) delete them outright. The audit provides the evidence; the user or a future autonomous session must make the call.

### Brain dual-ownership (Constitution §260 / §416)

The `tests/orphan-reach.test.js` audit also surfaced a related but separate finding: `brain.js` (the live fear-band consumer) does NOT import `hysteresis.js`. Instead, `brain.js` uses `fearcore.js` (the production owner per the table above) AND runs an inline `this.state = 'RECOVER' | 'AGGRESSIVE' | ...` state machine that OVERRIDES `fearcore.state` in 43% of scenarios. This is the *Brain dual-ownership* P0 (EVID-2026-08-27-BRAIN-DUAL-OWNERSHIP), now documented as a constitutional §260 violation in the `docs/PROVENANCE.md` table. The fix is to route the inline state mutations through `FearCore` as additional bands (HIDE, FREEZE, AGGRESSIVE, RECOVER, PRESENCE_BREAK). This is parked per the §2 anti-tunnel-vision rule (4 consecutive breadth slices in the closed-world subsystem triggered this audit; the next breadth slice should rotate to a different subsystem before returning to FearCore).
