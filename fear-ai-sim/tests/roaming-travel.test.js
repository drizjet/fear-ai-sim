import { describe, it, expect } from '@jest/globals';
import { createRoamingGroup, scoutDestination, recordObservation, startTravel, advanceTravel } from '../roaming.js';

describe('roaming travel (PHASE 11)', () => {
    it('a group at home can start travelling to a destination', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        startTravel(group, { destination: 'north', travelTime: 5 });
        expect(group.travelState).toBe('IN_TRANSIT');
        expect(group.travelDestination).toBe('north');
        expect(group.travelRemaining).toBe(5);
    });

    it('a group in transit advances over time', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        startTravel(group, { destination: 'north', travelTime: 5 });
        advanceTravel(group, 3);
        expect(group.travelState).toBe('IN_TRANSIT');
        expect(group.travelRemaining).toBe(2);
    });

    it('a group arrives when travelRemaining reaches 0', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        startTravel(group, { destination: 'north', travelTime: 5 });
        advanceTravel(group, 5);
        expect(group.travelState).toBe('AT_LOCATION');
        expect(group.travelRemaining).toBe(0);
        expect(group.currentLocation).toBe('north');
    });

    it('arriving at a new location preserves all prior beliefs', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        const obs1 = scoutDestination(group, { locationId: 'home', tick: 0, resourceEstimate: 0.5, dangerEstimate: 0.1, confidence: 0.9 });
        recordObservation(group, obs1);
        startTravel(group, { destination: 'north', travelTime: 2 });
        advanceTravel(group, 2);
        // Arrived at 'north', belief about 'home' is still there.
        expect(group.currentLocation).toBe('north');
        expect(group.beliefs.home).toBeDefined();
    });

    it('arriving at an unknown destination does not auto-add a belief (the §9 invariant)', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        startTravel(group, { destination: 'paradise', travelTime: 2 });
        advanceTravel(group, 2);
        expect(group.currentLocation).toBe('paradise');
        // No auto-belief: the group now stands at 'paradise' but
        // doesn't know anything about it. A scout or rumor
        // would add a belief.
        expect(group.beliefs.paradise).toBeUndefined();
    });

    it('exposure to a location during travel is recorded', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        startTravel(group, { destination: 'north', travelTime: 5 });
        advanceTravel(group, 1, { exposure: { locationId: 'midway', resourceEstimate: 0.4, dangerEstimate: 0.3 } });
        // The midway belief is recorded (the group is "exposed" to the path).
        expect(group.beliefs.midway).toBeDefined();
        expect(group.beliefs.midway.resourceValue).toBe(0.4);
    });
});
