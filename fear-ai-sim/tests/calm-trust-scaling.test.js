import { describe, it, expect } from '@jest/globals';
import { ContagionGraph } from '../packages/core/index.js';

// NEXT-166 (post-25 candidate 6): leader-calming trust scaling. The
// NEXT-155 trust gain covered fear transmission only; calm-leader
// reassurance ignored trust. Opt-in calmTrustGain (default 0 is legacy)
// scales leaderCalm by focal trust in the calming leader, mirroring the
// fear-path ratios.
const FOCAL = { id: 'focal', x: 0, y: 0 };
const leader = (id, trust) => ({
    id, x: 10, y: 0, fearBand: 'CALM', leadership: 0.8,
    ...(trust === undefined ? {} : { trust }),
});

describe('NEXT-166: leader-calming trust scaling', () => {
    it('1. Legacy default ignores trust in the calming path', () => {
        const c = new ContagionGraph();
        const neutral = c.evaluateContagion(FOCAL, [leader('L')]).leaderCalm;
        expect(c.evaluateContagion(FOCAL, [leader('L', 1)]).leaderCalm).toBe(neutral);
        expect(c.evaluateContagion(FOCAL, [leader('L', -1)]).leaderCalm).toBe(neutral);
    });

    it('2. Trusted leaders calm harder, distrusted ones weaker', () => {
        const c = new ContagionGraph({ calmTrustGain: 0.6 });
        const neutral = c.evaluateContagion(FOCAL, [leader('L', 0)]).leaderCalm;
        const trusted = c.evaluateContagion(FOCAL, [leader('L', 1)]).leaderCalm;
        const distrusted = c.evaluateContagion(FOCAL, [leader('L', -1)]).leaderCalm;
        expect(trusted).toBeGreaterThan(neutral);
        expect(neutral).toBeGreaterThan(distrusted);
        expect(trusted).toBeCloseTo(neutral * 1.3, 10);
        expect(distrusted).toBeCloseTo(neutral * 0.7, 10);
    });

    it('3. Fear and calm gains compose independently', () => {
        const c = new ContagionGraph({ trustGain: 0.6, calmTrustGain: 0.6 });
        const peers = [
            { id: 'p', x: -10, y: 0, isPanicking: true, trust: 1 },
            leader('L', -1),
        ];
        const r = c.evaluateContagion(FOCAL, peers);
        const fearOnly = new ContagionGraph({ trustGain: 0.6 }).evaluateContagion(FOCAL, peers);
        const calmOnly = new ContagionGraph({ calmTrustGain: 0.6 }).evaluateContagion(FOCAL, peers);
        expect(r.contagionFear).toBe(fearOnly.contagionFear);
        expect(r.leaderCalm).toBe(calmOnly.leaderCalm);
    });

    it('4. Malformed trust reads as neutral and clamps safely', () => {
        const c = new ContagionGraph({ calmTrustGain: 0.6 });
        const neutral = c.evaluateContagion(FOCAL, [leader('L', 0)]).leaderCalm;
        for (const bad of [NaN, Infinity, 'high', null]) {
            expect(c.evaluateContagion(FOCAL, [leader('L', bad)]).leaderCalm).toBe(neutral);
        }
        expect(c.evaluateContagion(FOCAL, [leader('L', 5)]).leaderCalm)
            .toBe(c.evaluateContagion(FOCAL, [leader('L', 1)]).leaderCalm);
        expect(Number.isFinite(neutral)).toBe(true);
    });

    it('5. Calming runs replay exactly', () => {
        const run = () => new ContagionGraph({ calmTrustGain: 0.6 })
            .evaluateContagion(FOCAL, [leader('L', 0.5)]).leaderCalm;
        expect(run()).toBe(run());
    });
});
