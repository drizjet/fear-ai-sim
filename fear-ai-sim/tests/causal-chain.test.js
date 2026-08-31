import { describe, expect, test } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

function childOf(events, type, parentEventId, predicate = () => true) {
    return events.find(event => event.type === type
        && event.parentEventIds?.includes(parentEventId)
        && predicate(event));
}

describe('MUT-CHAIN-001 causal parentage', () => {
    test('observation -> belief -> decision -> trip -> exposure -> encounter -> consequence -> reaction is a valid partial order', () => {
        const world = createClosedWorldScenario();
        const merchant = world.merchants[0];
        merchant.riskTolerance = 1;
        merchant.perceptionAccuracy = 0;
        merchant.routeFamiliarity = { 'road-a': 1, 'road-b': 0, 'road-c': 0 };
        merchant.routeBeliefs['road-a'] = { perceivedDanger: 0.01, confidence: 1 };
        merchant.routeBeliefs['road-b'] = { perceivedDanger: 1, confidence: 1 };
        merchant.routeBeliefs['road-c'] = { perceivedDanger: 1, confidence: 1 };

        // Tick 1 creates a real ambush consequence. Tick 2 must observe that
        // consequence through the legal observation boundary and carry its
        // event identity through every downstream causal edge.
        tickClosedWorld(world, {
            tick: 1,
            perceivedDanger: 0.5,
            encounterRng: () => 0.999,
            pinBanditRoadId: 'road-a',
        });
        const sourceConsequence = world.events.find(event => event.type === 'BANDIT_ATTACK' && event.tick === 1);
        expect(sourceConsequence).toBeDefined();
        expect(sourceConsequence.eventId).toBeDefined();

        tickClosedWorld(world, {
            tick: 2,
            perceivedDanger: 0.5,
            encounterRng: () => 0.999,
            pinBanditRoadId: 'road-a',
        });

        const observation = childOf(
            world.events,
            'OBSERVATION',
            sourceConsequence.eventId,
            event => event.merchantId === merchant.id,
        );
        expect(observation).toBeDefined();
        const belief = childOf(world.events, 'BELIEF_UPDATE', observation.eventId);
        expect(belief).toBeDefined();
        const decision = childOf(
            world.events,
            'MERCHANT_ROUTE_DECISION',
            belief.eventId,
            event => event.tick === 2 && event.merchantId === merchant.id,
        );
        expect(decision).toBeDefined();
        const trip = childOf(world.events, 'TRIP_COMMITMENT', decision.eventId, event => event.tick === 2);
        expect(trip).toBeDefined();
        const exposure = childOf(world.events, 'ROUTE_EXPOSURE', trip.eventId);
        expect(exposure).toBeDefined();
        const candidate = childOf(world.events, 'CANDIDATE_ENCOUNTER', exposure.eventId, event => event.tick === 2);
        expect(candidate).toBeDefined();
        const encounter = childOf(
            world.events,
            'ENCOUNTER',
            candidate.eventId,
            event => event.encounterId === 'bandit-ambush',
        );
        expect(encounter).toBeDefined();
        const consequence = childOf(world.events, 'BANDIT_ATTACK', encounter.eventId, event => event.tick === 2);
        expect(consequence).toBeDefined();
        const reaction = childOf(world.events, 'FACTION_REACTION', consequence.eventId);
        expect(reaction).toBeDefined();
        expect(reaction.memoryAfter).toBeGreaterThan(reaction.memoryBefore);

        // Every parent is real and precedes its child. This validates a
        // partial order, rather than assuming adjacent array entries are
        // causally related.
        const position = new Map(world.events.map((event, index) => [event.eventId, index]));
        expect(position.size).toBe(world.events.length);
        for (const [index, event] of world.events.entries()) {
            expect(event.eventId).toEqual(expect.any(String));
            expect(Array.isArray(event.parentEventIds)).toBe(true);
            for (const parentEventId of event.parentEventIds) {
                expect(position.has(parentEventId)).toBe(true);
                expect(position.get(parentEventId)).toBeLessThan(index);
            }
        }
    });
});
