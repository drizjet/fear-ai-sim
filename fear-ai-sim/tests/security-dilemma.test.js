/**
 * @file security-dilemma.test.js
 *
 * Section XLVI: defensive mobilization misread as aggression.
 */

import { SecurityDilemmaHarness } from '../packages/core/index.js';

describe('Section XLVI: Security Dilemma', () => {
    test('1. Mutual fear with high misperception spirals without intent', () => {
        const h = new SecurityDilemmaHarness();
        const rep = h.run({ fearA: 0.7, fearB: 0.7, misperceptionA: 0.6, misperceptionB: 0.6, trustAB: 0.1 });
        expect(rep.verdict).toBe('SPIRAL');
        expect(rep.peakA).toBeGreaterThanOrEqual(0.8);
        expect(rep.peakB).toBeGreaterThanOrEqual(0.8);
    });

    test('2. Costly signals arrest the spiral', () => {
        const h = new SecurityDilemmaHarness();
        const blind = h.run({ fearA: 0.6, fearB: 0.6, misperceptionA: 0.5, misperceptionB: 0.5, trustAB: 0.2 });
        const signaled = h.run({ fearA: 0.6, fearB: 0.6, misperceptionA: 0.5, misperceptionB: 0.5, trustAB: 0.2, signals: [true, true, true] });
        expect(signaled.peakA).toBeLessThanOrEqual(blind.peakA);
        expect(signaled.finalMisperception).toBeLessThan(0.5);
    });

    test('3. Trust damps mirroring into stable deterrence', () => {
        const h = new SecurityDilemmaHarness();
        const rep = h.run({ fearA: 0.4, fearB: 0.4, misperceptionA: 0.2, misperceptionB: 0.2, trustAB: 0.8 });
        expect(rep.verdict).not.toBe('SPIRAL');
        expect(rep.peakA).toBeLessThan(0.8);
    });

    test('4. Calm powers de-escalate from low baselines', () => {
        const h = new SecurityDilemmaHarness();
        const rep = h.run({ fearA: 0.1, fearB: 0.1, mobilizationA: 0.3, mobilizationB: 0.3 });
        expect(['DE_ESCALATION', 'STABLE_DETERRENCE']).toContain(rep.verdict);
    });

    test('5. Runs deterministic and audits clean', () => {
        const h = new SecurityDilemmaHarness();
        const cfg = { fearA: 0.5, fearB: 0.6, misperceptionA: 0.4, misperceptionB: 0.3 };
        expect(h.run(cfg)).toEqual(h.run(cfg));
        expect(h.auditImmutability().isClean).toBe(true);
        expect(h.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
