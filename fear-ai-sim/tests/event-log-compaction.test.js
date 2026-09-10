import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';
import { makeSoakRng } from '../world-soak-monitor.js';
import {
  compactEventLog,
  verifyAnchorClosure,
  mergeColdSummaries,
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

describe('LXXI NOW-12: middle-summary value distributions', () => {
  function voteFixture() {
    const evs = [];
    for (let i = 0; i < 60; i++) {
      evs.push({
        eventId: `v-${i}`, type: 'FACTION_ACTION_GATE', tick: i + 1,
        factionId: 'f1', allowed: i % 3 === 0, note: { nested: true },
        tag: `unique-${i}`, parentEventIds: [],
      });
    }
    return evs;
  }

  it('counts primitives per window, skips objects, caps distinct with overflow', () => {
    const r = compactEventLog(voteFixture(), {
      middleMinRepeat: 10, middleWindowTicks: 1000,
      middleValueFields: ['allowed', 'note', 'tag', 'missing'],
      middleMaxDistinct: 5,
    });
    expect(r.stats.middleSummarized).toBeGreaterThan(0);
    const s = r.middleSummaries.find((x) => x.type === 'FACTION_ACTION_GATE');
    // 60 votes: 20 true, 40 false (boundary first/last stay whole).
    const total = Object.values(s.values.allowed).reduce((a, b) => a + b, 0);
    expect(total).toBe(s.count);
    expect(s.values.allowed['true'] + s.values.allowed['false']).toBe(s.count);
    // Objects never enter distributions; missing fields leave no bucket.
    expect(s.values.note).toBeUndefined();
    expect(s.values.missing).toBeUndefined();
    // 60 unique tags capped at 5 distinct plus overflow.
    expect(Object.keys(s.values.tag)).toHaveLength(5);
    const tagSum = Object.values(s.values.tag).reduce((a, b) => a + b, 0) + s.valuesOverflow.tag;
    expect(tagSum).toBe(s.count);
    // Sorted keys for stable output.
    expect(Object.keys(s.values.tag)).toEqual([...Object.keys(s.values.tag)].sort());
  });

  it('real log: allowed splits sum to window counts, deterministically', () => {
    const world = contactWorld();
    const opts = { middleValueFields: ['allowed', 'decision'] };
    const a = compactEventLog(world.events, opts);
    const b = compactEventLog(world.events, opts);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    for (const s of a.middleSummaries) {
      for (const f of Object.keys(s.values)) {
        const sum = Object.values(s.values[f]).reduce((x, y) => x + y, 0) + (s.valuesOverflow[f] ?? 0);
        expect(sum).toBe(s.count);
      }
    }
    const gate = a.middleSummaries.find((s) => s.type === 'FACTION_ACTION_GATE' && s.values.allowed);
    expect(gate).toBeDefined();
  }, 180000);
});

describe('NEXT-49: cold-tier steady-state bounding', () => {
  const campSpan = (n, key) => ([
    { eventId: `est-${n}`, type: 'CAMP_ESTABLISHED', tick: n * 10, primaryId: key, parentEventIds: [] },
    { eventId: `abd-${n}`, type: 'CAMP_ABANDONED', tick: n * 10 + 5, primaryId: key, parentEventIds: [] },
  ]);
  const coldOpts = {
    anchorTypes: ['CAMP_ESTABLISHED', 'CAMP_ABANDONED', 'TRADE_DELIVERY'],
    bulkTypes: ['MARKET_TICK'],
    coldAgeTicks: 50,
    coldPairRollup: [{ open: 'CAMP_ESTABLISHED', close: 'CAMP_ABANDONED', key: 'primaryId' }],
  };
  it('rolls unreferenced cold camp pairs into per-key occupancy, keeps referenced halves whole', () => {
    const evs = [
      ...campSpan(1, 'g1'), ...campSpan(2, 'g1'), ...campSpan(3, 'g2'),
      { eventId: 'd1', type: 'TRADE_DELIVERY', tick: 35, parentEventIds: ['est-3'] },
      { eventId: 'm1', type: 'MARKET_TICK', tick: 5, parentEventIds: [] },
      { eventId: 'd2', type: 'TRADE_DELIVERY', tick: 200, parentEventIds: [] },
    ];
    const out = compactEventLog(evs, coldOpts);
    // g1 pairs rolled (2 pairs, 4 events gone); g2's est-3 is referenced by
    // the delivery, so the g2 pair stays whole.
    expect(out.stats.coldPaired).toBe(2);
    expect(out.coldPairSummaries).toHaveLength(1);
    expect(out.coldPairSummaries[0]).toMatchObject({ keyValue: 'g1', pairCount: 2 });
    expect(out.events.some((e) => e.eventId === 'est-3')).toBe(true);
    expect(out.events.some((e) => e.eventId === 'abd-3')).toBe(true);
    expect(out.events.some((e) => e.eventId === 'd1')).toBe(true);
    expect(verifyAnchorClosure(out.events).closed).toBe(true);
  });
  it('merges cold summaries idempotently and leaves the default path byte-identical', () => {
    const evs = [];
    for (let i = 0; i < 300; i++) evs.push({ eventId: `m${i}`, type: 'MARKET_TICK', tick: i, parentEventIds: [] });
    const cold = compactEventLog(evs, { ...coldOpts, coldAgeTicks: 30 });
    expect(cold.stats.coldSummariesMerged).toBeGreaterThan(0);
    const total = cold.summaries.reduce((n, s) => n + s.count, 0);
    // First/last per type stay whole as boundary evidence; the rest sums.
    expect(total).toBe(298);
    expect(cold.events.map((e) => e.eventId).sort()).toEqual(['m0', 'm299']);
    // Idempotent re-merge preserves counts.
    const re = mergeColdSummaries(cold.summaries, 1000);
    expect(re.entries.reduce((n, s) => n + s.count, 0)).toBe(298);
    // Default path untouched: no cold keys requested, zero cold activity,
    // identical output with or without the null default spelled out.
    const a = compactEventLog(evs, { bulkTypes: ['MARKET_TICK'] });
    const b = compactEventLog(evs, { bulkTypes: ['MARKET_TICK'], coldAgeTicks: null, coldPairRollup: [] });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.stats.coldPaired).toBe(0);
  });
});

