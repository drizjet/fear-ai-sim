import { describe, it, expect } from '@jest/globals';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../packages/core/src/FrontierValleySimulation.js';

// R22: designer scenario params round-trip snapshots. A tuned valley
// (displacement cadence, scarcity threshold, severity sweep) must fork
// and restore with tuning intact instead of silently reverting to
// defaults — counterfactual fidelity (CCLXVIII).

const TUNED = {
    seed: 4242,
    displacement: { everyTicks: 5, rate: 0.1 },
    scarcity: { perCapitaThreshold: 0.1, dreadPerTick: 0.09 },
    directiveConsumption: false
};

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

describe('R22: scenario params survive snapshots and forks', () => {
    it('1. Tuned params persist through getState/setState', () => {
        const sim = new FrontierValleySimulation({ ...TUNED });
        sim.severityParams = { floor: 0.4, knee: 0.7 };
        const snap = sim.getState();
        expect(snap.scenarioParams.displacement.everyTicks).toBe(5);
        expect(snap.scenarioParams.scarcity.dreadPerTick).toBe(0.09);
        expect(snap.scenarioParams.severityParams.knee).toBe(0.7);
        const restored = new FrontierValleySimulation({ seed: 4242 });
        restored.setState(snap);
        expect(restored.displacement.everyTicks).toBe(5);
        expect(restored.displacement.rate).toBe(0.1);
        expect(restored.scarcity.dreadPerTick).toBe(0.09);
        expect(restored.severityParams).toEqual({ floor: 0.4, knee: 0.7 });
        expect(restored.directiveConsumption).toBe(false);
    });

    it('2. Fork inherits tuning: tuned fork diverges from default twin', () => {
        const tuned = new FrontierValleySimulation({ ...TUNED });
        stokeWar(tuned);
        tuned.advance(30);
        const forked = tuned.fork();
        expect(forked.displacement.everyTicks).toBe(5);
        // Cadence 5 (tuned) displaces twice as often as cadence 10:
        // a default twin moved less by tick 30.
        const plain = new FrontierValleySimulation({ seed: 4242 });
        stokeWar(plain);
        plain.advance(30);
        expect(tuned.macroMetrics.migrations).toBeGreaterThan(plain.macroMetrics.migrations);
        // Fork continues identically to its tuned parent.
        const a = tuned.advance(30);
        const b = forked.advance(30);
        expect(b.settlements).toEqual(a.settlements);
    });

    it('3. Pre-R22 snapshots restore clean onto defaults', () => {
        const sim = new FrontierValleySimulation({ seed: 4242 });
        sim.advance(20);
        const snap = sim.getState();
        delete snap.scenarioParams;
        delete snap.directiveConsumption;
        const restored = new FrontierValleySimulation({ seed: 4242 });
        expect(() => restored.setState(snap)).not.toThrow();
        expect(restored.displacement.everyTicks).toBe(10);
        expect(restored.scarcity.perCapitaThreshold).toBe(0.25);
        expect(restored.directiveConsumption).toBe(true);
    });

    it('4. Garbage params never corrupt live tuning', () => {
        const sim = new FrontierValleySimulation({ ...TUNED });
        sim.setState({
            scenarioParams: {
                displacement: null,
                scarcity: 'lots',
                severityParams: 42
            }
        });
        expect(sim.displacement.everyTicks).toBe(5);
        expect(sim.scarcity.dreadPerTick).toBe(0.09);
        expect(sim.severityParams ?? {}).toEqual({});
    });

    it('5. Same tuned inputs replay identically', () => {
        const run = () => {
            const sim = new FrontierValleySimulation({ ...TUNED });
            stokeWar(sim);
            const summary = sim.advance(60);
            return { settlements: summary.settlements, migrations: sim.macroMetrics.migrations };
        };
        expect(run()).toEqual(run());
    });
});
