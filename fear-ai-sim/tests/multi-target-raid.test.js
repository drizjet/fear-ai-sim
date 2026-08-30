import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario } from '../closed-world.js';
import { chooseRoamingDestination, scoutDestination, recordObservation, destinationUtility } from '../roaming.js';
import { deterministicRng } from '../closed-world.js';

describe('multi-target raid selection (PHASE 17)', () => {
    it('a bandit with 4 candidates picks the highest-utility one', () => {
        // The audit: "Give a roaming raider at least 3-5
        // legitimate candidates."
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        bandit.switchMargin = 0;
        bandit.explorationTemperature = 0.01;
        // Seed beliefs for 4 candidates: road-a, road-b,
        // north, south. Each has different loot/danger profiles.
        for (const [id, resource, danger] of [
            ['road-a', 0.5, 0.1],
            ['road-b', 0.5, 0.1],
            ['north', 0.99, 0.1],
            ['south', 0.2, 0.1]
        ]) {
            recordObservation(bandit, scoutDestination(bandit, {
                locationId: id, tick: 0,
                resourceEstimate: resource, dangerEstimate: danger, confidence: 0.9
            }));
        }
        const choice = chooseRoamingDestination(bandit, {
            candidates: ['road-a', 'road-b', 'north', 'south']
        , rng: deterministicRng(12345) });
        // North has the highest resource; the bandit picks it.
        expect(choice).toBe('north');
    });

    it('a bandit avoids a candidate with high retaliation risk', () => {
        // The audit: "Evaluate: loot opportunity; defense;
        // distance; belief confidence; retaliation risk;
        // escape feasibility."
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        bandit.switchMargin = 0;
        bandit.explorationTemperature = 0.01;
        // North is rich but the retaliation risk is very high.
        // We seed the retaliation field on the belief
        // directly AFTER recordObservation (which would
        // otherwise overwrite it).
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'road-a', tick: 0,
            resourceEstimate: 0.5, dangerEstimate: 0.1, confidence: 0.9
        }));
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'north', tick: 0,
            resourceEstimate: 0.9, dangerEstimate: 0.1, confidence: 0.9
        }));
        bandit.beliefs.north.retaliationRisk = 0.9;
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'south', tick: 0,
            resourceEstimate: 0.4, dangerEstimate: 0.1, confidence: 0.9
        }));
        const choice = chooseRoamingDestination(bandit, {
            candidates: ['road-a', 'north', 'south']
        , rng: deterministicRng(12345) });
        // The bandit should avoid north (high retaliation) and
        // pick the better of road-a (0.5) or south (0.4).
        // Both are RAID-eligible; the bandit picks the higher
        // resource destination.
        expect(choice).not.toBe('north');
    });

    it('a bandit with no scout data cannot choose any unknown candidate', () => {
        // The audit: "Normal modes must not evaluate unknown
        // world locations."
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        bandit.switchMargin = 0;
        bandit.beliefs = {};
        bandit.explorationTemperature = 0.01;
        // No beliefs: all 3 candidates are -Infinity.
        const choice = chooseRoamingDestination(bandit, {
            candidates: ['road-a', 'north', 'south']
        , rng: deterministicRng(12345) });
        // The bandit stays at its current location.
        expect(choice).toBe(bandit.currentLocation);
    });
});
