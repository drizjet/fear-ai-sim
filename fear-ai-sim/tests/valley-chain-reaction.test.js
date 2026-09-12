import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R23 (red team): the full CCVIII chain in one live run — war displaces
// mouths (R16), dilution-era stocks stress groups (R17), stressed
// settlements blame rivals (R18). Plus the honest negative finding:
// canonical stocks dwarf displacement flows, so the chain never trips
// at canonical calibration (per-capita floor observed 0.44 vs 0.25
// threshold over 1500 war ticks). That pin guards the calibration:
// retune stocks/meals and this test forces a conscious update.

function stokeWar(sim) {
    sim.applySetupStance({
        source: FRONTIER_VALLEY_FACTIONS.SETTLERS,
        target: FRONTIER_VALLEY_FACTIONS.BANDITS,
        patch: {
            grievance: 1, territorialPressure: 1, economicPressure: 1,
            trust: 0, fear: 0, informationConfidence: 1
        }
    });
}

function starve(sim) {
    for (const s of sim.settlements.values()) s.resources.food = 0;
}

function minPerCapita(sim) {
    let min = Infinity;
    for (const s of sim.settlements.values()) {
        min = Math.min(min, (s.resources?.food ?? 0) / Math.max(1, s.population));
    }
    return min;
}

describe('R23: the war-to-blame chain fires end to end', () => {
    it('1. Low-stock war valley runs the whole chain', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        starve(sim);
        stokeWar(sim);
        const summary = sim.advance(60);
        // R16: mouths fled.
        expect(sim.macroMetrics.migrations).toBeGreaterThan(0);
        expect(summary.settlements.northwatch).toBeLessThan(45);
        // R17: stressed groups feared (starved run fears at/above fed war control).
        const fed = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(fed);
        const fedSummary = fed.advance(60);
        expect(summary.meanPopulationFear).toBeGreaterThanOrEqual(fedSummary.meanPopulationFear);
        // R18: blame incidents aimed at bandits exist; fed war control has none.
        const blame = sim.factionSystem
            .getBilateralStance(FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS)
            .incidents.filter((i) => i.type === 'RUMOR_HEARSAY' && i.details?.famineBlame === true);
        expect(blame.length).toBeGreaterThan(0);
        const fedBlame = fed.factionSystem
            .getBilateralStance(FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS)
            .incidents.filter((i) => i.type === 'RUMOR_HEARSAY' && i.details?.famineBlame === true);
        expect(fedBlame.length).toBe(0);
    });

    it('2. Negative finding: canonical stocks never trip the chain', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(sim);
        sim.advance(1500);
        // Weakest per-capita observed stays above the 0.25 famine line,
        // so R17/R18 never fire from displacement dilution alone.
        let floor = Infinity;
        const probe = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(probe);
        for (let t = 0; t < 1500; t++) {
            probe.advance(1);
            floor = Math.min(floor, minPerCapita(probe));
        }
        expect(floor).toBeGreaterThanOrEqual(0.25);
        expect(sim.macroMetrics.migrations).toBeGreaterThan(0);
        const blame = sim.factionSystem
            .getBilateralStance(FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS)
            .incidents.filter((i) => i.details?.famineBlame === true);
        expect(blame.length).toBe(0);
    });

    it('3. Chain replays identically', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ seed: 777 });
            starve(sim);
            stokeWar(sim);
            const summary = sim.advance(60);
            return {
                settlements: summary.settlements,
                migrations: sim.macroMetrics.migrations,
                fear: summary.meanPopulationFear
            };
        };
        expect(run()).toEqual(run());
    });
});
