import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, reassessFaction } from '../closed-world.js';
import { makeSoakRng, mapPhaseTransition } from '../world-soak-monitor.js';

// Sections LXXIII: world phase-transition mapping. Each sweep must show an
// INTERIOR crossing (degenerate always/never responses are rejected), which
// proves the world can sit on either side of the threshold.

// Stable trade -> reroute: believed danger of the dominant road rises until
// the merchant abandons it. Beliefs are the legal control (merchants act on
// observations, never on ground-truth actualDanger).
function roadCShare(believedDanger) {
  const world = createClosedWorldScenario();
  world.merchants[0].routeBeliefs = {
    'road-a': { perceivedDanger: 0.8, confidence: 0.9 },
    'road-b': { perceivedDanger: 0.1, confidence: 0.9 },
    'road-c': { perceivedDanger: believedDanger, confidence: 0.9 },
  };
  const rng = makeSoakRng(7);
  let chosen = 0;
  let total = 0;
  for (let t = 1; t <= 200; t++) {
    const before = world.events.length;
    tickClosedWorld(world, { tick: t, perceivedDanger: 0.0, encounterRng: rng });
    for (let i = before; i < world.events.length; i++) {
      const e = world.events[i];
      if (e.type === 'MERCHANT_ROUTE_DECISION') {
        total += 1;
        if (e.chosenRoute === 'road-c') chosen += 1;
      }
    }
  }
  return total ? chosen / total : NaN;
}

// Peace -> conflict: enemy weakness rises at maximal shortage until the
// faction flips HOLD -> RAID. Five reassess iterations per level (fixed;
// advanceEmotion mutates state, so the count is part of the fixture).
function factionRaids(enemyWeakness) {
  const world = createClosedWorldScenario();
  let last = null;
  for (let k = 0; k < 5; k++) {
    last = reassessFaction(world, 'south-faction', { perceivedDanger: 0.9, supplyShortage: 1, enemyWeakness });
  }
  return last.decision === 'RAID' ? 1 : 0;
}

describe('LXXIII: world phase transitions', () => {
  it('trade reroutes inside the believed-danger ladder (interior crossing)', () => {
    const { curve, crossing, degenerate } = mapPhaseTransition({
      values: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8],
      threshold: 0.5,
      run: (d) => d,
      metric: roadCShare,
    });
    expect(degenerate).toBe(false);
    expect(crossing).not.toBeNull();
    expect(crossing.from).toBeLessThan(crossing.to);
    expect(curve[0].metric).toBe(1);
    expect(curve[curve.length - 1].metric).toBe(0);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].metric).toBeLessThanOrEqual(curve[i - 1].metric);
    }
  }, 180000);

  it('faction flips HOLD -> RAID inside the weakness ladder (interior crossing)', () => {
    const { curve, crossing, degenerate } = mapPhaseTransition({
      values: [0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
      threshold: 0.5,
      run: (w) => w,
      metric: factionRaids,
    });
    expect(degenerate).toBe(false);
    expect(crossing).not.toBeNull();
    expect(curve[0].metric).toBe(0);
    expect(curve[curve.length - 1].metric).toBe(1);
  }, 120000);

  it('both sweeps reproduce identically (seeded determinism)', () => {
    const trade = () => mapPhaseTransition({ values: [0, 0.3, 0.8], threshold: 0.5, run: (d) => d, metric: roadCShare }).curve;
    const faction = () => mapPhaseTransition({ values: [0.3, 0.9], threshold: 0.5, run: (w) => w, metric: factionRaids }).curve;
    expect(trade()).toEqual(trade());
    expect(faction()).toEqual(faction());
  }, 180000);
});
