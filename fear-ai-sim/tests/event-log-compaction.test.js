import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { makeSoakRng } from '../world-soak-monitor.js';
import {
  compactEventLog,
  verifyAnchorClosure,
  DEFAULT_ANCHOR_TYPES,
} from '../packages/core/index.js';

// Sections LXXI (NEXT-8): event-log compaction must shrink the log while
// preserving every causal anchor. The compacted log keeps all anchor-type
// events, per-type boundaries, and the transitive parent-closure; bulk
// bookkeeping collapses into counted per-window summaries.

function contactWorld(seed = 3, ticks = 2000) {
  const world = createClosedWorldScenario();
  world.towns.get('north').population = 100;
  world.towns.get('south').population = 100;
  world.bandits[0].roadId = 'road-c';
  world.bandits[0].perceptionAccuracy = 1;
  world.merchants[0].perceptionAccuracy = 0;
  const rng = makeSoakRng(seed);
  for (let t = 1; t <= ticks; t++) {
    tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, encounterRng: rng });
  }
  return world;
}

function chainFixture() {
  // Synthetic causal chain: root -> mid -> leaf, plus noise around it.
  return [
    { eventId: 'e-root', type: 'BANDIT_ATTACK', tick: 1, parentEventIds: [] },
    { eventId: 'e-noise-1', type: 'MARKET_TICK', tick: 1, parentEventIds: [] },
    { eventId: 'e-mid', type: 'MIGRATION_DECISION', tick: 2, parentEventIds: ['e-root'] },
    { eventId: 'e-noise-1b', type: 'MARKET_TICK', tick: 1, parentEventIds: [] },
    { eventId: 'e-noise-2', type: 'MARKET_TICK', tick: 2, parentEventIds: [] },
    { eventId: 'e-leaf', type: 'MERCHANT_ROUTE_DECISION', tick: 3, parentEventIds: ['e-mid'] },
    { eventId: 'e-noise-3', type: 'TAX_COLLECTED', tick: 3, parentEventIds: [] },
    { eventId: 'e-noise-3b', type: 'TAX_COLLECTED', tick: 4, parentEventIds: [] },
    { eventId: 'e-noise-4', type: 'TAX_COLLECTED', tick: 350, parentEventIds: [] },
  ];
}

describe('LXXI NEXT-8: event-log compaction with anchor preservation', () => {
  it('synthetic chain keeps anchors plus parent closure, summarizes bulk', () => {
    const r = compactEventLog(chainFixture());
    const ids = new Set(r.events.map((e) => e.eventId));
    // Anchor root kept; mid/leaf kept via closure (leaf references mid).
    expect(ids.has('e-root')).toBe(true);
    expect(ids.has('e-mid')).toBe(true);
    // Bulk noise summarized; boundary rule keeps first and last MARKET_TICK.
    expect(ids.has('e-noise-1')).toBe(true);
    expect(ids.has('e-noise-2')).toBe(true);
    expect(ids.has('e-noise-1b')).toBe(false);
    expect(r.summaries.find((s) => s.type === 'MARKET_TICK').count).toBe(1);
    expect(r.summaries.find((s) => s.type === 'TAX_COLLECTED').count).toBe(1);
    expect(r.stats.dropped).toBe(0);
  });

  it('real 2000-tick contact log compacts with all raids and closure intact', () => {
    const world = contactWorld();
    const attacks = world.events.filter((e) => e.type === 'BANDIT_ATTACK').length;
    expect(attacks).toBeGreaterThan(100);
    const r = compactEventLog(world.events);
    expect(r.events.filter((e) => e.type === 'BANDIT_ATTACK')).toHaveLength(attacks);
    expect(verifyAnchorClosure(r.events).closed).toBe(true);
    expect(r.danglingParents).toEqual([]);
    // Summaries reconstruct bulk counts exactly.
    const summarized = r.summaries.reduce((s, x) => s + x.count, 0);
    const keptBulk = r.events.filter((e) => ['MARKET_TICK', 'TAX_COLLECTED', 'REPORT_FILED', 'ROUTE_EXPOSURE', 'CANDIDATE_ENCOUNTER', 'TAKEOVER_GATE', 'INTRUSION', 'ROUTE_SELECTED', 'ROUTE_CHANGED'].includes(e.type)).length;
    const originalBulk = world.events.filter((e) => ['MARKET_TICK', 'TAX_COLLECTED', 'REPORT_FILED', 'ROUTE_EXPOSURE', 'CANDIDATE_ENCOUNTER', 'TAKEOVER_GATE', 'INTRUSION', 'ROUTE_SELECTED', 'ROUTE_CHANGED'].includes(e.type)).length;
    expect(summarized + keptBulk).toBe(originalBulk);
    expect(r.stats.savingsPercent).toBeGreaterThan(25);
  }, 180000);

  it('compaction is deterministic across repeated runs', () => {
    const world = contactWorld(5, 500);
    const a = compactEventLog(world.events);
    const b = compactEventLog(world.events);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  }, 180000);

  it('every default anchor type present in a brutalized world survives', () => {
    const world = contactWorld();
    const present = new Set(world.events.map((e) => e.type));
    const anchored = DEFAULT_ANCHOR_TYPES.filter((t) => present.has(t));
    expect(anchored.length).toBeGreaterThan(0);
    const r = compactEventLog(world.events);
    const keptTypes = new Set(r.events.map((e) => e.type));
    for (const t of anchored) expect(keptTypes.has(t)).toBe(true);
  }, 180000);
  it('dangling parents are reported, never fatal', () => {
    const r = compactEventLog([
      { eventId: 'orphan', type: 'MIGRATION', tick: 5, parentEventIds: ['ghost-1', 'ghost-2'] },
    ]);
    expect(r.events).toHaveLength(1);
    expect(r.danglingParents).toEqual(['ghost-1', 'ghost-2']);
    expect(verifyAnchorClosure(r.events).closed).toBe(false);
  });

  it('cyclic parents terminate with the cycle kept', () => {
    const r = compactEventLog([
      { eventId: 'a', type: 'MIGRATION', tick: 1, parentEventIds: ['b'] },
      { eventId: 'b', type: 'MIGRATION', tick: 2, parentEventIds: ['a'] },
    ]);
    expect(r.events).toHaveLength(2);
    expect(verifyAnchorClosure(r.events).closed).toBe(true);
  });

  it('malformed input compacts to empty without throwing', () => {
    for (const bad of [null, undefined, {}, 'str', 42]) {
      let r;
      expect(() => { r = compactEventLog(bad); }).not.toThrow();
      expect(r.events).toEqual([]);
      expect(r.stats.original).toBe(0);
    }
    const r = compactEventLog([null, 42, 'x', { type: 'MARKET_TICK', tick: 1 }]);
    expect(r.events).toHaveLength(1);
  });

  it('explicit dropTypes destroy only what the caller names', () => {
    const r = compactEventLog(chainFixture(), { dropTypes: ['MERCHANT_ROUTE_DECISION'] });
    const ids = new Set(r.events.map((e) => e.eventId));
    expect(ids.has('e-leaf')).toBe(false);
    expect(ids.has('e-root')).toBe(true);
    expect(r.stats.dropped).toBe(1);
  });
});

