import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';

describe('justice recovery when no crime (Slice K)', () => {
    it('justiceState and ruler legitimacy both recover together when crime stops', () => {
        const world = createClosedWorldScenario();
        world.ticksPerSeason = 10000;
        // Scar through the original five attacks. The wound may cost
        // the incumbent control (secession is a lawful exit) — the pin
        // is that recovery follows CONTROL: whoever rules the town
        // heals with it, never a null-fallback ghost.
        for (let t = 1; t <= 5; t++) {
            appendWorldEvent(world, { type: 'BANDIT_ATTACK', tick: t, roadId: 'road-a', banditId: 'b1' });
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
        }
        const scarredJustice = world.justiceState.get('north').legitimacy;
        expect(scarredJustice).toBeLessThan(0.9);
        // Now 50 ticks without crime — town and ruler drift back
        // toward 0.9 and stay in sync. At most one secession per town
        // can interleave, so a stable ruler must strictly recover.
        world.bandits = [];
        const startRulerId = world.towns.get('north').controlledBy;
        const startRulerLeg = startRulerId
            ? world.factions.find(f => f.id === startRulerId).legitimacy
            : null;
        for (let t = 6; t <= 55; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        }
        const recoveredJustice = world.justiceState.get('north').legitimacy;
        const endRulerId = world.towns.get('north').controlledBy;
        expect(endRulerId).not.toBeNull();
        const endRuler = world.factions.find(f => f.id === endRulerId);
        expect(recoveredJustice).toBeGreaterThan(scarredJustice);
        expect(recoveredJustice).toBeGreaterThan(0.5);
        expect(endRuler.legitimacy).toBeGreaterThan(0.5);
        if (endRulerId === startRulerId && startRulerLeg !== null) {
            expect(endRuler.legitimacy).toBeGreaterThan(startRulerLeg);
        }
        // Drift together: difference should be small (both use 0.98 lerp)
        expect(Math.abs(recoveredJustice - endRuler.legitimacy)).toBeLessThan(0.15);
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
