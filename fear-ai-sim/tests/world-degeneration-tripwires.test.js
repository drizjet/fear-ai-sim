import { describe, it, expect } from '@jest/globals';
import { runSoak } from '../world-soak-monitor.js';

// Sections LXXII (NOW-5): endogenous-trigger adjudication for the
// synthetic-only degeneration flags. Each test stages the strongest
// endogenous stress found by probing and pins the model's structural
// resistance. If a future change makes any of these fire, the test
// fails LOUDLY — that is the tripwire working, not the test breaking.
//
// Probe record (2026-09-09, seeds 1/3):
// - Default scenario never raids: bandit sits on road-a, merchant sails
//   road-c; zero BANDIT_ATTACK at any perceivedDanger 0.5-1.0.
// - Sustained contact (bandit on road-c, full perception): ~456 raids per
//   2000 ticks at a FLAT rate (early 214 vs late 242; heat +0.2/raid vs
//   0.95/tick cooling equilibrates).
// - Wealth under contact grows linearly (104 -> 5129); buyAmount capped at
//   20 with no capital feedback, so exponential runaway is unreachable.
// - Event rate under maximal stress DECELERATES (24.4 -> 22.8/tick).

function contactSetup(world) {
  world.bandits[0].roadId = 'road-c';
  world.bandits[0].perceptionAccuracy = 1;
  world.merchants[0].perceptionAccuracy = 0;
}

describe('LXXII NOW-5: degeneration tripwire adjudication', () => {
  it('default scenario never raids without contact (spatial mismatch, not broken raids)', () => {
    const { series } = runSoak({ ticks: 2000, seed: 3 });
    expect(series[series.length - 1].raids).toBe(0);
  }, 120000);

  it('sustained bandit contact raids flat without runaway (heat equilibrates)', () => {
    const { series, report } = runSoak({ ticks: 2000, seed: 3, setup: contactSetup });
    const first = series[0];
    const mid = series[Math.floor(series.length / 2)];
    const last = series[series.length - 1];
    const earlyRaids = mid.raids - first.raids;
    const lateRaids = last.raids - mid.raids;
    expect(earlyRaids).toBeGreaterThan(50);
    expect(lateRaids).toBeLessThan(2 * earlyRaids);
    expect(report.flags.map((f) => f.mode)).not.toContain('RUNAWAY_RAIDS');
  }, 120000);

  it('wealth under contact grows without acceleration (linear commerce)', () => {
    const { series, report } = runSoak({ ticks: 2000, seed: 3, setup: contactSetup });
    const first = series[0];
    const last = series[series.length - 1];
    expect(last.wealth).toBeGreaterThan(first.wealth);
    expect(report.flags.map((f) => f.mode)).not.toContain('INFINITE_WEALTH');
  }, 120000);

  it('event rate under maximal stress does not accelerate', () => {
    const { series, report } = runSoak({
      ticks: 2000,
      seed: 3,
      perceivedDanger: 1.0,
      setup: contactSetup,
    });
    const half = Math.floor(series.length / 2);
    const earlyRate = (series[half].events - series[0].events) / half;
    const lateRate = (series[series.length - 1].events - series[half].events) / (series.length - 1 - half);
    expect(lateRate).toBeLessThan(2 * earlyRate);
    expect(report.flags.map((f) => f.mode)).not.toContain('EVENT_EXPLOSION');
  }, 120000);
});
