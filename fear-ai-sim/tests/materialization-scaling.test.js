import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

// R5 (V8 audit TM-HOLD-08/09) — the two unguarded terms of the trip
// materialization statement. Both scale material flow in production;
// neutralizing either must fail here.

function beliefWorld(danger) {
    const world = createClosedWorldScenario();
    const merchant = world.merchants[0];
    merchant.cargo = 20;
    merchant.routeBeliefs = {
        'road-a': { perceivedDanger: danger, confidence: 0.9 },
        'road-b': { perceivedDanger: danger, confidence: 0.9 },
        'road-c': { perceivedDanger: danger, confidence: 0.9 },
    };
    return { world, merchant };
}

describe('trip materialization scaling (R5 holdouts)', () => {
    test('believed danger scales shipped volume', () => {
        // Uniform beliefs keep the route choice identical while the
        // danger level differs: cautious merchants ship less.
        const calm = beliefWorld(0.05);
        const nervous = beliefWorld(0.95);
        tickClosedWorld(calm.world, { tick: 1, perceivedDanger: 0.5 });
        tickClosedWorld(nervous.world, { tick: 1, perceivedDanger: 0.5 });
        const calmCargo = calm.world.events.find(e => e.type === 'TRIP_COMMITMENT' && e.status !== 'DEFERRED')?.cargo?.amount;
        const nervousCargo = nervous.world.events.find(e => e.type === 'TRIP_COMMITMENT' && e.status !== 'DEFERRED')?.cargo?.amount;
        expect(calmCargo).toBeDefined();
        expect(nervousCargo).toBeDefined();
        expect(nervousCargo).toBeLessThan(calmCargo);
    });

    test('road condition scales travel time', () => {
        // Same shipment, different road wear: degraded roads take
        // longer (round(distance / condition)), worst case 2x.
        const pristine = createClosedWorldScenario();
        pristine.routes.find(r => r.id === 'road-a').condition = 1;
        pristine.merchants[0].cargo = 20;
        pristine.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.05, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.8, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.8, confidence: 0.5 },
        };
        const worn = createClosedWorldScenario();
        worn.routes.find(r => r.id === 'road-a').condition = 0.5;
        worn.merchants[0].cargo = 20;
        worn.merchants[0].routeBeliefs = {
            'road-a': { perceivedDanger: 0.05, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.8, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.8, confidence: 0.5 },
        };
        tickClosedWorld(pristine, { tick: 1, perceivedDanger: 0.0 });
        tickClosedWorld(worn, { tick: 1, perceivedDanger: 0.0 });
        const pristineTrip = pristine.pendingTrips.find(t => t.status === 'IN_TRANSIT');
        const wornTrip = worn.pendingTrips.find(t => t.status === 'IN_TRANSIT');
        expect(pristineTrip).toBeDefined();
        expect(wornTrip).toBeDefined();
        expect(pristineTrip.routeId).toBe('road-a');
        expect(wornTrip.routeId).toBe('road-a');
        expect(wornTrip.remainingTicks).toBeGreaterThan(pristineTrip.remainingTicks);
    });
});
