import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { ObservabilityHooks } from '../packages/core/src/ObservabilityHooks.js';

// Section CVII (NEXT-11): observability must be optional. Attaching,
// detaching, or weaponizing the telemetry sink never changes the world:
// telemetry ON vs OFF yields identical semantic output.

function makeRng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 0x100000000;
  };
}

function runWorld({ ticks = 500, seed = 9, hooks = null }) {
  const world = createClosedWorldScenario();
  world.towns.get('north').population = 100;
  world.towns.get('south').population = 100;
  const rng = makeRng(seed);
  for (let t = 1; t <= ticks; t++) {
    tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, encounterRng: rng, hooks });
  }
  return world;
}

const snapshot = (world) => JSON.stringify({ events: world.events, tickHistory: world.tickHistory });

describe('CVII: observability optionality (telemetry cannot steer the world)', () => {
  it('hooked and unhooked 500-tick worlds are identical', () => {
    const hooks = new ObservabilityHooks();
    const withHooks = runWorld({ hooks });
    const without = runWorld({ hooks: null });
    expect(snapshot(withHooks)).toBe(snapshot(without));
  }, 120000);

  it('the sink observes every tick (metrics actually flow)', () => {
    const hooks = new ObservabilityHooks();
    runWorld({ ticks: 500, hooks });
    for (const name of ['world_tick', 'world_population', 'world_events']) {
      expect(hooks.summarize(name).count).toBe(500);
    }
    expect(hooks.summarize('world_tick').last).toBe(500);
  }, 120000);

  it('hostile subscribers (throw plus mutate) cannot perturb the trajectory', () => {
    const hooks = new ObservabilityHooks();
    hooks.subscribe((event) => {
      event.name = 'HACKED';
      event.value = -999;
      event.tags.tick = -1;
      throw new Error('subscriber sabotage');
    });
    const sabotaged = runWorld({ hooks });
    const clean = runWorld({ hooks: null });
    expect(snapshot(sabotaged)).toBe(snapshot(clean));
  }, 120000);

  it('telemetry overhead stays bounded (informational budget)', () => {
    const hooks = new ObservabilityHooks();
    const t0 = performance.now();
    runWorld({ ticks: 500, hooks });
    const hookedMs = performance.now() - t0;
    const t1 = performance.now();
    runWorld({ ticks: 500, hooks: null });
    const bareMs = performance.now() - t1;
    expect(hookedMs).toBeLessThan(5 * Math.max(1, bareMs));
  }, 120000);
  it('a throwing sink object cannot break the tick', () => {
    const evil = { emit() { throw new Error('sink sabotage'); } };
    let world;
    expect(() => { world = runWorld({ ticks: 10, hooks: evil }); }).not.toThrow();
    expect(world.events.length).toBeGreaterThan(0);
  });
});

