import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack, saveWorld, loadWorld } from '../closed-world.js';

function directWorld({ northResources = 1, southResources = 2 } = {}) {
    const world = createClosedWorldScenario();
    world.factions.find(f => f.id === 'north-faction').resources = northResources;
    world.factions.find(f => f.id === 'south-faction').resources = southResources;
    world.merchants[0].cargo = 20;
    return world;
}

describe('penalty-funded restitution (slice X)', () => {
    test('violator transfers penalty units to the observer faction, zero-sum', () => {
        const world = directWorld({});
        const result = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(result.ok).toBe(true);
        const law = world.events.find(e => e.type === 'LAW_VIOLATED');
        expect(law.restitution).toMatchObject({ from: 'south-faction', to: 'north-faction', amount: 0.3, transferred: 0.3 });
        expect(world.factions.find(f => f.id === 'south-faction').resources).toBeCloseTo(1.7, 10);
        expect(world.factions.find(f => f.id === 'north-faction').resources).toBeCloseTo(1.3, 10);
        // Zero-sum: total faction resources unchanged (2 + 1 = 3).
        const total = world.factions.reduce((sum, f) => sum + f.resources, 0);
        expect(total).toBeCloseTo(3, 10);
    });

    test('no town law means no transfer (mutation-sensitive)', () => {
        const world = directWorld({});
        for (const [, town] of world.towns) town.laws = [];
        const result = resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        expect(result.ok).toBe(true);
        expect(world.events.filter(e => e.type === 'LAW_VIOLATED').length).toBe(0);
        expect(world.factions.find(f => f.id === 'south-faction').resources).toBe(2);
        expect(world.factions.find(f => f.id === 'north-faction').resources).toBe(1);
    });

    test('broke violator transfers only what it has, never below zero', () => {
        const world = directWorld({ northResources: 1, southResources: 0.1 });
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        const law = world.events.find(e => e.type === 'LAW_VIOLATED');
        expect(law.restitution.transferred).toBeCloseTo(0.1, 10);
        expect(world.factions.find(f => f.id === 'south-faction').resources).toBe(0);
        expect(world.factions.find(f => f.id === 'north-faction').resources).toBeCloseTo(1.1, 10);
    });

    test('capped observer keeps the debit honest: violator still pays, credit clamps at cap', () => {
        const world = directWorld({ northResources: 2, southResources: 2 });
        resolveBanditAttack(world, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        const law = world.events.find(e => e.type === 'LAW_VIOLATED');
        expect(law.restitution.transferred).toBeCloseTo(0.3, 10);
        expect(law.restitution.credited).toBe(0);
        expect(world.factions.find(f => f.id === 'south-faction').resources).toBeCloseTo(1.7, 10);
        expect(world.factions.find(f => f.id === 'north-faction').resources).toBe(2);
    });

    test('free-agent and self-loop violations skip the transfer honestly', () => {
        const free = directWorld({});
        delete free.bandits[0].factionId;
        resolveBanditAttack(free, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        const freeLaw = free.events.find(e => e.type === 'LAW_VIOLATED');
        expect(freeLaw.restitution).toBeNull();
        expect(free.factions.find(f => f.id === 'south-faction').resources).toBe(2);

        const loop = directWorld({});
        loop.bandits[0].factionId = 'north-faction';
        resolveBanditAttack(loop, { merchantId: 'merchant-1', roadId: 'road-a', tick: 1 });
        const loopLaw = loop.events.find(e => e.type === 'LAW_VIOLATED');
        expect(loopLaw.violatorFactionId).toBe('north-faction');
        expect(loopLaw.observerFactionId).toBe('north-faction');
        expect(loopLaw.restitution).toBeNull();
        expect(loop.factions.find(f => f.id === 'north-faction').resources).toBe(1);
    });

    test('tick path audits every transfer and restitution survives save/load', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        for (let t = 1; t <= 3; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, attackRoadId: 'road-a' });
        }
        const laws = world.events.filter(e => e.type === 'LAW_VIOLATED');
        expect(laws.length).toBeGreaterThan(0);
        for (const law of laws) {
            expect(law.restitution).not.toBeNull();
            expect(law.restitution.amount).toBeCloseTo(0.3, 10);
        }
        const totalTransferred = laws.reduce((sum, law) => sum + law.restitution.transferred, 0);
        expect(totalTransferred).toBeGreaterThan(0);
        const json = saveWorld(world);
        const loaded = loadWorld(json);
        expect(loaded.events.filter(e => e.type === 'LAW_VIOLATED')).toEqual(laws);
    });
});
