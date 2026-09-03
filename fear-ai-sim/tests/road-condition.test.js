import { createClosedWorldScenario, tickClosedWorld, schedulePendingTradeTrip, saveWorld, loadWorld } from '../closed-world.js';
import { routeCost } from '../routing.js';
import { chooseMerchantRouteDecision } from '../canonical-trade-system.js';

describe('road condition infrastructure (slice Z)', () => {
    test('routes start pristine and legacy roads without condition migrate on tick', () => {
        const world = createClosedWorldScenario();
        for (const route of world.routes) expect(route.condition).toBe(1);
        const legacy = createClosedWorldScenario();
        for (const route of legacy.routes) delete route.condition;
        tickClosedWorld(legacy, { tick: 1, perceivedDanger: 0.1 });
        // Migration yields a finite condition; the merchant may already have
        // shipped on tick 1 (maintenance runs before shipment wear), so the
        // migrated value is 1 minus at most one wagon-scaled wear step
        // (Slice AC: tick-1 cargo is at most 20 units = 2 wagons = 0.02).
        // Roads that shipped match their commitment's wagon count exactly.
        const wagonsByRoad = new Map();
        for (const event of legacy.events) {
            if (event.type === 'TRIP_COMMITMENT' && event.materialized !== false && Number.isInteger(event.wagons)) {
                wagonsByRoad.set(event.routeId, event.wagons);
            }
        }
        for (const route of legacy.routes) {
            expect(Number.isFinite(route.condition)).toBe(true);
            expect(route.condition).toBeGreaterThanOrEqual(0.98);
            expect(route.condition).toBeLessThanOrEqual(1);
            if (wagonsByRoad.has(route.id)) {
                expect(route.condition).toBeCloseTo(1 - 0.01 * wagonsByRoad.get(route.id), 10);
            } else {
                expect(route.condition).toBe(1);
            }
        }
    });

    test('each shipment wears the road and the commitment snapshots pre-wear condition', () => {
        const world = createClosedWorldScenario();
        world.merchants[0].cargo = 20;
        schedulePendingTradeTrip(world, {
            merchantId: 'merchant-1', routeId: 'road-a', destinationTownId: 'south',
            cargoKind: 'food', cargoAmount: 5, travelTicks: 5, startTick: 0,
        });
        expect(world.routes.find(r => r.id === 'road-a').condition).toBeCloseTo(0.99, 10);
        const commitment = world.events.find(e => e.type === 'TRIP_COMMITMENT');
        expect(commitment.roadCondition).toBe(1);
        expect(world.routes.find(r => r.id === 'road-b').condition).toBe(1);
    });

    test('maintenance recovers toward 1 and floors at 0.5', () => {
        const world = createClosedWorldScenario();
        world.routes.find(r => r.id === 'road-a').condition = 0.2;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1 });
        expect(world.routes.find(r => r.id === 'road-a').condition).toBe(0.5);
        const pristine = createClosedWorldScenario();
        tickClosedWorld(pristine, { tick: 1, perceivedDanger: 0.1 });
        for (const route of pristine.routes) expect(route.condition).toBeLessThanOrEqual(1);
    });

    test('degraded short road loses to a pristine long road (condition drives choice)', () => {
        const world = createClosedWorldScenario();
        const merchant = world.merchants[0];
        merchant.routeBeliefs = {
            'road-a': { perceivedDanger: 0.1, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.1, confidence: 0.9 },
        };
        const routes = [
            { id: 'road-a', from: 'north', to: 'south', distance: 5, condition: 0.5 },
            { id: 'road-b', from: 'north', to: 'south', distance: 9, condition: 1 },
        ];
        const degraded = chooseMerchantRouteDecision(merchant, routes, {}, { tick: 1, world });
        expect(degraded.chosenRoute).toBe('road-b');
        const pristineRoutes = [
            { id: 'road-a', from: 'north', to: 'south', distance: 5, condition: 1 },
            { id: 'road-b', from: 'north', to: 'south', distance: 9, condition: 1 },
        ];
        const pristine = chooseMerchantRouteDecision(merchant, pristineRoutes, {}, { tick: 1, world });
        expect(pristine.chosenRoute).toBe('road-a');
    });

    test('routeCost is unchanged without condition and doubles distance at floor', () => {
        const route = { id: 'road-a', from: 'north', to: 'south', distance: 5 };
        expect(routeCost(route, {})).toBe(5);
        expect(routeCost({ ...route, condition: 1 }, {})).toBe(5);
        expect(routeCost({ ...route, condition: 0.5 }, {})).toBe(10);
    });

    test('condition stays bounded over sustained traffic and persists through save/load', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        world.merchants[0].cargo = 20;
        for (let t = 1; t <= 50; t++) {
            world.merchants[0].cargo = Math.max(world.merchants[0].cargo, 5);
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        }
        for (const route of world.routes) {
            expect(route.condition).toBeGreaterThanOrEqual(0.5);
            expect(route.condition).toBeLessThanOrEqual(1);
        }
        const loaded = loadWorld(saveWorld(world));
        expect(loaded.routes.map(r => r.condition)).toEqual(world.routes.map(r => r.condition));
    });
});
