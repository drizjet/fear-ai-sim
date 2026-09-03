import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';
import { JusticeSystem } from '../justice.js';

function runAttacks({ stripLaw = false, penalty = null, ticks = 5 } = {}) {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    if (stripLaw) for (const [, town] of world.towns) town.laws = [];
    if (penalty !== null) world.towns.get('north').laws[0].penalty = penalty;
    for (let t = 1; t <= ticks; t++) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, attackRoadId: 'road-a' });
    }
    return world;
}

describe('law penalty -> justice legitimacy (slice W)', () => {
    test('law-confirmed crime erodes town justice legitimacy beyond generic reported crime', () => {
        const withLaw = runAttacks({});
        const noLaw = runAttacks({ stripLaw: true });
        const lawJustice = withLaw.justiceState.get('north').legitimacy;
        const baseJustice = noLaw.justiceState.get('north').legitimacy;
        expect(lawJustice).toBeLessThan(baseJustice);
        expect(baseJustice - lawJustice).toBeGreaterThan(0.05);
    });

    test('owning faction legitimacy tracks the law-driven justice outcome', () => {
        const withLaw = runAttacks({});
        const noLaw = runAttacks({ stripLaw: true });
        const lawFaction = withLaw.factions.find(f => f.townId === 'north').legitimacy;
        const baseFaction = noLaw.factions.find(f => f.townId === 'north').legitimacy;
        expect(lawFaction).toBeLessThan(baseFaction);
    });

    test('higher penalty erodes legitimacy monotonically', () => {
        const base = runAttacks({});
        const high = runAttacks({ penalty: 0.77 });
        expect(high.justiceState.get('north').legitimacy).toBeLessThanOrEqual(
            base.justiceState.get('north').legitimacy
        );
        expect(high.factions.find(f => f.townId === 'north').legitimacy).toBeLessThan(
            base.factions.find(f => f.townId === 'north').legitimacy
        );
    });

    test('JUSTICE_RESOLVED audits the law penalty and parents to LAW_VIOLATED', () => {
        const withLaw = runAttacks({});
        const noLaw = runAttacks({ stripLaw: true });
        const lawEvent = withLaw.events.filter(e => e.type === 'JUSTICE_RESOLVED' && e.townId === 'north').slice(-1)[0];
        const baseEvent = noLaw.events.filter(e => e.type === 'JUSTICE_RESOLVED' && e.townId === 'north').slice(-1)[0];
        expect(lawEvent.lawPenalty).toBeCloseTo(0.3, 5);
        expect(lawEvent.lawViolationCount).toBeGreaterThan(0);
        expect(baseEvent.lawPenalty).toBe(0);
        expect(baseEvent.lawViolationCount).toBe(0);
        const lawIds = new Set(withLaw.events.filter(e => e.type === 'LAW_VIOLATED').map(e => e.eventId));
        expect(lawEvent.parentEventIds.some(id => lawIds.has(id))).toBe(true);
    });

    test('hand-forged LAW without any attack cannot erode legitimacy on its own', () => {
        const forged = createClosedWorldScenario();
        forged.ticksPerSeason = 10000;
        forged.bandits = [];
        appendWorldEvent(forged, {
            type: 'LAW_VIOLATED', tick: 1, townId: 'north', roadId: 'road-a',
            lawId: 'north-law-banditry', lawType: 'banditry', penalty: 0.77,
            rootReason: 'TEST_FORGERY',
        });
        const clean = createClosedWorldScenario();
        clean.ticksPerSeason = 10000;
        clean.bandits = [];
        tickClosedWorld(forged, { tick: 1, perceivedDanger: 0.1 });
        tickClosedWorld(clean, { tick: 1, perceivedDanger: 0.1 });
        expect(forged.justiceState.get('north').legitimacy).toBe(
            clean.justiceState.get('north').legitimacy
        );
    });

    test('JusticeSystem.resolve stays backward compatible without lawPenalty', () => {
        const system = new JusticeSystem();
        const def = system.resolve({ legitimacy: 0.5, grievance: 0.1, reportedCrime: true });
        const zero = system.resolve({ legitimacy: 0.5, grievance: 0.1, reportedCrime: true, lawPenalty: 0 });
        expect(zero).toEqual(def);
        const penalized = system.resolve({ legitimacy: 0.5, grievance: 0.1, reportedCrime: true, lawPenalty: 0.3 });
        expect(penalized.legitimacy).toBeLessThan(def.legitimacy);
        expect(penalized.grievance).toBe(def.grievance);
    });
});
