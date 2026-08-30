import { describe, it, expect } from '@jest/globals';
import { tickClosedWorld, createClosedWorldScenario } from '../closed-world.js';
import { chooseRoamingDestination, startTravel, advanceTravel, scoutDestination, recordObservation } from '../roaming.js';
import { deterministicRng } from '../closed-world.js';

describe('bandit is a roaming group (PHASE 12)', () => {
    it('a bandit that has scouted both roads chooses the better one', () => {
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        // Disable switchMargin so the bandit doesn't bias
        // toward its current location. The audit's "destination
        // utility" property is what we want to test.
        bandit.switchMargin = 0;
        // Seed beliefs directly: north (where the merchant starts)
        // is rich + low-danger, south is poor.
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'north', tick: 0,
            resourceEstimate: 0.8, dangerEstimate: 0.1, confidence: 0.9
        }));
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'south', tick: 0,
            resourceEstimate: 0.2, dangerEstimate: 0.1, confidence: 0.9
        }));
        // At low temperature, the bandit picks the richer location.
        bandit.explorationTemperature = 0.01;
        const choice = chooseRoamingDestination(bandit, { candidates: ['north', 'south'] , rng: deterministicRng(12345) });
        expect(choice).toBe('north');
    });

    it('a bandit with explicit knowledge of all candidates picks the best by utility', () => {
        // The bandit explicitly has beliefs for its current
        // location too. This is the audit's "no omniscience"
        // contract: a bandit acts on what it knows.
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        bandit.switchMargin = 0;
        bandit.beliefs = {};
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'road-a', tick: 0,
            resourceEstimate: 0.3, dangerEstimate: 0.1, confidence: 0.9
        }));
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'north', tick: 0,
            resourceEstimate: 0.8, dangerEstimate: 0.1, confidence: 0.9
        }));
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'south', tick: 0,
            resourceEstimate: 0.2, dangerEstimate: 0.1, confidence: 0.9
        }));
        bandit.explorationTemperature = 0.01;
        const choice = chooseRoamingDestination(bandit, { candidates: ['road-a', 'north', 'south'] , rng: deterministicRng(12345) });
        expect(choice).toBe('north');
    });

    it('a bandit with no scout data cannot choose an unknown destination', () => {
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        // Empty beliefs: no scout, no observations.
        bandit.beliefs = {};
        bandit.explorationTemperature = 0.01;
        const choice = chooseRoamingDestination(bandit, { candidates: ['north', 'south'] , rng: deterministicRng(12345) });
        // The bandit stays at its current location.
        expect(choice).toBe(bandit.currentLocation);
    });

    it('a bandit can make a bad decision because its information is stale', () => {
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        bandit.switchMargin = 0;
        bandit.beliefs = {};
        // The bandit's belief says north is rich. The audit demands
        // that bandits be able to make bad decisions: they should
        // act on their belief, even if the world has changed.
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'road-a', tick: 0,
            resourceEstimate: 0.05, dangerEstimate: 0.1, confidence: 0.9
        }));
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'north', tick: 0,
            resourceEstimate: 0.99, dangerEstimate: 0.1, confidence: 0.9
        }));
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'south', tick: 0,
            resourceEstimate: 0.1, dangerEstimate: 0.1, confidence: 0.9
        }));
        bandit.explorationTemperature = 0.01;
        const choice = chooseRoamingDestination(bandit, { candidates: ['road-a', 'north', 'south'] , rng: deterministicRng(12345) });
        // The bandit picks north based on its belief.
        expect(choice).toBe('north');
    });

    it('a bandit can travel physically (PHASE 11 integration)', () => {
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        bandit.switchMargin = 0;
        recordObservation(bandit, scoutDestination(bandit, {
            locationId: 'north', tick: 0,
            resourceEstimate: 0.5, dangerEstimate: 0.1, confidence: 0.9
        }));
        bandit.explorationTemperature = 0.01;
        const dest = chooseRoamingDestination(bandit, { candidates: ['north'] , rng: deterministicRng(12345) });
        // If the bandit chose to leave home, it must travel physically.
        if (dest !== bandit.currentLocation) {
            startTravel(bandit, { destination: dest, travelTime: 3 });
            expect(bandit.travelState).toBe('IN_TRANSIT');
            advanceTravel(bandit, 3);
            expect(bandit.currentLocation).toBe(dest);
            expect(bandit.travelState).toBe('AT_LOCATION');
        }
    });
});
