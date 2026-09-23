import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-CLOSURE-AUDIT-001', () => {
    it('audits transfer event causality, locality, and conservation', () => {
        const society = new SocietyCore({ seed: 2741 });
        society.addMarket('a', new Market({ prices: { grain: 1 }, stock: { grain: 40 } }));
        society.addMarket('b', new Market({ prices: { grain: 2 }, stock: { grain: 3 } }));
        society.routes.edges.push({ id: 'hidden', actualDanger: 99999 });
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', quantity: 7 }] });
        const turn = society.events[0];
        const transfer = society.events[1];
        expect(transfer).toMatchObject({ type: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', parentId: turn.id, moved: 7, fromMarket: 'a', toMarket: 'b' });
        expect(transfer.seq).toBe(turn.seq + 1);
        expect(JSON.stringify(transfer)).not.toContain('actualDanger');
        expect(society.markets.get('a').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('b').balanceSheet().balanced).toBe(true);
    });

    it('audits repeated mixed transfers for bounded, deterministic closure', () => {
        for (const seed of [2741, 2751, 2761]) {
            const society = new SocietyCore({ seed });
            society.addMarket('a', new Market({ prices: { grain: 1 }, stock: { grain: 300 } }));
            society.addMarket('b', new Market({ prices: { grain: 2 }, stock: { grain: 10 } }));
            society.addMarket('c', new Market({ prices: { grain: 3 }, stock: { grain: 0 } }));
            for (let i = 0; i < 120; i += 1) {
                society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: i % 2 ? 'a' : 'b', toMarket: 'c', quantity: (i % 9) + 1 }] });
                if (i % 15 === 0) society.markets.get('a').receive('grain', 4);
            }
            expect(society.events).toHaveLength(240);
            expect(society.events.every((event, i) => i === 0 || event.seq === society.events[i - 1].seq + 1)).toBe(true);
            for (const market of society.markets.values()) {
                expect(market.stock.grain).toBeGreaterThanOrEqual(0);
                expect(market.balanceSheet().balanced).toBe(true);
            }
        }
    });

    it('audits persistence and negative-control behavior together', () => {
        const society = new SocietyCore({ seed: 2771 });
        society.addMarket('a', new Market({ stock: { grain: 5 } }));
        society.addMarket('b', new Market({ stock: { grain: 0 } }));
        expect(() => society.transferQueueAwareEconomicSupply({ fromMarket: 'a', toMarket: 'missing', quantity: 2 })).toThrow();
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'a', toMarket: 'b', quantity: 2 }] });
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });
});
