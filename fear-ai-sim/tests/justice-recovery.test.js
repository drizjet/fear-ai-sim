import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';

describe('justice recovery when no crime (Slice K)', () => {
    it('justiceState and faction legitimacy both recover together when crime stops', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        const northFaction = world.factions.find(f => f.townId === 'north');
        northFaction.legitimacy = 0.9;
        // Trigger crime for 5 ticks to scar justice and faction
        for (let t = 1; t <= 5; t++) {
            appendWorldEvent(world, { type: 'BANDIT_ATTACK', tick: t, roadId: 'road-a', banditId: 'b1' });
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        const scarredJustice = world.justiceState.get('north').legitimacy;
        const scarredFaction = northFaction.legitimacy;
        expect(scarredJustice).toBeLessThan(0.9);
        expect(scarredFaction).toBeLessThan(0.9);
        // Now 50 ticks without crime — both should drift back toward 0.9 and stay in sync
        world.bandits = [];
        for (let t = 6; t <= 55; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        }
        const recoveredJustice = world.justiceState.get('north').legitimacy;
        const recoveredFaction = northFaction.legitimacy;
        expect(recoveredJustice).toBeGreaterThan(scarredJustice);
        expect(recoveredFaction).toBeGreaterThan(scarredFaction);
        expect(recoveredJustice).toBeGreaterThan(0.5);
        expect(recoveredFaction).toBeGreaterThan(0.5);
        // Drift together: difference should be small (both use 0.98 lerp)
        expect(Math.abs(recoveredJustice - recoveredFaction)).toBeLessThan(0.15);
    });

    it('no recovery stall: justiceState grievance also drifts toward baseline when idle', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        for (let t = 1; t <= 5; t++) {
            appendWorldEvent(world, { type: 'BANDIT_ATTACK', tick: t, roadId: 'road-a', banditId: 'b1' });
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        const scarredGrievance = world.justiceState.get('north').grievance;
        world.bandits = [];
        for (let t = 6; t <= 30; t++) tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        const recoveredGrievance = world.justiceState.get('north').grievance;
        expect(recoveredGrievance).toBeLessThan(scarredGrievance);
    });
});
