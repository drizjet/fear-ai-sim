# Causal event schema

This is the Lane B development schema for the canonical closed-world reducer. Frozen supervisor acceptance remains pending.

Every event in `world.events` has:

- `eventId`: a unique stable string within the world ledger.
- `parentEventIds`: an array of zero or more IDs for direct causal parents.
- `type`: the event kind.
- `tick`: the reducer tick when applicable.

Roots legitimately have an empty parent list. A parent must already exist in the same ledger and must precede its child; array adjacency alone does not establish causality.

The protected production chain is:

1. A prior `BANDIT_ATTACK` consequence is visible through `canObserve`.
2. `OBSERVATION` names that consequence as its parent.
3. `BELIEF_UPDATE` names the observation.
4. `MERCHANT_ROUTE_DECISION` names every belief update consumed on that decision tick.
5. `TRIP_COMMITMENT` names the route decision and carries a persistent action ID.
6. `ROUTE_EXPOSURE` names the trip commitment.
7. `CANDIDATE_ENCOUNTER` names the route exposures that made a local collision plausible.
8. `ENCOUNTER` names the candidate event.
9. `BANDIT_ATTACK` names the encounter whose apply function changed cargo.
10. `FACTION_REACTION` names the attack and records the resulting memory/grievance state.

Consequences emitted after the reducer's initial faction pass are consumed immediately and exactly once through `processedFactionAttackEventIds`. On the next tick, witnesses may observe the same consequence for information flow without applying its faction-memory effect again.

`tests/causal-chain.test.js` verifies every required edge, global ID uniqueness, parent existence, parent-before-child order, and the material memory change. Clearing the belief-to-decision parents at both the producer and integration boundary makes the detector fail at that edge.
