import { describe, it, expect } from '@jest/globals';
import { createRoamingGroup, scoutDestination, recordObservation, decayBeliefs, repeatVisit } from '../roaming.js';

describe('roaming memory decay', () => {
    it('decayBeliefs reduces confidence with age', () => {
        const group = createRoamingGroup({ id: 'g1' });
        const obs = scoutDestination(group, { locationId: 'locA', tick: 0, resourceEstimate: 0.8, dangerEstimate: 0.2, confidence: 0.9 });
        recordObservation(group, obs);
        expect(group.beliefs.locA.confidence).toBe(0.9);
        decayBeliefs(group, 20);
        expect(group.beliefs.locA.confidence).toBeLessThan(0.9);
        expect(group.beliefs.locA.confidence).toBeGreaterThan(0);
    });

    it('decayBeliefs prunes beliefs that fall below a minimum confidence', () => {
        const group = createRoamingGroup({ id: 'g1' });
        const obs = scoutDestination(group, { locationId: 'locA', tick: 0, resourceEstimate: 0.8, dangerEstimate: 0.2, confidence: 0.5 });
        recordObservation(group, obs);
        decayBeliefs(group, 1000);
        expect(group.beliefs.locA).toBeUndefined();
    });

    it('repeatVisit increases confidence up to a cap', () => {
        const group = createRoamingGroup({ id: 'g1' });
        const obs = scoutDestination(group, { locationId: 'locA', tick: 0, resourceEstimate: 0.8, dangerEstimate: 0.2, confidence: 0.3 });
        recordObservation(group, obs);
        repeatVisit(group, 'locA', { tick: 1, resourceEstimate: 0.8, dangerEstimate: 0.2 });
        repeatVisit(group, 'locA', { tick: 2, resourceEstimate: 0.8, dangerEstimate: 0.2 });
        expect(group.beliefs.locA.confidence).toBeGreaterThan(0.3);
    });

    it('repeatVisit caps confidence at 1', () => {
        const group = createRoamingGroup({ id: 'g1' });
        const obs = scoutDestination(group, { locationId: 'locA', tick: 0, resourceEstimate: 0.8, dangerEstimate: 0.2, confidence: 0.95 });
        recordObservation(group, obs);
        for (let i = 0; i < 50; i++) {
            repeatVisit(group, 'locA', { tick: i + 1, resourceEstimate: 0.8, dangerEstimate: 0.2 });
        }
        expect(group.beliefs.locA.confidence).toBeLessThanOrEqual(1);
    });

    it('decayBeliefs respects the half-life parameter', () => {
        const group = createRoamingGroup({ id: 'g1' });
        const obs = scoutDestination(group, { locationId: 'locA', tick: 0, resourceEstimate: 0.8, dangerEstimate: 0.2, confidence: 0.9 });
        recordObservation(group, obs);
        decayBeliefs(group, 10, { halfLifeTicks: 10 });
        expect(group.beliefs.locA.confidence).toBeCloseTo(0.45, 1);
    });
});
