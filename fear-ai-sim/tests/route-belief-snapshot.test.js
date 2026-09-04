import { describe, it, expect } from '@jest/globals';
import { createCanonicalMerchant, chooseMerchantRouteDecision } from '../canonical-trade-system.js';

// R7 (V8 audit F4): the route decision's ranked list must carry
// belief snapshots. Mutating a ranked entry must not reach back
// into the merchant's live routeBeliefs store.

describe('R7 — route decision beliefs are snapshots, not live handles', () => {
    it('mutating ranked[].belief leaves merchant.routeBeliefs untouched', () => {
        const routes = [
            { id: 'road-a', from: 'north', to: 'south', distance: 5 },
            { id: 'road-b', from: 'north', to: 'south', distance: 9 },
        ];
        const merchant = createCanonicalMerchant({
            id: 'm', location: 'north', cargo: 10, riskTolerance: 0.5, switchingCost: 0,
            routeBeliefs: {
                'road-a': { perceivedDanger: 0.2, confidence: 0.9 },
                'road-b': { perceivedDanger: 0.1, confidence: 0.9 },
            },
        });
        const decision = chooseMerchantRouteDecision(merchant, routes, merchant.routeBeliefs, { tick: 1, world: null });
        expect(decision.ranked.length).toBe(2);
        decision.ranked[0].belief.perceivedDanger = 0.99;
        decision.ranked[0].belief.confidence = 0.01;
        decision.ranked[1].belief.perceivedDanger = 0.99;
        expect(merchant.routeBeliefs['road-a'].perceivedDanger).toBe(0.2);
        expect(merchant.routeBeliefs['road-a'].confidence).toBe(0.9);
        expect(merchant.routeBeliefs['road-b'].perceivedDanger).toBe(0.1);
    });
});
