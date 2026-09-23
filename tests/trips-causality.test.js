import { describe, expect, it } from '@jest/globals';
import { Market, SocietyCore } from '../societycore.js';

describe('causal observations and materialized trips', () => {
    it('records observation and belief update as ordered TURN children', () => {
        const society = new SocietyCore();
        const actor = { id: 'merchant' };
        society.tick({ actions: [{ kind: 'ROUTE_OBSERVATION', actor, route: { id: 'road-a', actualDanger: 99 }, observation: { perceivedDanger: 2, confidence: 1, source: 'scout' } }] });
        const turn = society.events[0];
        const observation = society.events.find(event => event.type === 'ROUTE_OBSERVATION');
        const belief = society.events.find(event => event.type === 'BELIEF_UPDATED');
        expect(observation.parentId).toBe(turn.id);
        expect(belief.parentId).toBe(observation.id);
        expect(belief.tick).toBe(turn.tick);
        expect(actor.beliefs.get('route:road-a:danger').estimate).toBe(2);
    });

    it('allocates origin material into transit and settles exactly once', () => {
        const society = new SocietyCore();
        society.addMarket('north', new Market({ stock: { grain: 10 } }));
        society.addMarket('south', new Market({ stock: { grain: 0 } }));
        society.tick({ actions: [{ kind: 'MARKET_TRIP_CREATE', market: 'north', tripId: 'trip-1', good: 'grain', quantity: 4, destination: 'south' }] });
        const market = society.markets.get('north');
        expect(market.stock.grain).toBe(6);
        expect(market.inTransit.get('trip-1').status).toBe('IN_TRANSIT');
        expect(market.balanceSheet().goods.grain.tradeOut).toBe(4);
        society.tick({ actions: [{ kind: 'MARKET_TRIP_SETTLE', market: 'north', destinationMarket: 'south', tripId: 'trip-1', outcome: 'DELIVERED' }] });
        expect(market.inTransit.size).toBe(0);
        expect(society.markets.get('south').stock.grain).toBe(4);
        expect(market.history.filter(entry => entry.kind === 'TRIP_SETTLEMENT')).toHaveLength(1);
        expect(() => market.settleTrip('trip-1', 'DELIVERED')).toThrow(/already settled/);
        expect(market.balanceSheet().balanced).toBe(true);
    });

    it('records a declared loss without silently restoring origin stock', () => {
        const market = new Market({ stock: { grain: 5 } });
        expect(market.createTrip({ id: 'trip-loss', good: 'grain', quantity: 3, destination: 'south' })).not.toBeNull();
        expect(market.settleTrip('trip-loss', 'LOST').status).toBe('LOST');
        expect(market.stock.grain).toBe(2);
        expect(market.balanceSheet().goods.grain.tradeOut).toBe(0);
        expect(market.balanceSheet().goods.grain.destroyed).toBe(3);
        expect(market.balanceSheet().balanced).toBe(true);
    });

    it('returns cargo to origin ownership and records stolen ownership exactly once', () => {
        const market = new Market({ stock: { grain: 10 } });
        const trip = market.createTrip({ id: 'trip-return', good: 'grain', quantity: 4, destination: 'south' });
        expect(trip.status).toBe('IN_TRANSIT');
        expect(market.settleTrip('trip-return', 'RETURNED').status).toBe('RETURNED');
        expect(market.stock.grain).toBe(10);
        expect(market.history.filter(entry => entry.kind === 'TRIP_RETURN')).toHaveLength(1);
        expect(market.balanceSheet().balanced).toBe(true);

        const stolen = market.createTrip({ id: 'trip-stolen', good: 'grain', quantity: 3, destination: 'south' });
        expect(stolen.status).toBe('IN_TRANSIT');
        expect(market.settleTrip('trip-stolen', 'STOLEN').status).toBe('STOLEN');
        expect(market.stock.grain).toBe(7);
        expect(market.history.filter(entry => entry.kind === 'TRIP_THEFT')).toHaveLength(1);
        expect(market.balanceSheet().goods.grain.tradeOut).toBe(7);
        expect(() => market.settleTrip('trip-stolen', 'STOLEN')).toThrow(/already settled/);
        expect(market.balanceSheet().balanced).toBe(true);
    });

    it('preserves mass across origin and destination markets on delivery', () => {
        const origin = new Market({ stock: { grain: 10 } });
        const destination = new Market({ stock: { grain: 2 } });
        origin.createTrip({ id: 'trip-cross', good: 'grain', quantity: 4, destination: 'south' });
        origin.settleTrip('trip-cross', 'DELIVERED', destination);
        expect(origin.stock.grain + destination.stock.grain).toBe(12);
        expect(origin.balanceSheet().balanced).toBe(true);
        expect(destination.balanceSheet().balanced).toBe(true);
    });
});