describe('LXXI NOW-5: middle-tier semantic summarization', () => {
  function repeatFixture(n = 120) {
    const evs = [{ eventId: 'anchor-0', type: 'BANDIT_ATTACK', tick: 1, parentEventIds: [] }];
    for (let i = 0; i < n; i++) {
      evs.push({ eventId: `pop-${i}`, type: 'POPULATION_CHANGE', tick: i + 1, townId: i % 2 ? 'north' : 'south', parentEventIds: [] });
    }
    evs.push({ eventId: 'rare-0', type: 'SEASON_CHANGE', tick: 5, parentEventIds: [] });
    return evs;
  }

  it('repeated KEPT types collapse with span plus actor sample; rare types stay whole', () => {
    const r = compactEventLog(repeatFixture(), { middleWindowTicks: 50 });
    // 118 interior repeats summarized (first/last kept as boundaries).
    expect(r.stats.middleSummarized).toBe(118);
    expect(r.events.find((e) => e.eventId === 'pop-0')).toBeDefined();
    expect(r.events.find((e) => e.eventId === 'pop-119')).toBeDefined();
    expect(r.events.find((e) => e.eventId === 'rare-0')).toBeDefined();
    const s = r.middleSummaries.find((x) => x.type === 'POPULATION_CHANGE');
    expect(s.count).toBeGreaterThan(0);
    expect(s.firstTick).toBeLessThanOrEqual(s.lastTick);
    expect(s.actors).toContain('north');
    expect(s.exampleEventId).toMatch(/^pop-/);
    expect(verifyAnchorClosure(r.events).closed).toBe(true);
  });

  it('closure-referenced repeats stay whole despite high repetition', () => {
    const evs = repeatFixture(120);
    evs.push({ eventId: 'anchor-1', type: 'WAR_DECLARED', tick: 130, parentEventIds: ['pop-60'] });
    const r = compactEventLog(evs, { middleWindowTicks: 50 });
    expect(r.events.find((e) => e.eventId === 'pop-60')).toBeDefined();
    expect(verifyAnchorClosure(r.events).closed).toBe(true);
  });

  it('middle tier opts out exactly (legacy bulk-only behavior)', () => {
    const evs = repeatFixture();
    const r = compactEventLog(evs, { middleMinRepeat: Infinity });
    expect(r.middleSummaries).toEqual([]);
    expect(r.stats.middleSummarized).toBe(0);
    expect(r.events.filter((e) => e.type === 'POPULATION_CHANGE')).toHaveLength(120);
  });

  it('real 2000-tick log: middle tier doubles savings with exact reconstruction', () => {
    const world = contactWorld();
    const r = compactEventLog(world.events);
    expect(verifyAnchorClosure(r.events).closed).toBe(true);
    expect(r.stats.savingsPercent).toBeGreaterThan(45);
    // Per-type reconstruction: kept plus bulk plus middle equals original.
    const orig = {};
    for (const e of world.events) orig[e.type] = (orig[e.type] || 0) + 1;
    const accounted = {};
    for (const e of r.events) accounted[e.type] = (accounted[e.type] || 0) + 1;
    for (const s of [...r.summaries, ...r.middleSummaries]) accounted[s.type] = (accounted[s.type] || 0) + s.count;
    for (const t of Object.keys(orig)) expect(accounted[t] || 0).toBe(orig[t]);
    expect(r.stats.dropped).toBe(0);
  }, 180000);
});
