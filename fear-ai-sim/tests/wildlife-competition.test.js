import { createClosedWorldScenario, tickClosedWorld, saveWorld, loadWorld } from '../closed-world.js';
import { tickBandit } from '../canonical-trade-system.js';
import { createWildlifeGroup, tickWildlifeGroup, wildlifePayoffFactor } from '../wildlife.js';

function suppressionWorld(groupSize) {
    const world = createClosedWorldScenario();
    world.wildlifeGroups = groupSize === 0
        ? []
        : [{ id: 'wolves-1', roadId: 'road-b', size: groupSize, lastMoveTick: null }];
    const bandit = world.bandits[0];
    bandit.roadId = 'road-a';
    bandit.perceptionAccuracy = 0;
    bandit.trafficBelief = {
        'road-a': { estimatedTraffic: 1, recency: 1, lastDecayTick: 1 },
        'road-b': { estimatedTraffic: 5, recency: 1, lastDecayTick: 1 },
        'road-c': { estimatedTraffic: 0, recency: 0, lastDecayTick: 1 },
    };
    world.merchants[0].selectedRoute = 'road-c';
    world.merchants[0].lastRoute = 'road-c';
    return world;
}

describe('wildlife predator competition (slice AA)', () => {
    test('wildlife group tracks the busiest merchant road deterministically', () => {
        const world = createClosedWorldScenario();
        world.wildlifeGroups = [createWildlifeGroup({ id: 'wolves-1', roadId: 'road-b', size: 3 })];
        world.merchants[0].selectedRoute = 'road-a';
        world.merchants[0].lastRoute = null;
        const moved = tickWildlifeGroup(world, 'wolves-1', { tick: 1 });
        expect(moved).toMatchObject({ ok: true, relocated: true, from: 'road-b', to: 'road-a' });
        expect(world.wildlifeGroups[0].lastMoveTick).toBe(1);
        // Holding emits nothing: already on the busiest road.
        const held = tickWildlifeGroup(world, 'wolves-1', { tick: 2 });
        expect(held).toMatchObject({ ok: true, relocated: false });
    });

    test('no merchant traffic means no movement and no events', () => {
        const world = createClosedWorldScenario();
        world.wildlifeGroups = [createWildlifeGroup({ id: 'wolves-1', roadId: 'road-b', size: 3 })];
        world.merchants[0].selectedRoute = null;
        world.merchants[0].lastRoute = null;
        const result = tickWildlifeGroup(world, 'wolves-1', { tick: 1 });
        expect(result).toMatchObject({ ok: true, relocated: false });
        expect(world.wildlifeGroups[0].roadId).toBe('road-b');
    });

    test('crowded road suppresses bandit relocation while empty road does not', () => {
        const crowded = suppressionWorld(10);
        const crowdedResult = tickBandit(crowded, crowded.bandits[0].id, { tick: 2, rng: () => 0.99 });
        expect(crowdedResult.relocated ?? false).toBe(false);
        expect(crowded.bandits[0].roadId).toBe('road-a');

        const empty = suppressionWorld(0);
        const emptyResult = tickBandit(empty, empty.bandits[0].id, { tick: 2, rng: () => 0.99 });
        expect(emptyResult.relocated).toBe(true);
        expect(empty.bandits[0].roadId).toBe('road-b');
    });

    test('wildlife on an unrelated road does not affect the bandit', () => {
        const world = suppressionWorld(10);
        world.wildlifeGroups[0].roadId = 'road-c';
        expect(wildlifePayoffFactor(world, 'road-b')).toBe(1);
        const result = tickBandit(world, world.bandits[0].id, { tick: 2, rng: () => 0.99 });
        expect(result.relocated).toBe(true);
        expect(world.bandits[0].roadId).toBe('road-b');
    });

    test('payoff factor is exact: absent means 1, size 3 means 0.7, capped at 0.2', () => {
        const world = createClosedWorldScenario();
        world.wildlifeGroups = [];
        expect(wildlifePayoffFactor(world, 'road-a')).toBe(1);
        world.wildlifeGroups = [{ id: 'wolves-1', roadId: 'road-a', size: 3, lastMoveTick: null }];
        expect(wildlifePayoffFactor(world, 'road-a')).toBeCloseTo(0.7, 10);
        world.wildlifeGroups[0].size = 30;
        expect(wildlifePayoffFactor(world, 'road-a')).toBeCloseTo(0.2, 10);
    });

    test('wildlife state survives save/load and the reducer stays sparse on hold', () => {
        const world = createClosedWorldScenario();
        world.merchants[0].selectedRoute = 'road-b';
        world.merchants[0].lastRoute = 'road-b';
        world.merchants[0].cargo = 0;
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.1 });
        const json = saveWorld(world);
        const loaded = loadWorld(json);
        expect(loaded.wildlifeGroups).toEqual(world.wildlifeGroups);
        // Group already on the busiest road: next tick emits no relocation.
        const before = loaded.events.filter(e => e.type === 'WILDLIFE_RELOCATION').length;
        loaded.merchants[0].selectedRoute = loaded.wildlifeGroups[0].roadId;
        loaded.merchants[0].lastRoute = loaded.wildlifeGroups[0].roadId;
        tickClosedWorld(loaded, { tick: 2, perceivedDanger: 0.1 });
        const after = loaded.events.filter(e => e.type === 'WILDLIFE_RELOCATION').length;
        expect(after).toBe(before);
    });
});
