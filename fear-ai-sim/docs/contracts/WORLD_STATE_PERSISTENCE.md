# Closed-world persistence boundary

This document classifies the production state observed on a canonical world after a reducer tick. It describes the development implementation; it is not frozen supervisor acceptance.

## Serialized authoritative state

`saveWorld` recursively serializes every enumerable data property below. Maps and Sets use explicit marker objects and are reconstructed by `loadWorld`.

| State group | Serialized fields |
| --- | --- |
| Time and environment | `currentTick`, `season` |
| Geography and economy | `towns` (including population, ownership, production/consumption schema, and `Market` data), `routes`, `marketState`, `marketFlows` |
| Actors | `factions`, `bandits`, `merchants`, `civilians`, `guards`, `vampires`, `wildlife` and all enumerable actor data |
| Relationships and institutions | `relationships`, faction-local relationship maps, `treaties`, `justiceState`, `interactionEngine.cooldown`, `interactionEngine.lastAction` |
| Historical/audit state | `events`, `tickHistory`, `reports`, `convoy`, `convoys`, `consumedAttackIds`, `processedFactionAttackEventIds`, `migrationCooldowns` |
| Pending protocol | `nextActionId`, `nextEventId`, `rngStreams`, `pendingTrips`, `scheduledConsequences`, `routeCommitments`, `patrolAssignments`, `rumorsInTransit`, `migrationJourneys` |
| Belief and memory | world/merchant belief stores, faction fear/grievance/memory, bandit beliefs/observations/traffic belief, directional relationship memory |

Pending protocol records carry their action IDs, event IDs, `parentEventIds`, status, due/progress fields, cargo, route, destination, and assignment references. The `pendingEffects` RNG stream is serialized as `{ algorithm, state, draws }`; no pending stochastic decision relies on a closure.

The reducer also maintains a non-enumerable incremental event-ledger index keyed by event type and tick. It is derived cache state, intentionally excluded from `saveWorld`, and rebuilt by `loadWorld` or `forkWorld`; direct legacy pushes are synchronized before indexed reads so the authoritative persisted representation remains `world.events`.

## Derived on load

These values are behaviorally required but are reconstructed from serialized data rather than treated as independent authority:

- Class prototypes for `FactionDecisionModel`, `Market`, `BeliefStore`, `FactionRelationshipVector`, and `InteractionEngine`.
- Shared relationship aliases: each faction-local relationship entry is relinked to the canonical object in `world.relationships` after JSON removes object identity.
- `JusticeSystem`, which has methods but no persistent instance state.
- Function-backed roaming helpers such as `bandit.rng`. The canonical reducer derives its ordinary per-tick random helper from stable IDs/ticks; pending work must instead use `world.rngStreams`.
- The derived event-ledger index and its cursor. They are performance caches, not authoritative state, and are reconstructed from the serialized event array.

## Ephemeral inputs and calculations

The following are deliberately outside a checkpoint:

- Reducer call options such as `perceivedDanger`, decay rates, `relationshipGate`, `pinBanditRoadId`, and an externally supplied `encounterRng` function.
- Local candidate sets, scores, quotes, temporary observations, and other values recomputed within one reducer call.
- JavaScript functions and closures. JSON cannot preserve closure state, so a function must never own a future obligation. A future stochastic obligation belongs in `world.rngStreams` as numeric state.

## Verification contract

`tests/save-load-pending.test.js` checkpoints a world while cargo, a scheduled delivery, route and patrol commitments, a rumor, a migration journey, a treaty, a cooldown, counters, event parentage, and an RNG stream are live. It then compares uninterrupted continuation with save-load continuation byte-for-byte and proves the scheduled cargo reaches the market. Temporarily omitting `scheduledConsequences` from serialization makes that detector fail.
