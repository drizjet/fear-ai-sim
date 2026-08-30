import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { BeliefStore } from '../beliefs.js';
import { Market } from '../economy.js';

// World-Completion Directive §8 follow-up: after a
// BANDIT_ATTACK, a witness merchant should automatically
// share the observation with a non-witness merchant at the
// next tick. The `propagateRumor` function is proven
// end-to-end (EVID-2026-08-28-RUMOR-PROPAGATION-LIVE); this
// slice wires the auto-share into the live closed-world
// reducer.

describe('rumor auto-share in the live reducer (directive §8)', () => {
    it('after a BANDIT_ATTACK, a non-witness merchant on a different road learns via rumor', () => {
        // The 2-town closed-world has both towns on road-a
        // (the attack road), so both merchants directly
        // observe. To test the auto-share contract we
        // need a 3-town setup where the non-witness is on
        // a road that does NOT connect to the attack.
        // We build a minimal 3-town world manually.
        const towns = new Map();
        for (const id of ['north', 'south', 'east']) {
            const market = new Market();
            towns.set(id, {
                id,
                market,
                population: 1,
                consumes: { food: 1 },
                produces: { food: 1.5 }
            });
        }
        const world = {
            season: 'SPRING',
            towns,
            routes: [
                { id: 'road-ns', from: 'north', to: 'south', distance: 5, actualDanger: 0.8 },
                { id: 'road-ne', from: 'north', to: 'east', distance: 7, actualDanger: 0.1 },
                { id: 'road-se', from: 'south', to: 'east', distance: 6, actualDanger: 0.1 }
            ],
            factions: [],
            bandits: [
                Object.assign(
                    {
                        id: 'bandits-1',
                        roadId: 'road-ns',
                        alternateRoadId: 'road-ne',
                        lootExpectation: 0.5
                    }
                )
            ],
            merchants: [
                {
                    id: 'merchants-1',
                    location: 'north',
                    cargo: 20,
                    selectedRoute: 'road-ns',
                    beliefs: new BeliefStore()
                },
                {
                    id: 'merchants-2',
                    location: 'east',
                    cargo: 0,
                    selectedRoute: 'road-ne',
                    beliefs: new BeliefStore()
                }
            ],
            guards: [],
            events: [],
            beliefs: new BeliefStore(),
            tickHistory: [],
            relationships: new Map(),
            consumedAttackIds: new Set()
        };
        // Inject a BANDIT_ATTACK event on road-ns at
        // tick 1. The witness (merchants-1 at north) is
        // adjacent to road-ns (canObserve returns true).
        // The non-witness (merchants-2 at east) is on
        // road-ne, NOT on road-ns. The canObserve check
        // should exclude merchants-2.
        world.events.push({
            type: 'BANDIT_ATTACK',
            roadId: 'road-ns',
            banditId: 'bandits-1',
            tick: 1,
            lost: 6,
            delivered: 14
        });
        // Run tick 1: belief formation (witness learns
        // road-ns is dangerous) and auto-share (non-witness
        // gets a reduced-confidence rumor).
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        // The witness should have a belief for road-ns.
        const witnessBelief = world.merchants[0].beliefs.get('road-ns', 'perceivedDanger');
        expect(witnessBelief).toBeDefined();
        // The non-witness should have a belief for road-ns
        // with reduced confidence (TRUSTED_REPORT decay).
        const nonWitnessBelief = world.merchants[1].beliefs.get('road-ns', 'perceivedDanger');
        expect(nonWitnessBelief).toBeDefined();
        // The non-witness's confidence must be lower than
        // the witness's (the share decay factor is 0.5).
        expect(nonWitnessBelief.confidence).toBeLessThan(witnessBelief.confidence);
    });
});
