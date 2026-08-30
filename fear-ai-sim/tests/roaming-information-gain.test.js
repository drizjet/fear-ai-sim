import { describe, it, expect } from '@jest/globals';
import { createRoamingGroup, scoutDestination, recordObservation, chooseRoamingDestination, destinationUtility } from '../roaming.js';
import { deterministicRng } from '../closed-world.js';

describe('mode-specific information value (PHASE 14)', () => {
    it('SCOUT mode prefers destinations with low confidence (high information gain)', () => {
        // Two destinations with identical resource and danger,
        // but different confidence. The high-uncertainty
        // destination has more to learn, so SCOUT prefers it.
        const group = createRoamingGroup({
            id: 'scout',
            mode: 'SCOUT',
            currentLocation: 'home',
            explorationTemperature: 0.01
        });
        const obsHighConf = scoutDestination(group, {
            locationId: 'known-rich', tick: 0,
            resourceEstimate: 0.8, dangerEstimate: 0.1, confidence: 0.9
        });
        const obsLowConf = scoutDestination(group, {
            locationId: 'uncertain', tick: 0,
            resourceEstimate: 0.8, dangerEstimate: 0.1, confidence: 0.2
        });
        recordObservation(group, obsHighConf);
        recordObservation(group, obsLowConf);
        const choice = chooseRoamingDestination(group, {
            candidates: ['known-rich', 'uncertain']
        , rng: deterministicRng(12345) });
        // SCOUT should prefer the low-confidence destination.
        expect(choice).toBe('uncertain');
    });

    it('FORAGE mode does not value information gain (prefers high confidence)', () => {
        // The complement: FORAGE doesn't scout, it exploits.
        // High-confidence destination is preferred. We give
        // the known-rich destination a higher resource so
        // FORAGE's resource-weighting makes a clear choice
        // (the audit: "if changing mode cannot change the
        // ranking in meaningful scenarios, mode is not yet
        // implemented").
        const group = createRoamingGroup({
            id: 'forager',
            mode: 'FORAGE',
            currentLocation: 'home',
            explorationTemperature: 0.01
        });
        const obsHighConf = scoutDestination(group, {
            locationId: 'known-rich', tick: 0,
            resourceEstimate: 0.9, dangerEstimate: 0.1, confidence: 0.9
        });
        const obsLowConf = scoutDestination(group, {
            locationId: 'uncertain', tick: 0,
            resourceEstimate: 0.5, dangerEstimate: 0.1, confidence: 0.2
        });
        recordObservation(group, obsHighConf);
        recordObservation(group, obsLowConf);
        const choice = chooseRoamingDestination(group, {
            candidates: ['known-rich', 'uncertain']
        , rng: deterministicRng(12345) });
        // FORAGE should prefer the high-confidence (and
        // higher-resource) destination.
        expect(choice).toBe('known-rich');
    });

    it('information gain has opportunity cost (SCOUT accepts a lower resource to learn)', () => {
        // A scout may prefer a slightly worse but unknown
        // destination over a known good one. This is the
        // "information acquisition must have opportunity cost"
        // property: the scout trades resource for information.
        const group = createRoamingGroup({
            id: 'scout',
            mode: 'SCOUT',
            currentLocation: 'home',
            explorationTemperature: 0.01
        });
        const obsKnown = scoutDestination(group, {
            locationId: 'known-rich', tick: 0,
            resourceEstimate: 0.9, dangerEstimate: 0.1, confidence: 0.9
        });
        const obsUnknown = scoutDestination(group, {
            locationId: 'unknown-poor', tick: 0,
            resourceEstimate: 0.3, dangerEstimate: 0.1, confidence: 0.1
        });
        recordObservation(group, obsKnown);
        recordObservation(group, obsUnknown);
        const choice = chooseRoamingDestination(group, {
            candidates: ['known-rich', 'unknown-poor']
        , rng: deterministicRng(12345) });
        // The scout accepts the lower-resource destination
        // because it has high information gain.
        expect(choice).toBe('unknown-poor');
    });

    it('information gain is a positive utility term, not a penalty', () => {
        // The utility function should add a positive value
        // for low-confidence destinations in SCOUT mode.
        const group = createRoamingGroup({ id: 'scout', mode: 'SCOUT' });
        const beliefHigh = { resourceValue: 0.5, danger: 0.1, distance: 0, informationConfidence: 0.9 };
        const beliefLow = { resourceValue: 0.5, danger: 0.1, distance: 0, informationConfidence: 0.1 };
        const uHigh = destinationUtility('a', beliefHigh, group);
        const uLow = destinationUtility('b', beliefLow, group);
        // Low confidence (high information gain) should give
        // a higher utility in SCOUT mode.
        expect(uLow).toBeGreaterThan(uHigh);
    });
});
