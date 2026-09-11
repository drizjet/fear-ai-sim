import { describe, it, expect } from '@jest/globals';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';

// NEXT-133: stress-affinity interplay under state noise (CCI-28
// frontier 17). Group-panic susceptibility scales with socialOrientation;
// the affinity ordering must survive deterministic state noise.
describe('NEXT-133: affinity-modulated contagion under noise', () => {
    const BASE = { resilience: 0.5, neuroticism: 0.5, agreeableness: 0.5 };

    // Deterministic LCG: reproducible "sensor noise" without Math.random.
    function lcg(seed) {
        let s = seed >>> 0;
        return () => {
            s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
            return s / 0x100000000;
        };
    }

    function noisyRun(seed, soA, soB, ticks = 60) {
        const c = new CharacterIdentityArchitecture();
        c.registerCharacter('a', { ...BASE, socialOrientation: soA });
        c.registerCharacter('b', { ...BASE, socialOrientation: soB });
        const rnd = lcg(seed);
        let fleeA = 0, fleeB = 0;
        for (let t = 0; t < ticks; t++) {
            // Shared noisy world: both characters see the same jittered
            // channels, so only affinity separates their responses.
            const situation = {
                fear: 0.4 + (rnd() - 0.5) * 0.3,
                perceivedDanger: 0.4 + (rnd() - 0.5) * 0.3,
                urgency: 0.3 + (rnd() - 0.5) * 0.2,
                groupPanic: 0.7 + (rnd() - 0.5) * 0.3
            };
            fleeA += c.tick('a', {}, situation).tendencies.flee;
            fleeB += c.tick('b', {}, situation).tendencies.flee;
        }
        return { meanA: fleeA / ticks, meanB: fleeB / ticks };
    }

    it('1. Neutral affinity reproduces the legacy 0.25 contagion weight', () => {
        const c = new CharacterIdentityArchitecture();
        c.registerCharacter('mid', BASE);
        expect(c.decide('mid').layers.identityGain.contagionGain).toBe(0.25);
    });

    it('2. Contagion gain spans 0.125 to 0.375 across affinity', () => {
        const c = new CharacterIdentityArchitecture();
        c.registerCharacter('hi', { ...BASE, socialOrientation: 1.0 });
        c.registerCharacter('lo', { ...BASE, socialOrientation: 0.0 });
        expect(c.decide('hi').layers.identityGain.contagionGain).toBe(0.375);
        expect(c.decide('lo').layers.identityGain.contagionGain).toBe(0.125);
    });

    it('3. High affinity flees harder and stands less under group panic', () => {
        const c = new CharacterIdentityArchitecture();
        c.registerCharacter('hi', { ...BASE, socialOrientation: 1.0 });
        c.registerCharacter('lo', { ...BASE, socialOrientation: 0.0 });
        c.tick('hi', {}, { groupPanic: 1 });
        c.tick('lo', {}, { groupPanic: 1 });
        const h = c.decide('hi'), l = c.decide('lo');
        expect(h.tendencies.flee).toBeGreaterThan(l.tendencies.flee);
        expect(h.tendencies.stand).toBeLessThan(l.tendencies.stand);
    });

    it('4. Affinity is irrelevant when no peer panic is present', () => {
        const c = new CharacterIdentityArchitecture();
        c.registerCharacter('hi', { ...BASE, socialOrientation: 1.0 });
        c.registerCharacter('lo', { ...BASE, socialOrientation: 0.0 });
        c.tick('hi', {}, { groupPanic: 0, fear: 0.5 });
        c.tick('lo', {}, { groupPanic: 0, fear: 0.5 });
        const h = c.decide('hi'), l = c.decide('lo');
        // helpGain still uses socialOrientation directly; flee/stand match.
        expect(h.tendencies.flee).toBe(l.tendencies.flee);
        expect(h.tendencies.stand).toBe(l.tendencies.stand);
    });

    it('5. Near-neighbor affinity ordering survives state noise', () => {
        for (const seed of [7, 42, 1234]) {
            const { meanA, meanB } = noisyRun(seed, 0.55, 0.45);
            expect(meanA).toBeGreaterThan(meanB);
        }
    });

    it('6. Noisy runs are exactly reproducible', () => {
        expect(noisyRun(99, 0.8, 0.2)).toEqual(noisyRun(99, 0.8, 0.2));
    });
});
