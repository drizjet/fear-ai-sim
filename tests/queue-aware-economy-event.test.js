import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-DECISION-EVENT-001', () => {
    function setup() {
        const society = new SocietyCore({ seed: 2401 });
        society.addSettlement('town', { population: 20 });
        society.addMarket('grain', new Market({ prices: { grain: 2 }, stock: { grain: 30 } }));
        return society;
    }

    it('records queue-aware economic consequences as a causal event', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'grain', foodNeed: 7 }] });
        const turn = society.events[0];
        const event = society.events.at(-1);
        expect(event).toMatchObject({ type: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlementId: 'town', marketId: 'grain', consumed: 7, marketStock: 23 });
        expect(event.parentId).toBe(turn.id);
        expect(event.seq).toBe(2);
    });

    it('keeps actor-local report influence in the event payload', () => {
        const society = setup();
        const actor = { id: 'scout', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        const report = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 2, confidence: .8 });
        society.rumors.spread(report, [actor], { now: () => society.now() });
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'grain', recipientId: actor.id, foodNeed: 5 }] });
        expect(society.events.at(-1)).toMatchObject({ reportedDanger: 2, recipientId: actor.id, confidence: expect.any(Number) });
    });

    it('round-trips event and economic state exactly', () => {
        const society = setup();
        society.tick({ actions: [{ kind: 'QUEUE_AWARE_SETTLEMENT_ECONOMY', settlement: 'town', market: 'grain', foodNeed: 7 }] });
        const snapshot = society.serialize();
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });

    it('mutation control detects an event-less economic withdrawal', () => {
        const society = setup();
        const market = society.markets.get('grain');
        market.stock.grain -= 1;
        expect(market.balanceSheet().balanced).toBe(false);
        expect(society.events).toHaveLength(0);
    });
});
