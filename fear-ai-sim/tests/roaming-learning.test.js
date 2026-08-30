import { describe, it, expect } from '@jest/globals';
import { createRoamingGroup, scoutDestination, recordObservation, repeatVisit, decayBeliefs, chooseRoamingDestination } from '../roaming.js';
import { deterministicRng } from '../closed-world.js';

describe('route learning (PHASE 15)', () => {
    it('repeated visits increase confidence (successful trips)', () => {
        // The audit: "When a merchant repeatedly succeeds:
        // route confidence/reliability may rise."
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        const obs = scoutDestination(group, {
            locationId: 'trade-route', tick: 0,
            resourceEstimate: 0.7, dangerEstimate: 0.1, confidence: 0.5
        });
        recordObservation(group, obs);
        const initialConfidence = group.beliefs['trade-route'].confidence;
        for (let i = 0; i < 5; i++) {
            repeatVisit(group, 'trade-route', {
                tick: i + 1,
                resourceEstimate: 0.7,
                dangerEstimate: 0.1
            });
        }
        expect(group.beliefs['trade-route'].confidence).toBeGreaterThan(initialConfidence);
    });

    it('a dangerous encounter that contradicts the belief updates the estimate', () => {
        // The audit: "Unexpected outcomes update the memory."
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        const obs = scoutDestination(group, {
            locationId: 'dangerous-pass', tick: 0,
            resourceEstimate: 0.7, dangerEstimate: 0.1, confidence: 0.9
        });
        recordObservation(group, obs);
        // The faction visits and finds the danger is much higher.
        repeatVisit(group, 'dangerous-pass', {
            tick: 1,
            resourceEstimate: 0.7,
            dangerEstimate: 0.8
        });
        // The danger estimate should rise.
        expect(group.beliefs['dangerous-pass'].danger).toBeGreaterThan(0.1);
    });

    it('a stale belief loses confidence over time (information decay)', () => {
        // The audit: "When information becomes stale:
        // uncertainty rises."
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        const obs = scoutDestination(group, {
            locationId: 'old-info', tick: 0,
            resourceEstimate: 0.5, dangerEstimate: 0.2, confidence: 0.9
        });
        recordObservation(group, obs);
        const initialConfidence = group.beliefs['old-info'].confidence;
        // Decay over 60 ticks (half-life 30).
        decayBeliefs(group, 60);
        // Confidence should have decayed (approximately halved).
        expect(group.beliefs['old-info'].confidence).toBeLessThan(initialConfidence);
    });

    it('a route that the group avoids (low confidence) is less preferred', () => {
        // The audit: "A roaming group should gradually
        // differentiate: good routes; dangerous routes;
        // profitable routes; depleted routes."
        const group = createRoamingGroup({
            id: 'g1',
            mode: 'FORAGE',
            currentLocation: 'home',
            explorationTemperature: 0.01,
            switchMargin: 0
        });
        // Two destinations: good is high-confidence + high-resource,
        // bad is low-confidence + low-resource. FORAGE's
        // resource-weighting gives a clear preference for good.
        const obsGood = scoutDestination(group, {
            locationId: 'good', tick: 0,
            resourceEstimate: 0.9, dangerEstimate: 0.1, confidence: 0.9
        });
        const obsBad = scoutDestination(group, {
            locationId: 'bad', tick: 0,
            resourceEstimate: 0.3, dangerEstimate: 0.1, confidence: 0.2
        });
        recordObservation(group, obsGood);
        recordObservation(group, obsBad);
        // Add the current location belief so STAY is finite.
        recordObservation(group, scoutDestination(group, {
            locationId: 'home', tick: 0,
            resourceEstimate: 0.1, dangerEstimate: 0.1, confidence: 0.9
        }));
        const choice = chooseRoamingDestination(group, {
            candidates: ['good', 'bad']
        , rng: deterministicRng(12345) });
        // FORAGE prefers the high-resource destination.
        expect(choice).toBe('good');
    });
});
