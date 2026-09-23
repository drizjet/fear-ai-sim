import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-CLOSURE-AUDIT-DYNAMIC-001', () => {
    it('survives a long mixed-direction multi-market regime', () => {
        for (const seed of [2781, 2791, 2801]) {
            const society = new SocietyCore({ seed });
            society.addMarket('north', new Market({ prices: { grain: 1, water: 1 }, stock: { grain: 400, water: 180 } }));
            society.addMarket('central', new Market({ prices: { grain: 2, water: 2 }, stock: { grain: 25, water: 25 } }));
            society.addMarket('south', new Market({ prices: { grain: 3, water: 3 }, stock: { grain: 0, water: 0 } }));
            const ids = ['north', 'central', 'south'];
            for (let i = 0; i < 600; i += 1) {
                const from = ids[i % 3];
                const to = ids[(i + 1) % 3];
                const good = i % 2 ? 'grain' : 'water';
                society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: from, toMarket: to, good, quantity: (i % 13) + 1 }] });
                if (i % 17 === 0) society.markets.get('north').receive(good, 5);
            }
            expect(society.events).toHaveLength(1200);
            expect(society.events.every((event, i) => i === 0 || event.seq === society.events[i - 1].seq + 1)).toBe(true);
            for (const market of society.markets.values()) {
                expect(Object.values(market.stock).every(value => value >= 0)).toBe(true);
                expect(market.balanceSheet().balanced).toBe(true);
                expect(market.history.length).toBeLessThanOrEqual(1200);
            }
            const snapshot = society.serialize();
            expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
        }
    });
});
