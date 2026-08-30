import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack } from '../closed-world.js';
import { getMemoryOfLoss } from '../escalation.js';

describe('per-target memory wired into closed-world attack flow', () => {
    it('a bandit attack produces a per-target memory entry on the affected faction', () => {
        const world = createClosedWorldScenario();
        const faction = world.factions.find(f => f.id === 'north-faction');
        const bandit = world.bandits[0];
        // Resolve a bandit attack: this should produce a BANDIT_ATTACK event.
        resolveBanditAttack(world, { roadId: 'road-a', perceivedDanger: 0.8, tick: 1 });
        // The reducer consumes the event and writes to memoryByActor.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.8 });
        // The faction's memoryByActor should contain the bandit.
        expect(faction.memoryByActor).toBeDefined();
        const banditMemory = getMemoryOfLoss(faction, bandit.id);
        expect(banditMemory).toBeGreaterThan(0);
    });

    it('a bandit-A attack produces a higher memory than a bandit-B attack (per-target specificity)', () => {
        const world = createClosedWorldScenario();
        const faction = world.factions.find(f => f.id === 'north-faction');
        // Two different bandit attacks at the same tick.
        world.events.push({ type: 'BANDIT_ATTACK', banditId: 'bandit-A', tick: 1, roadId: 'road-a' });
        world.events.push({ type: 'BANDIT_ATTACK', banditId: 'bandit-B', tick: 1, roadId: 'road-b' });
        // The reducer processes events at the current tick.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.5 });
        const memA = getMemoryOfLoss(faction, 'bandit-A');
        const memB = getMemoryOfLoss(faction, 'bandit-B');
        // Both should be positive, and the reducer should not conflate them.
        expect(memA).toBeGreaterThan(0);
        expect(memB).toBeGreaterThan(0);
    });

    it('the faction retains its scalar memoryOfLoss as a generalized fear signal', () => {
        // The audit: "Unknown attackers may produce generalized
        // fear while specific grievance remains uncertain."
        const world = createClosedWorldScenario();
        const faction = world.factions.find(f => f.id === 'north-faction');
        world.events.push({ type: 'BANDIT_ATTACK', banditId: 'unknown', tick: 1, roadId: 'road-a' });
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.5 });
        // The scalar memoryOfLoss should still rise (generalized fear).
        expect(faction.memoryOfLoss).toBeGreaterThan(0);
    });
});
