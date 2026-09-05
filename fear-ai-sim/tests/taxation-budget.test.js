import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld } from '../closed-world.js';
import { StanceLadder } from '../factionrelationship.js';

// E13 — taxation and garrison budgets. Faction income is no longer
// purely exogenous refill: controllers tax living towns per head
// (scaled by occupation foot-dragging) and pay garrison costs for
// meaningfully occupied towns. All of it is capped, floored, and
// audited per faction per tick.

function holdWorld(pop = 10) {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    const north = world.factions.find(f => f.id === 'north-faction');
    north.maxResources = 1000;
    world.towns.get('north').population = pop;
    world.towns.get('north').market.inventory.set('food', 500);
    return { world, north };
}

function holdTicks(world, from, to) {
    for (let t = from; t <= to; t++) {
        for (const f of world.factions) f.grievance = 0;
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.0, encounterRng: () => 0.999 });
        for (const f of world.factions) f.lastDecision = 'HOLD';
    }
}
describe('E13 taxation and garrison budgets', () => {
    it('controller income scales with town population (tax, not just refill)', () => {
        const big = holdWorld(50);
        const small = holdWorld(1);
        holdTicks(big.world, 1, 20);
        holdTicks(small.world, 1, 20);
        const gross = w => w.events
            .filter(e => e.type === 'TAX_COLLECTED' && e.factionId === 'north-faction')
            .reduce((s, e) => s + (e.gross ?? 0), 0);
        // Refill is identical on both twins (same HOLD ticks, same
        // cap headroom), so the resource spread equals the audited
        // tax spread exactly — income scales with the town.
        expect(big.north.resources - small.north.resources)
            .toBeCloseTo(gross(big.world) - gross(small.world), 8);
        expect(gross(big.world) - gross(small.world)).toBeGreaterThan(10);
    });

    it('occupied towns pay garrison costs audited per faction per tick', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        const north = world.factions.find(f => f.id === 'north-faction');
        north.lastDecision = 'RAID';
        north.grievance = 1;
        north.resources = 5;
        north.maxResources = 5;
        // E8-coherent capability: the stance machine reads
        // resources/maxResources, so a big max would downgrade the
        // staged WAR to HOSTILE before the gate runs.
        north.informationConfidence = 1;
        const south = world.factions.find(f => f.id === 'south-faction');
        south.resources = 1;
        south.maxResources = 1000;
        const pair = world.relationships.get('north-faction::south-faction');
        pair.setTrustFrom('north-faction', 0);
        pair.setGrievanceFrom('north-faction', 1);
        pair.setFearFrom('north-faction', 1);
        pair.setTerritorialPressureFrom('north-faction', 1);
        pair.observeFrom('north-faction', StanceLadder.WAR, 0);
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, encounterRng: () => 0.999 });
        expect(world.towns.get('south').controlledBy).toBe('north-faction');
        // The tax pass runs before the takeover pass, so the
        // conquest tick itself carries no garrison; the occupation
        // is taxed from the next tick on.
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.0, encounterRng: () => 0.999 });
        const taxes = world.events.filter(e => e.type === 'TAX_COLLECTED'
            && e.factionId === 'north-faction' && e.tick === 2);
        expect(taxes.length).toBe(1);
        expect(taxes[0].garrisonCost).toBeCloseTo(0.15, 10);
        expect(taxes[0].net).toBeCloseTo(taxes[0].gross - 0.15, 10);
        expect(taxes[0].towns.some(t => t.townId === 'south')).toBe(true);
    });

    it('resources never exceed maxResources no matter the tax base', () => {
        const { world, north } = holdWorld(50);
        north.maxResources = 2;
        holdTicks(world, 1, 20);
        expect(north.resources).toBeLessThanOrEqual(2);
    });

    it('dead towns yield no tax (abandoned ground pays nothing)', () => {
        const world = createClosedWorldScenario({ season: 'SUMMER' });
        world.ticksPerSeason = 10000;
        const north = world.factions.find(f => f.id === 'north-faction');
        north.maxResources = 1000;
        world.towns.get('north').abandoned = true;
        world.towns.get('north').population = 0;
        holdTicks(world, 1, 10);
        const taxes = world.events.filter(e => e.type === 'TAX_COLLECTED' && e.factionId === 'north-faction');
        const gross = taxes.reduce((s, e) => s + (e.gross ?? 0), 0);
        expect(gross).toBe(0);
    });

    it('budgets survive save/load with identical follow-up resources', () => {
        const { world } = holdWorld(30);
        holdTicks(world, 1, 10);
        const resumed = loadWorld(saveWorld(world));
        holdTicks(world, 11, 15);
        holdTicks(resumed, 11, 15);
        const res = w => w.factions.find(f => f.id === 'north-faction').resources;
        expect(res(resumed)).toBe(res(world));
        const count = w => w.events.filter(e => e.type === 'TAX_COLLECTED').length;
        expect(count(resumed)).toBe(count(world));
    });
});
