import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, getWorldEvents } from '../closed-world.js';

// R8 (rate calibration): refugee-group fires at most once per 15
// ticks. Uncooled it fires every tick with grievance > 0.3 and
// swamps demography births in quiet worlds.

describe('R8 — refugee encounter rate is calibrated', () => {
    it('60 pinned-grievance ticks produce 1-5 refugee groups, not ~60', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 100000;
        let firings = 0;
        for (let tick = 1; tick <= 60; tick++) {
            for (const faction of world.factions) faction.grievance = 0.5;
            const before = getWorldEvents(world, { types: ['ENCOUNTER'] })
                .filter(e => e.encounterId === 'refugee-group').length;
            tickClosedWorld(world, { tick });
            const after = getWorldEvents(world, { types: ['ENCOUNTER'] })
                .filter(e => e.encounterId === 'refugee-group').length;
            firings += (after - before);
        }
        // The type is alive (not dead-coded by the floor) but bounded:
        // 60 ticks / 15-tick floor + 1 for tick-1 alignment.
        expect(firings).toBeGreaterThanOrEqual(1);
        expect(firings).toBeLessThanOrEqual(5);
    });
});
