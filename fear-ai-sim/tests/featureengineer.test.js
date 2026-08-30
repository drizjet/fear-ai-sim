import { describe, expect, it } from '@jest/globals';
import { FeatureEngineer } from '../featureengineer.js';

describe('feature engineering context', () => {
    it('uses supplied population, traits, and simulation dimensions', () => {
        const engineer = new FeatureEngineer({ simWidth: 200, simHeight: 100 });
        const result = engineer.engineerFeatures({
            id: 't', agentId: 'a', traits: { fear: 0.9, resilience: 0.8, skill: 0.7, curiosity: 0.6, leadership: 0.5 },
            frames: [
                { tick: 0, position: { x: 100, y: 50 }, fear: 0.2, state: 'CALM', energy: 80, population: { localPanicDensity: 0.7, groupCohesion: 0.6, globalPanicRatio: 0.5, nearbyDeaths: 2 } },
                { tick: 1, position: { x: 110, y: 50 }, fear: 0.4, state: 'ALERT', energy: 70, population: { localPanicDensity: 0.8, groupCohesion: 0.5, globalPanicRatio: 0.6, nearbyDeaths: 3 } }
            ]
        }, {});
        expect(result.features[0][1]).toBe(0.5);
        expect(result.features[0][2]).toBe(0.5);
        expect(result.features[0]).toContain(0.7);
        expect(result.features[0]).toContain(0.9);
    });
});
