import { describe, it, expect } from '@jest/globals';
import { runSoak, detectDegeneration } from '../world-soak-monitor.js';

// Sections LXXII: living-world soak degeneration detection.
// The monitor must stay silent on the healthy world and fire on lesions.
// Detector predicates were calibrated against a 500-tick autopsy:
// per-tick bookkeeping (~20 events/tick) is structural, merchant profit is
// structurally linear (buyAmount capped at 20, no capital feedback), and
// overshoot populations equilibrate Malthusian-style instead of extincting.

function synth(len, fn) {
  return Array.from({ length: len }, (_, i) => ({ wealth: 0, population: 100, events: 0, decisions: 0, raids: 0, deliveries: 0, ...fn(i) }));
}

describe('LXXII: soak degeneration monitor', () => {
  it('healthy 2000-tick world trips no flag and stays agentic', () => {
    const { series, report } = runSoak({ ticks: 2000, seed: 1 });
    expect(report.degenerate).toBe(false);
    expect(report.flags).toEqual([]);
    const last = series[series.length - 1];
    expect(last.decisions).toBeGreaterThan(1000);
    expect(last.population).toBeGreaterThan(0);
  }, 120000);

  it('soak series is deterministic under the same seed', () => {
    const a = runSoak({ ticks: 500, seed: 42 });
    const b = runSoak({ ticks: 500, seed: 42 });
    expect(a.series).toEqual(b.series);
  }, 120000);

  it('removing all merchants trips AGENCY_STAGNATION end to end', () => {
    const { series, report } = runSoak({ ticks: 1000, seed: 1, setup: (w) => { w.merchants = []; } });
    expect(series[series.length - 1].decisions).toBe(0);
    expect(report.flags.map((f) => f.mode)).toContain('AGENCY_STAGNATION');
  }, 120000);

  it('hard famine collapses population toward single digits without extinction (equilibration floor)', () => {
    // Negative result: x30 consumption for 2000 ticks drives 200 -> ~7
    // but never extincts (refugee recirculation + birth floor). The
    // monitor reports the trajectory; the test pins the measurement.
    const { series, report } = runSoak({
      ticks: 2000,
      seed: 1,
      setup: (w) => { for (const t of w.towns.values()) t.consumes = { food: 30, tools: 6 }; },
    });
    const popEnd = series[series.length - 1].population;
    expect(popEnd / series[0].population).toBeLessThan(0.1);
    expect(popEnd).toBeGreaterThan(0);
    expect(report.flags.map((f) => f.mode)).not.toContain('POPULATION_COLLAPSE');
  }, 120000);

  it('accelerating wealth trips INFINITE_WEALTH; linear profit stays clean', () => {
    const exp = detectDegeneration(synth(10, (i) => ({ wealth: 100 * 1.8 ** i, population: 100, events: i * 20, decisions: i * 2 })));
    expect(exp.flags.map((f) => f.mode)).toContain('INFINITE_WEALTH');
    const linear = detectDegeneration(synth(10, (i) => ({ wealth: 100 + 30 * i, population: 100, events: i * 20, decisions: i * 2 })));
    expect(linear.flags.map((f) => f.mode)).not.toContain('INFINITE_WEALTH');
  });

  it('near-extinction trips POPULATION_COLLAPSE; partial decline does not', () => {
    const extinct = detectDegeneration(synth(10, (i) => ({ population: 200 - i * 25, events: i * 20, decisions: i * 2, wealth: 500 })));
    expect(extinct.flags.map((f) => f.mode)).toContain('POPULATION_COLLAPSE');
    const partial = detectDegeneration(synth(10, (i) => ({ population: 200 - i * 15, events: i * 20, decisions: i * 2, wealth: 500 })));
    expect(partial.flags.map((f) => f.mode)).not.toContain('POPULATION_COLLAPSE');
  });

  it('accelerating log rate trips EVENT_EXPLOSION; steady bookkeeping does not', () => {
    const boom = detectDegeneration(synth(10, (i) => ({ events: i < 5 ? i * 20 : 100 + (i - 5) * 2000, decisions: i * 2, wealth: 500, population: 100 })));
    expect(boom.flags.map((f) => f.mode)).toContain('EVENT_EXPLOSION');
    const steady = detectDegeneration(synth(10, (i) => ({ events: i * 20, decisions: i * 2, wealth: 500, population: 100 })));
    expect(steady.flags.map((f) => f.mode)).not.toContain('EVENT_EXPLOSION');
  });

  it('raid acceleration trips RUNAWAY_RAIDS; flat raiding does not', () => {
    const runaway = detectDegeneration(synth(10, (i) => ({ raids: i < 5 ? i : 5 + (i - 5) * 10, events: i * 20, decisions: i * 2, wealth: 500, population: 100 })));
    expect(runaway.flags.map((f) => f.mode)).toContain('RUNAWAY_RAIDS');
    const flat = detectDegeneration(synth(10, (i) => ({ raids: i, events: i * 20, decisions: i * 2, wealth: 500, population: 100 })));
    expect(flat.flags.map((f) => f.mode)).not.toContain('RUNAWAY_RAIDS');
  });
});
