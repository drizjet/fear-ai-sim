import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-CROSS-MARKET-001', () => {
    function setup() {
        const society = new SocietyCore({ seed: 2701 });
        society.addMarket('source', new Market({ prices: { grain: 1 }, stock: { grain: 20 } }));
        society.addMarket('destination', new Market({ prices: { grain: 3 }, stock: { grain: 5 } }));
        return society;
    }

    it('moves only available supply and records both sides of the flow', () => {
        const society = setup();
        const result = society.transferQueueAwareEconomicSupply({ fromMarket: 'source', toMarket: 'destination', good: 'grain', quantity: 8 });
        expect(result.moved).toBe(8);
        expect(society.markets.get('source').stock.grain).toBe(12);
        expect(society.markets.get('destination').stock.grain).toBe(13);
        expect(society.markets.get('source').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('destination').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('destination').balanceSheet().goods.grain.production).toBe(8);
    });

    it('exposes cross-market transfer through the causal event graph', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'source', toMarket: 'destination', quantity: 4 }] });
        const event = society.events.at(-1);
        expect(event).toMatchObject({ type: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', moved: 4, fromMarket: 'source', toMarket: 'destination' });
        expect(event.parentId).toBe(society.events[0].id);
    });

    it('round-trips both market ledgers and transfer events exactly', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'source', toMarket: 'destination', quantity: 7 }] });
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });

    it('does not expose unrelated hidden route truth', () => {
        const society = setup();
        society.routes.edges.push({ id: 'road', actualDanger: 54321 });
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_CROSS_MARKET_TRANSFER', fromMarket: 'source', toMarket: 'destination', quantity: 2 }] });
        expect(JSON.stringify(society.events.at(-1))).not.toContain('actualDanger');
        expect(JSON.stringify(society.events.at(-1))).not.toContain('54321');
    });
});
