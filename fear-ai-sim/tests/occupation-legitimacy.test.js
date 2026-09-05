import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, occupationPenalty, saveWorld, loadWorld, appendWorldEvent } from '../closed-world.js';
import { StanceLadder } from '../factionrelationship.js';

// E12 — occupation has a cost. A taken town does not administer
// itself for free: foreign rule erodes legitimacy (decaying over
// ~tens of ticks), the occupied work less, and the unhappy leave.
// Recapture refreshes the clock; quiet control is untouched.

function twin(takeover, tick1Stance) {
    const world = createClosedWorldScenario({ season: 'SUMMER' });
    world.ticksPerSeason = 10000;
    const north = world.factions.find(f => f.id === 'north-faction');
    const south = world.factions.find(f => f.id === 'south-faction');
    const pair = world.relationships.get('north-faction::south-faction');
    north.grievance = 1;
    north.lastDecision = 'RAID';
    north.resources = 5;
    north.maxResources = 5;
    north.informationConfidence = 1;
    south.resources = 1;
    south.maxResources = 5;
    world.towns.get('south').population = 10;
    pair.setTrustFrom('north-faction', 0);
    pair.setGrievanceFrom('north-faction', 1);
    pair.setFearFrom('north-faction', 1);
    pair.setTerritorialPressureFrom('north-faction', 1);
    pair.observeFrom('north-faction', takeover ? StanceLadder.WAR : (tick1Stance ?? StanceLadder.HOSTILE), 0);
    return world;
}

function runTicks(world, from, to) {
    for (let t = from; t <= to; t++) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.0, encounterRng: () => 0.999 });
    }
}

describe('E12 occupation legitimacy', () => {
    it('a taken town is less legitimate than its untaken twin, then converges', () => {
        const taken = twin(true);
        const control = twin(false);
        runTicks(taken, 1, 10);
        runTicks(control, 1, 10);
        const takenLeg = taken.justiceState.get('south').legitimacy;
        const controlLeg = control.justiceState.get('south').legitimacy;
        expect(takenLeg).toBeLessThan(controlLeg);
        const earlyGap = controlLeg - takenLeg;
        expect(earlyGap).toBeGreaterThan(0.01);
        // Recovery is ceiling-shaped: the occupied climbs toward a
        // lower target, so the gap humps before it closes. Run out
        // the assimilation window (penalty < 0.01 past ~100 ticks).
        runTicks(taken, 11, 200);
        runTicks(control, 11, 200);
        const lateGap = control.justiceState.get('south').legitimacy
            - taken.justiceState.get('south').legitimacy;
        expect(lateGap).toBeLessThan(earlyGap);
        expect(lateGap).toBeLessThan(0.02);
    });
    it('the occupied work less: production trails the untaken twin', () => {
        const taken = twin(true);
        const control = twin(false);
        runTicks(taken, 1, 20);
        runTicks(control, 1, 20);
        const tools = w => w.events
            .filter(e => e.type === 'MARKET_TICK' && e.townId === 'south' && e.kind === 'tools')
            .reduce((s, e) => s + (e.flows?.produced ?? 0), 0);
        expect(tools(taken)).toBeLessThan(tools(control));
    });

    it('recapture refreshes the occupation clock', () => {
        const world = twin(true);
        runTicks(world, 1, 30);
        const stale = occupationPenalty(world.towns.get('south'), 30);
        // South takes it back: stage WAR in reverse with resources.
        const south = world.factions.find(f => f.id === 'south-faction');
        const north = world.factions.find(f => f.id === 'north-faction');
        const pair = world.relationships.get('north-faction::south-faction');
        south.lastDecision = 'RAID';
        // The reducer reassesses every tick: RAID intent must be live
        // grievance, not leftover lastDecision.
        south.grievance = 1;
        south.resources = 5;
        north.resources = 1;
        // One town per tick, north evaluated first: empty it so the
        // only eligible prize is the occupied south town itself.
        world.towns.get('north').population = 0;
        pair.setTrustFrom('south-faction', 0);
        pair.setGrievanceFrom('south-faction', 1);
        pair.setFearFrom('south-faction', 1);
        pair.setTerritorialPressureFrom('south-faction', 1);
        pair.observeFrom('south-faction', StanceLadder.WAR, 30);
        runTicks(world, 31, 31);
        expect(world.towns.get('south').controlledBy).toBe('south-faction');
        expect(occupationPenalty(world.towns.get('south'), 31)).toBeGreaterThan(stale);
    });

    it('occupation debits reported-crime justice like unredressed crime', () => {
        const taken = twin(true);
        const control = twin(false);
        runTicks(taken, 1, 1);
        runTicks(control, 1, 1);
        expect(taken.towns.get('south').controlledBy).toBe('north-faction');
        // Identical attacks on both twins: the only difference in
        // the JUSTICE_RESOLVED ledger is the occupation debit.
        for (const world of [taken, control]) {
            appendWorldEvent(world, {
                type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bandits-1',
                merchantId: 'merchant-1', lost: 5, tick: 2,
                attackOpportunityId: 'occ-crime-2',
            });
        }
        runTicks(taken, 2, 2);
        runTicks(control, 2, 2);
        const just = w => w.events.find(e =>
            e.type === 'JUSTICE_RESOLVED' && e.townId === 'south' && e.tick === 2);
        expect(just(taken)).toBeDefined();
        expect(just(control)).toBeDefined();
        expect(just(taken).occupationPenalty).toBeGreaterThan(0.2);
        expect(just(control).occupationPenalty ?? 0).toBe(0);
        expect(just(taken).legitimacy).toBeLessThan(just(control).legitimacy);
    });

    it('occupation survives save/load with identical follow-up legitimacy', () => {
        const world = twin(true);
        runTicks(world, 1, 5);
        const resumed = loadWorld(saveWorld(world));
        expect(resumed.towns.get('south').occupation).toEqual(world.towns.get('south').occupation);
        runTicks(world, 6, 10);
        runTicks(resumed, 6, 10);
        expect(resumed.justiceState.get('south').legitimacy)
            .toBe(world.justiceState.get('south').legitimacy);
    });

    it('quiet control carries no occupation record (negative control)', () => {
        const world = twin(false);
        runTicks(world, 1, 20);
        expect(world.towns.get('south').occupation ?? null).toBeNull();
        expect(world.towns.get('north').occupation ?? null).toBeNull();
    });
});
