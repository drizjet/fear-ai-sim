import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack } from '../closed-world.js';
import { getMemoryOfLoss, recordHarmByActor } from '../escalation.js';

describe('targeted retaliation: faction prefers the bandit it remembers', () => {
    it('a faction with a higher memory of bandit-B (the second bandit in the array) still raids bandit-B', () => {
        // The audit: "A faction harmed by Bandit A should not
        // automatically attach equal grievance to every bandit."
        // This test proves the invasion gate consults the
        // per-target memory: if it just picked the first bandit
        // in the array, the test would fail because bandit-A is
        // first but the faction remembers bandit-B.
        const world = createClosedWorldScenario();
        // Bandit-A is first in the array (would win with the
        // legacy "first bandit" logic). Bandit-B is second but
        // the faction has a strong memory of bandit-B.
        world.bandits = [
            { id: 'bandit-A', roadId: 'road-a', alternateRoadId: 'road-b', lootExpectation: 0.7 },
            { id: 'bandit-B', roadId: 'road-c', alternateRoadId: 'road-a', lootExpectation: 0.7 }
        ];
        for (const faction of world.factions) {
            // Set parameters that produce RAID state under
            // perceivedDanger: 0.8.
            faction.grievance = 0.5;
            faction.militaryConfidence = 1.0;
            faction.riskTolerance = 1.0;
            faction.resources = 5;
            faction.maxResources = 5;
            // The faction has a STRONG memory of bandit-B and
            // no memory of bandit-A.
            recordHarmByActor(faction, 'bandit-B', { severity: 0.9, tick: 0, known: true });
        }
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.8 });
        const invasionEvents = world.events.filter(ev => ev.type === 'INVASION');
        expect(invasionEvents.length).toBeGreaterThan(0);
        // The first invasion should target bandit-B, the bandit
        // the faction has the strongest specific memory of,
        // even though bandit-A is first in the array.
        const firstTarget = invasionEvents[0].targetId;
        expect(firstTarget).toBe('bandit-B');
    });
});


