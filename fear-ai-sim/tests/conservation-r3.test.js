import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack } from '../closed-world.js';
import { tickDemography } from '../demography.js';
import { encounterCatalog, instantiateEncounter } from '../encounters.js';

function totalPop(world) {
    let sum = 0;
    for (const town of world.towns.values()) sum += Number(town.population) || 0;
    return sum;
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

describe('R3 conservation closure (MAT-001 / MAT-005)', () => {
    test('bandit-path delivery at capacity conserves mass (stored + overflow booked)', () => {
        // MAT-001: resolveBanditAttack delivers the remainder into a
        // FULL market. Stored (0) plus capacity-rejected overflow (4)
        // must both enter the bookkeeping, or the residual drops.
        const world = createClosedWorldScenario();
        world.towns.get('south').market.setDemand('food', 50, 1);
        world.towns.get('south').market.setCapacity('food', 5);
        world.towns.get('south').market.inventory.set('food', 5);
        world.merchants[0].cargo = 20;
        world.merchants[0].cargoKind = 'food';
        const baseline = massResidual(world);
        const r = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(r.ok).toBe(true);
        expect(r.event.lost).toBeCloseTo(16, 5);
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0 });
        expect(massResidual(world)).toBeCloseTo(baseline, 5);
        const southFlows = [...(world.marketFlows ?? new Map()).values()];
        const overflow = southFlows.reduce((s, f) => s + (Number(f.deliveryOverflow) || 0), 0);
        expect(overflow).toBeGreaterThan(0);
    });

    test('refugee-group arrival is booked as declared exogenous inflow', () => {
        // MAT-005a: the encounter creates +N people with no source.
        // Creation is legitimate (refugees arrive from off-map) but it
        // must be owned by the exogenous-population ledger. E7: the
        // heads camp at the destination — towns plus camps equal the
        // booked inflow, and the town alone does not move.
        const world = createClosedWorldScenario();
        world.factions[0].grievance = 0.6;
        const template = encounterCatalog().find(t => t.id === 'refugee-group');
        const before = totalPop(world);
        const result = instantiateEncounter(template, world, { tick: 1, rng: () => 0 });
        expect(result?.refugeeCount).toBeGreaterThan(0);
        const camped = (world.refugeeCamps ?? []).reduce((s, c) => s + (Number(c.size) || 0), 0);
        expect(totalPop(world) - before).toBe(0);
        expect(totalPop(world) + camped - before).toBe(result.refugeeCount);
        expect(world.exogenousPopulation?.inflow ?? 0).toBe(result.refugeeCount);
    });

    test('demography emigration to a 0-population town camps as settlers (E1 restatement)', () => {
        // E1 restates MAT-005b: emigrants subtracted at the source but
        // dropped at a 0-pop destination no longer vanish into the
        // outflow ledger — they persist as a camped settler group.
        // Force shortage-driven emigration out of north into a world
        // where every other town is empty.
        const world = createClosedWorldScenario();
        for (const [id, town] of world.towns) {
            town.population = id === 'north' ? 50 : 0;
        }
        world.towns.get('north').market.inventory.set('food', 0);
        world.towns.get('north').market.setDemand('food', 500, 1);
        const before = totalPop(world);
        tickDemography(world, 1);
        const evs = world.events.filter(e => e.type === 'POPULATION_CHANGE' && e.tick === 1);
        const emigrated = evs.reduce((s, e) => s + (Number(e.emigration) || 0), 0);
        const immigrated = evs.reduce((s, e) => s + (Number(e.immigration) || 0), 0);
        const births = evs.reduce((s, e) => s + (Number(e.births) || 0), 0);
        const deaths = evs.reduce((s, e) => s + (Number(e.deaths) || 0), 0);
        const settlerPop = (world.settlerGroups ?? []).reduce((s, g) => s + (Number(g.size) || 0), 0);
        expect(emigrated).toBeGreaterThan(0);
        expect(immigrated).toBe(0);
        // The camp holds the dropped headcount; nothing is booked as
        // outflow for grouped humans.
        expect(settlerPop).toBe(emigrated - immigrated);
        expect(Number(world.exogenousPopulation?.outflow ?? 0)).toBe(0);
        expect(totalPop(world) + settlerPop).toBe(before + births - deaths);
    });
});
