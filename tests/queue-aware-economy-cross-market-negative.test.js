import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-NEGATIVE-001', () => {
    function setup() {
        const society = new SocietyCore({ seed: 2731 });
        society.addMarket('source', new Market({ prices: { grain: 1 }, stock: { grain: 5 } }));
        society.addMarket('destination', new Market({ prices: { grain: 2 }, stock: { grain: 1 } }));
        return society;
    }

    it('caps requested movement at available source stock', () => {
        const society = setup();
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'source', toMarket: 'destination', good: 'grain', quantity: 99 });
        expect(result).toMatchObject({ requested: 99, moved: 5, sourceStock: 0, destinationStock: 6 });
        expect(society.markets.get('source').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('destination').balanceSheet().balanced).toBe(true);
    });

    it('rejects missing markets before mutating either ledger', () => {
        const society = setup();
        const before = JSON.stringify([...society.markets].map(([id, market]) => [id, market.stock, market.history]));
        expect(() => society.transferQueueAwareEconomicSupply({ fromMarket: 'missing', toMarket: 'destination', quantity: 1 })).toThrow('Source and destination markets are required');
        expect(JSON.stringify([...society.markets].map(([id, market]) => [id, market.stock, market.history]))).toBe(before);
    });

    it('does not create phantom imports for zero or negative movement', () => {
        const society = setup();
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'source', toMarket: 'destination', quantity: -10 });
        expect(result.moved).toBe(0);
        expect(society.markets.get('source').history).toHaveLength(0);
        expect(society.markets.get('destination').history).toHaveLength(0);
    });

    it('detects an unrecorded source withdrawal as conservation drift', () => {
        const society = setup();
        society.transferQueueAwareEconomicSupply({ fromMarket: 'source', toMarket: 'destination', quantity: 2 });
        const source = society.markets.get('source');
        source.stock.grain -= 1;
        expect(source.balanceSheet().balanced).toBe(false);
    });
});
