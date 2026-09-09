import { describe, it, expect } from '@jest/globals';
import { ExtensionRegistry } from '../packages/core/index.js';

// Section CIII (NEXT-10): plugin resource budgets. Enforcement is honest
// about the single-threaded limit: an over-budget synchronous call cannot
// be preempted, so the registry detects, reports, and disables — the
// offending tick still pays, later ticks skip the extension.

function burn(ms) {
  const end = performance.now() + ms;
  while (performance.now() < end) { /* intentional busy work */ }
}

describe('CIII: plugin resource budgets', () => {
  it('measures per-extension latency without changing modifiers', () => {
    const r = new ExtensionRegistry();
    r.registerExtension({ name: 'fast', onObserve: () => 0.2 });
    const out = r.evaluateAll({ fear: 0.5 }, {});
    expect(out.modifiers.fast).toBeCloseTo(0.2, 4);
    const health = r.getHealth().find((h) => h.name === 'fast');
    expect(health.latencyMs.count).toBe(1);
    expect(health.latencyMs.max).toBeGreaterThanOrEqual(0);
    expect(health.disabled).toBe(false);
  });

  it('disables a latency hog after the offending tick (detect, report, skip)', () => {
    const r = new ExtensionRegistry({ latencyBudgetMs: 5 });
    r.registerExtension({ name: 'hog', onObserve: () => { burn(30); return 0.4; } });
    const first = r.evaluateAll({}, {});
    // The offending tick still counted (cannot preempt), flagged OVER_BUDGET.
    expect(first.perExtension[0].status).toBe('OVER_BUDGET');
    expect(first.modifiers.hog).toBeCloseTo(0.4, 4);
    // Later ticks skip the hog entirely.
    const second = r.evaluateAll({}, {});
    expect(second.perExtension[0].status).toBe('DISABLED');
    expect(second.modifiers.hog).toBe(0);
    const health = r.getHealth().find((h) => h.name === 'hog');
    expect(health.disabled).toBe(true);
    expect(health.latencyMs.max).toBeGreaterThanOrEqual(25);
    expect(health.contributions).toBe(1);
  });

  it('disables a chronic thrower after N consecutive failures', () => {
    const r = new ExtensionRegistry({ maxConsecutiveFailures: 3 });
    r.registerExtension({ name: 'flaky', onObserve: () => { throw new Error('boom'); } });
    expect(r.evaluateAll({}, {}).perExtension[0].status).toBe('FAILED');
    expect(r.evaluateAll({}, {}).perExtension[0].status).toBe('FAILED');

    const third = r.evaluateAll({}, {});
    expect(third.perExtension[0].status).toBe('DISABLED');
    const fourth = r.evaluateAll({}, {});
    expect(fourth.perExtension[0].status).toBe('DISABLED');
    expect(r.getHealth().find((h) => h.name === 'flaky').failures).toBe(3);
  });
  it('reentrant evaluation fails the extension instead of recursing', () => {
    const r = new ExtensionRegistry();
    r.registerExtension({ name: 'rec', onObserve: () => r.evaluateAll({}, {}) });
    // Inner call throws on the reentrancy flag; the per-extension boundary
    // converts it to FAILED. No unbounded recursion, no hang.
    const out = r.evaluateAll({}, {});
    expect(out.perExtension[0].status).toBe('FAILED');
    // Registry recovers: flag cleared, later ticks proceed.
    r.unregisterExtension('rec');
    r.registerExtension({ name: 'ok', onObserve: () => 0.1 });
    expect(r.evaluateAll({}, {}).modifiers.ok).toBeCloseTo(0.1, 4);
  });

  it('snapshot-mutating extensions fail without corrupting state', () => {
    const r = new ExtensionRegistry();
    const snap = { fear: 0.5, nested: { x: 1 } };
    r.registerExtension({ name: 'mut', onObserve: (s) => { s.fear = 999; s.nested.x = 999; return 0.1; } });
    const out = r.evaluateAll(snap, {});
    expect(out.perExtension[0].status).toBe('FAILED');
    expect(snap.fear).toBe(0.5);
    expect(snap.nested.x).toBe(1);
  });

  it('garbage return values clamp to safe modifiers', () => {
    const r = new ExtensionRegistry();
    r.registerExtension({ name: 'g1', onObserve: () => ({}) });
    r.registerExtension({ name: 'g2', onObserve: () => '999' });
    r.registerExtension({ name: 'g3', onObserve: () => -999 });
    const out = r.evaluateAll({}, {});
    expect(out.modifiers.g1).toBe(0);
    expect(out.modifiers.g2).toBe(0.5);
    expect(out.modifiers.g3).toBe(-0.5);
  });

  it('recovery is explicit: re-enable resumes a healed extension', () => {
    const r = new ExtensionRegistry({ maxConsecutiveFailures: 1 });
    let heal = false;
    r.registerExtension({ name: 'sick', onObserve: () => { if (!heal) throw new Error('sick'); return 0.1; } });
    expect(r.evaluateAll({}, {}).perExtension[0].status).toBe('DISABLED');
    heal = true;
    expect(r.setDisabled('sick', false)).toBe(true);
    const out = r.evaluateAll({}, {});
    expect(out.perExtension[0].status).toBe('OK');
    expect(out.modifiers.sick).toBeCloseTo(0.1, 4);
  });

  it('budgets off by default: slow and failing extensions keep legacy behavior', () => {
    const r = new ExtensionRegistry();
    r.registerExtension({ name: 'slow', onObserve: () => { burn(15); return 0.1; } });
    r.registerExtension({ name: 'bad', onObserve: () => { throw new Error('x'); } });
    for (let i = 0; i < 5; i++) {
      const out = r.evaluateAll({}, {});
      expect(out.perExtension.find((p) => p.name === 'slow').status).toBe('OK');
      expect(out.perExtension.find((p) => p.name === 'bad').status).toBe('FAILED');
    }
    expect(r.getHealth().find((h) => h.name === 'slow').disabled).toBe(false);
  });
});
