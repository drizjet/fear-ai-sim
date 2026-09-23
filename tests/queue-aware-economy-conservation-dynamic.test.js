import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

function runProbe(seed) {
    const society = new SocietyCore({ seed });
    society.addSettlement('north', { population: 40, resources: 20 });
    society.addSettlement('south', { population: 60, resources: 20 });
    society.addMarket('grain', new Market({ prices: { grain: 2 }, stock: { grain: 600 } }));
    const actors = [{ id: 'north-scout', beliefs: new Map() }, { id: 'south-scout', beliefs: new Map() }];
    for (const actor of actors) society.actors.set(actor.id, actor);
    for (let tick = 0; tick < 400; tick++) {
        society.time = tick;
        if (tick % 17 === 0) {
            const report = society.rumors.publish({ claim: `route:road-${tick % 2}:danger`, valueEstimate: tick % 34 === 0 ? 2 : 0, confidence: .7, timestamp: tick });
            society.rumors.spread(report, [actors[tick % 2]], { now: () => society.now() });
        }
        if (tick % 23 === 0) society.markets.get('grain').update({ supply: { grain: 5 } });
        for (let i = 0; i < actors.length; i++) society.applyQueueAwareSettlementEconomy({ settlement: i === 0 ? 'north' : 'south', market: 'grain', recipientId: actors[i].id, foodNeed: i === 0 ? 2 : 3 });
    }
    return society;
}

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CONSERVATION-DYNAMIC-001', () => {
    it('keeps multi-settlement replenishment finite and exactly balanced', () => {
        for (const seed of [2301, 2311, 2321]) {
            const society = runProbe(seed);
            const market = society.markets.get('grain');
            expect(market.stock.grain).toBeGreaterThanOrEqual(0);
            expect(market.balanceSheet().balanced).toBe(true);
            expect(market.history.length).toBeGreaterThan(200);
            expect(market.history.length).toBeLessThanOrEqual(420);
        }
    });

    it('round-trips dynamic conservation state exactly', () => {
        const society = runProbe(2333);
        const snapshot = society.serialize();
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot)));
        expect(restored.serialize()).toEqual(snapshot);
        expect(restored.markets.get('grain').balanceSheet()).toEqual(society.markets.get('grain').balanceSheet());
    });

    it('mutation control detects dynamic stock drift', () => {
        const society = runProbe(2341);
        const market = society.markets.get('grain');
        market.stock.grain -= .5;
        expect(market.balanceSheet().balanced).toBe(false);
    });
});
