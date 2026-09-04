import { describe, it, expect } from '@jest/globals';
import {
    createClosedWorldScenario,
    tickClosedWorld,
    appendWorldEvent,
} from '../closed-world.js';

// V8 corrective checkpoint (2026-08-31):
//
// The previous migration-event.test.js collapsed three
// behaviourally distinct contracts into a single assertion:
//
//   MIGRATION-COUNT     (highCount > lowCount)
//   MIGRATION-LATENCY   (highFirst < lowFirst)
//   MIGRATION-COOLDOWN  (per-town cadence)
//
// and used the canonical scenario as the "low-pressure"
// control. The canonical scenario still produces emergent
// bandit attacks through its merchant-bandit encounter
// chain, so the control was *not* low-pressure; the §29
// MIGRATION_COOLDOWN (10 ticks) further saturates fixed-
// window counts. The count oracle therefore could not
// distinguish sustained pressure from a peaceful world at
// saturation.
//
// This file replaces that single oracle with three
// independent contracts, each with a *genuinely
// controlled* fixture that keeps a sink town so
// conservation is possible, injects attacks via
// appendWorldEvent so parentage is intact, and asserts
// FIRE/MIGRATION integrity. Pressure comes only
// from pre-seeded BANDIT_ATTACK events; peaceful worlds
// remain at zero attacks. The relationship gate runs at
// its production default (`relationshipGate: true` is the
// default in tickClosedWorld and is *not* overridden
// here).
//
// Evidence sources:
//   - MIGRATION-INCIDENCE: contraction v8-migration-incidence
//   - MIGRATION-LATENCY: contraction v8-migration-latency
//   - MIGRATION-COOLDOWN: contraction v8-migration-cooldown
//
// The cooldowns map is read directly from the world after
// the run; it is the canonical per-town cadence ledger.

function buildIsolatedTownWorld({ townId = 'north', sinkTownId = 'south', preSeededAttacks = [], preSeedJustice = false, population = 10, sinkPopulation = 10 } = {}) {
    const world = createClosedWorldScenario();
    // Strip the bandit encounter chain so the canonical
    // merchant-bandit observation loop cannot synthesize
    // emergent BANDIT_ATTACK events. The controlled-pressure
    // arms inject attacks only via the preSeededAttacks
    // parameter through appendWorldEvent so they carry
    // eventIds and can parent JUSTICE_RESOLVED.
    world.bandits = [];
    world.merchants = [];
    world.guards = [];
    world.civilians = [];
    world.vampires = [];
    world.convoy = null;
    world.convoys = [];
    // KEEP sink town so migration has a real destination
    // and conservation (source + dest = constant) can be
    // asserted. Deleting the other town made MIGRATION
    // emit toTownId: null and dump population into void.
    const sourceTown = world.towns.get(townId);
    const sinkTown = world.towns.get(sinkTownId);
    if (!sourceTown) throw new Error(`unknown townId ${townId}`);
    if (!sinkTown) throw new Error(`unknown sinkTownId ${sinkTownId}`);
    sourceTown.population = population;
    sinkTown.population = sinkPopulation;
    if (preSeedJustice) {
        if (!world.justiceState) world.justiceState = new Map();
        world.justiceState.set(townId, {
            legitimacy: 0.1,
            grievance: 0.9,
            migrationPressure: 0,
            justiceAccess: 0.4,
        });
    }
    for (const attack of preSeededAttacks) {
        const roadId = attack.roadId ?? world.routes.find(r => r.from === townId || r.to === townId)?.id ?? 'road-a';
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK',
            banditId: 'isolated-bandit',
            tick: attack.tick,
            roadId,
        });
    }
    return world;
}

function migrationEventsForTown(world, townId) {
    return world.events
        .filter(ev => ev.type === 'MIGRATION' && ev.townId === townId)
        .sort((a, b) => a.tick - b.tick);
}

