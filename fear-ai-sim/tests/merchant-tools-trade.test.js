import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    saveWorld,
    loadWorld,
} from '../closed-world.js';
import { selectMerchantCargoKind } from '../canonical-trade-system.js';

// E3 — endogenous tools trade and deficit relief.
//
// The world structurally produces a north tools deficit (produces
// 0.1/tick, consumes 0.2) and a south surplus (0.3 vs 0.2), but the
// merchant carried a frozen food hold forever: cargoKind never
// changed, restock refilled the same kind exogenously, and the
// route opportunityBonus read dest quotes no decision could act on.
// E3 closes the loop: deficit-relative cargo selection, a real
// market exchange at the source (sell hold, buy surplus), physical
// travel with the goods (merchant relocates on arrival), and
// kind-generic delivery/loss booking. Trade is transfer throughout.

function stagedWorld({ pop = 10, season = 'SPRING' } = {}) {
    const world = createClosedWorldScenario({ season });
    world.ticksPerSeason = 100000;
    for (const [, town] of world.towns) town.population = pop;
    return world;
}

function runTicks(world, from, to, opts = {}) {
    for (let t = from; t <= to; t++) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.3, ...opts });
    }
    return world;
}

function massResidual(world) {
    let k = 0;
    for (const town of world.towns.values()) {
        for (const kind of ['food', 'tools']) k += Number(town.market.inventory.get(kind)) || 0;
    }
    for (const m of world.merchants ?? []) k += Number(m.cargo) || 0;
    for (const t of world.pendingTrips ?? []) k += Number(t.cargo?.amount) || 0;
    for (const kind of Object.keys(world.transitLoss ?? {})) k += Number(world.transitLoss[kind]) || 0;
    for (const kind of Object.keys(world.exogenousInflow ?? {})) k -= Number(world.exogenousInflow[kind]) || 0;
    const flows = [...(world.marketFlows ?? new Map()).values()];
    const sum = (f) => flows.reduce((s, flow) => s + (Number(flow[f]) || 0), 0);
    k -= sum('produced') - sum('overflow');
    k += sum('consumed') + sum('spoiled') + sum('deliveryOverflow');
    return k;
}

describe('E3 — deficit-relative cargo selection', () => {
    it('a tools-deficient destination pulls a surplus-sited merchant into tools', () => {
        const world = stagedWorld();
        runTicks(world, 1, 8);
        const merchant = world.merchants[0];
        merchant.location = 'south';
        merchant.cargoKind = 'food';
        const sel = selectMerchantCargoKind(merchant, { world, destinationTownId: 'north' });
        expect(sel.best).toBe('tools');
        expect(sel.margin).toBeGreaterThan(0.2);
        expect(sel.switched).toBe(true);
        expect(sel.cargoKind).toBe('tools');
    });

    it('negative control: no destination deficit means the food hold stays', () => {
        const world = stagedWorld();
        runTicks(world, 1, 8);
        // Erase the deficit: a stocked north wants nothing.
        world.towns.get('north').market.inventory.set('tools', 100);
        const merchant = world.merchants[0];
        merchant.location = 'south';
        merchant.cargoKind = 'food';
        const sel = selectMerchantCargoKind(merchant, { world, destinationTownId: 'north' });
        expect(sel.switched).toBe(false);
        expect(sel.cargoKind).toBe('food');
    });
    it('no local surplus blocks the switch even when the destination starves', () => {
        const world = stagedWorld();
        runTicks(world, 1, 8);
        // Thin the south tools pool to a sub-load surplus WITHOUT
        // starving the town: supply sits just above demand, so the
        // destination pull is intact but no lawful load can be bought.
        const southTools = world.towns.get('south').market.getQuote('tools');
        world.towns.get('south').market.inventory.set('tools', southTools.demand + 0.5);
        const merchant = world.merchants[0];
        merchant.location = 'south';
        merchant.cargoKind = 'food';
        const sel = selectMerchantCargoKind(merchant, { world, destinationTownId: 'north' });
        expect(sel.best).toBe('tools');
        expect(sel.margin).toBeGreaterThan(0.2);
        expect(sel.switched).toBe(false);
        expect(sel.cargoKind).toBe('food');
    });
});

describe('E3 — live exchange, travel, and delivery', () => {
    it('the merchant exchanges into tools, ships them, and arrives with them', () => {
        const world = runTicks(stagedWorld(), 1, 40);
        const exchanges = world.events.filter(e => e.type === 'CARGO_EXCHANGED');
        expect(exchanges.length).toBeGreaterThanOrEqual(1);
        const toolsExchange = exchanges.find(e => e.toKind === 'tools');
        expect(toolsExchange).toBeDefined();
        // The buy never strips the home town's own demand cover.
        expect(toolsExchange.bought).toBeGreaterThanOrEqual(1);
        const toolsTrips = world.events.filter(e =>
            e.type === 'TRIP_COMMITMENT' && e.materialized !== false
            && e.cargo?.kind === 'tools');
        expect(toolsTrips.length).toBeGreaterThanOrEqual(1);
        const northToolsDeliveries = world.events.filter(e =>
            e.type === 'PENDING_CARGO_DELIVERED'
            && e.destinationTownId === 'north' && e.cargo?.kind === 'tools');
        expect(northToolsDeliveries.length).toBeGreaterThanOrEqual(1);
        // The merchant travels with its goods: an arrival moves it.
        const arrivals = world.events.filter(e =>
            e.type === 'TRIP_ARRIVAL' && typeof e.merchantLocation === 'string');
        expect(arrivals.length).toBeGreaterThanOrEqual(1);
    });

    it('arrival stock flows into the deficit town and lowers its shortage burden', () => {
        // North consumes each tools arrival almost immediately, so
        // end-state stock is the wrong meter. The honest meters are
        // cumulative inflow (flow) and mean shortage (burden).
        const traded = stagedWorld();
        let tradedShortage = 0;
        for (let t = 1; t <= 40; t++) {
            tickClosedWorld(traded, { tick: t, perceivedDanger: 0.3 });
            tradedShortage += traded.towns.get('north').market.getQuote('tools').shortage;
        }
        const control = stagedWorld();
        control.merchants = [];
        let controlShortage = 0;
        for (let t = 1; t <= 40; t++) {
            tickClosedWorld(control, { tick: t, perceivedDanger: 0.3 });
            controlShortage += control.towns.get('north').market.getQuote('tools').shortage;
        }
        const delivered = traded.events
            .filter(e => e.type === 'PENDING_CARGO_DELIVERED'
                && e.destinationTownId === 'north' && e.cargo?.kind === 'tools')
            .reduce((s, e) => s + (Number(e.cargo?.amount) || 0), 0);
        expect(delivered).toBeGreaterThan(0);
        expect(tradedShortage / 40).toBeLessThan(controlShortage / 40);
    });
});

