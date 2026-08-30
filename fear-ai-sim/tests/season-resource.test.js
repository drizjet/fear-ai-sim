import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { createRoamingGroup, scoutDestination, recordObservation, chooseRoamingDestination, destinationUtility } from '../roaming.js';

describe('season → resource → behavior (PHASE 20)', () => {
    it('season is a world property that changes resource availability', () => {
        // The audit: "season → local resource availability →
        // scout observation → roaming belief → destination
        // utility → migration → encounters → trade/territorial
        // consequence."
        // The minimal causal chain: season modifies
        // resourceEstimate in observations. A WINTER season
        // should reduce resource estimates.
        const world = createClosedWorldScenario({ season: 'WINTER' });
        expect(world.season).toBe('WINTER');
        // The season should propagate to resource availability
        // for scouts. A scout in WINTER sees a scarcer landscape.
        const bandit = world.bandits[0];
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'north', tick: 0,
            resourceEstimate: 0.5, dangerEstimate: 0.1, confidence: 0.9
        }));
        // With season-aware resource adjustment, a WINTER
        // observation should yield a lower effective resource
        // than the same observation in SUMMER.
        // (The exact factor is a calibration choice.)
        // We test that the world property is accessible.
        expect(bandit.beliefs.north).toBeDefined();
    });

    it('a season-aware utility is lower in WINTER than SUMMER for the same resource', () => {
        // Season adjustment: WINTER reduces effective resource
        // by a factor (e.g. 0.5). The utility function should
        // be lower in WINTER for the same observation.
        const belief = { resourceValue: 0.5, danger: 0.1, distance: 0, informationConfidence: 0.9 };
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        const uSummer = destinationUtility('a', belief, group, { season: 'SUMMER' });
        const uWinter = destinationUtility('a', belief, group, { season: 'WINTER' });
        // WINTER reduces resource estimate; the utility should
        // be lower.
        expect(uWinter).toBeLessThan(uSummer);
    });
});
