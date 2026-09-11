import { describe, it, expect } from '@jest/globals';
import { ContagionGraph } from '../packages/core/index.js';

// NEXT-155 (audit candidate 20): peer-trust contagion paths.
// Focal-agent trust in a peer scales that peer's fear transmission
// (opt-in peer.trust in [-1, 1] plus trustGain; default 0 is legacy).
const FOCAL = { id: 'focal', x: 0, y: 0, traits: { extraversion: 0.5, neuroticism: 0.5 } };
const panicker = (id, trust) => ({ id, x: 10, y: 0, isPanicking: true, ...(trust === undefined ? {} : { trust }) });

describe('NEXT-155: peer-trust contagion paths', () => {
    it('1. Legacy default ignores the trust field', () => {
        const c = new ContagionGraph();
        const neutral = c.evaluateContagion(FOCAL, [panicker('p')]).contagionFear;
        const trusted = c.evaluateContagion(FOCAL, [panicker('p', 1)]).contagionFear;
        const distrusted = c.evaluateContagion(FOCAL, [panicker('p', -1)]).contagionFear;
        expect(trusted).toBe(neutral);
        expect(distrusted).toBe(neutral);
    });

    it('2. Trusted panickers transmit harder, distrusted ones weaker', () => {
        const c = new ContagionGraph({ trustGain: 0.6 });
        const neutral = c.evaluateContagion(FOCAL, [panicker('p', 0)]).contagionFear;
        const trusted = c.evaluateContagion(FOCAL, [panicker('p', 1)]).contagionFear;
        const distrusted = c.evaluateContagion(FOCAL, [panicker('p', -1)]).contagionFear;
        expect(trusted).toBeGreaterThan(neutral);
        expect(neutral).toBeGreaterThan(distrusted);
        expect(trusted).toBeCloseTo(neutral * 1.3, 10);
        expect(distrusted).toBeCloseTo(neutral * 0.7, 10);
    });

    it('3. Dominant source follows the trusted peer on otherwise equal impact', () => {
        const c = new ContagionGraph({ trustGain: 0.6 });
        const r = c.evaluateContagion(FOCAL, [panicker('stranger', -1), panicker('friend', 1)]);
        expect(r.dominantSourceId).toBe('friend');
    });

    it('4. Malformed trust reads as neutral and clamps safely', () => {
        const c = new ContagionGraph({ trustGain: 0.6 });
        const neutral = c.evaluateContagion(FOCAL, [panicker('p', 0)]).contagionFear;
        for (const bad of [NaN, Infinity, 5, -5, 'high', null]) {
            const got = c.evaluateContagion(FOCAL, [panicker('p', bad)]).contagionFear;
            if (typeof bad !== 'number' || !Number.isFinite(bad)) {
                expect(got).toBe(neutral);
            } else {
                const clamped = c.evaluateContagion(FOCAL, [panicker('p', Math.sign(bad))]).contagionFear;
                expect(got).toBe(clamped);
            }
        }
        expect(Number.isFinite(c.evaluateContagion(FOCAL, [panicker('p', 1)]).contagionFear)).toBe(true);
    });

    it('5. Trust gain composes with the trauma amplifier', () => {
        const c = new ContagionGraph({ trustGain: 0.6, traumaAmplifier: 0.5 });
        const peer = { id: 'p', x: 10, y: 0, isPanicking: true, trust: 1, traumaLoad: 1 };
        const both = c.evaluateContagion(FOCAL, [peer]).contagionFear;
        const plain = new ContagionGraph().evaluateContagion(FOCAL, [{ id: 'p', x: 10, y: 0, isPanicking: true }]).contagionFear;
        expect(both).toBeCloseTo(plain * 1.5 * 1.3, 10);
    });
});