describe('E3 — conservation and exact-once trip contract', () => {
    it('the R3 mass residual holds across exchange, travel, theft, and delivery', () => {
        const world = stagedWorld();
        const baseline = massResidual(world);
        runTicks(world, 1, 40);
        expect(world.events.some(e => e.type === 'CARGO_EXCHANGED')).toBe(true);
        expect(massResidual(world)).toBeCloseTo(baseline, 5);
    });

    it('every tools trip has exactly one terminal fate and survives save/load', () => {
        const world = runTicks(stagedWorld(), 1, 25);
        // Persist across the arrival boundary: serialize mid-flight.
        const inFlight = (world.pendingTrips ?? []).filter(t =>
            t.status === 'IN_TRANSIT' || t.status === 'ARRIVED');
        if (inFlight.length > 0) {
            const restored = loadWorld(saveWorld(world));
            expect(restored.pendingTrips.length).toBe(world.pendingTrips.length);
            runTicks(restored, 26, 60);
            const deliveredIds = restored.events
                .filter(e => e.type === 'PENDING_CARGO_DELIVERED')
                .map(e => e.tripId);
            expect(new Set(deliveredIds).size).toBe(deliveredIds.length);
            expect(restored.pendingTrips.some(t => t.status === 'DELIVERED')).toBe(false);
        }
        const world2 = runTicks(stagedWorld(), 1, 60);
        const deliveredIds = world2.events
            .filter(e => e.type === 'PENDING_CARGO_DELIVERED')
            .map(e => e.tripId);
        expect(deliveredIds.length).toBeGreaterThan(0);
        expect(new Set(deliveredIds).size).toBe(deliveredIds.length);
        expect(world2.pendingTrips.some(t => t.status === 'DELIVERED')).toBe(false);
    });
});

describe('E3 — E2 traffic link and relief proof', () => {
    it('tools-trip traffic enters co-located bandit observation, nothing remote', () => {
        const world = stagedWorld();
        let tripRoad = null;
        for (let t = 1; t <= 30; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.3 });
            const commitment = world.events.find(e =>
                e.type === 'TRIP_COMMITMENT' && e.materialized !== false && e.cargo?.kind === 'tools');
            if (commitment && !tripRoad) {
                tripRoad = commitment.routeId;
                // Staged interception, labeled as such: the bandit
                // co-locates with the traveling merchant from here on.
                // What matters is that ONLY the co-located road is
                // learned, via the lawful observation channel.
                world.bandits[0].roadId = tripRoad;
                world.bandits[0].trafficBelief = {
                    'road-a': { estimatedTraffic: 0, recency: 0.5, lastDecayTick: t },
                    'road-b': { estimatedTraffic: 0, recency: 0.5, lastDecayTick: t },
                    'road-c': { estimatedTraffic: 0, recency: 0.5, lastDecayTick: t },
                };
            }
        }
        expect(tripRoad).not.toBeNull();
        const observed = world.bandits[0].trafficBelief?.[tripRoad]?.estimatedTraffic ?? 0;
        expect(observed).toBeGreaterThan(0);
        for (const roadId of ['road-a', 'road-b', 'road-c']) {
            if (roadId === tripRoad) continue;
            expect(world.bandits[0].trafficBelief?.[roadId]?.estimatedTraffic ?? 0).toBe(0);
        }
    });

    it('relief: trade access lowers the deficit burden versus the no-trader control', () => {
        const traded = stagedWorld();
        let tradedShortage = 0;
        for (let t = 1; t <= 60; t++) {
            tickClosedWorld(traded, { tick: t, perceivedDanger: 0.3 });
            tradedShortage += traded.towns.get('north').market.getQuote('tools').shortage;
        }
        const control = stagedWorld();
        control.merchants = [];
        let controlShortage = 0;
        for (let t = 1; t <= 60; t++) {
            tickClosedWorld(control, { tick: t, perceivedDanger: 0.3 });
            controlShortage += control.towns.get('north').market.getQuote('tools').shortage;
        }
        const delivered = traded.events
            .filter(e => e.type === 'PENDING_CARGO_DELIVERED'
                && e.destinationTownId === 'north' && e.cargo?.kind === 'tools')
            .reduce((s, e) => s + (Number(e.cargo?.amount) || 0), 0);
        expect(delivered).toBeGreaterThan(0);
        expect(tradedShortage / 60).toBeLessThan(controlShortage / 60);
        expect(controlShortage / 60).toBeCloseTo(1, 1);
    });
});