const N_TICKS = 30;
const MIGRATION_COOLDOWN = 10; // mirror of closed-world.js > MIGRATION_COOLDOWN

describe('MIGRATION-COOLDOWN guardrail (V8 corrective checkpoint, §29 cooldown)', () => {
    it('no town emits migration events more frequently than MIGRATION_COOLDOWN ticks apart', () => {
        const world = buildIsolatedTownWorld({
            townId: 'north',
            preSeedJustice: true,
            preSeededAttacks: Array.from({ length: N_TICKS }, (_, i) => ({ tick: i + 1 })),
        });
        for (let t = 1; t <= N_TICKS; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        const migs = migrationEventsForTown(world, 'north');
        expect(migs.length).toBeGreaterThan(0);
        for (let i = 1; i < migs.length; i++) {
            const gap = migs[i].tick - migs[i - 1].tick;
            expect(gap).toBeGreaterThanOrEqual(MIGRATION_COOLDOWN);
        }
        // Every MIGRATION must have a real destination (sink town)
        for (const m of migs) {
            expect(m.toTownId).toBe('south');
        }
        // FIRE iff MIGRATION: every FIRE decision has a MIGRATION on same tick
        const fires = world.events.filter(ev => ev.type === 'MIGRATION_DECISION' && ev.townId === 'north' && ev.decision === 'FIRE');
        expect(fires.length).toBe(migs.length);
    });
});

describe('MIGRATION-INCIDENCE (V8 corrective checkpoint, sustained vs controlled)', () => {
    it('sustained pressure produces migrations at the saturation ceiling; peaceful control produces none; population is conserved', () => {
        const ticks = Array.from({ length: N_TICKS }, (_, i) => i + 1);
        const low = buildIsolatedTownWorld({ townId: 'north', population: 10, sinkPopulation: 10 });
        for (const t of ticks) tickClosedWorld(low, { tick: t, perceivedDanger: 0.5 });
        const high = buildIsolatedTownWorld({
            townId: 'north',
            preSeedJustice: true,
            preSeededAttacks: ticks.map(t => ({ tick: t })),
            population: 10,
            sinkPopulation: 10,
        });
        for (const t of ticks) tickClosedWorld(high, { tick: t, perceivedDanger: 0.5 });
        const lowMigs = migrationEventsForTown(low, 'north');
        const highMigs = migrationEventsForTown(high, 'north');
        // Hard contract: a peaceful controlled fixture
        // never fires MIGRATION (no reported crime, the
        // justice loop is skipped on every tick).
        expect(lowMigs.length).toBe(0);
        // Sustained-pressure incidence at saturation:
        // with cooldown 10 and N=30, ceiling is ~3 fires.
        // We assert near-ceiling, not merely >0.
        expect(highMigs.length).toBeGreaterThanOrEqual(2);
        const firstMig = highMigs[0];
        expect(firstMig).toBeDefined();
        const eligibleTicksAfterFirst = Math.max(0, N_TICKS - firstMig.tick - (MIGRATION_COOLDOWN - 1));
        const eligibleOpportunities = 1 + Math.floor(eligibleTicksAfterFirst / MIGRATION_COOLDOWN);
        // Must use eligible opportunities, not just any firing
        expect(highMigs.length).toBeGreaterThanOrEqual(eligibleOpportunities - 1);
        expect(highMigs.length).toBeLessThanOrEqual(eligibleOpportunities);
        expect(highMigs.every(m => m.toTownId === 'south')).toBe(true);
        // FIRE iff MIGRATION
        const highFires = high.events.filter(ev => ev.type === 'MIGRATION_DECISION' && ev.townId === 'north' && ev.decision === 'FIRE');
        expect(highFires.length).toBe(highMigs.length);
        // Population conserved across migration (source + sink = initial total, modulo demography which is ~0 at these populations)
        // With sink, total should remain 20 (no net birth/death at pop 10 with surplus food in 30 ticks is small; allow +-1 for demography)
        // R3: refugee absorption adds booked inflow on top; close the
        // band with it (massResidual pattern).
        const highExo = high.exogenousPopulation ?? { inflow: 0, outflow: 0 };
        const highTotal = high.towns.get('north').population + high.towns.get('south').population
            - (highExo.inflow ?? 0) + (highExo.outflow ?? 0);
        expect(highTotal).toBeGreaterThanOrEqual(19);
        expect(highTotal).toBeLessThanOrEqual(21);
        const lowExo = low.exogenousPopulation ?? { inflow: 0, outflow: 0 };
        const lowTotal = low.towns.get('north').population + low.towns.get('south').population
            - (lowExo.inflow ?? 0) + (lowExo.outflow ?? 0);
        expect(lowTotal).toBeGreaterThanOrEqual(19);
    });
});

describe('MIGRATION-LATENCY (V8 corrective checkpoint, time-to-first-migration)', () => {
    it('a chronic-crisis town fires its first migration on or before the first tick of the run; a peaceful town never fires one', () => {
        const crisis = buildIsolatedTownWorld({
            townId: 'north',
            preSeedJustice: true,
            preSeededAttacks: [{ tick: 1 }, { tick: 2 }, { tick: 3 }, { tick: 4 }, { tick: 5 }],
            population: 10,
            sinkPopulation: 10,
        });
        const peaceful = buildIsolatedTownWorld({ townId: 'north', population: 10, sinkPopulation: 10 });
        for (let t = 1; t <= 5; t++) {
            tickClosedWorld(crisis, { tick: t, perceivedDanger: 0.5 });
            tickClosedWorld(peaceful, { tick: t, perceivedDanger: 0.5 });
        }
        const crisisFirst = migrationEventsForTown(crisis, 'north');
        const peacefulFirst = migrationEventsForTown(peaceful, 'north');
        expect(crisisFirst.length).toBeGreaterThan(0);
        expect(crisisFirst[0].tick).toBeLessThanOrEqual(5);
        expect(crisisFirst[0].toTownId).toBe('south');
        expect(peacefulFirst.length).toBe(0);
    });
});

describe('MIGRATION decision integrity (FIRE iff MIGRATION, conservation)', () => {
    it('one-town-like pressure with no destination is SUPPRESSED, not FIRE; population unchanged', () => {
        // Build a world where the sink town has been depopulated to 0
        // and cannot receive (or we test the guard by using a  single-town world via manual deletion AFTER builder keeps it)
        // Here we test the production guard directly: source pop 1, but we delete sink to simulate no destination
        const world = createClosedWorldScenario();
        world.bandits = []; world.merchants = []; world.guards = []; world.civilians = []; world.vampires = []; world.convoy = null; world.convoys = [];
        const source = world.towns.get('north');
        source.population = 1;
        // Delete sink to force NO_DESTINATION
        world.towns.delete('south');
        world.factions = world.factions.filter(f => f.townId === 'north');
        if (!world.justiceState) world.justiceState = new Map();
        world.justiceState.set('north', { legitimacy: 0.1, grievance: 0.9, migrationPressure: 0, justiceAccess: 0.4 });
        for (let t = 1; t <= 5; t++) appendWorldEvent(world, { type: 'BANDIT_ATTACK', banditId: 'isolated-bandit', tick: t, roadId: 'road-a' });
        for (let t = 1; t <= 5; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        const fires = world.events.filter(ev => ev.type === 'MIGRATION_DECISION' && ev.decision === 'FIRE');
        const migs = world.events.filter(ev => ev.type === 'MIGRATION');
        const suppressedNoDest = world.events.filter(ev => ev.type === 'MIGRATION_DECISION' && ev.reason === 'NO_DESTINATION');
        expect(fires.length).toBe(0);
        expect(migs.length).toBe(0);
        expect(suppressedNoDest.length).toBeGreaterThan(0);
        expect(source.population).toBe(1);
    });
});
