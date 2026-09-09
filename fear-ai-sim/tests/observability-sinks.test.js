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

describe('CVII NOW-13: core per-agent trauma memory sinks', () => {
  const THREAT = [{ agent_id: 'a1', threats: [{ type: 'PREDATOR', distance: 2, intensity: 1.0 }] }];
  function panicSim(seed = 77, ticks = 0, hooks = null, opts = {}) {
    const sim = new RuntimeSimulation({ seed, ...opts });
    sim.registerAgent('a1', { neuroticism: 0.9, resilience: 0.1 });
    const outs = [];
    for (let t = 0; t < ticks; t++) outs.push(sim.batchTick(THREAT, 0.0166, { hooks }));
    return { sim, outs };
  }

  it('panic episodes record active traumas and crystallize over time', () => {
    const hooks = new ObservabilityHooks();
    const { sim } = panicSim(77, 5, hooks);
    const rec = sim.coreTrauma.agentRecords.get('a1');
    expect(rec.activeTraumas.length).toBeGreaterThanOrEqual(1);
    expect(hooks.summarize('sim_core_traumas_active').last).toBeGreaterThanOrEqual(1);
    const late = panicSim(77, 150, hooks);
    const lateRec = late.sim.coreTrauma.agentRecords.get('a1');
    expect(lateRec.crystallizedTraumas.length).toBeGreaterThanOrEqual(1);
    expect(hooks.summarize('sim_core_traumas_crystallized').last).toBeGreaterThanOrEqual(1);
  });

  it('NEXT-20: feedback changes traumatized recovery but never calm agents', () => {
    // Threat phase crystallizes; safety phase reveals the floor.
    function recover(opts) {
      const sim = new RuntimeSimulation({ seed: 77, ...opts });
      sim.registerAgent('a1', { neuroticism: 0.6, resilience: 0.4 });
      for (let t = 0; t < 150; t++) sim.batchTick(THREAT, 0.0166);
      const fears = [];
      for (let t = 0; t < 120; t++) {
        sim.batchTick([{ agent_id: 'a1' }], 0.0166);
        fears.push(sim.agents.get('a1').currentFear);
      }
      return { sim, fears };
    }
    const on = recover({});
    const off = recover({ enableTraumaFeedback: false });
    // Traumatized agent plateaus at the hyper-vigilance floor in safety.
    expect(on.fears[119]).toBeGreaterThan(0.1);
    expect(off.fears[119]).toBeLessThan(0.05);
    expect(on.fears).not.toEqual(off.fears);
    // Never-panicked agents are untouched by the feedback path.
    function calm(opts) {
      const sim = new RuntimeSimulation({ seed: 77, ...opts });
      sim.registerAgent('c1', { neuroticism: 0.2, resilience: 0.8 });
      const outs = [];
      for (let t = 0; t < 30; t++) outs.push(sim.batchTick([{ agent_id: 'c1' }], 0.0166));
      return outs;
    }
    expect(calm({})).toEqual(calm({ enableTraumaFeedback: false }));
  });

  it('NEXT-20: sanctuary solace defuses trauma before locking', () => {
    const sim = new RuntimeSimulation({ seed: 77 });
    sim.registerAgent('a1', { neuroticism: 0.9, resilience: 0.1 });
    for (let t = 0; t < 5; t++) sim.batchTick(THREAT, 0.0166);
    const rec = sim.coreTrauma.agentRecords.get('a1');
    expect(rec.activeTraumas.length).toBe(1);
    for (let t = 0; t < 150; t++) sim.batchTick([{ agent_id: 'a1' }], 0.0166);
    expect(rec.activeTraumas.length).toBe(0);
    expect(rec.crystallizedTraumas.length).toBe(0);
  });

  it('NEXT-20: unregister purges the core trauma record', () => {
    const sim = new RuntimeSimulation({ seed: 77 });
    sim.registerAgent('x1', {});
    sim.batchTick([{ agent_id: 'x1', threats: [{ type: 'PREDATOR', distance: 2, intensity: 1.0 }] }], 0.0166);
    sim.unregisterAgent('x1');
    expect(sim.coreTrauma.agentRecords.has('x1')).toBe(false);
  });

  it('core trauma state is deterministic across identical runs', () => {
    const a = panicSim(77, 150, null);
    const b = panicSim(77, 150, null);
    expect(JSON.stringify(a.sim.coreTrauma.getState())).toBe(JSON.stringify(b.sim.coreTrauma.getState()));
  });
});
