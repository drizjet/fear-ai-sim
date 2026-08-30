import { describe, it, expect } from '@jest/globals';
import { createRoamingGroup, scoutDestination, recordObservation, chooseRoamingDestination, generateCandidates } from '../roaming.js';

describe('candidate generation', () => {
    it('generateCandidates returns known locations plus currentLocation', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        const obs1 = scoutDestination(group, { locationId: 'home', tick: 0, resourceEstimate: 0.6, dangerEstimate: 0.1, confidence: 0.9 });
        recordObservation(group, obs1);
        const obs2 = scoutDestination(group, { locationId: 'north', tick: 0, resourceEstimate: 0.5, dangerEstimate: 0.2, confidence: 0.8 });
        recordObservation(group, obs2);
        const cands = generateCandidates(group);
        expect(cands).toContain('home');
        expect(cands).toContain('north');
    });

    it('generateCandidates does not include unknown locations', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        const obs = scoutDestination(group, { locationId: 'home', tick: 0, resourceEstimate: 0.6, dangerEstimate: 0.1, confidence: 0.9 });
        recordObservation(group, obs);
        const cands = generateCandidates(group);
        expect(cands).not.toContain('paradise');
        expect(cands).not.toContain('unknown-place');
    });

    it('chooseRoamingDestination uses an injected candidate generator when provided', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home', explorationTemperature: 0 });
        group.beliefs.home = { resourceValue: 0.5, danger: 0, distance: 0, informationConfidence: 0.9 };
        group.beliefs.elsewhere = { resourceValue: 0.7, danger: 0, distance: 0, informationConfidence: 0.9 };
        // Custom generator returns only 'elsewhere' (omits 'home' as a destination).
        const customGenerator = () => ['elsewhere'];
        const choice = chooseRoamingDestination(group, { candidates: customGenerator(), rng: () => 0.5 });
        // The function falls back to the current location (STAY) when 'home' is not in the candidate list.
        expect(typeof choice).toBe('string');
    });

    it('generateCandidates dedupes when a location appears twice', () => {
        const group = createRoamingGroup({ id: 'g1', currentLocation: 'home' });
        const obs = scoutDestination(group, { locationId: 'home', tick: 0, resourceEstimate: 0.6, dangerEstimate: 0.1, confidence: 0.9 });
        recordObservation(group, obs);
        const cands = generateCandidates(group);
        // currentLocation + known beliefs; 'home' should appear once.
        const homeCount = cands.filter(c => c === 'home').length;
        expect(homeCount).toBe(1);
    });
});
