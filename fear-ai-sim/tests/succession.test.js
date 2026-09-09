/**
 * @file succession.test.js
 *
 * Section XXXVII: leader loss selects heirs with visible costs.
 */

import { SuccessionEngine } from '../packages/core/index.js';
const HEIRS = [
    { id: 'crown_prince', legitimacy: 0.9, competence: 0.3, popularity: 0.6, continuity: 0.8 },
    { id: 'warlord', legitimacy: 0.45, competence: 0.9, popularity: 0.5, continuity: 0.3 },
    { id: 'populist', legitimacy: 0.4, competence: 0.4, popularity: 0.95, continuity: 0.5 }
];

describe('Section XXXVII: Succession', () => {
    test('1. Autocracy crowns legitimacy, junta crowns competence', () => {
        const eng = new SuccessionEngine();
        const aut = eng.resolve({ factionId: 'f1', cause: 'NATURAL_DEATH', archetype: 'AUTOCRATIC_DESPOT', candidates: HEIRS });
        expect(aut.successorId).toBe('crown_prince');
        const junta = eng.resolve({ factionId: 'f1', cause: 'NATURAL_DEATH', archetype: 'MILITARY_JUNTA', candidates: HEIRS });
        expect(junta.successorId).toBe('warlord');
    });

    test('2. Assassination wounds cohesion more than natural death', () => {
        const eng = new SuccessionEngine();
        const calm = eng.resolve({ cause: 'NATURAL_DEATH', archetype: 'TRIBAL_CONSENSUS', candidates: HEIRS });
        const bloody = eng.resolve({ cause: 'ASSASSINATION', archetype: 'TRIBAL_CONSENSUS', candidates: HEIRS });
        expect(bloody.cohesionDelta).toBeLessThan(calm.cohesionDelta);
        expect(bloody.moraleDelta).toBeLessThan(calm.moraleDelta);
    });

    test('3. Contested outcomes raise splinter risk', () => {
        const eng = new SuccessionEngine();
        const twins = [
            { id: 'a', legitimacy: 0.6, competence: 0.6, popularity: 0.6, continuity: 0.6 },
            { id: 'b', legitimacy: 0.61, competence: 0.6, popularity: 0.6, continuity: 0.6 }
        ];
        const rep = eng.resolve({ cause: 'DEATH_IN_BATTLE', candidates: twins });
        expect(rep.margin).toBeLessThan(0.1);
        expect(rep.splinterRisk).toBeGreaterThan(0.3);
    });

    test('4. No heir means interregnum with cratering cohesion', () => {
        const eng = new SuccessionEngine();
        const rep = eng.resolve({ factionId: 'f9', cause: 'ASSASSINATION', candidates: [] });
        expect(rep.interregnum).toBe(true);
        expect(rep.successorId).toBe(null);
        expect(rep.splinterRisk).toBeGreaterThan(0.7);
        expect(rep.cohesionDelta).toBeLessThan(-0.3);
    });

    test('5. Bad inputs fail loudly and audits stay clean', () => {
        const eng = new SuccessionEngine();
        expect(() => eng.resolve({ cause: 'OLD_AGE', candidates: HEIRS })).toThrow(/UNKNOWN_SUCCESSION_CAUSE/);
        expect(() => eng.resolve({ cause: 'CAPTURE', candidates: [{ competence: 1 }] })).toThrow(/CANDIDATE_MISSING_ID/);
        expect(eng.auditImmutability().isClean).toBe(true);
        expect(eng.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
