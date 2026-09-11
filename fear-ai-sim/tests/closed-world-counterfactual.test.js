import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario } from '../closed-world.js';
import { ClosedWorldRunner, disableRouteDanger } from '../closed-world-counterfactual.js';
import {
    WorldCounterfactualEngine,
    COUNTERFACTUAL_MUTATIONS
} from '../packages/core/src/WorldCounterfactualEngine.js';

// NEXT-127: closed-world counterfactual forks (CCI-28 frontier 11).
// CCXXXII interaction mutation: disable route danger, the trade
// counterfactual must show it. Staged bandit attacks ride symmetrically
// in both branches; only ground-truth danger differs.
describe('NEXT-127: closed-world counterfactual forks', () => {
    function scenario() {
        const world = createClosedWorldScenario();
        const m = world.merchants[0];
        m.perceptionAccuracy = 1;
        m.selectedRoute = 'road-a';
        m.lastRoute = 'road-a';
        m.routeBeliefs = {
            'road-a': { perceivedDanger: 0.05, confidence: 0.9 },
            'road-b': { perceivedDanger: 0.5, confidence: 0.5 },
            'road-c': { perceivedDanger: 0.5, confidence: 0.5 }
        };
        world.bandits[0].roadId = 'road-a';
        const script = [];
        for (let tick = 2; tick <= 14; tick++) {
            script.push({
                tick,
                build: () => ({
                    type: 'BANDIT_ATTACK', roadId: 'road-a', tick,
                    banditId: 'bandit-1', merchantId: 'merchant-1'
                })
            });
        }
        return new ClosedWorldRunner(world, { script, currentTick: 1 });
    }

    it('1. Zero-intervention fork is bit-identical (ATE = 0)', () => {
        const result = WorldCounterfactualEngine.runExperiment({
            simulation: scenario(),
            forkTick: 1,
            horizonTicks: 13,
            mutation: {
                type: COUNTERFACTUAL_MUTATIONS.CUSTOM_MUTATION,
                params: { description: 'Null intervention' },
                customFn: () => {}
            }
        });
        expect(result.firstDivergenceTick).toBeNull();
        expect(result.ate.meanPopulationFearDiff).toBe(0);
        expect(result.ate.routeFailuresDiff).toBe(0);
    });

    it('2. Disabling route danger reroutes belief and road choice', () => {
        const result = WorldCounterfactualEngine.runExperiment({
            simulation: scenario(),
            forkTick: 1,
            horizonTicks: 13,
            mutation: {
                type: COUNTERFACTUAL_MUTATIONS.CUSTOM_MUTATION,
                params: { description: 'Disable route danger' },
                customFn: (runner) => disableRouteDanger(runner.world)
            }
        });
        expect(result.firstDivergenceTick).not.toBeNull();
        // Counterfactual merchants stay calm: less route dread.
        expect(result.ate.meanPopulationFearDiff).toBeLessThan(0);
    });

    it('3. Factual branch flees while the pacified branch holds its road', () => {
        const base = scenario();
        const factual = base.fork();
        const counter = base.fork();
        disableRouteDanger(counter.world);
        for (let i = 0; i < 13; i++) {
            factual.advance(1);
            counter.advance(1);
        }
        expect(factual.world.merchants[0].selectedRoute).not.toBe('road-a');
        expect(counter.world.merchants[0].selectedRoute).toBe('road-a');
        expect(factual.world.merchants[0].routeBeliefs['road-a'].perceivedDanger)
            .toBeGreaterThan(counter.world.merchants[0].routeBeliefs['road-a'].perceivedDanger);
    });

    it('4. Runner forks are deterministic on identical inputs', () => {
        const run = () => {
            const sim = scenario();
            const a = sim.fork();
            const b = sim.fork();
            for (let i = 0; i < 5; i++) {
                a.advance(1);
                b.advance(1);
            }
            return a.summarize();
        };
        expect(run()).toEqual(run());
    });
});
