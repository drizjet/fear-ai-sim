import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, getWorldEvents } from '../closed-world.js';

// R8 (bandit initiative): a contact-starved bandit scouts
// neighboring roads instead of freezing forever. Trigger is
// own-state only (locationAge >= 15, lootExpectation < 0.3) —
// no distant truth is read.

function stalemateWorld() {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 100000;
    const bandit = world.bandits[0];
    bandit.roadId = 'road-c';
    bandit.lootExpectation = 0;
    // Merchants shun road-c so the bandit makes no contact.
    for (const merch of world.merchants) {
        merch.routeBeliefs = {
            'road-a': { perceivedDanger: 0, confidence: 1 },
            'road-b': { perceivedDanger: 0, confidence: 1 },
            'road-c': { perceivedDanger: 1, confidence: 1 },
        };
    }
    return { world, bandit };
}

describe('R8 — starved bandits scout instead of freezing', () => {
    it('an idle bandit with no loot relocates within 40 ticks', () => {
        const { world, bandit } = stalemateWorld();
        const startRoad = bandit.roadId;
        for (let tick = 1; tick <= 40; tick++) {
            bandit.lootExpectation = 0;
            tickClosedWorld(world, { tick });
        }
        const scouts = getWorldEvents(world, { types: ['BANDIT_RELOCATION'] })
            .filter(e => e.relocation?.reason === 'starvation-scout');
        expect(scouts.length).toBeGreaterThanOrEqual(1);
        expect(bandit.roadId).not.toBe(startRoad);
    });

    it('a fed bandit never starvation-scouts', () => {
        const { world, bandit } = stalemateWorld();
        for (let tick = 1; tick <= 40; tick++) {
            bandit.lootExpectation = 0.7;
            tickClosedWorld(world, { tick });
        }
        const scouts = getWorldEvents(world, { types: ['BANDIT_RELOCATION'] })
            .filter(e => e.relocation?.reason === 'starvation-scout');
        expect(scouts.length).toBe(0);
    });
});
