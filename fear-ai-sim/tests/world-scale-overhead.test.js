import { describe, it, expect } from '@jest/globals';
import {
  WorldSimulationSystem,
  TradeCaravanSupplyChainSystem,
  CivilizationSimulationSystem,
} from '../packages/core/index.js';

// Sections NEXT-6 (LXXVIII-LXXIX): world overhead at hundreds of groups and
// routes. Entity scale (10k) is covered by Milestone J; this pins the MESO
// layer: roaming groups, trade corridors/caravans, and civ entities ticking
// together. Probe record 2026-09-09: per-tick cost doubles with group count
// (linear, no O(N²) encounter blowup); caravans cost ~0.02 ms/tick at 294.

function buildWorld(ngroups, nhubs) {
  const world = new WorldSimulationSystem({ seed: 7 });
  for (let g = 0; g < ngroups; g++) {
    world.registerGroup(`grp_${g}`, {
      memberCount: 10,
      position: { x: (g % 20) * 10, y: 0, z: Math.floor(g / 20) * 10 },
      waypoints: [{ x: 100, y: 0, z: 100 }],
    });
  }
  const trade = new TradeCaravanSupplyChainSystem({ seed: 11 });
  for (let i = 0; i < nhubs; i++) {
    trade.registerSettlementHub(`hub${i}`, { x: (i % 10) * 50, z: Math.floor(i / 10) * 50, stockpiles: { food: 500 } });
  }
  for (let i = 0; i < nhubs; i++) {
    for (let j = i + 1; j < Math.min(i + 4, nhubs); j++) {
      trade.registerCorridor(`hub${i}`, `hub${j}`);
      trade.commissionCaravan({ originId: `hub${i}`, destinationId: `hub${j}` });
    }
  }
  const civ = new CivilizationSimulationSystem();
  for (let i = 0; i < 1000; i++) {
    civ.registerEntity(`e_${i}`, { position: { x: i, y: 0, z: 0 }, fear: 0.2, morale: 0.8 });
  }
  return { world, trade, civ };
}

function tickAll(bundle, n) {
  const t0 = performance.now();
  for (let t = 0; t < n; t++) {
    bundle.world.tick(1.0, {});
    bundle.trade.tick(1);
    bundle.civ.advanceSimulation(1);
  }
  return performance.now() - t0;
}

describe('NEXT-6: large-civilization overhead budgets', () => {
  it('200 groups plus 100 hubs tick inside budget with sane state', () => {
    const bundle = buildWorld(200, 100);
    // Warmup (JIT) then measure.
    tickAll(bundle, 5);
    const ms = tickAll(bundle, 20);
    expect(ms).toBeLessThan(2000);
    expect(bundle.world.tickCount).toBe(25);
    expect(bundle.world.groups.size).toBe(200);
    const g0 = bundle.world.groups.get('grp_0');
    expect(Number.isFinite(g0.position.x)).toBe(true);
    expect(bundle.trade.activeCaravans.size).toBeGreaterThan(0);
    const c0 = bundle.civ.entities.get('e_0');
    expect(Number.isFinite(c0.fear)).toBe(true);
  }, 120000);

  it('doubling groups less than triples tick cost (no superlinear blowup)', () => {
    const small = buildWorld(200, 100);
    tickAll(small, 5);
    const smallMs = tickAll(small, 20);
    const big = buildWorld(400, 100);
    tickAll(big, 5);
    const bigMs = tickAll(big, 20);
    expect(bigMs).toBeLessThan(3 * Math.max(1, smallMs));
  }, 120000);
});
