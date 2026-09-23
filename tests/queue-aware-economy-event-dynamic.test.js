import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-EVENT-DYNAMIC-001', () => {
    it('keeps repeated multi-settlement events ordered and conserved', () => {
        const society = new SocietyCore({ seed: 2501 });
        society.addSettlement('north', { population: 30 });
        society.addSettlement('south', { population: 50 });
        society.addMarket('grain', new Market({ prices: { grain: 2 }, stock: { grain: 500 } }));
        for (let tick = 0; tick < 200; tick++) {
            society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: tick % 2 ? 'north' : 'south', market: 'grain', foodNeed: 2 + (tick % 3) }] });
            if (tick % 19 === 0) society.markets.get('grain').update({ supply: { grain: 7 } });
        }
        const actionEvents = society.events.filter(event => event.type === 'QUEUE_AWARE_SETTLEMENT_ECONOMY');
        expect(actionEvents).toHaveLength(200);
        expect(society.events.every((event, index) => index === 0 || event.seq > society.events[index - 1].seq)).toBe(true);
        expect(society.markets.get('grain').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('grain').stock.grain).toBeGreaterThanOrEqual(0);
    });

    it('preserves event graph and economic balances through persistence', () => {
        const society = new SocietyCore({ seed: 2511 });
        society.addSettlement('town', { population: 20 });
        society.addMarket('grain', new Market({ prices: { grain: 1 }, stock: { grain: 50 } }));
        for (let i = 0; i < 30; i++) society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'grain', foodNeed: 1 }] });
        const snapshot = society.serialize();
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot)));
        expect(restored.serialize()).toEqual(snapshot);
        expect(restored.markets.get('grain').balanceSheet()).toEqual(society.markets.get('grain').balanceSheet());
    });
});
