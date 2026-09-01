import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    schedulePendingTradeTrip,
    resolveBanditAttack,
} from '../closed-world.js';
import { tickPatrol } from '../canonical-trade-system.js';

// R2 Wave 1 — Subagent A remainder (W1-MATERIAL-TRADE-CLOSURE, loss side).
//
// Frozen contracts under test:
//   MARKET-GLOBAL-MASS-001 — over towns + merchant cargo + in-trip cargo
//     + the persistent loss sink (world.transitLoss) − declared exogenous
//     inflow (world.exogenousInflow), material conserves exactly across
//     produce / consume / spoil / overflow / delivery / theft / restock.
//     The residual massResidual(world) must be 0 at every tick. A theft
//     with an unbooked loss sink pushes the residual positive by exactly
//     the lost amount (this is what MUT-MARKET-THEFT-001 kills).
//   MARKET-TRIP-001 — an accepted positive-cargo trip reaches exactly one
//     terminal state (DELIVERED) and its delivery consequence applies
//     exactly once (MUT-MARKET-EXACTONCE-001 kills this by leaving the
//     consequence/trip open so the same delivery re-applies).
//   Loss ledger lifecycle — attack theft books into world.transitLoss;
//     a successful patrol interception reverses the booking (recovered
//     cargo is not destroyed material).

function totalTownsSupply(world) {
    let total = 0;
    for (const town of world.towns.values()) {
        for (const kind of ['food', 'tools']) {
            total += Number(town.market.inventory.get(kind) ?? 0);
        }
    }
    return total;
}

function totalMerchantCargo(world) {
    return (world.merchants ?? []).reduce((sum, m) => sum + (Number(m.cargo) || 0), 0);
}

function totalInTripCargo(world) {
    return (world.pendingTrips ?? []).reduce((sum, t) => sum + (Number(t.cargo?.amount) || 0), 0);
}

function flowTerm(world, term) {
    let sum = 0;
    for (const flow of (world.marketFlows ?? new Map()).values()) sum += Number(flow[term]) || 0;
    return sum;
}

/**
 * Closed-system mass residual. 0 means every unit of material that left
 * the system is declared (consumed, spoiled, delivery-overflow waste) or
 * parked in the loss sink, and every unit that entered is declared
 * (production stored, exogenous inflow). Any unexplained creation or
 * destruction pushes this away from 0.
 */
function massResidual(world) {
    let k = totalTownsSupply(world) + totalMerchantCargo(world) + totalInTripCargo(world);
    for (const kind of Object.keys(world.transitLoss ?? {})) k += Number(world.transitLoss[kind]) || 0;
    for (const kind of Object.keys(world.exogenousInflow ?? {})) k -= Number(world.exogenousInflow[kind]) || 0;
    // Net production actually stored (attempted − capacity-rejected).
    k -= flowTerm(world, 'produced') - flowTerm(world, 'overflow');
    // Outflows the town ledger already subtracted from supply.
    k += flowTerm(world, 'consumed') + flowTerm(world, 'spoiled') + flowTerm(world, 'deliveryOverflow');
    return k;
}

