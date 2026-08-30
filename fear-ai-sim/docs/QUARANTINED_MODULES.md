# Quarantined Modules Manifest

This is the **quarantine manifest** for Fear AI. The audit
called out that `tests/orphan-reach.test.js` was treating
"known technical debt still exists" as the desired green
state — that makes a healthy future refactor red, which is
exactly what architecture tests should avoid.

The fix is a **declarative manifest**: any module listed here
is *intentionally* not in the production reach graph. The
production-reach test asserts the *negative* invariant
(production does not import these), and the manifest is the
*positive* intent (these are quarantined for a reason).

To rehabilitate a module:

1. Remove it from the `QUARANTINED` list below.
2. Add the module to a live entry point's import graph.
3. Add an integration test that exercises the module's
   production path.
4. Update `docs/MODULE_AUDIT.md` with the integration status.

## QUARANTINED

| Module | Reason for quarantine | Owner | Review date |
|---|---|---|---|
| `hysteresis.js` | Phase-3 fear-band controller, superseded by `fearcore.js` (the production owner per the §260 single-owner rule). Kept as a test fixture for `tests/phase3.test.js`. | — | — |
| `habituation.js` | Phase-3 habituation system, integrated into `Brain.calculateHabituatedFear()` in `brain.js`. The standalone class is no longer the production owner. | — | — |
| `emotions.js` | Phase-3 `EmotionSystem` class. The production agent uses an inline `emotions` object (`agent.emotions`), not the `EmotionSystem` class. | — | — |
| `masac_metrics.js` | Intended to be imported by `masac_worker.js`, but `masac_worker.js` is itself quarantined. | — | — |
| `masac_worker.js` | Web Worker for optional MASAC training. No production caller imports it. MASAC is disabled by default (per `MODULE_AUDIT.md`). | — | — |
| `featureengineer.js` | Feature extraction for neural systems. Imported by `feardatagen.js` (which is the data-generator test fixture). Not in the live runtime path. | — | — |

## How to use

Production code MUST NOT import any module listed in
`QUARANTINED`. The `tests/quarantine.test.js` file walks the
production import graph and asserts that none of the listed
modules are reachable. A failure of this test means a
quarantined module has been *unintentionally* wired into
production — that is a real bug to investigate.

To *intentionally* un-quarantine a module (i.e. make it
production-integrated), follow the four steps above. The
manifest is the source of truth for the quarantine status;
`MODULE_AUDIT.md` records the historical reasoning.
