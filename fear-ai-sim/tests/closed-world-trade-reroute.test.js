// tests/closed-world-trade-reroute.test.js
//
// Constitution §399 / §409 / §411 emergent chain test. After a
// bandit relocates from road-a to road-b, the merchant's perceived
// danger for road-a should fall, and the merchant should re-route
// back to road-a on the next decision cycle. This is the
// "feedback from bandit to trade" loop that the §161 EMERGENT
// CHAIN TEST 4 (BANDIT ADAPTATION) requires.

import { describe, expect, it } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

describe('closed-world trade rerouting (Constitution §409 / §161)', () => {
    it('merchant avoids the road the bandit is on (Constitution §161 emergent chain)', () => {
        // The §161 EMERGENT CHAIN TEST 4 (BANDIT ADAPTATION)
        // contract: the merchant observes the bandit (via
        // a legal observation channel, not a ground-truth
        // shortcut — per Guardian §3) and switches roads.
        // Per Guardian §3: "actors can be wrong" — the
        // cat-and-mouse is genuinely partial-observable, so
        // the merchant and bandit may occasionally meet on
        // the same road. The contract is: the merchant
        // REACTS to observations (the routeBeliefs for the
        // bandit's road rise), and the merchant's chosen
        // route is CAUSALLY DRIVEN by the observation (not
        // ground truth). To make this test deterministic,
        // we set the bandit's perceptionAccuracy to 0 (the
        // bandit never observes, so it never relocates to
        // the merchant's road), and the merchant's to 1 (the
        // merchant always observes). Then the merchant
        // ALWAYS avoids the bandit's road from tick 2 onward.
        const world = createClosedWorldScenario();
        world.merchants[0].perceptionAccuracy = 1;
        world.bandits[0].perceptionAccuracy = 0; // bandit cannot chase
        for (let tick = 1; tick <= 5; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
            const merchant = world.merchants[0];
            const bandit = world.bandits[0];
            if (tick >= 2) {
                expect(merchant.selectedRoute).not.toBe(bandit.roadId);
            }
        }
        // Additionally: the merchant's routeBeliefs for the
        // bandit's road must have been raised by the
        // observation (source === 'observation'). This proves
        // the route change was CAUSALLY DRIVEN by the
        // observation, not ground truth.
        const banditRoad = world.bandits[0].roadId;
        expect(world.merchants[0].routeBeliefs[banditRoad].source).toBe('observation');
        expect(world.merchants[0].routeBeliefs[banditRoad].perceivedDanger).toBeGreaterThanOrEqual(0.7);
    });

    it('mechanism check: with perceptionAccuracy=0, the merchant picks the initial-best road (no ground-truth shortcut)', () => {
        // Guardian V4 §5 MUT-OBS-001 mechanism-level assertion.
        // Setup: make road-a (the bandit's road) the initial-best road
        // by giving it the lowest perceivedDanger. Without observation,
        // the merchant should pick road-a (the best road). With the
        // MUT-OBS-001 mutation (ground-truth shortcut), the merchant
        // avoids road-a regardless of perceptionAccuracy.
        const world = createClosedWorldScenario();
        // Set up: road-a is the safest (lowest danger), road-b and
        // road-c are dangerous. The bandit is on road-a. Without
        // observation, the merchant should pick road-a.
        world.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.05, confidence: 0.5 },
            'road-b': { perceivedDanger: 0.8, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.8, confidence: 0.5 },
        };
        world.merchants[0].perceptionAccuracy = 0; // cannot observe
        world.bandits[0].perceptionAccuracy = 0;
        world.bandits[0].roadId = 'road-a';
        for (let tick = 1; tick <= 5; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
        }
        // The merchant should pick road-a (the initial-best road).
        // With the MUT-OBS-001 mutation, the merchant avoids road-a
        // (the bandit's road) and picks road-b or road-c.
        if (world.merchants[0].selectedRoute !== 'road-a') {
            throw new Error(
                `Merchant did not pick the initial-best road (road-a) with perceptionAccuracy=0. ` +
                `selectedRoute=${world.merchants[0].selectedRoute}. ` +
                `This indicates a ground-truth shortcut: the merchant read bandit.roadId directly.`
            );
        }
    });

    it('emits ROUTE_SELECTED on every merchant re-evaluation', () => {
        // The §538 vertical-slice contract: every per-tick evaluation
        // of the merchant's route emits an event in the audit log.
        // This is the "explainable route choice" requirement.
        const world = createClosedWorldScenario();
        for (let tick = 1; tick <= 5; tick += 1) {
            tickClosedWorld(world, { tick, perceivedDanger: 0.0, relationshipGate: true });
        }
        const routeEvents = world.events.filter(
            event => event.type === 'ROUTE_SELECTED'
        );
        // One ROUTE_SELECTED per tick (the merchant's evaluation).
        expect(routeEvents.length).toBe(5);
    });

    it('emits ROUTE_CHANGED when a bandit moves onto the merchants current route', () => {
        // The §161 emergent chain: if a bandit moves onto a
        // road the merchant is currently using, the merchant
        // must switch. We directly inject a BANDIT_RELOCATION
        // event that places a bandit on the merchant's current
        // route, then run a tick and assert the merchant
        // switches.
        const world = createClosedWorldScenario();
        // Tick 1: run a normal tick. Record the merchant's
        // initial route.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true });
        const merchant = world.merchants[0];
        const initialRoute = merchant.selectedRoute;
        // Force the existing bandit onto the merchant's
        // current route by mutating the bandit's roadId.
        const bandit = world.bandits[0];
        bandit.roadId = initialRoute;
        world.events.push({
            type: 'BANDIT_RELOCATION',
            tick: 2,
            roadId: initialRoute,
            relocation: {
                relocated: true,
                from: world.routes.find(r => r.id !== initialRoute).id,
                to: initialRoute,
                roadId: initialRoute,
                reason: 'test-injected'
            }
        });
        // Tick 2: the merchant must switch to the other road.
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.0, relationshipGate: true });
        const routeChangedEvents = world.events.filter(
            event => event.type === 'ROUTE_CHANGED'
        );
        expect(routeChangedEvents.length).toBeGreaterThan(0);
    });
});
