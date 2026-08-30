# PARTIAL TRESPASS OBSERVATION BUG

EVID-2026-08-28-PARTIAL-TRESPASS-OBSERVATION-BUG

## Classification

`SPECIFICATION_DEFECT` (audit debt #3): the model was missing a
per-perspective ownership of the territorial-pressure component. The
"pressure" was a single pair-symmetric number, so when a faction
observed an intrusion and another faction observed a different
intrusion, the vector collapsed them into the same scalar — losing
the audit's P1 #1 "A → B ≠ B → A" contract for territory.

## Minimal reproduction (pre-slice)

```js
import { FactionRelationshipVector } from './factionrelationship.js';

const a2b = new FactionRelationshipVector({ id: 'a::b' });
// A observes an armed intrusion on its own territory.
a2b.recordTrespass({ severity: 0.4, fromFactionId: 'b', tick: 10 });
// B observes an intrusion on its own territory by A.
a2b.recordTrespass({ severity: 0.2, fromFactionId: 'a', tick: 11 });

// Expected (audit debt #3): A's view of the relationship
// (territorial pressure on A from B's intrusions) is 0.4, B's
// view is 0.2, and they are INDEPENDENT.
console.log(a2b.territorialPressure);
// Pre-slice: 0.24 (mean of 0.4 and 0.2) — A→B and B→A
// have been collapsed.
```

## Why this is a defect

The audit's P1 #1 contract states: "A → B and B → A must be
independent." Before this slice, trust was already directional
(`directedTrust`), but the three pressure components (territorial,
grievance, fear) were still pair-symmetric. The `pressureFrom` read
used the directed trust for the damping term but the *components*
themselves were shared. A faction that observed a 0.4-severity
intrusion by B and B that observed a 0.2-severity intrusion by A
would have the same territorial pressure — 0.3 — even though the
two perspectives described completely different worlds.

The downstream consequence: the live `chooseStance` call site at
`closed-world.js:499-506` was using a single symmetric mean, so the
directional stance decisions were partially symmetric too. The
"north sees south as threatening while south does not see north the
same way" requirement was technically possible at the *stance*
level (via `_stanceFrom`) but the *pressure* inputs were not.

## Resolution (EVID-2026-08-28-TERRITORY-VERTICAL-SLICE)

- `FactionRelationshipVector` gained three new directed maps
  (`directedTerritorialPressure`, `directedGrievance`, `directedFear`).
- New accessors `getXFrom` / `setXFrom` mirror the `getTrustFrom` /
  `setTrustFrom` pattern.
- New writer `recordIntrusion({ observerFactionId, fromFactionId,
  severity, groupSize, armedStatus, scarceResourceOccupancy,
  priorIncidents, duration, location, tick })` scales severity by
  context and writes to the OBSERVER's perspective only.
- The legacy `territorialPressure` / `grievance` / `fear` fields
  are now derived getters (mean across perspectives) with throwing
  setters (mirror the `trust` setter at lines 156-162).
- `pressureFrom(fromFactionId)` now uses the directed components.
- The live `chooseStance` call site is fully directional.

## Test evidence

13 new tests in `tests/territory-vertical-slice.test.js`:

1. `town.claimedRadius` is authoritative
2. `recordIntrusion` is directional (debt #3 acceptance test)
3. `canObserveTerritory` is the legal observation path
4. Contextual severity scaling (50 armed vs 1 traveler)
5. `chooseStance` consumes `previousIncidentsCount`
6. Live invasion-gate consequence: 5 prior incidents → at least WATCHFUL
7. Live `INTRUSION` event emission
8. Metamorphic: increase armed intruder count → pressure does not decrease
9. Metamorphic: move intruder farther → fewer or no `INTRUSION` events
10. Treaty passage hook is wired into the territory pass
11. `directedTerritorialPressure` survives save/load round-trip
12. Legacy `territorialPressure` getter returns the mean; setter throws
13. Determinism: same seed → same `INTRUSION` sequence

## Why this is in the failure corpus

The defect was real: the directional contract was partially honored
at the stance level but violated at the pressure level. The audit
flagged it as debt #3 in `AUDIT_2026-08-28.md`. The failure
reproduction above is preserved so that any future regression in
the directional pressure contract can be detected immediately.
