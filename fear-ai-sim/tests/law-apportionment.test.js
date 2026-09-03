import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack, saveWorld, loadWorld } from '../closed-world.js';
import { checkAllLawCompliance, checkLawCompliance } from '../law.js';
import { getReputationObservation, REPUTATION_DIMENSIONS } from '../reputation.js';

describe('multi-town law apportionment (slice Y)', () => {
    test('shared road violates every incident town law, not just the first', () => {
        const world = createClosedWorldScenario();
        const violations = checkAllLawCompliance({
            world, action: { type: 'BANDIT_ATTACK', roadId: 'road-a' }, tick: 1,
        });
        expect(violations.map(v => v.townId)).toEqual(['north', 'south']);
        // Legacy single-match API still returns the first town (backward compatible).
        expect(checkLawCompliance({ world, action: { type: 'BANDIT_ATTACK', roadId: 'road-a' }, tick: 1 }).townId).toBe('north');
        world.merchants[0].cargo = 20;
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        const laws = world.events.filter(e => e.type === 'LAW_VIOLATED');
        expect(laws.map(l => l.townId).sort()).toEqual(['north', 'south']);
    });

    test('restitution total stays conserved across towns (no sentence multiplication)', () => {
        const world = createClosedWorldScenario();
        world.factions.find(f => f.id === 'north-faction').resources = 1;
        world.factions.find(f => f.id === 'south-faction').resources = 2;
        world.merchants[0].cargo = 20;
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        const laws = world.events.filter(e => e.type === 'LAW_VIOLATED');
        const total = laws.reduce((sum, law) => sum + (law.restitution?.transferred ?? 0), 0);
        expect(total).toBeCloseTo(0.3, 10);
        // Zero-sum on the faction budget is preserved.
        expect(world.factions.reduce((sum, f) => sum + f.resources, 0)).toBeCloseTo(3, 10);
    });

    test('self-loop town emits audit only: no self-observation, no self-payment', () => {
        const world = createClosedWorldScenario();
        world.merchants[0].cargo = 20;
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        const southLaw = world.events.filter(e => e.type === 'LAW_VIOLATED').find(l => l.townId === 'south');
        expect(southLaw.violatorFactionId).toBe('south-faction');
        expect(southLaw.observerFactionId).toBe('south-faction');
        expect(southLaw.lawfulness).toBeNull();
        expect(southLaw.restitution).toBeNull();
        // The town still observed its own law text (no starvation), and no
        // faction pays itself: south keeps exactly what the north transfer took.
        const southFaction = world.factions.find(f => f.id === 'south-faction');
        expect(southFaction.resources).toBeCloseTo(1.7, 10);
        const selfRecord = getReputationObservation(southFaction, REPUTATION_DIMENSIONS.LAWFULNESS, 'south-faction');
        expect(selfRecord).toBeNull();
    });

    test('starved town justice now responds: south sees its own law penalty', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        for (let t = 1; t <= 5; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, attackRoadId: 'road-a' });
        }
        const southJustice = world.events.filter(e => e.type === 'JUSTICE_RESOLVED' && e.townId === 'south').slice(-1)[0];
        expect(southJustice.lawViolationCount).toBeGreaterThan(0);
        expect(southJustice.lawPenalty).toBeCloseTo(0.3, 5);
        expect(southJustice.parentEventIds.some(id => String(id).length > 0)).toBe(true);
    });

    test('single-town scope keeps single event with the full sentence', () => {
        const world = createClosedWorldScenario();
        world.towns.get('south').laws = [];
        world.factions.find(f => f.id === 'north-faction').resources = 1;
        world.factions.find(f => f.id === 'south-faction').resources = 2;
        world.merchants[0].cargo = 20;
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        const laws = world.events.filter(e => e.type === 'LAW_VIOLATED');
        expect(laws.length).toBe(1);
        expect(laws[0].townId).toBe('north');
        expect(laws[0].restitution.transferred).toBeCloseTo(0.3, 10);
    });

    test('apportioned violations survive save/load with identical shares', () => {
        const world = createClosedWorldScenario();
        world.merchants[0].cargo = 20;
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        const json = saveWorld(world);
        const loaded = loadWorld(json);
        expect(loaded.events.filter(e => e.type === 'LAW_VIOLATED')).toEqual(
            world.events.filter(e => e.type === 'LAW_VIOLATED')
        );
    });
});
