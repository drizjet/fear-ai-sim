import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack } from '../closed-world.js';
import { destinationUtility, scoutDestination, recordObservation, ROAMING_MODE } from '../roaming.js';

describe('bandit rest decay wired into closed-world (PHASE 19 fix in live path)', () => {
    it('a bandit that has been at a location for many ticks has a decayed rest bonus', () => {
        // The audit's EVID-2026-08-28-REST-BONUS-DECAY limitation:
        // "The tickRoamingGroup function must be called
        // explicitly by the caller. The closed-world reducer
        // does not yet call it; a future slice can wire it in."
        // This test proves the wiring: after many ticks of
        // the reducer, the bandit's locationAge increments and
        // the rest bonus decays.
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        // Override to REST mode so the rest bonus is non-zero.
        bandit.mode = ROAMING_MODE.REST;
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: bandit.currentLocation, tick: 0,
            resourceEstimate: 0.5, dangerEstimate: 0.1, confidence: 0.9
        }));
        // Fresh: rest bonus at full strength.
        const freshUtility = destinationUtility(
            bandit.currentLocation, bandit.beliefs[bandit.currentLocation], bandit
        );
        // Drive 100 ticks of the reducer.
        for (let t = 1; t <= 100; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.0 });
        }
        // The bandit's locationAge should have incremented.
        expect(bandit.locationAge).toBeGreaterThan(0);
        // The current utility should be lower than the fresh one
        // (the rest bonus decayed).
        const staleUtility = destinationUtility(
            bandit.currentLocation, bandit.beliefs[bandit.currentLocation], bandit
        );
        expect(staleUtility).toBeLessThan(freshUtility);
    });
});
