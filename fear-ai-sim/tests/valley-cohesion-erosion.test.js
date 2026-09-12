import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R28: famine erodes settler cohesion. Starving towns cost the
// SettlersAlliance faith per tick until fracture; succession can rally
// it back. This closes the victim-side loop: settler fight-back
// composure becomes reachable live (R21 machinery, settler side).

function settlers(sim) {
    return sim.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.SETTLERS);
}

function starve(sim) {
    for (const s of sim.settlements.values()) s.resources.food = 0;
}

describe('R28: famine erodes settler cohesion', () => {
    it('1. Starvation erodes; fed towns hold faith steady', () => {
        const starved = new FrontierValleySimulation({ seed: 4242 });
        starve(starved);
        starved.advance(100);
        expect(settlers(starved).cohesion).toBeLessThan(0.7);
        const fed = new FrontierValleySimulation({ seed: 4242 });
        fed.advance(100);
        expect(settlers(fed).cohesion).toBe(0.7);
    });

    it('2. Floor holds at zero over long famine, never NaN', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        starve(sim);
        sim.advance(2000);
        const cohesion = settlers(sim).cohesion;
        expect(Number.isFinite(cohesion)).toBe(true);
        expect(cohesion).toBeGreaterThanOrEqual(0);
    });

    it('3. Full circle: famine fractures settlers, fight-back weakens', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        starve(sim);
        sim.advance(500);
        const faction = settlers(sim);
        expect(faction.cohesion).toBeLessThanOrEqual(0.35);
        // Victim-side composure now live: fractured settlers inflict
        // half conviction.
        expect(sim._composureScale(FRONTIER_VALLEY_FACTIONS.SETTLERS)).toBe(0.5);
    });

    it('4. Erosion is gradual, not a cliff: early famine barely dents', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        starve(sim);
        sim.advance(10);
        // 3 towns x 10 ticks x 0.002 = 0.06 off 0.70.
        expect(settlers(sim).cohesion).toBeCloseTo(0.64, 9);
    });

    it('5. Same inputs replay identical erosion', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 777 });
            starve(sim);
            sim.advance(120);
            return settlers(sim).cohesion;
        };
        expect(run()).toBe(run());
    });
});
