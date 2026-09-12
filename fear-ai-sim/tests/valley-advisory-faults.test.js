import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R33: advisory-loop fault isolation (CCXIX). A throwing advisory
// subsystem is counted and the tick continues degraded — the overlay
// must never break the host tick. The world model (movement, civ,
// world tick, stance evaluation) stays unguarded by design.

const S = FRONTIER_VALLEY_FACTIONS.SETTLERS;
const B = FRONTIER_VALLEY_FACTIONS.BANDITS;

function faults(sim) {
    return sim.macroMetrics.advisoryFaults || {};
}

describe('R33: advisory faults degrade, never break, the tick', () => {
    it('1. Throwing erosion is counted; the tick still completes', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        for (const s of sim.settlements.values()) s.resources.food = 0;
        const cohesionBefore = sim.factionSystem.getFaction(S).cohesion;
        sim._erodeSettlerCohesion = () => { throw new Error('inject-erosion'); };
        let summary;
        expect(() => { summary = sim.advance(10); }).not.toThrow();
        expect(faults(sim).cohesionErosion).toBe(10);
        expect(sim.factionSystem.getFaction(S).cohesion).toBe(cohesionBefore);
        expect(typeof summary.warsActive).toBe('number');
    });

    it('2. Throwing encounter mapping is counted at the tick boundary', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        const real = sim._recordEncounterConsequences.bind(sim);
        sim._recordEncounterConsequences = () => { throw new Error('inject-consequences'); };
        expect(() => sim.advance(4)).not.toThrow();
        expect(faults(sim).encounterConsequences).toBe(4);
        // The boundary is advance(): direct calls still throw loudly.
        sim._recordEncounterConsequences = real;
        sim._deliberateGovernance = () => { throw new Error('inject-deliberation'); };
        expect(() => sim._deliberateGovernance(S, {})).toThrow('inject-deliberation');
    });

    it('3. Corrupt season clock degrades trade; the tick survives', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        sim.tradeSeasons = null;
        expect(() => sim.advance(200)).not.toThrow();
        expect((faults(sim).encounterConsequences || 0)).toBeGreaterThan(0);
    });

    it('4. Macro summary shape is unchanged by isolation', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        sim._attriteLeadership = () => { throw new Error('inject-attrition'); };
        sim.advance(5);
        const healthy = new FrontierValleySimulation({ seed: 4242 });
        healthy.advance(5);
        expect(Object.keys(sim.getMacroSummary()).sort())
            .toEqual(Object.keys(healthy.getMacroSummary()).sort());
        expect(faults(sim).warAttrition).toBe(5);
    });

    it('5. Restored subsystems stop counting; no fault debt lingers', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        const real = sim._blameRivalsForFamine;
        sim._blameRivalsForFamine = () => { throw new Error('inject-blame'); };
        sim.advance(3);
        expect(faults(sim).famineBlame).toBe(3);
        sim._blameRivalsForFamine = real;
        sim.advance(3);
        expect(faults(sim).famineBlame).toBe(3);
    });

    it('6. Same injected faults replay identically', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 4242 });
            sim._erodeSettlerCohesion = () => { throw new Error('inject'); };
            sim._attriteLeadership = () => { throw new Error('inject'); };
            sim.advance(20);
            return { faults: faults(sim), summary: sim.getMacroSummary() };
        };
        expect(run()).toEqual(run());
    });
});
