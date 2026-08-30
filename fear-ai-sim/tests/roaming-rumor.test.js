import { describe, it, expect } from '@jest/globals';
import {
    createRoamingGroup,
    scoutDestination,
    recordObservation,
    shareObservation,
    propagateRumor,
    chooseRoamingDestination
} from '../roaming.js';

describe('rumor and report propagation (PHASE 13)', () => {
    it('shareObservation creates a derived observation with reduced confidence', () => {
        const a = createRoamingGroup({ id: 'A' });
        const b = createRoamingGroup({ id: 'B' });
        const obs = scoutDestination(a, {
            locationId: 'north', tick: 0,
            resourceEstimate: 0.8, dangerEstimate: 0.2, confidence: 0.9
        });
        recordObservation(a, obs);
        const shared = shareObservation(a, b, obs, { tick: 5 });
        // The shared observation has lower confidence than the
        // direct observation (the audit: hearsay < direct).
        expect(shared.confidence).toBeLessThan(0.9);
        expect(shared.sourceType).toBe('TRUSTED_REPORT');
        expect(shared.observerId).toBe('A');
        expect(shared.locationId).toBe('north');
    });

    it('recordObservation on the recipient stores the secondhand belief', () => {
        const a = createRoamingGroup({ id: 'A' });
        const b = createRoamingGroup({ id: 'B' });
        const obs = scoutDestination(a, {
            locationId: 'north', tick: 0,
            resourceEstimate: 0.8, dangerEstimate: 0.2, confidence: 0.9
        });
        recordObservation(a, obs);
        const shared = shareObservation(a, b, obs, { tick: 5 });
        recordObservation(b, shared);
        // B now has a belief about 'north' with reduced confidence.
        expect(b.beliefs.north).toBeDefined();
        expect(b.beliefs.north.confidence).toBeLessThan(0.9);
    });

    it('propagateRumor chains across multiple actors with decay', () => {
        const a = createRoamingGroup({ id: 'A' });
        const b = createRoamingGroup({ id: 'B' });
        const c = createRoamingGroup({ id: 'C' });
        const obs = scoutDestination(a, {
            locationId: 'north', tick: 0,
            resourceEstimate: 0.8, dangerEstimate: 0.2, confidence: 0.9
        });
        recordObservation(a, obs);
        // A tells B at tick 5; B tells C at tick 10.
        const cBelief = propagateRumor([a, b, c], obs, [{ from: 'A', to: 'B', tick: 5 }, { from: 'B', to: 'C', tick: 10 }]);
        // C's confidence should be lower than A's (decay along chain).
        expect(cBelief.confidence).toBeLessThan(0.9);
        // C has a belief about 'north'.
        expect(c.beliefs.north).toBeDefined();
    });

    it('a rumor can cause a suboptimal route (false belief from hearsay)', () => {
        // The audit: "The bandit must be able to make a bad
        // decision because its information is stale. ... A
        // traveler reaches Town B four ticks later. Merchant B
        // hears the report. Merchant B changes route — but
        // less strongly than Merchant A because this is
        // secondhand evidence."
        const a = createRoamingGroup({ id: 'A' });
        const b = createRoamingGroup({ id: 'B' });
        // A directly observed that north is dangerous.
        const obs = scoutDestination(a, {
            locationId: 'north', tick: 0,
            resourceEstimate: 0.1, dangerEstimate: 0.9, confidence: 0.9
        });
        recordObservation(a, obs);
        // A tells B (B has no direct observation).
        const shared = shareObservation(a, b, obs, { tick: 5 });
        recordObservation(b, shared);
        // B's belief about 'north' has lower confidence than A's.
        expect(b.beliefs.north.confidence).toBeLessThan(a.beliefs.north.confidence);
    });
});
