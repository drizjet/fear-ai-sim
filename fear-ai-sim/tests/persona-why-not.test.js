import { describe, it, expect } from '@jest/globals';
import { CharacterIdentityArchitecture, attributeGain, IDENTITY_GAIN_WEIGHTS } from '../packages/core/index.js';
import { WhyNotExplainer } from '../packages/core/index.js';

// NEXT-146: persona-trait why-not answers (audit candidate 10).
// Opt-in identity lets explainIdentity name the strongest supporting
// and dragging traits behind a rejected action's gain, derived from
// the same coefficients as decide().
describe('NEXT-146: trait-level why-not attribution', () => {
    const cia = new CharacterIdentityArchitecture();
    cia.registerCharacter('guard', {
        resilience: 0.9, conscientiousness: 0.6, loyalty: 0.7, neuroticism: 0.2,
        duty: 1.0, agreeableness: 0.5, openness: 0.4, extraversion: 0.5,
        leadership: 0.4, riskTolerance: 0.6, socialOrientation: 0.5
    });
    const identity = cia.identityFor('guard');
    const frame = cia.decide('guard');
    const explainer = new WhyNotExplainer();

    it('1. Coefficient table reproduces decide gains exactly', () => {
        const gainOf = (action) => {
            const w = IDENTITY_GAIN_WEIGHTS[action];
            let s = w.base;
            for (const [t, k] of Object.entries(w)) {
                if (t === 'base') continue;
                s += (t === 'duty' ? identity[t] - 0.5 : identity[t]) * k;
            }
            return Math.round(Math.max(0, Math.min(1, s)) * 10000) / 10000;
        };
        expect(gainOf('stand')).toBe(frame.layers.identityGain.standGain);
        expect(gainOf('flee')).toBe(frame.layers.identityGain.fleeGain);
        expect(gainOf('help')).toBe(frame.layers.identityGain.helpGain);
    });

    it('2. Attribution ranks the real contributors behind stand', () => {
        const a = attributeGain('stand', identity);
        expect(a.supporter).toBe('resilience');
        expect(a.supporterValue).toBeCloseTo(0.36, 6);
        expect(a.contributions.duty).toBeCloseTo(0.15, 6);
        expect(a.drag).toBe('neuroticism');
    });

    it('3. Why-not answers cite traits only when identity is provided', () => {
        const asked = frame.topIntent === 'stand' ? 'flee' : 'stand';
        const plain = explainer.explainIdentity(frame, asked);
        expect(plain.traitAttribution).toBeNull();
        expect(plain.answer).not.toMatch(/supports .* most/);
        const attributed = explainer.explainIdentity(frame, asked, identity);
        expect(attributed.traitAttribution.supporter).toBe(attributeGain(asked, identity).supporter);
        expect(attributed.answer).toMatch(/supports .* most/);
        expect(attributed.answer).toMatch(/drags it most/);
        // Margin and layer attribution unchanged by the trait note.
        expect(attributed.margin).toBe(plain.margin);
        expect(attributed.blockingLayer).toBe(plain.blockingLayer);
    });

    it('4. Coward persona attributes flee to neuroticism', () => {
        const c = new CharacterIdentityArchitecture();
        c.registerCharacter('coward', { neuroticism: 1.0, resilience: 0.0, riskTolerance: 0.0 });
        const a = attributeGain('flee', c.identityFor('coward'));
        expect(a.supporter).toBe('neuroticism');
        expect(a.supporterValue).toBeCloseTo(0.4, 6);
    });

    it('5. Unknown actions fail loudly', () => {
        expect(() => attributeGain('nap', identity)).toThrow(/UNKNOWN_ACTION/);
    });

    it('6. Attribution is exactly reproducible', () => {
        expect(attributeGain('rally', identity)).toEqual(attributeGain('rally', identity));
    });
});
