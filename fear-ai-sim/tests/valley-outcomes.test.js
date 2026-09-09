/**
 * @file valley-outcomes.test.js
 *
 * Sections CCX-CCXI + LXXII: seed distributions and soak guard.
 */

import { ValleyOutcomeDistribution } from '../packages/core/index.js';
import { FrontierValleySimulation } from '../packages/core/index.js';

describe('Sections CCX-CCXI + LXXII: Valley Outcomes', () => {
    test('1. Same seeds reproduce identical distributions', () => {
        const v = new ValleyOutcomeDistribution();
        const a = v.analyze({ seeds: [11, 22, 33], ticks: 30 });
        const b = v.analyze({ seeds: [11, 22, 33], ticks: 30 });
        expect(a).toEqual(b);
        expect(a.seeds).toEqual([11, 22, 33]);
    });

    test('2. Live valley advances deterministically via fork', () => {
        const sim = new FrontierValleySimulation({ seed: 5 });
        sim.advance(25);
        const forked = sim.fork();
        const a = sim.advance(25);
        const b = forked.advance(25);
        expect(a).toEqual(b);
    });

    test('3. Degeneracy analysis covers the seed set without crashing', () => {
        const v = new ValleyOutcomeDistribution();
        const rep = v.analyze({ seeds: [11, 22, 33, 44, 55], ticks: 50 });
        expect(rep.degeneracy.degenerate).toBe(false);
        expect(rep.degeneracy.flags).toEqual([]);
        expect(rep.distinctOutcomes).toBeGreaterThanOrEqual(1);
    });

    test('4. Longer horizons stay bounded (mini soak)', () => {
        const sim = new FrontierValleySimulation({ seed: 9 });
        const summary = sim.advance(500);
        expect(Number.isFinite(summary.meanPopulationFear)).toBe(true);
        expect(summary.ticksExecuted).toBe(500);
        expect(summary.panicIncidents).toBeGreaterThanOrEqual(0);
    });

    test('5. Audits stay clean', () => {
        const v = new ValleyOutcomeDistribution();
        v.analyze({ seeds: [1], ticks: 5 });
        expect(v.auditImmutability().isClean).toBe(true);
        expect(v.auditImmutability().analyses).toBe(1);
        expect(v.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
