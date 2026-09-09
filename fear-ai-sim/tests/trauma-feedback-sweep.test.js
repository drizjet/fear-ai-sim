import { RuntimeSimulation } from '../packages/runtime/src/RuntimeSimulation.js';

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
