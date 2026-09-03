import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld, schedulePendingTradeTrip, wagonsForShipment, WAGON_CAPACITY } from '../closed-world.js';

function ship(world, amount, routeId = 'road-a') {
    return schedulePendingTradeTrip(world, {
        merchantId: 'merchant-1', routeId, destinationTownId: 'south',
        cargoKind: 'food', cargoAmount: amount, travelTicks: 5, startTick: 0,
    });
}

describe('logistics wagon capacity (slice AC)', () => {
    test('wagon math: standard loads are one wagon, overflow takes more', () => {
        expect(WAGON_CAPACITY).toBe(12);
        expect(wagonsForShipment(1)).toBe(1);
        expect(wagonsForShipment(12)).toBe(1);
        expect(wagonsForShipment(13)).toBe(2);
        expect(wagonsForShipment(24)).toBe(2);
        expect(wagonsForShipment(25)).toBe(3);
    });

    test('12-unit shipment keeps the legacy 0.01 wear and audits one wagon', () => {
        const world = createClosedWorldScenario();
        ship(world, 12);
        expect(world.routes.find(r => r.id === 'road-a').condition).toBeCloseTo(0.99, 10);
        const commitment = world.events.find(e => e.type === 'TRIP_COMMITMENT');
        expect(commitment.wagons).toBe(1);
        expect(commitment.roadCondition).toBe(1);
    });

    test('20-unit shipment wears twice as much and audits two wagons', () => {
        const world = createClosedWorldScenario();
        ship(world, 20);
        expect(world.routes.find(r => r.id === 'road-a').condition).toBeCloseTo(0.98, 10);
        const commitment = world.events.find(e => e.type === 'TRIP_COMMITMENT');
        expect(commitment.wagons).toBe(2);
    });

    test('cargo volume is preserved — capacity prices the road, not the goods', () => {
        const world = createClosedWorldScenario();
        const trip = ship(world, 20);
        expect(trip.cargo.amount).toBe(20);
        expect(world.merchants.find(m => m.id === 'merchant-1').cargo).toBe(0);
    });

    test('condition floor holds under wagon-scaled wear', () => {
        const world = createClosedWorldScenario();
        const road = world.routes.find(r => r.id === 'road-a');
        road.condition = 0.5;
        world.merchants.find(m => m.id === 'merchant-1').cargo = 40;
        ship(world, 24);
        expect(road.condition).toBe(0.5);
    });

    test('wagon-scaled condition survives save/load', () => {
        const world = createClosedWorldScenario();
        ship(world, 20);
        const loaded = loadWorld(saveWorld(world));
        expect(loaded.routes.find(r => r.id === 'road-a').condition)
            .toBe(world.routes.find(r => r.id === 'road-a').condition);
        expect(loaded.events.find(e => e.type === 'TRIP_COMMITMENT').wagons).toBe(2);
    });
});
