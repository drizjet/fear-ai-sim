import { describe, it, expect } from '@jest/globals';
import { RuntimeSimulation } from '../packages/runtime/src/RuntimeSimulation.js';
import { ObservabilityHooks } from '../packages/core/index.js';

// NEXT-148: crystallized-state telemetry hooks (audit candidate 12).
// Beyond trauma totals, the runtime now emits the crystallized load
// distribution (max, mean, loaded-agent count) as read-only post-tick
// gauges. Telemetry stays optional: ON vs OFF outputs are identical.
describe('NEXT-148: crystallized load telemetry', () => {
    const THREAT = (id) => ({ agent_id: id, threats: [{ type: 'PREDATOR', distance: 2, intensity: 1.0 }] });
    function simWithHooks(seed = 77, ticks = 150, hooks = null) {
        const sim = new RuntimeSimulation({ seed });
        sim.registerAgent('a1', { neuroticism: 0.9, resilience: 0.1 });
        sim.registerAgent('a2', { neuroticism: 0.1, resilience: 0.9 });
        const outs = [];
        for (let t = 0; t < ticks; t++) {
            outs.push(sim.batchTick([THREAT('a1'), { agent_id: 'a2' }], 0.0166, { hooks }));
        }
        return { sim, outs };
    }

    it('1. Load gauges track crystallization', () => {
        const hooks = new ObservabilityHooks();
        const { sim } = simWithHooks(77, 150, hooks);
        const rec = sim.coreTrauma.agentRecords.get('a1');
        expect(rec.crystallizedTraumas.length).toBeGreaterThanOrEqual(1);
        const max = hooks.summarize('sim_core_trauma_max_load').last;
        const mean = hooks.summarize('sim_core_trauma_mean_load').last;
        const loaded = hooks.summarize('sim_core_trauma_loaded_agents').last;
        expect(max).toBeGreaterThan(0);
        expect(max).toBeLessThanOrEqual(1);
        expect(mean).toBeGreaterThan(0);
        expect(mean).toBeLessThanOrEqual(max);
        expect(loaded).toBeGreaterThanOrEqual(1);
    });

    it('2. Fresh simulations read zero load', () => {
        const hooks = new ObservabilityHooks();
        simWithHooks(77, 2, hooks);
        expect(hooks.summarize('sim_core_trauma_max_load').last).toBe(0);
        expect(hooks.summarize('sim_core_trauma_loaded_agents').last).toBe(0);
    });

    it('3. Gauges leave outputs identical (CVII)', () => {
        const hooks = new ObservabilityHooks();
        const withHooks = simWithHooks(77, 60, hooks).outs;
        const without = simWithHooks(77, 60, null).outs;
        expect(withHooks).toEqual(without);
        expect(hooks.summarize('sim_core_trauma_max_load').count).toBe(60);
    });

    it('4. Hostile sink on load gauges leaves trajectory untouched', () => {
        const evil = { emit() { throw new Error('sink sabotage'); } };
        expect(() => simWithHooks(77, 5, evil)).not.toThrow();
        expect(simWithHooks(77, 5, evil).outs).toEqual(simWithHooks(77, 5, null).outs);
    });

    it('5. Load series is exactly reproducible', () => {
        const run = () => {
            const hooks = new ObservabilityHooks();
            simWithHooks(99, 150, hooks);
            return hooks.summarize('sim_core_trauma_max_load').last;
        };
        expect(run()).toBe(run());
    });
});
