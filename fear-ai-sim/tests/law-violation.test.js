import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack, saveWorld, loadWorld } from '../closed-world.js';
import { ensureTownLaws, isActionIllegal, checkLawCompliance, LAW_TYPES } from '../law.js';

describe('law violation (town banditry prohibition)', () => {
    test('BANDIT_ATTACK on an incident road violates every incident town law', () => {
        const world = createClosedWorldScenario();
        // Force a deterministic attack via resolveBanditAttack (direct path).
        // road-a is incident to both north and south, so both towns emit
        // their own LAW_VIOLATED (Slice Y ended first-match starvation).
        world.merchants[0].cargo = 20;
        const result = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(result.ok).toBe(true);
        const lawEvents = world.events.filter(e => e.type === 'LAW_VIOLATED');
        expect(lawEvents.map(e => e.townId).sort()).toEqual(['north', 'south']);
        for (const ev of lawEvents) {
            expect(ev.prohibits).toBe('BANDIT_ATTACK');
            expect(ev.lawType).toBe(LAW_TYPES.BANDITRY);
            expect(typeof ev.lawId).toBe('string');
            expect(ev.penalty).toBeGreaterThan(0);
            expect(ev.roadId).toBe('road-a');
            expect(ev.attackEventId).toBe(result.event.eventId);
            // Parentage is auditable: LAW_VIOLATED parent is the attack
            expect(ev.parentEventIds).toContain(result.event.eventId);
        }
        // The sentence stays conserved across towns (no multiplication).
        const total = lawEvents.reduce((sum, ev) => sum + (ev.restitution?.transferred ?? 0), 0);
        expect(total).toBeCloseTo(0.3, 10);
    });

    test('removing town laws prevents violation (mutation-sensitive)', () => {
        const world = createClosedWorldScenario();
        // Mutation: strip all town laws (the gate we added)
        for (const [, town] of world.towns) town.laws = [];
        world.merchants[0].cargo = 20;
        const result = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(result.ok).toBe(true);
        const lawEvents = world.events.filter(e => e.type === 'LAW_VIOLATED');
        expect(lawEvents.length).toBe(0);
        // Direct API also reflects the missing law
        const town = world.towns.get('north');
        const illegal = isActionIllegal({ type: 'BANDIT_ATTACK', roadId: 'road-a' }, town, world);
        expect(illegal).toBeNull();
    });

    test('tickClosedWorld encounter path also emits LAW_VIOLATED for incident road', () => {
        const world = createClosedWorldScenario();
        // Use the explicit attack route to force bandit-ambush deterministically
        tickClosedWorld(world, { tick: 1, attackRoadId: 'road-a' });
        const attacks = world.events.filter(e => e.type === 'BANDIT_ATTACK' && e.tick === 1);
        expect(attacks.length).toBeGreaterThan(0);
        const laws = world.events.filter(e => e.type === 'LAW_VIOLATED' && e.tick === 1);
        expect(laws.length).toBeGreaterThan(0);
        const law = laws[0];
        expect(law.roadId).toBe('road-a');
        expect(law.penalty).toBeCloseTo(0.3, 2);
        // checkLawCompliance also finds the same violation directly
        const direct = checkLawCompliance({ world, action: { type: 'BANDIT_ATTACK', roadId: 'road-a' }, tick: 1 });
        expect(direct).not.toBeNull();
        expect(direct.townId).toBe(law.townId);
    });

    test('law with non-matching scope does not trigger (honest mismatch)', () => {
        const world = createClosedWorldScenario();
        // Give north a law that only prohibits on a non-existent road
        const north = world.towns.get('north');
        north.laws = [{
            id: 'north-law-smuggling',
            type: LAW_TYPES.SMUGGLING,
            prohibits: 'BANDIT_ATTACK',
            scope: 'road-z', // not incident, not the attack road
            penalty: 0.2,
            description: 'smuggling on road-z',
        }];
        const south = world.towns.get('south');
        // Also remove south's default banditry law to isolate north
        south.laws = [];
        world.merchants[0].cargo = 20;
        const result = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(result.ok).toBe(true);
        const lawEvents = world.events.filter(e => e.type === 'LAW_VIOLATED');
        expect(lawEvents.length).toBe(0);
        // Now restore a global law and it should fire even on road-a
        north.laws[0].scope = 'global';
        world.events = world.events.filter(e => e.type !== 'LAW_VIOLATED');
        // Need a new attack opportunity (different tick)
        world.merchants[0].cargo = 20;
        const result2 = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 2 });
        expect(result2.ok).toBe(true);
        const lawEvents2 = world.events.filter(e => e.type === 'LAW_VIOLATED' && e.tick === 2);
        expect(lawEvents2.length).toBe(1);
        expect(lawEvents2[0].townId).toBe('north');
    });

    test('town laws survive save/load and still enforce after load', () => {
        const world = createClosedWorldScenario();
        // mutate one town's law to a custom penalty to prove persistence of custom state
        const north = world.towns.get('north');
        ensureTownLaws(north);
        north.laws[0].penalty = 0.77;
        const json = saveWorld(world);
        const loaded = loadWorld(json);
        const loadedNorth = loaded.towns.get('north');
        expect(loadedNorth.laws[0].penalty).toBeCloseTo(0.77, 5);
        loaded.merchants[0].cargo = 20;
        const result = resolveBanditAttack(loaded, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(result.ok).toBe(true);
        const lawEvents = loaded.events.filter(e => e.type === 'LAW_VIOLATED');
        expect(lawEvents.map(e => e.townId).sort()).toEqual(['north', 'south']);
        expect(lawEvents.find(e => e.townId === 'north').penalty).toBeCloseTo(0.77, 5);
        // Deterministic replay: same save/load + same tick yields byte-identical events
        const world2 = createClosedWorldScenario();
        world2.towns.get('north').laws[0].penalty = 0.77;
        world2.merchants[0].cargo = 20;
        const r2 = resolveBanditAttack(world2, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(r2.event.lost).toBe(result.event.lost);
        expect(loaded.events.filter(e => e.type === 'LAW_VIOLATED')[0].lawId).toBe(
            world2.events.filter(e => e.type === 'LAW_VIOLATED')[0].lawId
        );
    });
});
