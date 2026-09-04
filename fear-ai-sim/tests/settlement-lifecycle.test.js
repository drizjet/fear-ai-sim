import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    resolveBanditAttack,
    abandonTown,
    settleAttempt,
    saveWorld,
    loadWorld,
} from '../closed-world.js';
import { tickDemography } from '../demography.js';
import { Market } from '../economy.js';
// Founded towns used to be pop-1 statues: integer demographic
// floors froze every sub-scale town forever (shortage 1.0, never
// dying, never growing, never abandoned). E4 resolves fractional
// headcount through remainder buckets, abandons inhabited-then-
// empty towns (exact-once per episode, spoil-out booked), lets
// camped groups re-found known husks, and weights migration
// attraction by recent attack exposure as well as shortage.

function barrenNorth({ pop = 8 } = {}) {
    const world = createClosedWorldScenario({ season: 'SPRING' });
    world.ticksPerSeason = 100000;
    const north = world.towns.get('north');
    north.population = pop;
    north.produces = { food: 0, tools: 0 };
    north.market.inventory.set('food', 0);
    north.market.inventory.set('tools', 0);
    return world;
}

function runTicks(world, from, to, opts = {}) {
    for (let t = from; t <= to; t++) {
        tickClosedWorld(world, {
            tick: t, perceivedDanger: 0.1, encounterRng: () => 0.999, ...opts,
        });
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

describe('E4 — decline, abandonment, and growth', () => {
    it('a barren town declines to zero and abandons exactly once', () => {
        const world = runTicks(barrenNorth(), 1, 200);
        const north = world.towns.get('north');
        expect(north.population).toBe(0);
        expect(north.abandoned).toBe(true);
        expect(north.controlledBy).toBeNull();
        const abandons = world.events.filter(e =>
            e.type === 'TOWN_ABANDONED' && e.townId === 'north');
        expect(abandons.length).toBe(1);
    });
    it('negative control: a prosperous twin grows and never abandons', () => {
        const world = createClosedWorldScenario({ season: 'SPRING' });
        world.ticksPerSeason = 100000;
        const north = world.towns.get('north');
        north.population = 8;
        // Genuine surplus on every consumed kind: the deficit town
        // above shrinks, this one must grow. Staging prosperity, not
        // assuming it.
        // E5: prosperity includes the production chain — forge demand
        // without ore/metal extraction is a blockade, not surplus.
        north.produces = { food: 2, tools: 0.5, ore: 0.5, metal: 0.5 };
        runTicks(world, 1, 120);
        expect(north.population).toBeGreaterThan(8);
        expect(north.abandoned).not.toBe(true);
        expect(world.events.some(e => e.type === 'TOWN_ABANDONED')).toBe(false);
    });
    it('a never-inhabited 0-pop town never abandons', () => {
        const world = createClosedWorldScenario({ season: 'SPRING' });
        world.ticksPerSeason = 100000;
        world.towns.get('south').population = 0;
        runTicks(world, 1, 60);
        // The husk-that-never-lived keeps its (non-)status no
        // matter what happens elsewhere in the world.
        expect(world.towns.get('south').abandoned).not.toBe(true);
        expect(world.events.some(e =>
            e.type === 'TOWN_ABANDONED' && e.townId === 'south')).toBe(false);
    });
});

describe('E4 — conservation and husk silence', () => {
    it('the R3 residual holds across decline and spoil-out abandonment', () => {
        const world = barrenNorth();
        const baseline = massResidual(world);
        runTicks(world, 1, 200);
        expect(world.events.some(e => e.type === 'TOWN_ABANDONED')).toBe(true);
        expect(massResidual(world)).toBeCloseTo(baseline, 5);
    });

    it('the husk goes idle and survives save/load', () => {
        const world = runTicks(barrenNorth(), 1, 200);
        const north = world.towns.get('north');
        expect(north.abandoned).toBe(true);
        const abandonedTick = north.abandonedTick;
        // In-flight cargo committed before the abandonment may still
        // land and rot (spoilage ticks are honest decay). The idle
        // invariant is stricter and precise: past the travel window
        // nothing is PRODUCED, CONSUMED, or DELIVERED at the husk —
        // and no new trip is ever committed to it.
        const lateMarketTicks = world.events.filter(e =>
            e.type === 'MARKET_TICK' && e.townId === 'north' && e.tick > abandonedTick + 15);
        for (const e of lateMarketTicks) {
            expect(e.flows?.produced ?? 0).toBe(0);
            expect(e.flows?.consumed ?? 0).toBe(0);
            expect(e.flows?.delivered ?? 0).toBe(0);
        }
        const lateCommits = world.events.filter(e =>
            e.type === 'TRIP_COMMITMENT' && e.materialized !== false
            && e.destinationTownId === 'north' && e.tick > abandonedTick);
        expect(lateCommits.length).toBe(0);
        const restored = loadWorld(saveWorld(world));
        expect(restored.towns.get('north').abandoned).toBe(true);
        expect(restored.towns.get('north').controlledBy).toBeNull();
        expect(restored.towns.get('north').population).toBe(0);
    });
});

describe('E4 — recovery through re-founding', () => {
    it('a camped group re-founds a known husk instead of sprawling', () => {
        const world = runTicks(barrenNorth(), 1, 200);
        const north = world.towns.get('north');
        expect(north.abandoned).toBe(true);
        // A camped group at the husk with a funded faction.
        const faction = world.factions.find(f => f.id === 'north-faction');
        faction.resources = 10;
        faction.maxResources = 10;
        world.settlerGroups.push({
            id: 'settlers-refound', size: 6, originTownId: 'south',
            campTownId: 'north', factionId: 'north-faction',
            formedTick: 200, status: 'CAMPED', travelState: 'AT_LOCATION',
            currentLocation: 'north', beliefs: {},
        });
        runTicks(world, 201, 220);
        expect(north.abandoned).toBe(false);
        // The refound event carries the settled headcount; the live
        // town then faces the same barren economics (it may shrink
        // again — that is decline working, not a broken refound).
        const refounds = world.events.filter(e =>
            e.type === 'TOWN_REFOUNDED' && e.locationId === 'north');
        expect(refounds.length).toBe(1);
        expect(refounds[0].population).toBe(6);
        expect(north.population).toBeGreaterThan(0);
        expect(north.controlledBy).toBe('north-faction');
        // No fresh landing sprawled for this group.
        expect([...world.towns.keys()].some(k => k.startsWith('north-landing'))).toBe(false);
    });

    it('a lived-in town is still refused: ALREADY_EXISTS survives', () => {
        const world = createClosedWorldScenario();
        const group = {
            id: 'g', size: 4, originTownId: 'north', campTownId: 'south',
            factionId: 'north-faction', status: 'CAMPED',
            travelState: 'AT_LOCATION', currentLocation: 'south', beliefs: {},
        };
        const result = settleAttempt(world, group, 'south', { tick: 1 });
        expect(result.ok).toBe(false);
        expect(result.reason).toBe('ALREADY_EXISTS');
    });
});

describe('E4 — insecurity repels migrants', () => {
    // East is a healthy third town on its own stub road. Attacks on
    // that road are incident to north+east but NOT south, so raid
    // exposure differentiates the two destinations lawfully.
    function threeTownWorld() {
        const world = createClosedWorldScenario({ season: 'SPRING' });
        world.ticksPerSeason = 100000;
        const north = world.towns.get('north');
        north.population = 30;
        north.produces = { food: 0, tools: 0 };
        north.market.inventory.set('food', 0);
        north.market.inventory.set('tools', 0);
        // Direct tickDemography reads live quotes without the market
        // loop, so demand is staged explicitly (shortage 1.0).
        north.market.setDemand('food', 30, 1);
        north.market.setDemand('tools', 6, 1);
        const market = new Market('east');
        market.setCapacity('tools', 50);
        market.setSpoilageRate('food', 0.05);
        market.inventory.set('food', 60);
        market.inventory.set('tools', 20);
        market.setDemand('food', 60, 1);
        market.setDemand('tools', 20, 1);
        // South leans slightly worse (0.3 mean shortage) so the
        // control prefers east with no tie, while a 0.5 raid
        // penalty still flips the ranking.
        const southMarket = world.towns.get('south').market;
        southMarket.inventory.set('food', 7);
        southMarket.inventory.set('tools', 7);
        southMarket.setDemand('food', 10, 1);
        southMarket.setDemand('tools', 10, 1);
        world.towns.set('east', {
            id: 'east',
            market,
            population: 10,
            consumes: { food: 1, tools: 0.2 },
            produces: { food: 1.5, tools: 0.3 },
            controlledBy: null,
        });
        world.routes.push({
            id: 'road-east', from: 'north', to: 'east',
            distance: 6, actualDanger: 0.2,
        });
        return world;
    }

    function destOfFirstEmigration(world) {
        tickDemography(world, 1);
        const outbound = world.events.find(e =>
            e.type === 'POPULATION_CHANGE' && e.townId === 'north');
        expect(outbound).toBeDefined();
        expect(outbound.emigration).toBeGreaterThan(0);
        const inbound = world.events.find(e =>
            e.type === 'POPULATION_CHANGE' && (e.immigration || 0) > 0);
        expect(inbound).toBeDefined();
        return inbound.townId;
    }

    it('control: the better-stocked town wins with no attacks', () => {
        // East holds 60 food against modest demand; south's
        // live-loop state is leaner. No attacks anywhere.
        expect(destOfFirstEmigration(threeTownWorld())).toBe('east');
    });

    it('a real raid on the east road diverts migrants to the safe town', () => {
        const world = threeTownWorld();
        world.merchants[0].cargo = 20;
        const attack = resolveBanditAttack(world, {
            merchantId: 'merchant-1', roadId: 'road-east', tick: 1,
        });
        expect(attack.ok).toBe(true);
        expect(destOfFirstEmigration(world)).toBe('south');
    });
});

describe('E4 — trade retains population (E3 link)', () => {
    function emigratedTotal(world) {
        return world.events
            .filter(e => e.type === 'POPULATION_CHANGE' && e.townId === 'north')
            .reduce((s, e) => s + (Number(e.emigration) || 0), 0);
    }

    it('merchant trade access lowers emigration from the deficit town', () => {
        const traded = createClosedWorldScenario({ season: 'SPRING' });
        traded.ticksPerSeason = 100000;
        for (const [, town] of traded.towns) town.population = 100;
        runTicks(traded, 1, 60);
        const control = createClosedWorldScenario({ season: 'SPRING' });
        control.ticksPerSeason = 100000;
        for (const [, town] of control.towns) town.population = 100;
        control.merchants = [];
        runTicks(control, 1, 60);
        expect(emigratedTotal(traded)).toBeLessThan(emigratedTotal(control));
        expect(emigratedTotal(control)).toBeGreaterThan(0);
    });
});
