# V8 audit — causal contracts (candidate 79f287c)

## Truth → decision map (Auditor 3, grep-verified by manager)

- LEGAL: attack/relocation event → canObserve (selectedRoute==roadId,
  closed-world.js:3709) → BeliefStore → BELIEF_UPDATE → routeBeliefs →
  chooseMerchantRouteDecision (canonical-trade-system.js:173).
- LEAK F1 (P0): tickMerchant reads bandit.roadId directly
  (canonical-trade-system.js:377-392), accuracy coin flip only, no
  canObserve. Distant roads learned with p=0.5.
- LEAK F2 (P0): tickBandit reads merchant.selectedRoute||lastRoute
  (canonical-trade-system.js:617), accuracy coin flip only.
- LEGAL: roaming beliefs synthesized (closed-world.js:3564),
  chooseRoamingDestination reads group.beliefs (roaming.js:667);
  migration safety reads routeBeliefs with neutral priors.
- EXECUTION (legal): resolveBanditAttack compares true positions to
  resolve outcomes — must not feed beliefs.
- FIDELITY F3 (P1): legal gate, oracle-exact value
  (closed-world.js:1834-1836 copies actualDanger verbatim).
- ALIASING F4 (P1): BeliefStore hardened; routeBeliefs ranked outputs
  alias live merchant state.

## Material conservation (Auditor 4, MAT-001 confirmed by read)

- Identity: supply(t+1)-supply(t) = (produced-overflow) +
  delivered_stored - consumed - spoiled. Trip path books all terms
  (closed-world.js:611-618, 2355-2360).
- HOLE MAT-001 (P1): bandit-path delivery (1062-1072) books theft but
  never merges marketResult stored/overflow → capacity overflow
  vanishes from the books.
- Population: justice path conserves exactly (2877-2879/2904-2912);
  encounter refugee-group creates +1..3 unbooked; demography sinks
  emigrants to 0-pop destinations (MAT-005, P1).
- Trip lifecycle: single terminal state holds in default (APPLIED+prune);
  missing-market strands ARRIVED forever (MAT-004, P2, malformed-load
  only); in-flight cargo invulnerable by design (audit-only exposure).
- Interception: BANDIT_ATTACK-only recovery (MAT-002, P2 asymmetry);
  no exactly-once idempotency across patrols (MAT-003, P2 creation).

## Event DAG

- Allocator (allocateWorldEventId + appendWorldEvent) verified for
  storm/law/justice/stance/intrusion/migration chains.
- HOLE F6 (P0): CONVOY_AMBUSH (:2273) + MERCHANT_RESPAWN (:2299) bare
  pushes in the live tick path — standing orphan stream.
- HOLE F7 (P1): ecology SEASON_CHANGE (template id), encounters ENCOUNTER
  (+parent rewrite on undefined id), treaty TREATY_* (4 sites), one-shot
  helpers (:940-1199).

## Persistence

- Round-trip verified: storm, stormSchedule.nextRoadIndex, _priceMemory,
  executedActions, migrationCooldowns, wildlifeGroups, reputation
  ledgers. Gap: world.beliefs prototype (F8, P2 dormant).
- RNG clean except roaming factory default (F9, P2 latent).