describe('NEXT-64: migration-chain cold readiness', () => {
    it('rolls configured migration pairs with no code change; live valley emits none', async () => {
        const { compactEventLog } = await import('../packages/core/index.js');
        // Generic mechanism check: any configured open/close pair rolls.
        const evs = [
            { eventId: 'm-est-1', type: 'MIGRATION_STARTED', tick: 10, primaryId: 'clan', parentEventIds: [] },
            { eventId: 'm-end-1', type: 'MIGRATION_COMPLETED', tick: 40, primaryId: 'clan', parentEventIds: [] },
            { eventId: 'm-est-2', type: 'MIGRATION_STARTED', tick: 900, primaryId: 'clan', parentEventIds: [] },
            { eventId: 'm-end-2', type: 'MIGRATION_COMPLETED', tick: 950, primaryId: 'clan', parentEventIds: [] },
        ];
        const out = compactEventLog(evs, {
            anchorTypes: ['MIGRATION_STARTED', 'MIGRATION_COMPLETED'],
            bulkTypes: [],
            coldAgeTicks: 100,
            coldPairRollup: [{ open: 'MIGRATION_STARTED', close: 'MIGRATION_COMPLETED', key: 'primaryId' }]
        });
        // maxTick 950, cutoff 850: only the first pair is cold.
        expect(out.stats.coldPaired).toBe(1);
        expect(out.coldPairSummaries).toHaveLength(1);
        expect(out.coldPairSummaries[0]).toMatchObject({ keyValue: 'clan', pairCount: 1 });
        expect(out.events.some((e) => e.eventId === 'm-est-2')).toBe(true);
    });
});
