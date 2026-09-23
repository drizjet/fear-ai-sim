import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore, RouteNetwork } from '../societycore.js';

describe('RESP-MARKET-PENDING-DELIVERY-MATERIAL-ACCOUNTING-DYNAMIC-001', () => {
    it('conserves mixed goods across terminal outcomes and restart checkpoints', () => {
        for (const seed of [4601, 4611, 4621]) {
            const society = new SocietyCore({ seed });
            const origin = society.addMarket('origin', new Market({ stock: { grain: 180, iron: 90 } }));
            const destination = society.addMarket('destination', new Market({ stock: { grain: 0, iron: 0 } }));
            society.routes = new RouteNetwork([
                { id: 'safe', available: true, perceivedDanger: 0 },
                { id: 'danger', available: true, perceivedDanger: 9 },
                { id: 'closed', available: false, perceivedDanger: 0 },
            ]);
            const goods = ['grain', 'iron'];
            for (let i = 0; i < 60; i += 1) {
                const good = goods[i % goods.length];
                const route = society.routes.edges[i % society.routes.edges.length];
                const trip = origin.createTrip({ id: `trip-${seed}-${i}`, good, cargoKind: good.toUpperCase(), owner: `merchant-${i % 4}`, quantity: 2, destination: 'destination' });
                if (!trip) break;
                society.worldStep({ routes: [route] });
                expect(origin.inTransit.size).toBe(0);
                expect(origin.stock[good]).toBeGreaterThanOrEqual(0);
                expect(destination.stock[good]).toBeGreaterThanOrEqual(0);
                if (i % 15 === 14) {
                    const snapshot = society.serialize();
                    expect(SocietyCore.deserialize(JSON.parse(JSON.stringify(snapshot))).serialize()).toEqual(snapshot);
                }
                origin.receive(good, 1);
            }
            expect(origin.balanceSheet().balanced).toBe(true);
            expect(destination.balanceSheet().balanced).toBe(true);
        }
    });
});
