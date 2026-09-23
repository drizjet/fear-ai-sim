import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

function probe(seed, reportEvery) {
    const society = new SocietyCore({ seed });
    society.addSettlement('town', { population: 100, resources: 50 });
    society.addMarket('south', new Market({ prices: { grain: 2 }, stock: { grain: 2000 } }));
    const actor = { id: 'merchant', beliefs: new Map() };
    society.actors.set(actor.id, actor);
    let totalConsumed = 0;
    for (let tick = 0; tick < 300; tick++) {
        society.time = tick;
        if (tick % reportEvery === 0) {
            const report = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: tick % 40 === 0 ? 2 : 0, confidence: .8, timestamp: tick });
            society.rumors.spread(report, [actor], { now: () => society.now() });
        }
        const result = society.applyQueueAwareSettlementEconomy({ settlement: 'town', market: 'south', recipientId: actor.id, foodNeed: 4 });
        totalConsumed += result.consumed;
        if (!Number.isFinite(result.requested) || result.consumed < 0 || result.consumed > 4 * 3) throw new Error(`invalid economic result at ${tick}`);
    }
    return { society, actor, totalConsumed };
}

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-DYNAMIC-001', () => {
    it('keeps long-horizon mixed information and consumption finite', () => {
        for (const seed of [2101, 2113, 2129]) {
            const { society, totalConsumed } = probe(seed, 7);
            expect(Number.isFinite(totalConsumed)).toBe(true);
            expect(society.markets.get('south').stock.grain).toBeGreaterThanOrEqual(0);
            expect(society.markets.get('south').history.length).toBe(300);
        }
    });

    it('shows stale confidence reducing information-driven demand over time', () => {
        const { society, actor } = probe(2131, 1000);
        const belief = actor.beliefs.get('route:road:danger');
        const before = belief.confidence;
        society.time += 50;
        society.decayRouteBeliefs({ halfLife: 10 });
        const after = belief.confidence;
        expect(after).toBeLessThan(before);
        const result = society.applyQueueAwareSettlementEconomy({ settlement: 'town', market: 'south', recipientId: actor.id, foodNeed: 4 });
        expect(result.requested).toBeLessThan(4 * (1 + before * belief.estimate));
    });
});
