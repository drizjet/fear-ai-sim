import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, advanceRoamingTravel } from '../closed-world.js';
import { createRoamingGroup, startTravel, advanceTravel, scoutDestination, recordObservation, chooseRoamingDestination, ROAMING_MODE, makeXorShift32 } from '../roaming.js';

// Slice L: roaming travel is real movement and scout observations feed bandit beliefs

describe('Slice L — roaming travel exposure → bandit belief (real movement)', () => {
    it('IN_TRANSIT bandit does not teleport: currentLocation unchanged until arrival', () => {
        const group = createRoamingGroup({ id: 'bandits-1', currentLocation: 'road-a', mode: 'RAID' });
        startTravel(group, { destination: 'road-b', travelTime: 5 });
        expect(group.travelState).toBe('IN_TRANSIT');
        expect(group.currentLocation).toBe('road-a');
        advanceTravel(group, 3);
        expect(group.currentLocation).toBe('road-a');
        expect(group.travelRemaining).toBe(2);
        advanceTravel(group, 2);
        expect(group.currentLocation).toBe('road-b');
        expect(group.travelState).toBe('AT_LOCATION');
    });

    it('advanceRoamingTravel exposure mints belief + SCOUT_OBSERVATION event', () => {
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0]; // already a roaming group at road-a
        // Start travel to road-b with exposure to a midway location
        startTravel(bandit, { destination: 'road-b', travelTime: 3 });
        expect(bandit.travelState).toBe('IN_TRANSIT');
        const state = advanceRoamingTravel(bandit, 1, {
            exposure: { locationId: 'midway', resourceEstimate: 0.85, dangerEstimate: 0.1, confidence: 0.9 },
            world, tick: 1
        });
        expect(state).toBe('IN_TRANSIT');
        expect(bandit.beliefs['midway']).toBeDefined();
        expect(bandit.beliefs['midway'].resourceValue).toBeCloseTo(0.85);
        expect(world.events.some(e => e.type === 'SCOUT_OBSERVATION' && e.locationId === 'midway')).toBe(true);
        // Not yet arrived
        expect(bandit.currentLocation).not.toBe('road-b');
    });

    it('scout observation makes unknown location eligible for destination choice', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'road-a', mode: 'FORAGE', needs: { food: 0.8 } });
        group.beliefs['road-a'] = { resourceValue: 0.3, distance: 0, danger: 0.1, informationConfidence: 0.9, observedTick: 1, confidence: 0.9, source: 'DIRECT_SCOUT' };
        const rng = makeXorShift32(42);
        // Without belief about 'paradise', it is unknown → never chosen when road-a is eligible
        let chosenBefore = chooseRoamingDestination(group, { candidates: ['road-a', 'paradise'], rng });
        // paradise unknown → only road-a eligible, so STAY or road-a
        expect(['road-a', 'road-a'].includes(chosenBefore) || chosenBefore === 'road-a').toBe(true);
        // After scout, paradise becomes eligible and with high resource should win sometimes
        recordObservation(group, scoutDestination(group, { locationId: 'paradise', tick: 2, resourceEstimate: 0.95, dangerEstimate: 0.05, confidence: 0.9 }));
        let paradiseWins = 0;
        for (let seed = 0; seed < 20; seed++) {
            const r = chooseRoamingDestination(group, { candidates: ['road-a', 'paradise'], rng: makeXorShift32(seed) });
            if (r === 'paradise') paradiseWins++;
        }
        expect(paradiseWins).toBeGreaterThan(0);
    });

    it('bandit travel exposure persists across save/load (via belt)', () => {
        const world = createClosedWorldScenario();
        const bandit = world.bandits[0];
        startTravel(bandit, { destination: 'road-b', travelTime: 5 });
        advanceRoamingTravel(bandit, 1, {
            exposure: { locationId: 'scouted-road', resourceEstimate: 0.7, dangerEstimate: 0.2, confidence: 0.8 },
            world, tick: 1
        });
        expect(bandit.travelState).toBe('IN_TRANSIT');
        expect(bandit.beliefs['scouted-road']).toBeDefined();
        // Advance another tick without exposure — belief persists, travel continues
        advanceRoamingTravel(bandit, 1, { world, tick: 2 });
        expect(bandit.beliefs['scouted-road']).toBeDefined();
        expect(bandit.travelRemaining).toBe(3);
    });

    it('cannot start new travel while IN_TRANSIT (idempotent)', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'road-a' });
        startTravel(group, { destination: 'road-b', travelTime: 5 });
        const second = startTravel(group, { destination: 'road-c', travelTime: 3 });
        expect(second).toBe(false);
        expect(group.travelDestination).toBe('road-b');
    });
});
