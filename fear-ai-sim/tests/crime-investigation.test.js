import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld } from '../closed-world.js';
import { createPatrol } from '../canonical-trade-system.js';

function attackWorld({ withPatrol = false, patrolRoute = 'road-a' } = {}) {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    if (withPatrol) {
        world.patrols = [createPatrol({ id: 'patrol-invest', route: patrolRoute, factionId: 'north-faction' })];
    }
    return world;
}

function runAttacks(world, ticks = 5) {
    for (let t = 1; t <= ticks; t++) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, attackRoadId: 'road-a' });
    }
    return world;
}

describe('crime investigation quality (slice AB)', () => {
    test('towns start at the legacy baseline and migrate older saves', () => {
        const world = createClosedWorldScenario();
        expect(world.towns.get('north').crime).toEqual({ investigationQuality: 0.4 });
        const legacy = createClosedWorldScenario();
        delete legacy.towns.get('north').crime;
        tickClosedWorld(legacy, { tick: 1, perceivedDanger: 0.1 });
        expect(legacy.towns.get('north').crime.investigationQuality).toBeCloseTo(0.4, 10);
    });

    test('patrol coverage ratchets quality upward, capped at 0.9', () => {
        const world = attackWorld({ withPatrol: true });
        runAttacks(world, 5);
        const iq = world.towns.get('north').crime.investigationQuality;
        expect(iq).toBeGreaterThan(0.4);
        expect(iq).toBeLessThanOrEqual(0.9);
        runAttacks(world, 1);
        expect(world.towns.get('north').crime.investigationQuality).toBeLessThanOrEqual(0.9);
    });

    test('patrolled town keeps higher legitimacy and lower grievance than bare control', () => {
        const patrolled = runAttacks(attackWorld({ withPatrol: true }));
        const bare = runAttacks(attackWorld({}));
        const pJustice = patrolled.justiceState.get('north');
        const bJustice = bare.justiceState.get('north');
        expect(pJustice.legitimacy).toBeGreaterThan(bJustice.legitimacy);
        expect(pJustice.grievance).toBeLessThan(bJustice.grievance);
    });

    test('patrol on an unrelated road does not help this town', () => {
        const world = attackWorld({ withPatrol: true, patrolRoute: 'road-c' });
        // road-c is incident to both towns in the default map; use a patrol
        // whose deployed route touches no town instead.
        world.patrols[0].deployedRoute = 'road-nowhere';
        runAttacks(world, 5);
        expect(world.towns.get('north').crime.investigationQuality).toBe(0.4);
    });

    test('JUSTICE_RESOLVED audits the investigation quality used', () => {
        const world = runAttacks(attackWorld({ withPatrol: true }));
        const events = world.events.filter(e => e.type === 'JUSTICE_RESOLVED' && e.townId === 'north');
        expect(events.length).toBeGreaterThan(0);
        for (const event of events) {
            expect(event.investigationQuality).toBeGreaterThan(0.4);
            expect(event.investigationQuality).toBeLessThanOrEqual(0.9);
        }
        const bare = runAttacks(attackWorld({}));
        const bareEvents = bare.events.filter(e => e.type === 'JUSTICE_RESOLVED' && e.townId === 'north');
        expect(bareEvents.length).toBeGreaterThan(0);
        for (const event of bareEvents) expect(event.investigationQuality).toBe(0.4);
    });

    test('crime state survives save/load with identical follow-up justice', () => {
        const world = runAttacks(attackWorld({ withPatrol: true }), 3);
        const json = saveWorld(world);
        const loaded = loadWorld(json);
        expect(loaded.towns.get('north').crime).toEqual(world.towns.get('north').crime);
        tickClosedWorld(world, { tick: 4, perceivedDanger: 0.5, attackRoadId: 'road-a' });
        tickClosedWorld(loaded, { tick: 4, perceivedDanger: 0.5, attackRoadId: 'road-a' });
        expect(loaded.justiceState.get('north')).toEqual(world.justiceState.get('north'));
    });
});
