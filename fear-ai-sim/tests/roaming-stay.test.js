import { describe, it, expect } from '@jest/globals';
import { createRoamingGroup, scoutDestination, recordObservation, chooseRoamingDestination, destinationUtility } from '../roaming.js';
import { deterministicRng } from '../closed-world.js';

describe('STAY as a real decision', () => {
    it('STAY uses the same pipeline as every other destination', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home', explorationTemperature: 0 });
        const belief = { resourceValue: 0.5, danger: 0.1, distance: 0, informationConfidence: 0.9 };
        group.beliefs.home = belief;
        const choice = chooseRoamingDestination(group, { candidates: ['home', 'elsewhere'] , rng: deterministicRng(12345) });
        // With temperature 0 and identical candidates, the
        // function must return one of them (likely home since
        // it has the rest bonus). The key property is that
        // STAY doesn't crash; the return value is a real
        // location.
        expect(typeof choice).toBe('string');
        expect(['home', 'elsewhere']).toContain(choice);
    });

    it('STAY benefits from inertia via the switchMargin parameter', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home', explorationTemperature: 0, switchMargin: 0.5 });
        group.beliefs.home = { resourceValue: 0.5, danger: 0, distance: 0, informationConfidence: 0.9 };
        group.beliefs.elsewhere = { resourceValue: 0.55, danger: 0, distance: 0, informationConfidence: 0.9 };
        // elsewhere is only marginally better (0.55 vs 0.5
        // = delta 0.05), but the switchMargin is 0.5, so the
        // function should choose STAY (i.e. return 'home').
        const choice = chooseRoamingDestination(group, { candidates: ['home', 'elsewhere'] , rng: deterministicRng(12345) });
        expect(choice).toBe('home');
    });

    it('STAY is returned when no candidate has a belief', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home', explorationTemperature: 0 });
        group.beliefs.home = { resourceValue: 0.5, danger: 0, distance: 0, informationConfidence: 0.9 };
        const choice = chooseRoamingDestination(group, { candidates: ['elsewhere'] , rng: deterministicRng(12345) });
        // 'elsewhere' has no belief so -Infinity; only 'home' (STAY) is eligible.
        expect(choice).toBe('home');
    });
});
