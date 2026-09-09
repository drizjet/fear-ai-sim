import { RuntimeSimulation } from '../packages/runtime/src/RuntimeSimulation.js';
import { AffectiveAgent } from '../packages/core/src/AffectiveAgent.js';

// Section NOW-18: trauma feedback strength sweep. Feedback is default-on, so
// its response surface must be bounded across the persona space: no
// archetype may collapse to permanent panic, freeze at zero effect, or
// converge to an identical traumatized clone. Probes show floors in a narrow
// band (severity-driven) with wide trait separation (identity-driven).

const THREAT = [{ agent_id: 'a1', threats: [{ type: 'PREDATOR', distance: 2, intensity: 1.0 }] }];
const CALM = [{ agent_id: 'a1' }];

const ARCHETYPES = {
  fragile: { neuroticism: 0.9, resilience: 0.1 },
  average: { neuroticism: 0.5, resilience: 0.5 },
  stoic: { neuroticism: 0.1, resilience: 0.9 },
  stoicMax: { neuroticism: 0.0, resilience: 1.0 },
};

function recover(name, threatTicks = 150, calmTicks = 120) {
  const sim = new RuntimeSimulation({ seed: 77 });
  sim.registerAgent('a1', ARCHETYPES[name]);
  for (let t = 0; t < threatTicks; t++) sim.batchTick(THREAT, 0.0166);
  for (let t = 0; t < calmTicks; t++) sim.batchTick(CALM, 0.0166);
  // Settle convalescence: RECOVER skips the vigilance floor by design, so
  // archetypes must be compared outside it (bounded; deterministic).
  for (let t = 0; t < 500; t++) {
    if (sim.agents.get('a1').fearCore.state !== 'RECOVER') break;
    sim.batchTick(CALM, 0.0166);
  }
  const agent = sim.agents.get('a1');
  const rec = sim.coreTrauma.agentRecords.get('a1');
  return {
    floor: agent.currentFear,
    N: agent.traits.neuroticism,
    R: agent.traits.resilience,
    crystallized: rec.crystallizedTraumas.length,
  };
}

describe('NOW-18: trauma feedback strength sweep', () => {
  it('every archetype crystallizes but nobody locks into permanent panic', () => {
    for (const name of Object.keys(ARCHETYPES)) {
      const r = recover(name);
      expect(r.crystallized).toBeGreaterThanOrEqual(1);
      // Hyper-vigilance floor stays far below panic bands.
      expect(r.floor).toBeGreaterThan(0.05);
      expect(r.floor).toBeLessThan(0.5);
    }
  });

  it('trait bounds hold at the extremes (no over/underflow)', () => {
    for (const name of Object.keys(ARCHETYPES)) {
      const r = recover(name);
      expect(r.N).toBeLessThanOrEqual(0.98);
      expect(r.R).toBeGreaterThanOrEqual(0.08);
      expect(r.N).toBeGreaterThanOrEqual(0);
      expect(r.R).toBeLessThanOrEqual(1);
    }
  });

  it('identity survives trauma: fragile stays more fearful than stoic', () => {
    const fragile = recover('fragile');
    const stoic = recover('stoicMax');
    // Ordering preserved on both the floor and the drifted traits.
    expect(fragile.floor).toBeGreaterThan(stoic.floor);
    expect(fragile.N).toBeGreaterThan(stoic.N);
    expect(fragile.R).toBeLessThan(stoic.R);
  });

  it('sweep is deterministic per seed', () => {
    const a = recover('average');
    const b = recover('average');
    expect(a).toEqual(b);
  });
});

describe('NOW-17: crystallized panic-onset offset', () => {
  const HARD = [{ agent_id: 'a1', threats: [{ type: 'PREDATOR', distance: 2, intensity: 1.0 }] }];
  const MOD = [{ agent_id: 'a1', threats: [{ type: 'PREDATOR', distance: 8, intensity: 0.3 }] }];
  function veteran() {
    const sim = new RuntimeSimulation({ seed: 77 });
    sim.registerAgent('a1', { neuroticism: 0.5, resilience: 0.5 });
    for (let t = 0; t < 150; t++) sim.batchTick(HARD, 0.0166);
    for (let t = 0; t < 200; t++) sim.batchTick([{ agent_id: 'a1' }], 0.0166);
    return sim;
  }
  function onsetTicks(sim, ticks = 120) {
    for (let t = 1; t <= ticks; t++) {
      sim.batchTick(MOD, 0.0166);
      if (sim.agents.get('a1').fearCore.state === 'PANIC') return t;
    }
    return -1;
  }

  it('recovery completes (no permanent RECOVER lock)', () => {
    const sim = veteran();
    expect(sim.agents.get('a1').fearCore.state).not.toBe('RECOVER');
  });

  it('veteran panics earlier than a fresh twin at the same threat', () => {
    const vet = veteran();
    const fresh = new RuntimeSimulation({ seed: 77 });
    fresh.registerAgent('a1', { neuroticism: 0.5, resilience: 0.5 });
    const vetOnset = onsetTicks(vet);
    const freshOnset = onsetTicks(fresh);
    expect(vetOnset).toBeGreaterThan(0);
    expect(freshOnset).toBeGreaterThan(0);
    expect(vetOnset).toBeLessThan(freshOnset);
  });

  it('bias touches thresholds only: stored fear identical with and without', () => {
    // Direct agent proof: same fear trajectory, different panic timing.
    const mk = () => new AffectiveAgent('t', { neuroticism: 0.5, resilience: 0.5 });
    const a = mk();
    const b = mk();
    const obs = { threats: [{ type: 'PREDATOR', distance: 8, intensity: 0.55 }] };
    for (let t = 1; t <= 10; t++) {
      a.tick(0.016, obs, { panicFearBias: 0.35 });
      b.tick(0.016, obs, {});
    }
    expect(a.currentFear).toBe(b.currentFear);
  });
});
