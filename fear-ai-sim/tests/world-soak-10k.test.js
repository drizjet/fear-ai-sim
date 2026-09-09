import { describe, it, expect } from '@jest/globals';
import { runSoak } from '../world-soak-monitor.js';

// Sections LXXII (NOW-4): 10k-tick living-world soak under the degeneration
// monitor. Serialized-gate only (about 30 s); the default matrix stops at 2k.
// Calibrated expectations from the 10k probe: linear merchant profit reaches
// ~36k wealth without tripping INFINITE_WEALTH (acceleration-based), the
// overshoot population equilibrates near carrying capacity, agency fires
// every tick, and the event log grows linearly (~19/tick bookkeeping).

describe('LXXII: 10k-tick world soak', () => {
  it('10k ticks stay non-degenerate, agentic, and bounded', () => {
    const { series, report } = runSoak({ ticks: 10000, sampleEvery: 100, seed: 1 });
    expect(report.degenerate).toBe(false);
    expect(report.flags).toEqual([]);
    const last = series[series.length - 1];
    expect(last.decisions).toBe(10000);
    expect(last.population).toBeGreaterThan(0);
    expect(Number.isFinite(last.wealth)).toBe(true);
    // Linear event growth: ~19 bookkeeping events per tick, no explosion.
    const perTick = last.events / 10000;
    expect(perTick).toBeGreaterThan(5);
    expect(perTick).toBeLessThan(40);
  }, 300000);
});
