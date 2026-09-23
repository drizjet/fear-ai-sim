import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-DYNAMIC-001', () => {
    it('keeps multi-market transfer ledgers bounded, ordered, and conserved', () => {
        for (const seed of [2701, 2711, 2721]) {
            const society = new SocietyCore({ seed });
            society.addMarket('a', new Market({ prices: { grain: 1 }, stock: { grain: 500 } }));
            society.addMarket('b', new Market({ prices: { grain: 2 }, stock: { grain: 0 } }));
            for (let i = 0; i < 250; i += 1) {
                society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', good: 'grain', quantity: (i % 7) + 1 }] });
                if (i % 11 === 0) society.markets.get('a').receive('grain', 3);
            }
            expect(society.events).toHaveLength(500);
            expect(society.events.every((event, index) => index === 0 || event.seq === society.events[index - 1].seq + 1)).toBe(true);
            expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
            expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
            expect(society.markets.get('a').stock.grain).toBeGreaterThanOrEqual(0);
            expect(society.markets.get('b').stock.grain).toBeGreaterThanOrEqual(0);
        }
    });

    it('preserves cross-market history and event state through persistence', () => {
        const society = new SocietyCore({ seed: 2707 });
        society.addMarket('a', new Market({ prices: { grain: 1 }, stock: { grain: 30 } }));
        society.addMarket('b', new Market({ prices: { grain: 2 }, stock: { grain: 4 } }));
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', quantity: 9 }] });
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });
});
