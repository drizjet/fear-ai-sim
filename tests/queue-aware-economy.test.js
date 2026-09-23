import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

describe('RESP-WORLD-EXPANSION-QUEUE-AWARE-ECONOMY-001', () => {
    it('uses delivered actor-local danger information to change settlement demand', () => {
        const society = new SocietyCore({ seed: 2001 });
        society.addSettlement('town', { population: 100, resources: 10 });
        society.addMarket('south', new Market({ prices: { grain: 2 }, stock: { grain: 100 } }));
        society.routes = new RouteNetwork([{ id: 'road', perceivedDanger: 0 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        const report = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 3, confidence: .8, source: 'scout' });
        society.queueRumor(report, actor, { delay: 2, ttl: 10 });
        expect(society.applyQueueAwareSettlementEconomy({ settlement: 'town', market: 'south', recipientId: actor.id, foodNeed: 10 }).reportedDanger).toBe(0);
        society.time = 2;
        society.rumors.spread(report, [actor], { now: () => society.now() });
        const informed = society.applyQueueAwareSettlementEconomy({ settlement: 'town', market: 'south', recipientId: actor.id, foodNeed: 10 });
        expect(informed.reportedDanger).toBe(3);
        expect(informed.requested).toBeGreaterThan(10);
    });

    it('keeps consumption bounded by market stock and reports unmet demand', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 10, resources: 4 });
        society.addMarket('south', new Market({ prices: { grain: 1 }, stock: { grain: 3 } }));
        const result = society.applyQueueAwareSettlementEconomy({ settlement: 'town', market: 'south', foodNeed: 20 });
        expect(result.consumed).toBe(3);
        expect(result.unmet).toBeGreaterThan(0);
        expect(society.markets.get('south').stock.grain).toBe(0);
    });

    it('persists the information-dependent economic state without hidden truth', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 20, resources: 5 });
        society.addMarket('south', new Market({ prices: { grain: 2 }, stock: { grain: 50 } }));
        society.routes = new RouteNetwork([{ id: 'road', actualDanger: 999 }]);
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        const report = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 2, confidence: .5 });
        society.queueRumor(report, actor, { delay: 1 });
        society.time = 1;
        society.deliverRumors([actor]);
        society.applyQueueAwareSettlementEconomy({ settlement: 'town', market: 'south', recipientId: actor.id, reportClaim: 'route:road:danger', foodNeed: 5 });
        const snapshot = society.serialize();
        expect(snapshot.routes.edges[0].actualDanger).toBe(999);
        expect(snapshot.actors.merchant.beliefs['route:road:danger'].evidence[0]).not.toHaveProperty('actualDanger');
        expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
    });

    it('does not let an undelivered report affect the economy', () => {
        const society = new SocietyCore();
        society.addSettlement('town', { population: 10 });
        society.addMarket('south', new Market({ prices: { grain: 2 }, stock: { grain: 50 } }));
        const actor = { id: 'merchant', beliefs: new Map() };
        society.actors.set(actor.id, actor);
        const report = society.rumors.publish({ claim: 'route:road:danger', valueEstimate: 9, confidence: 1 });
        society.queueRumor(report, actor, { delay: 5 });
        const result = society.applyQueueAwareSettlementEconomy({ settlement: 'town', market: 'south', recipientId: actor.id, foodNeed: 5 });
        expect(result.reportedDanger).toBe(0);
        expect(result.requested).toBe(5);
    });
});