describe('R2 W1 — loss sink: theft books, interception reverses, mass conserves', () => {
    it('resolveBanditAttack theft books into transitLoss; global identity stays exact', () => {
        const world = createClosedWorldScenario();
        const south = world.towns.get('south');
        void south;
        world.towns.get('south').market.setDemand('food', 50, 1);
        world.towns.get('south').market.setCapacity('food', 200);
        world.towns.get('south').market.inventory.set('food', 0);
        world.merchants[0].cargo = 20;
        const baseline = massResidual(world);
        expect(massResidual(world)).toBeCloseTo(baseline, 5);

        const r = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(r.ok).toBe(true);
        expect(r.event.lost).toBeCloseTo(16, 5); // 20 * road-a danger 0.8
        expect(world.merchants[0].cargo).toBe(0);
        // Theft lands in the loss sink, not nowhere.
        expect(world.transitLoss.food).toBeCloseTo(16, 5);
        // The remainder really reached the destination market.
        expect(world.towns.get('south').market.getQuote('food').supply).toBeCloseTo(4, 5);
        // Nothing vanished: the conserved quantity is unchanged.
        expect(massResidual(world)).toBeCloseTo(baseline, 5);
        // MUT-MARKET-THEFT-001: with the booking removed this residual is
        // ~+16 — material that "disappeared" unexplained.
    });

    it('patrol interception reverses the loss-sink booking (cargo recovered, not destroyed)', () => {
        const world = createClosedWorldScenario();
        world.towns.get('south').market.setDemand('food', 50, 1);
        world.towns.get('south').market.setCapacity('food', 200);
        world.towns.get('south').market.inventory.set('food', 0);
        world.merchants[0].cargo = 20;
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(world.transitLoss.food).toBeCloseTo(16, 5);
        const baseline = massResidual(world);

        world.patrols = [{
            id: 'patrol-1', deployedRoute: 'road-a', detectionRate: 1, interceptionRate: 1,
            detections: 0, interceptions: 0,
        }];
        const patrolResult = tickPatrol(world, 'patrol-1', { tick: 1, rng: () => 0 });
        expect(patrolResult.ok).toBe(true);
        // Cargo restored to the merchant AND un-booked from the loss sink.
        expect(world.merchants[0].cargo).toBeCloseTo(16, 5);
        expect(world.transitLoss.food).toBeCloseTo(0, 5);
        expect(massResidual(world)).toBeCloseTo(baseline, 5);
    });

    it('default world conserves the global mass identity over 40 ticks with real theft + restock', () => {
        const world = createClosedWorldScenario({ season: 'SPRING' });
        world.ticksPerSeason = 10000; // pin season so production is stable
        const baseline = massResidual(world);
        let sawTheft = false;
        let sawRestock = false;
        for (let t = 1; t <= 40; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, relationshipGate: true });
            // The exact conservation identity holds on EVERY tick,
            // including delivery ticks, theft ticks, and restock ticks.
            expect(massResidual(world)).toBeCloseTo(baseline, 5);
            if ((world.transitLoss.food ?? 0) > 0) sawTheft = true;
            if ((world.exogenousInflow.food ?? 0) > 0) sawRestock = true;
        }
        // The production encounter engine must really have fired theft
        // (probe: first BANDIT_ATTACK on tick 2 in the default world),
        // and merchant restock must have been declared, not hidden.
        expect(sawTheft).toBe(true);
        expect(sawRestock).toBe(true);
        expect(world.transitLoss.food).toBeGreaterThan(0);
        expect(world.exogenousInflow.food).toBeGreaterThan(0);
    });
});

describe('R2 W1 — trip terminal state applies exactly once (MUT-MARKET-EXACTONCE-001)', () => {
    it('a delivered trip is recorded once and never re-applies on later ticks', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        const south = world.towns.get('south');
        south.market.setCapacity('food', 100);
        south.market.setDemand('food', 30, 1);
        south.market.inventory.set('food', 0);
        const merchant = world.merchants[0];
        merchant.cargo = 50;

        const trip = schedulePendingTradeTrip(world, {
            merchantId: 'merchant-1',
            routeId: 'road-a',
            destinationTownId: 'south',
            cargoKind: 'food',
            cargoAmount: 10,
            travelTicks: 1,
            startTick: 0,
        });
        expect(trip.status).toBe('IN_TRANSIT');
        expect(merchant.cargo).toBe(40);

        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.3, relationshipGate: true });
        const deliveredForTrip = world.events.filter(e => e.type === 'PENDING_CARGO_DELIVERED' && e.tripId === trip.tripId);
        expect(deliveredForTrip.length).toBe(1);
        expect(deliveredForTrip[0].delivery.stored).toBe(10);
        // Terminal state reached exactly once; the trip leaves the in-flight set.
        expect(world.pendingTrips.some(t => t.tripId === trip.tripId)).toBe(false);
        expect(world.scheduledConsequences.find(c => c.tripId === trip.tripId).status).toBe('APPLIED');

        // Later ticks must NOT re-apply the same consequence.
        const supplyAfterFirst = south.market.getQuote('food').supply;
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.3, relationshipGate: true });
        tickClosedWorld(world, { tick: 3, perceivedDanger: 0.3, relationshipGate: true });
        expect(world.events.filter(e => e.type === 'PENDING_CARGO_DELIVERED' && e.tripId === trip.tripId).length).toBe(1);
        const supplyAfterLater = south.market.getQuote('food').supply;
        // No +10 re-injection on ticks 2-3: the delta is bounded by the
        // town's own production (1.2/tick) plus risk-scaled auto-shipping,
        // far below a second 10-unit delivery.
        expect(supplyAfterLater).toBeLessThan(supplyAfterFirst + 10);
        expect(supplyAfterLater).toBeGreaterThanOrEqual(supplyAfterFirst - 2);
    });
});