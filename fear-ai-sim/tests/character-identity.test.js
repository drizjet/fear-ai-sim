/**
 * @file character-identity.test.js
 *
 * Sections VI-VII: three-layer identity architecture.
 */

import { CharacterIdentityArchitecture, IDENTITY_TRAITS } from '../packages/core/index.js';

describe('Sections VI-VII: Character Identity Architecture', () => {
    test('1. Layers separate: identity frozen, adaptive bounded, state volatile', () => {
        const arch = new CharacterIdentityArchitecture();
        arch.registerCharacter('guard', { neuroticism: 0.3, resilience: 0.8, loyalty: 0.9 });
        const before = arch.identityFor('guard');
        arch.tick('guard', { trauma: 0.5 }, { fear: 0.9 });
        const after = arch.identityFor('guard');
        expect(after).toEqual(before);
        expect(arch.adaptiveFor('guard').trauma).toBeLessThanOrEqual(0.05);
        expect(() => arch.registerCharacter('guard', {})).toThrow();
    });

    test('2. Identity constrains without dictating: brave stands, coward flees, both shift under extreme threat', () => {
        const arch = new CharacterIdentityArchitecture();
        arch.registerCharacter('brave', { neuroticism: 0.15, resilience: 0.9, riskTolerance: 0.7 });
        arch.registerCharacter('coward', { neuroticism: 0.85, resilience: 0.15, riskTolerance: 0.2 });
        const calmBrave = arch.tick('brave', {}, { fear: 0.2, perceivedDanger: 0.2 });
        const calmCoward = arch.tick('coward', {}, { fear: 0.2, perceivedDanger: 0.2 });
        expect(calmBrave.topIntent).not.toBe('flee');
        expect(calmCoward.tendencies.flee).toBeGreaterThan(calmBrave.tendencies.flee);
        const doomed = arch.tick('brave', { trauma: 0.05 }, { fear: 1, perceivedDanger: 1, urgency: 1 });
        expect(doomed.tendencies.flee).toBeGreaterThan(calmBrave.tendencies.flee);
    });

    test('3. Leader panics internally while holding duty', () => {
        const arch = new CharacterIdentityArchitecture();
        arch.registerCharacter('captain', { neuroticism: 0.4, resilience: 0.8, leadership: 0.95, loyalty: 0.9 });
        const frame = arch.tick('captain', {}, { fear: 0.85, perceivedDanger: 0.8, urgency: 0.7 });
        expect(frame.layers.statePressure).toBeGreaterThan(0.5);
        expect(frame.tendencies.rally).toBeGreaterThan(0.3);
        expect(frame.rankedIntents.length).toBe(5);
    });

    test('4. Adaptive drift stays bounded under sustained pressure', () => {
        const arch = new CharacterIdentityArchitecture();
        arch.registerCharacter('veteran', { neuroticism: 0.5, resilience: 0.5 });
        for (let t = 0; t < 200; t++) arch.tick('veteran', { trauma: 0.05 }, { fear: 0.8 });
        expect(arch.drift('veteran')).toBeLessThan(0.45);
        expect(arch.auditImmutability().isClean).toBe(true);
        expect(arch.auditImmutability().hostPhysicsMutations).toBe(0);
    });

    test('5. Unknown characters and invalid inputs fail loudly', () => {
        const arch = new CharacterIdentityArchitecture();
        expect(() => arch.tick('ghost', {}, {})).toThrow(/UNKNOWN_CHARACTER/);
        expect(arch.identityFor('ghost')).toBe(null);
        expect(IDENTITY_TRAITS.length).toBeGreaterThanOrEqual(10);
    });
});
