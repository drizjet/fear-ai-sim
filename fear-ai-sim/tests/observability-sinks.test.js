import { describe, it, expect } from '@jest/globals';
import { FrontierValleySimulation } from '../packages/core/src/FrontierValleySimulation.js';
import { RuntimeSimulation } from '../packages/runtime/src/RuntimeSimulation.js';
import { ObservabilityHooks } from '../packages/core/src/ObservabilityHooks.js';

// Sections CVII + NOW-2: telemetry sinks on the valley advance and runtime
// batch paths. Same contract as the closed-world sink: optional, read-only,
// post-mutation, fault-isolated — ON vs OFF identical output.

function valleySummary(seed = 77, ticks = 30, hooks = null) {
  const sim = new FrontierValleySimulation({ seed });
  sim.advance(ticks, { hooks });
  return sim.getMacroSummary();
}

function batchOutputs(seed = 77, ticks = 20, hooks = null) {
  const sim = new RuntimeSimulation({ seed });
  sim.registerAgent('a1', { neuroticism: 0.6, resilience: 0.4 });
  sim.registerAgent('a2', { neuroticism: 0.3, resilience: 0.7 });
  const outs = [];
  for (let t = 0; t < ticks; t++) {
    outs.push(sim.batchTick(
      [{ agent_id: 'a1', threats: [{ type: 'PREDATOR', distance: 5, intensity: 0.7 }] }, { agent_id: 'a2' }],
      0.0166,
      { hooks },
    ));
  }
  return outs;
}

describe('CVII NOW-2: valley and batch telemetry sinks', () => {
  it('valley advance with and without hooks yields identical summaries', () => {
    const hooks = new ObservabilityHooks();
    expect(valleySummary(77, 30, hooks)).toEqual(valleySummary(77, 30, null));
    expect(hooks.summarize('valley_tick').count).toBe(30);
    expect(hooks.summarize('valley_fear').count).toBe(30);
    expect(hooks.summarize('valley_panics').count).toBe(30);
  });

  it('runtime batch ticks with and without hooks yield identical outputs', () => {
    const hooks = new ObservabilityHooks();
    expect(batchOutputs(77, 20, hooks)).toEqual(batchOutputs(77, 20, null));
    expect(hooks.summarize('sim_tick').count).toBe(20);
    expect(hooks.summarize('sim_agents').last).toBe(2);
  });

  it('hostile sinks on both paths leave trajectories untouched', () => {
    const evil = { emit() { throw new Error('sink sabotage'); } };
    let valley;
    expect(() => {
      valley = new FrontierValleySimulation({ seed: 77 });
      valley.advance(30, { hooks: evil });
    }).not.toThrow();
    expect(valley.getMacroSummary()).toEqual(valleySummary(77, 30, null));
    expect(() => batchOutputs(77, 5, evil)).not.toThrow();
    expect(batchOutputs(77, 5, evil)).toEqual(batchOutputs(77, 5, null));
  });
});

describe('CVII NOW-8: trauma plus pacing runtime sinks', () => {
  function traumaOutputs(ticks = 10, hooks = null) {
    const sim = new RuntimeSimulation({ seed: 77 });
    sim.registerAgent('a1', { neuroticism: 0.6, resilience: 0.4 });
    sim.addTraumaZone(0, 0, 0, 1.0, 150, 1800);
    const outs = [];
    for (let t = 0; t < ticks; t++) {
      outs.push(sim.batchTick(
        [{ agent_id: 'a1', threats: [{ type: 'PREDATOR', distance: 5, intensity: 0.7 }] }],
        0.0166,
        { hooks },
      ));
    }
    return outs;
  }

  it('trauma and pacing emissions leave outputs identical', () => {
    const hooks = new ObservabilityHooks();
    expect(traumaOutputs(10, hooks)).toEqual(traumaOutputs(10, null));
    expect(hooks.summarize('sim_trauma_zones').last).toBe(1);
    expect(hooks.summarize('sim_pacing_intensity').count).toBe(10);
    expect(Number.isFinite(hooks.summarize('sim_pacing_intensity').last)).toBe(true);
    expect(hooks.summarize('sim_pacing_progress').count).toBe(10);
    const prog = hooks.summarize('sim_pacing_progress').last;
    expect(prog).toBeGreaterThanOrEqual(0);
    expect(prog).toBeLessThanOrEqual(1);
  });

  it('hostile sink on the trauma path leaves trajectory untouched', () => {
    const evil = { emit() { throw new Error('sink sabotage'); } };
    expect(() => traumaOutputs(5, evil)).not.toThrow();
    expect(traumaOutputs(5, evil)).toEqual(traumaOutputs(5, null));
  });
});
