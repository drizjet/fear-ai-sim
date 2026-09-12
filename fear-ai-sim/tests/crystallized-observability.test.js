import { describe, it, expect } from '@jest/globals';
import { RuntimeSimulation } from '../packages/runtime/src/RuntimeSimulation.js';
import { ObservabilityHooks } from '../packages/core/index.js';

// Post-25 audit candidate 18: crystallized-state observability.
// The bare TraumaCrystallizationEngine never emits to hooks itself;
// crystallized state becomes observable through the RuntimeSimulation
// tick path, which emits read-only post-tick gauges per tick:
//   sim_core_traumas_active / sim_core_traumas_crystallized (counts)
//   sim_core_trauma_max_load / sim_core_trauma_mean_load (distribution)
//   sim_core_trauma_loaded_agents (per-agent flags aggregated)
// Per-agent load normalization (NEXT-139): severity sums halved into
// [0,1], so one full-severity trauma reads 0.5; mean divides by ALL
// registered agents, not just loaded ones.
describe('post-25 candidate 18: crystallized-state observability', () => {
    const THREAT = (id) => ({ agent_id: id, threats: [{ type: 'PREDATOR', distance: 2, intensity: 1.0 }] });

    // Two fragile agents crystallize, one calm agent stays clean.
    // Pinned live: seed 41, 160 ticks.
    function runCrystallized(seed = 41, ticks = 160, hooks = null) {
        const sim = new RuntimeSimulation({ seed });
        sim.registerAgent('b1', { neuroticism: 0.9, resilience: 0.1 });
        sim.registerAgent('b2', { neuroticism: 0.8, resilience: 0.2 });
        sim.registerAgent('b3', { neuroticism: 0.1, resilience: 0.9 });
        const outs = [];
        for (let t = 0; t < ticks; t++) {
            outs.push(sim.batchTick([THREAT('b1'), THREAT('b2'), { agent_id: 'b3' }], 0.0166, { hooks }));
        }
        return { sim, outs };
    }

    function perAgentLoads(sim) {
        const loads = {};
        for (const id of ['b1', 'b2', 'b3']) {
            const rec = sim.coreTrauma.agentRecords.get(id);
            let sev = 0;
            for (const tr of rec.crystallizedTraumas) sev += Math.max(0, Math.min(1, tr.severity));
            loads[id] = Math.max(0, Math.min(1, sev / 2));
        }
        return loads;
    }

    it('1. hooks surface the crystallized count after trauma locks in', () => {
        const hooks = new ObservabilityHooks();
        const { sim } = runCrystallized(41, 160, hooks);
        const rec1 = sim.coreTrauma.agentRecords.get('b1');
        const rec2 = sim.coreTrauma.agentRecords.get('b2');
        expect(rec1.crystallizedTraumas.length).toBe(1);
        expect(rec2.crystallizedTraumas.length).toBe(1);
        // Exact field names; pinned values (seed 41, 160 ticks).
        expect(hooks.summarize('sim_core_traumas_crystallized').last).toBe(2);
        expect(hooks.summarize('sim_core_trauma_loaded_agents').last).toBe(2);
        expect(hooks.summarize('sim_core_traumas_crystallized').count).toBe(160);
        expect(hooks.summarize('sim_core_traumas_active').count).toBe(160);
    });

    it('2. crystallized load gauges pin max/mean over agents', () => {
        const hooks = new ObservabilityHooks();
        const { sim } = runCrystallized(41, 160, hooks);
        const loads = perAgentLoads(sim);
        // Pinned severities: b1 0.9209740955170519, b2 0.8601746505285806.
        expect(loads.b1).toBeCloseTo(0.46048704775852595, 10);
        expect(loads.b2).toBeCloseTo(0.4300873252642903, 10);
        expect(loads.b3).toBe(0);
        const expectedMax = Math.max(loads.b1, loads.b2, loads.b3);
        const expectedMean = (loads.b1 + loads.b2 + loads.b3) / 3;
        expect(hooks.summarize('sim_core_trauma_max_load').last).toBeCloseTo(expectedMax, 10);
        expect(hooks.summarize('sim_core_trauma_mean_load').last).toBeCloseTo(expectedMean, 10);
        // Pinned absolute values.
        expect(hooks.summarize('sim_core_trauma_max_load').last).toBeCloseTo(0.46048704775852595, 10);
        expect(hooks.summarize('sim_core_trauma_mean_load').last).toBeCloseTo(0.2968581243409387, 10);
    });

    it('3. per-agent crystallized flags and distribution are visible', () => {
        const hooks = new ObservabilityHooks();
        const { sim } = runCrystallized(41, 160, hooks);
        expect(sim.coreTrauma.evaluateAgentState('b1').isTraumatized).toBe(true);
        expect(sim.coreTrauma.evaluateAgentState('b2').isTraumatized).toBe(true);
        expect(sim.coreTrauma.evaluateAgentState('b3').isTraumatized).toBe(false);
        const max = hooks.summarize('sim_core_trauma_max_load').last;
        const mean = hooks.summarize('sim_core_trauma_mean_load').last;
        const loaded = hooks.summarize('sim_core_trauma_loaded_agents').last;
        expect(max).toBeGreaterThan(mean);
        expect(mean).toBeGreaterThan(0);
        expect(loaded).toBe(2);
        // Distribution is uneven: the max-carrying agent exceeds the mean.
        const loads = perAgentLoads(sim);
        expect(loads.b1).toBe(max);
        expect(mean).toBeCloseTo((loads.b1 + loads.b2 + loads.b3) / 3, 12);
    });

    it('4. fresh engine reports zeros, not undefined', () => {
        const hooks = new ObservabilityHooks();
        const sim = new RuntimeSimulation({ seed: 41 });
        sim.registerAgent('b1', { neuroticism: 0.9, resilience: 0.1 });
        for (let t = 0; t < 2; t++) sim.batchTick([{ agent_id: 'b1' }], 0.0166, { hooks });
        for (const name of [
            'sim_core_traumas_active',
            'sim_core_traumas_crystallized',
            'sim_core_trauma_max_load',
            'sim_core_trauma_mean_load',
            'sim_core_trauma_loaded_agents'
        ]) {
            const s = hooks.summarize(name);
            expect(s.count).toBe(2);
            expect(s.last).toBe(0);
            expect(Number.isFinite(s.last)).toBe(true);
            expect(s.last).not.toBeUndefined();
            expect(s.last).not.toBeNull();
        }
    });

    it('5. telemetry ON vs OFF leaves outputs identical (CVII)', () => {
        const hooks = new ObservabilityHooks();
        const withHooks = runCrystallized(41, 60, hooks).outs;
        const without = runCrystallized(41, 60, null).outs;
        expect(withHooks).toEqual(without);
        expect(hooks.summarize('sim_core_trauma_max_load').count).toBe(60);
    });

    it('6. crystallized telemetry series is exactly reproducible', () => {
        const run = () => {
            const hooks = new ObservabilityHooks();
            runCrystallized(41, 160, hooks);
            return {
                count: hooks.summarize('sim_core_traumas_crystallized').last,
                max: hooks.summarize('sim_core_trauma_max_load').last,
                mean: hooks.summarize('sim_core_trauma_mean_load').last,
                loaded: hooks.summarize('sim_core_trauma_loaded_agents').last
            };
        };
        expect(run()).toEqual(run());
    });
});
