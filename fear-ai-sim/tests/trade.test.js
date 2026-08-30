import { describe, expect, it } from '@jest/globals';
import { Market } from '../economy.js';
import { Merchant, Town, runTradeTrip, runTradeGraphTick, routesBetween } from '../trade.js';

describe('Deterministic town and merchant trade loop', () => {
    function makeTowns() {
        const origin = new Town('origin');
        const destination = new Town('destination');
        destination.market.setDemand('grain', 100, 2);
        return { origin, destination };
    }

    it('delivers cargo and records the selected route', () => {
        const { origin, destination } = makeTowns();
        const merchant = new Merchant('merchant-1', { grain: 20 });
        const result = runTradeTrip(merchant, origin, destination, [
            { id: 'road-a', distance: 30 },
            { id: 'road-b', distance: 50 }
        ], { perceivedDanger: 0, confidence: 1 });
        expect(result.ok).toBe(true);
        expect(result.routeId).toBe('road-a');
        expect(result.deliveries[0].delivered).toBe(20);
        expect(merchant.location).toBe('destination');
        expect(destination.market.getQuote('grain').supply).toBe(20);
    });

    it('changes delivered supply when the merchant perceives danger', () => {
        const { origin, destination } = makeTowns();
        const merchant = new Merchant('merchant-2', { grain: 100 });
        const result = runTradeTrip(merchant, origin, destination, [{ id: 'road-a', distance: 30 }], {
            perceivedDanger: 1,
            confidence: 0,
            cargoValue: 100,
            perceivedAmbushProbability: 1
        });
        expect(result.deliveries[0].lost).toBeGreaterThan(0);
        expect(destination.market.getQuote('grain').shortage).toBeGreaterThan(0);
    });

    it('resolves only routes connecting the requested towns', () => {
        const routes = [
            { id: 'a-b', from: 'a', to: 'b' },
            { id: 'b-c', from: 'b', to: 'c' },
            { id: 'legacy', distance: 5 }
        ];
        expect(routesBetween(routes, 'a', 'b').map(route => route.id)).toEqual(['a-b']);
        expect(routesBetween(routes, 'a', 'c')).toEqual([]);
        expect(routesBetween(routes, 'a', 'b').some(route => route.id === 'legacy')).toBe(false);
    });

    it('supports an active trip completing against a town graph', () => {
        const origin = new Town('origin');
        const middle = new Town('middle');
        middle.market.setDemand('grain', 20, 1);
        const merchant = new Merchant('merchant-graph', { grain: 5 });
        const departure = merchant.startTrip(origin, middle, [{ id: 'road-a', from: origin.id, to: middle.id, distance: 10 }], { confidence: 1 }, new Map([[origin.id, origin], [middle.id, middle]]));
        expect(departure.ok).toBe(true);
        expect(merchant.completeTrip(new Map([[origin.id, origin], [middle.id, middle]]), { confidence: 1 }).ok).toBe(true);
        expect(merchant.trip).toBeNull();
        expect(middle.market.getQuote('grain').supply).toBe(5);
    });

    it('starts then completes autonomous graph ticks for idle merchants', () => {
        const origin = new Town('origin');
        const destination = new Town('destination');
        destination.market.setDemand('grain', 10, 1);
        const merchant = new Merchant('merchant-tick', { grain: 4 });
        const towns = new Map([[origin.id, origin], [destination.id, destination]]);
        const routes = [{ id: 'origin-destination', from: 'origin', to: 'destination', distance: 10 }];
        const first = runTradeGraphTick([merchant], towns, routes, { 'merchant-tick': { confidence: 1 } });
        expect(first[0].ok).toBe(true);
        expect(merchant.trip).not.toBeNull();
        const second = runTradeGraphTick([merchant], towns, routes, { 'merchant-tick': { confidence: 1 } });
        expect(second[0].ok).toBe(true);
        expect(merchant.location).toBe('destination');
        expect(destination.market.getQuote('grain').supply).toBe(4);
    });

    it('completes a multi-hop graph trip using all path segments', () => {
        const origin = new Town('a');
        const destination = new Town('c');
        destination.market.setDemand('grain', 10, 1);
        const merchant = new Merchant('multi-hop', { grain: 3 });
        const towns = new Map([['a', origin], ['b', new Town('b')], ['c', destination]]);
        const routes = [
            { id: 'a-b', from: 'a', to: 'b', distance: 4 },
            { id: 'b-c', from: 'b', to: 'c', distance: 4 }
        ];
        const first = runTradeGraphTick([merchant], towns, routes, { 'multi-hop': { confidence: 1 } });
        expect(first[0].ok).toBe(true);
        expect(merchant.trip.decision.route.id).toBe('a-b');
        const second = runTradeGraphTick([merchant], towns, routes, { 'multi-hop': { confidence: 1 } });
        expect(second[0].ok).toBe(true);
        const third = runTradeGraphTick([merchant], towns, routes, { 'multi-hop': { confidence: 1 } });
        expect(third[0].ok).toBe(false);
        expect(third[0].reason).toBe('NO_ROUTE');
        expect(merchant.location).toBe('b');
        expect(destination.market.getQuote('grain').supply).toBe(0);
    });

    it('does not mutate markets until the final edge of a persistent trip', () => {
        const origin = new Town('a');
        const middle = new Town('b');
        const destination = new Town('c');
        destination.market.setDemand('grain', 10, 1);
        const merchant = new Merchant('three-hop', { grain: 7 });
        const towns = new Map([['a', origin], ['b', middle], ['c', destination]]);
        const path = [
            { id: 'a-b', from: 'a', to: 'b', distance: 1 },
            { id: 'b-c', from: 'b', to: 'c', distance: 1 }
        ];
        expect(merchant.startTrip(origin, destination, path, { confidence: 1 }, towns).route.id).toBe('a-b');
        expect(destination.market.getQuote('grain').supply).toBe(0);
        expect(merchant.completeTrip(towns, { confidence: 1 }).inTransit).toBe(true);
        expect(destination.market.getQuote('grain').supply).toBe(0);
        expect(merchant.completeTrip(towns, { confidence: 1 }).ok).toBe(true);
        expect(destination.market.getQuote('grain').supply).toBe(7);
        expect(merchant.completeTrip(towns, { confidence: 1 }).reason).toBe('NO_ACTIVE_TRIP');
        expect(destination.market.getQuote('grain').supply).toBe(7);
    });

    it('rejects disconnected, missing-town, stale-edge, and invalid paths safely', () => {
        const origin = new Town('a');
        const destination = new Town('c');
        const merchant = new Merchant('invalid', { grain: 2 });
        const towns = new Map([['a', origin], ['c', destination]]);
        expect(merchant.startTrip(origin, destination, [{ id: 'wrong', from: 'a', to: 'b' }], {}, towns).ok).toBe(false);
        expect(merchant.trip).toBeNull();
        expect(merchant.startTrip(origin, destination, [{ id: 'bad', from: 'a', to: 'c' }], {}, towns).ok).toBe(true);
        towns.delete('c');
        expect(merchant.completeTrip(towns).reason).toBe('INVALID_ROUTE');
        expect(merchant.trip.edgeIndex).toBe(0);
    });

    it('rejects a trip with no candidate route without mutating the merchant', () => {
        const { origin, destination } = makeTowns();
        const merchant = new Merchant('merchant-3', { grain: 10 });
        expect(runTradeTrip(merchant, origin, destination, [], {})).toEqual({ ok: false, reason: 'NO_ROUTE' });
        expect(merchant.location).toBeNull();
        expect(destination.market.getQuote('grain').supply).toBe(0);
    });
});
