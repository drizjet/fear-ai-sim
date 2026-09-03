// tests/bandit-ground-truth-shortcut.test.js — V6 §9.2 / V7 §19 MUT-OBS-003
//
// Contract: ONE AGENT OR WORLD SYSTEM MAY NOT SILENTLY WRITE ANOTHER AGENT'S
// SUBJECTIVE BELIEF AS A SUBSTITUTE FOR OBSERVATION.
//
// Defect: bandit relocation directly writes
// `merchant.routeBeliefs[bandit.roadId]` without a legal merchant observation
// transfer. This is the cross-agent belief-injection defect.
//
// The correct information flow per V7 §16 is:
//   BANDIT TRUTH/ACTION
//   → externally observable consequence (bandit on road, attack, report)
//   → merchant observation eligibility
//   → merchant observation record
//   → merchant belief update
//   → merchant next decision.
//
// Not:
//   BANDIT TRUTH → merchant.routeBeliefs directly (LEGACY SHORTCUT).
//
// Test creates a discriminating pair:
//   A: bandit's legal observation channel succeeds
//      (bandit.perceptionAccuracy = 1).
//   B: legal observation is unavailable
//      (bandit.perceptionAccuracy = 0).
//
// The authoritative merchant state is identical in both.
//
// Expected: behavior differs only when legal information differs.
//   A: bandit's trafficBelief for the merchant's road is > 0
//      (observation succeeded).
//   B: bandit's trafficBelief for the merchant's road stays at 0
//      (observation failed).
//
// Forbidden: test simply sets the desired bandit route.

import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

const PERCEPTION_ACCURACY = (m) =>
    Number.isFinite(m.perceptionAccuracy) ? m.perceptionAccuracy : 0.5;

describe('V5 §4 MUT-OBS-002 — bandit ground-truth shortcut', () => {
    it('A: with bandit perceptionAccuracy=1, the bandit observes the merchant route via the legal channel', () => {
        // R1 (V8 audit F2): co-location is the legal channel (see the
        // twin test in bandit-merchant-knowledge-shortcut.test.js).
        const world = createClosedWorldScenario();
        world.bandits[0].perceptionAccuracy = 1; // legal observation always succeeds
        world.bandits[0].roadId = 'road-a';
        // Force the merchant onto the bandit's own road (observable).
        world.merchants[0].selectedRoute = 'road-a';
        world.merchants[0].lastRoute = 'road-a';
        world.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.05, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.6, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.6, confidence: 0.5 },
        };
        // Run one tick.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true });
        // The bandit's trafficBelief for road-a should be > 0
        // (the bandit observed the merchant on road-a).
        const roadABelief = world.bandits[0].trafficBelief?.['road-a'];
        expect(roadABelief?.estimatedTraffic).toBeGreaterThan(0);
    });

    it('B: with bandit perceptionAccuracy=0, the bandit does NOT observe the merchant route', () => {
        const world = createClosedWorldScenario();
        world.bandits[0].perceptionAccuracy = 0; // legal observation always fails
        world.bandits[0].roadId = 'road-a';
        world.merchants[0].selectedRoute = 'road-b';
        world.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.5, confidence: 0.5 },
            'road-b': { perceivedDanger: 0.1, confidence: 0.9 },
            'road-c': { perceivedDanger: 0.3, confidence: 0.5 },
        };
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true });
        // The bandit's trafficBelief for road-b should stay at 0
        // (the bandit failed to observe the merchant).
        const roadBBelief = world.bandits[0].trafficBelief?.['road-b'];
        expect(roadBBelief?.estimatedTraffic).toBe(0);
    });

    it('discriminating: the bandit does NOT write to the merchant\'s routeBeliefs (no merchant-avoidance wire)', () => {
        // The MUT-OBS-003 mutation removes the merchant-avoidance wire:
        // the bandit should NOT directly modify merchant.routeBeliefs[bandit.roadId].
        // The merchant's beliefs should only change via the merchant's own
        // legal observation channel.
        //
        // Setup: force the bandit to relocate to road-b by pre-seeding
        // trafficBelief for road-b. This ensures the relocation code path
        // executes, which is where the MUT-OBS-003 mutation writes to
        // merchant.routeBeliefs.
        const world = createClosedWorldScenario();
        world.bandits[0].perceptionAccuracy = 0; // bandit cannot observe
        world.bandits[0].roadId = 'road-a';
        world.bandits[0].trafficBelief = {
            'road-a': { estimatedTraffic: 0, recency: 0.5 },
            'road-b': { estimatedTraffic: 5, recency: 1.0 },
            'road-c': { estimatedTraffic: 0, recency: 0.5 },
        };
        world.merchants[0].perceptionAccuracy = 0; // merchant cannot observe
        world.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.1, confidence: 0.5, source: 'initial' },
            'road-b': { perceivedDanger: 0.1, confidence: 0.5, source: 'initial' },
            'road-c': { perceivedDanger: 0.1, confidence: 0.5, source: 'initial' },
        };
        // Run 1 tick. The bandit will relocate to road-b (highest payoff).
        // The MUT-OBS-003 mutation would write merchant.routeBeliefs['road-b']
        // to perceivedDanger: 0.9. Without the mutation, the merchant's
        // beliefs stay unchanged.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true });
        // The merchant's routeBeliefs should be UNCHANGED
        // (no legal observation, no merchant-avoidance wire).
        const merchantBeliefs = world.merchants[0].routeBeliefs;
        expect(merchantBeliefs['road-b'].perceivedDanger).toBe(0.1);
        expect(merchantBeliefs['road-b'].source).toBe('initial');
        expect(merchantBeliefs['road-a'].perceivedDanger).toBe(0.1);
        expect(merchantBeliefs['road-c'].perceivedDanger).toBe(0.1);
    });
});
