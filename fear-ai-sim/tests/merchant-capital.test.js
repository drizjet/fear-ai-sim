import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack, saveWorld, loadWorld, schedulePendingTradeTrip } from '../closed-world.js';

// E9 — merchant capital. Trade has a downside now: buys cost, sales
// earn, and raids destroy value, all at live market quotes. A merchant
// stripped past zero goes bankrupt and stops shipping (terminal —
// there is no bailout). Quiet worlds never come close.

function quietWorld() {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    return world;
}

function runTicks(world, from, to) {
    for (let t = from; t <= to; t++) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.0, encounterRng: () => 0.999 });
    }
}

describe('E9 merchant capital', () => {
    it('deliveries earn revenue at the destination quote', () => {
        const world = quietWorld();
        runTicks(world, 1, 30);
        const merchant = world.merchants[0];
        expect(merchant.capital).toBeGreaterThan(100);
        const deliveries = world.events.filter(e => e.type === 'PENDING_CARGO_DELIVERED');
        expect(deliveries.length).toBeGreaterThan(0);
        for (const d of deliveries) {
            expect(d.merchantCapital).toBeGreaterThan(0);
            expect(d.capitalDelta).toBeGreaterThan(0);
        }
    });

    it('a single delivery credits exactly stored x pre-landing price', () => {
        const world = quietWorld();
        const merchant = world.merchants[0];
        merchant.cargo = 10;
        merchant.cargoKind = 'food';
        const south = world.towns.get('south');
        south.market.setCapacity('food', 500);
        const price = south.market.getQuote('food').price;
        schedulePendingTradeTrip(world, {
            merchantId: 'merchant-1', routeId: 'road-b', destinationTownId: 'south',
            cargoKind: 'food', cargoAmount: 10, travelTicks: 1, startTick: 0,
        });
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, encounterRng: () => 0.999 });
        const delivered = world.events.find(e => e.type === 'PENDING_CARGO_DELIVERED');
        expect(delivered).toBeDefined();
        expect(merchant.capital).toBeCloseTo(100 + (delivered.delivery?.stored ?? 0) * price, 8);
    });

    it('a raid books the loss and the forced sale at live quotes', () => {
        const world = quietWorld();
        const merchant = world.merchants[0];
        merchant.cargo = 20;
        merchant.cargoKind = 'food';
        const before = merchant.capital ?? 100;
        const r = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(r.ok).toBe(true);
        expect(r.event.capitalHit).toBeLessThan(0);
        expect(r.event.capitalGain).toBeGreaterThanOrEqual(0);
        expect(merchant.capital).toBeCloseTo(before + r.event.capitalHit + r.event.capitalGain, 8);
    });

    it('a stripped merchant goes bankrupt once and stops shipping', () => {
        const world = quietWorld();
        const merchant = world.merchants[0];
        let guard = 0;
        while ((merchant.capital ?? 100) >= 0 && guard++ < 20) {
            merchant.cargo = 20;
            merchant.cargoKind = 'food';
            resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: guard });
        }
        expect(merchant.capital).toBeLessThan(0);
        runTicks(world, 21, 25);
        const bankrupts = world.events.filter(e => e.type === 'MERCHANT_BANKRUPT' && e.merchantId === 'merchant-1');
        expect(bankrupts.length).toBe(1);
        const shipped = world.events.filter(e =>
            e.type === 'TRIP_COMMITMENT' && e.materialized !== false
            && e.merchantId === 'merchant-1' && e.tick >= 21);
        expect(shipped.length).toBe(0);
        const deferrals = world.events.filter(e =>
            e.type === 'TRIP_COMMITMENT' && e.status === 'DEFERRED'
            && e.reason === 'BANKRUPT' && e.tick >= 21);
        expect(deferrals.length).toBeGreaterThan(0);
    });

    it('a quiet trading loop never bankrupts (zero-blast pin)', () => {
        const world = quietWorld();
        runTicks(world, 1, 120);
        expect(world.merchants[0].capital).toBeGreaterThanOrEqual(100);
        expect(world.events.some(e => e.type === 'MERCHANT_BANKRUPT')).toBe(false);
    });

    it('capital survives save/load with identical follow-up earnings', () => {
        const world = quietWorld();
        runTicks(world, 1, 10);
        const resumed = loadWorld(saveWorld(world));
        expect(resumed.merchants[0].capital).toBe(world.merchants[0].capital);
        runTicks(world, 11, 15);
        runTicks(resumed, 11, 15);
        expect(resumed.merchants[0].capital).toBe(world.merchants[0].capital);
    });
});
