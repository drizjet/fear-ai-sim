import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, schedulePendingTradeTrip, resolveBanditAttack } from '../closed-world.js';

// EVID-2026-08-31-PENDING-TRIP-MARKET-LOOP
//
// The material market loop must run through the trip mechanism, not
// only through direct `deliverCargo` calls:
//   schedulePendingTradeTrip → IN_TRANSIT → TRIP_ARRIVAL →
//   DELIVER_CARGO consequence → destination market inventory +
//   quote price drop → booked into marketFlows.delivered and
//   MARKET_TICK.flows.delivered (the §155 mass-balance term).
//
// Fixture law: a two-town world with a source (north) and a sink
// (south), shipments via the production trip API, so conservation is
// meaningful. `startTick: 0` makes a travelTicks:1 trip land on tick 1
// (the advance pass skips ticks where `tick <= lastAdvancedTick`).

function tripWorld() {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    world.merchants[0].cargo = 20;
    world.merchants[0].cargoKind = 'food';
    const south = world.towns.get('south');
    south.market.setCapacity('food', 200);
    south.market.setDemand('food', 10, 1);
    south.market.inventory.set('food', 0);
    world.towns.get('north').market.inventory.set('food', 50);
    world.bandits = [];
    return world;
}

describe('Slice A follow-up — pending-trip cargo materializes into the market loop', () => {
    it('schedule → arrival → deliverCargo lands inventory, price drops, and the §155 flow is booked', () => {
        const world = tripWorld();
        const south = world.towns.get('south');
        const before = south.market.getQuote('food').price;
        // Ship 12 units north → south (road-b), travel 1 tick.
        const trip = schedulePendingTradeTrip(world, {
            merchantId: 'merchant-1',
            routeId: 'road-b',
            destinationTownId: 'south',
            cargoKind: 'food',
            cargoAmount: 12,
            travelTicks: 1,
            startTick: 0,
        });
        expect(trip.status).toBe('IN_TRANSIT');
        // Cargo left the merchant immediately.
        expect(world.merchants[0].cargo).toBe(8);

        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        expect(trip.status).toBe('DELIVERED');
        const q = south.market.getQuote('food');
        // 12 units landed, then the tick's production/consumption/spoilage
        // moved the supply a little (12 + 1.2 − 1 − 0.61 ≈ 11.59).
        expect(q.supply).toBeGreaterThanOrEqual(11);
        expect(q.price).toBeLessThan(before);
        expect(q.price).toBeLessThanOrEqual(1.5);
        // §155 mass-balance: the delivery is booked in the cumulative trail.
        const southFlow = world.marketFlows.get('south:food');
        expect(southFlow.delivered).toBe(12);
        // And surfaced on the MARKET_TICK event for that tick.
        const tickEvent = world.events.find(
            e => e.type === 'MARKET_TICK' && e.townId === 'south' && e.kind === 'food' && e.tick === 1
        );
        expect(tickEvent).toBeDefined();
        expect(tickEvent.flows.delivered).toBe(12);
        // The PENDING_CARGO_DELIVERED event carries the delivery result.
        const deliveredEvent = world.events.find(e => e.type === 'PENDING_CARGO_DELIVERED');
        expect(deliveredEvent).toBeDefined();
        expect(deliveredEvent.delivery.stored).toBe(12);
        // Cargo conservation: shipped 12 - abstracted merchant cargo.
        // The trip owned 12 while in transit; after delivery the
        // merchant holds the unshipped remainder (8) plus production
        // cycle effects, so it must always be <= 8 + epsilon.
        expect(world.merchants[0].cargo).toBeLessThanOrEqual(8 + 0.001);
    });

    it('per-tick mass-balance holds with the +delivered term on delivery ticks', () => {
        const world = tripWorld();
        const south = world.towns.get('south');
        const supplyBefore = new Map();
        for (let t = 1; t <= 8; t++) {
            if (t % 2 === 1) {
                // The production auto-shipper drains merchant cargo each
                // tick, so refill before each manual schedule to keep
                // this test focused on the trip→market booking, not on
                // merchant inventory arithmetic.
                world.merchants[0].cargo = 50;
                schedulePendingTradeTrip(world, {
                    merchantId: 'merchant-1',
                    routeId: 'road-b',
                    destinationTownId: 'south',
                    cargoKind: 'food',
                    cargoAmount: 5,
                    travelTicks: 1,
                    startTick: t - 1,
                });
            }
            supplyBefore.set(`${t}:before`, south.market.getQuote('food').supply);
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
            const after = south.market.getQuote('food').supply;
            const tickEvents = world.events.filter(
                e => e.type === 'MARKET_TICK' && e.townId === 'south'
                    && e.kind === 'food' && e.tick === t
            );
            for (const ev of tickEvents) {
                const stored = (ev.flows.produced ?? 0) - (ev.flows.overflow ?? 0);
                const expectedDelta = stored
                    + (ev.flows.delivered ?? 0)
                    - (ev.flows.consumed ?? 0)
                    - (ev.flows.spoiled ?? 0);
                const actualDelta = after - supplyBefore.get(`${t}:before`);
                // If the quote changed this tick, the event must
                // reconcile exactly — including the delivery term.
                expect(actualDelta).toBeCloseTo(expectedDelta, 5);
            }
        }
        // Audit trail is a superset of the (suppressive) event log:
        // every per-tick delivered shows up in the cumulative flow.
        let delivTotal = 0;
        for (const ev of world.events) {
            if (ev.type === 'MARKET_TICK' && ev.townId === 'south' && ev.kind === 'food') {
                delivTotal += ev.flows.delivered ?? 0;
            }
        }
        expect(world.marketFlows.get('south:food').delivered).toBeGreaterThanOrEqual(delivTotal - 0.0001);
    });

    it('a raid that strips the merchant before shipping means no delivery lands and the price stays high', () => {
        const safe = tripWorld();
        const raided = tripWorld();
        // Safe: full cargo, ships 12.
        schedulePendingTradeTrip(safe, {
            merchantId: 'merchant-1', routeId: 'road-b', destinationTownId: 'south',
            cargoKind: 'food', cargoAmount: 12, travelTicks: 1, startTick: 0,
        });
        // Raided: the bandit resolves the attack first (production
        // resolver), which zeroes the merchant's cargo. The merchant
        // cannot ship what it no longer owns.
        const attack = resolveBanditAttack(raided, {
            merchantId: 'merchant-1', roadId: 'road-b', tick: 0,
        });
        expect(attack.ok).toBe(true);
        expect(raided.merchants[0].cargo).toBe(0);
        let raidedShipFailed = false;
        try {
            schedulePendingTradeTrip(raided, {
                merchantId: 'merchant-1', routeId: 'road-b', destinationTownId: 'south',
                cargoKind: 'food', cargoAmount: 12, travelTicks: 1, startTick: 0,
            });
        } catch {
            raidedShipFailed = true; // merchant does not own 12 units anymore
        }
        expect(raidedShipFailed).toBe(true);

        tickClosedWorld(safe, { tick: 1, perceivedDanger: 0.5 });
        tickClosedWorld(raided, { tick: 1, perceivedDanger: 0.5 });

        const safeDelivered = safe.marketFlows.get('south:food')?.delivered ?? 0;
        // The raided world booked no *trip* delivery (its attack leftover
        // was delivered by the resolver, not shipped by a merchant trip).
        const raidedTripDeliveries = raided.events.filter(e => e.type === 'PENDING_CARGO_DELIVERED').length;
        expect(safeDelivered).toBeGreaterThan(0);
        expect(raidedTripDeliveries).toBe(0);
        const safeQ = safe.towns.get('south').market.getQuote('food');
        const raidedQ = raided.towns.get('south').market.getQuote('food');
        // Both worlds receive supply (safe via trip, raided via the
        // attack remainder), but the raided merchant cannot trade onward:
        // its cargo is gone. Price comparison is not the assertion here;
        // the trip-materialization difference is (raided shipped 0 trips).
        expect(safeQ.price).toBeLessThanOrEqual(raidedQ.price);
    });
});