import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

// RESP-ROUTING-TRADE-ECONOMY-LOOP-001 — the merchant economy loop as one production action:
// route + profitability plan → shipment → delivery → two-sided price response, all as
// canonical parent-chained events with exact stock conservation and save/load continuation.
// Mutants pinned: profitability gate removed (WAIT lost); origin demand shock skipped;
// destination stock not credited at settle.

const eventsOf = (society, type) => society.events.filter(event => event.type === type);

const world = ({ originStock = 100, destinationStock = 5, routes = [{ id: 'road', travelTime: 1, perceivedDanger: .1, available: true }] } = {}) => {
    const society = new SocietyCore({ seed: 55 });
    society.routes = new RouteNetwork(routes);
    society.addMarket('west', new Market({ prices: { grain: 2 }, stock: { grain: originStock } }));
    society.addMarket('east', new Market({ prices: { grain: 10 }, stock: { grain: destinationStock } }));
    return society;
};

const cycle = (extra = {}) => ({ kind: 'MERCHANT_ECONOMY_CYCLE', market: 'west', destination: 'east', good: 'grain', quantity: 10, tripId: 'trip-9', minimumPrice: 5, owner: 'merchant-7', ...extra });

describe('RESP-ROUTING-TRADE-ECONOMY-LOOP-001: merchant economy production loop', () => {
    it('runs plan → ship → deliver → price response with exact conservation', () => {
        const society = world();
        society.tick({ actions: [cycle()] });

        const [plan] = eventsOf(society, 'MERCHANT_ROUTE_PLAN');
        const [create] = eventsOf(society, 'MARKET_TRIP_CREATE');
        const [settle] = eventsOf(society, 'MARKET_TRIP_SETTLE');
        const updates = eventsOf(society, 'MARKET_UPDATE');

        // decision: destination price 10 ≥ minimum 5 → profitable → TRAVEL on the only route
        expect(plan.decision).toBe('TRAVEL');
        expect(plan.profitable).toBe(true);
        expect(plan.routeId).toBe('road');
        expect(plan.destinationPrice).toBe(10);
        expect(plan.minimumPrice).toBe(5);

        // shipment and delivery: cargo left west, arrived east, nothing left in transit
        expect(create.status).toBe('IN_TRANSIT');
        expect(settle.outcome).toBe('DELIVERED');
        expect(settle.routeId).toBe('road');
        // shipment: 100 − 10 (trip) − 10 (origin consumption under the demand shock) at west;
        // 5 + 10 (delivery) + 10 (destination production under the supply shock) at east —
        // the reaction pair cancels exactly, so the two-market total is conserved at 105.
        expect(society.markets.get('west').stock.grain).toBe(80);
        expect(society.markets.get('east').stock.grain).toBe(25);
        expect(society.markets.get('west').inTransit.size).toBe(0);
        expect(society.markets.get('west').stock.grain + society.markets.get('east').stock.grain).toBe(105);
        expect(society.markets.get('west').balanceSheet().balanced).toBe(true);
        expect(society.markets.get('east').balanceSheet().balanced).toBe(true);

        // price response: scarcity raises the origin price, arrivals lower the destination price
        expect(updates).toHaveLength(2);
        expect(updates[0].market).toBe('west');
        expect(updates[0].shock).toBe('DEMAND');
        expect(updates[0].priceAfter).toBeGreaterThan(updates[0].priceBefore); // scarcity: 2 → 3
        expect(updates[1].market).toBe('east');
        expect(updates[1].shock).toBe('SUPPLY');
        expect(updates[1].priceAfter).toBeLessThan(updates[1].priceBefore); // arrivals: 10 → 5

        // one validated lineage from the TURN: plan → create → settle → update → update
        const chain = society.causalChain(updates[1].id);
        expect(chain.lineage.map(event => event.type)).toEqual([
            'TURN', 'MERCHANT_ROUTE_PLAN', 'MARKET_TRIP_CREATE', 'MARKET_TRIP_SETTLE', 'MARKET_UPDATE', 'MARKET_UPDATE',
        ]);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('stops at WAIT when unprofitable or unroutable, touching nothing', () => {
        const society = world();
        society.tick({ actions: [cycle({ minimumPrice: 50 })] });
        const plans = eventsOf(society, 'MERCHANT_ROUTE_PLAN');
        expect(plans).toHaveLength(1);
        expect(plans[0].decision).toBe('WAIT');
        expect(plans[0].profitable).toBe(false);
        expect(eventsOf(society, 'MARKET_TRIP_CREATE')).toHaveLength(0);
        expect(society.markets.get('west').stock.grain).toBe(100);
        expect(society.markets.get('east').stock.grain).toBe(5);

        const noRoute = world({ routes: [] });
        noRoute.tick({ actions: [cycle()] });
        const [plan] = eventsOf(noRoute, 'MERCHANT_ROUTE_PLAN');
        expect(plan.decision).toBe('WAIT');
        expect(plan.profitable).toBe(true);
        expect(plan.routeId).toBeNull();
        expect(noRoute.markets.get('west').stock.grain).toBe(100);
        expect(noRoute.markets.get('west').inTransit.size).toBe(0);
    });

    it('rejects the shipment when origin stock is short, without moving goods', () => {
        const society = world({ originStock: 4 });
        society.tick({ actions: [cycle({ quantity: 10 })] });
        const [create] = eventsOf(society, 'MARKET_TRIP_CREATE');
        expect(create.status).toBe('REJECTED');
        expect(create.reason).toBe('INSUFFICIENT_STOCK');
        expect(society.markets.get('west').stock.grain).toBe(4);
        expect(society.markets.get('east').stock.grain).toBe(5);
        expect(eventsOf(society, 'MARKET_TRIP_SETTLE')).toHaveLength(0);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('rejects invalid cycle inputs before mutating state', () => {
        const society = world();
        expect(() => society.tick({ actions: [cycle({ destination: 'nowhere' })] })).toThrow(/Unknown destination market/);
        expect(() => society.tick({ actions: [cycle({ market: 'nowhere' })] })).toThrow(/Unknown market/);
        expect(() => society.tick({ actions: [cycle({ market: 'east' })] })).toThrow(/distinct/);
        expect(() => society.tick({ actions: [cycle({ quantity: 0 })] })).toThrow(/positive quantity/);
        expect(() => society.tick({ actions: [cycle({ tripId: undefined })] })).toThrow(/tripId/);
        expect(() => society.tick({ actions: [cycle({ good: undefined })] })).toThrow(/requires a good/);
        expect(society.markets.get('west').stock.grain).toBe(100); // no partial mutation
        // a trip already in transit squats the id
        society.tick({ actions: [{ kind: 'MARKET_TRIP_CREATE', market: 'west', tripId: 'trip-9', good: 'grain', quantity: 5, destination: 'east' }] });
        expect(() => society.tick({ actions: [cycle()] })).toThrow(/Duplicate trip id/);
        expect(society.markets.get('west').stock.grain).toBe(95); // squat creation unchanged by the rejected cycle
    });

    it('continues across save/load with identical seeded state', () => {
        const society = world();
        society.tick({ actions: [cycle()] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.markets.get('west').stock.grain).toBe(80);
        expect(restored.markets.get('east').stock.grain).toBe(25);
        expect(restored.markets.get('east').prices.grain).toBe(society.markets.get('east').prices.grain);
        expect(restored.events).toHaveLength(society.events.length);
        // seeded-identical continuation on both worlds
        society.tick({ actions: [cycle({ tripId: 'trip-10' })] });
        restored.tick({ actions: [cycle({ tripId: 'trip-10' })] });
        expect(restored.serialize()).toEqual(society.serialize());
    });
});
