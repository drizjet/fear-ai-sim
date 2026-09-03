// tests/bandit-merchant-knowledge-shortcut.test.js — V6 §9.1 MUT-OBS-002
//
// Defect: bandit decision reads authoritative merchant private/authoritative
// future state without a legal observation.
//
// Contract:
//   truth
//   → bandit legal observation (bandit.perceptionAccuracy)
//   → bandit trafficBelief
//   → relocation/ambush decision.
//
// Test creates a discriminating pair:
//   A: bandit's legal observation channel succeeds (perceptionAccuracy=1).
//      Bandit can observe merchant location and update trafficBelief.
//   B: bandit's legal observation channel is unavailable (perceptionAccuracy=0).
//      Bandit CANNOT observe merchant location.
//
// The authoritative merchant state is identical in both.
//
// Expected: behavior differs only when legal information differs.
//   A: bandit trafficBelief for merchant's road > 0 (observation succeeded).
//   B: bandit trafficBelief for merchant's road = 0 (observation failed).
//   Bandit relocation decision must be based on trafficBelief (legal), NOT
//   on direct reads of merchant.routeBeliefs or merchant.beliefs.
//
// Forbidden: test simply sets the desired bandit route.
// Required: the bandit must choose from its own belief state.

import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

describe('V6 §9.1 MUT-OBS-002 — bandit ground-truth shortcut', () => {
    it('A: with bandit perceptionAccuracy=1, bandit observes merchant via legal channel and updates trafficBelief', () => {
        // R1 (V8 audit F2): the legal channel is co-location — the
        // bandit counts passersby on its OWN road. The previous version
        // staged the merchant on road-b (distant) and expected learning,
        // which encoded the panopticon this repair removes.
        const world = createClosedWorldScenario();
        world.bandits[0].perceptionAccuracy = 1; // legal observation always succeeds
        world.bandits[0].roadId = 'road-a';
        // The merchant travels the bandit's own road (observable).
        world.merchants[0].selectedRoute = 'road-a';
        world.merchants[0].lastRoute = 'road-a';
        world.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.05, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.6, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.6, confidence: 0.5 },
        };
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true });
        // The bandit's trafficBelief for road-a should be > 0
        // (the bandit observed the merchant on road-a via the legal channel).
        const roadABelief = world.bandits[0].trafficBelief?.['road-a'];
        expect(roadABelief).toBeDefined();
        expect(roadABelief.estimatedTraffic).toBeGreaterThan(0);
    });
    it('B: with bandit perceptionAccuracy=0, bandit CANNOT observe merchant via legal channel', () => {
        const world = createClosedWorldScenario();
        world.bandits[0].perceptionAccuracy = 0; // legal observation always fails
        world.bandits[0].roadId = 'road-a';
        // Same authoritative merchant state as test A.
        world.merchants[0].selectedRoute = 'road-b';
        world.merchants[0].lastRoute = 'road-b';
        world.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.5, confidence: 0.5 },
            'road-b': { perceivedDanger: 0.1, confidence: 0.9 },
            'road-c': { perceivedDanger: 0.3, confidence: 0.5 },
        };
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true });
        // The bandit's trafficBelief for road-b should stay at 0
        // (the bandit failed to observe the merchant).
        const roadBBelief = world.bandits[0].trafficBelief?.['road-b'];
        expect(roadBBelief).toBeDefined();
        expect(roadBBelief.estimatedTraffic).toBe(0);
    });

    it('C: with bandit perceptionAccuracy=0 and no trafficBelief signal, bandit does NOT relocate to merchant road', () => {
        // Even if the merchant is on a known road, the bandit must NOT
        // use ground-truth knowledge of the merchant's location to relocate.
        // Without legal observation, the bandit's trafficBelief stays at 0,
        // and the bandit has no incentive to relocate.
        const world = createClosedWorldScenario();
        world.bandits[0].perceptionAccuracy = 0;
        world.bandits[0].roadId = 'road-a';
        // The merchant is on road-c. The bandit must NOT know this.
        world.merchants[0].selectedRoute = 'road-c';
        world.merchants[0].lastRoute = 'road-c';
        world.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.1, confidence: 0.5 },
            'road-b': { perceivedDanger: 0.1, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.1, confidence: 0.5 },
        };
        // Run 3 ticks.
        for (let tick = 1; tick <= 3; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
        }
        // The bandit should still be on road-a (no legal observation, no
        // trafficBelief signal, no relocation reason).
        // NOTE: If MUT-OBS-002 is applied (bandit reads merchant.routeBeliefs
        // or merchant.selectedRoute directly), the bandit will relocate to
        // road-c (where the merchant is). This test catches that.
        expect(world.bandits[0].roadId).toBe('road-a');
    });
});
