import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';
import {
  GroupContagionSystem,
  GROUP_TYPES,
  GROUP_DOCTRINES,
  GROUP_STATES,
} from '../packages/core/index.js';
import { mapPhaseTransition } from '../world-soak-monitor.js';

// Sections LXXIII (continued): the two transitions with no identified
// control in NOW-7 now have one each.
//
// Calm settlement -> panic: a civilian crowd's seeded panickers rise until
// the group bifurcates. Control = seeded panickers in a crowd of 10 under
// SELF_PRESERVATION doctrine (bifurcation at panickingRatio 0.25).
// Cohesive faction -> split: brutalization days rise until the town
// secedes and founds its own polity. Control = days of staged siege.

const PANIC_STATES = new Set([GROUP_STATES.CASCADE_TRIGGERED, GROUP_STATES.SCATTERED_STAMPEDE]);

function crowdState(seedPanickers, n = 10) {
  const groups = new GroupContagionSystem();
  const ids = Array.from({ length: n }, (_, i) => `c${i}`);
  groups.createGroup('crowd', GROUP_TYPES.CIVILIAN_CROWD, GROUP_DOCTRINES.SELF_PRESERVATION, null, ids);
  const states = new Map(ids.map((id, i) => [id, i < seedPanickers
    ? { id, fear: 0.9, fearBand: 'PANIC', isPanicking: true, traits: {} }
    : { id, fear: 0.1, fearBand: 'CALM', isPanicking: false, traits: {} }]));
  return groups.evaluateGroup('crowd', states).state;
}

function secededAfter(days) {
  const world = createClosedWorldScenario({ season: 'SUMMER' });
  world.ticksPerSeason = 10000;
  world.towns.get('south').population = 30;
  for (let t = 1; t <= days; t++) {
    world.towns.get('south').market.inventory.set('food', 0);
    appendWorldEvent(world, {
      type: 'BANDIT_ATTACK', roadId: 'road-b', banditId: 'bx',
      merchantId: 'm1', lost: 5, tick: t, attackOpportunityId: `sec-${t}`,
    });
    tickClosedWorld(world, { tick: t, perceivedDanger: 0.9, encounterRng: () => 0.999 });
  }
  return world.events.some((e) => e.type === 'SECESSION' && e.townId === 'south') ? 1 : 0;
}

describe('LXXIII: calm-to-panic and cohesion-to-split transitions', () => {
  it('crowd bifurcates inside the seeded-panicker ladder (interior crossing)', () => {
    const { curve, crossing, degenerate } = mapPhaseTransition({
      values: [0, 1, 2, 3, 4, 6],
      threshold: 0.5,
      run: (k) => k,
      metric: (k) => (PANIC_STATES.has(crowdState(k)) ? 1 : 0),
    });
    expect(degenerate).toBe(false);
    expect(crossing).toEqual({ from: 2, to: 3 });
    expect(curve[0].metric).toBe(0);
    expect(curve[curve.length - 1].metric).toBe(1);
  });

  it('crowd passes through the full cascade anatomy (calm, alert, cascade, stampede)', () => {
    expect(crowdState(0)).toBe(GROUP_STATES.COHESIVE_CALM);
    expect(crowdState(1)).toBe(GROUP_STATES.VIGILANT_ALERT);
    expect(crowdState(3)).toBe(GROUP_STATES.CASCADE_TRIGGERED);
    expect(crowdState(9)).toBe(GROUP_STATES.SCATTERED_STAMPEDE);
  });

  it('town secedes inside the brutalization ladder (interior crossing)', () => {
    const { curve, crossing, degenerate } = mapPhaseTransition({
      values: [0, 1, 2, 3, 5, 8],
      threshold: 0.5,
      run: (d) => d,
      metric: secededAfter,
    });
    expect(degenerate).toBe(false);
    expect(crossing).toEqual({ from: 2, to: 3 });
    expect(curve[0].metric).toBe(0);
    expect(curve[curve.length - 1].metric).toBe(1);
  });

  it('both transitions reproduce identically', () => {
    expect(crowdState(3)).toBe(crowdState(3));
    expect(secededAfter(3)).toBe(secededAfter(3));
    expect(secededAfter(2)).toBe(0);
  });
});
