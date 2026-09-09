/**
 * @file functional-persona-signatures.test.js
 *
 * Sections VIII-XIII: response functions, near-neighbors, confusion, collapse.
 */

import { FunctionalPersonaSignatures, evaluateResponseFunctions } from '../packages/core/index.js';

const BRAVE = { neuroticism: 0.15, resilience: 0.9, agreeableness: 0.6, openness: 0.5, extraversion: 0.6, leadership: 0.7, riskTolerance: 0.75, conscientiousness: 0.7 };
const TIMID = { neuroticism: 0.85, resilience: 0.15, agreeableness: 0.6, openness: 0.4, extraversion: 0.35, leadership: 0.25, riskTolerance: 0.2, conscientiousness: 0.5 };

describe('Sections VIII-XIII: Functional Persona Signatures', () => {
    test('1. Reaction curves separate cartoon archetypes by shape', () => {
        const fps = new FunctionalPersonaSignatures();
        expect(fps.distance(BRAVE, TIMID)).toBeGreaterThan(0.1);
        const sig = fps.signatureFor(BRAVE);
        expect(Object.keys(sig.auc).length).toBe(11);
        expect(evaluateResponseFunctions(BRAVE, 1).panicThreat).toBeLessThan(evaluateResponseFunctions(TIMID, 1).panicThreat);
        expect(evaluateResponseFunctions(BRAVE, 0.5).helpRisk).toBeGreaterThan(0.2);
    });

    test('2. Near-neighbor personas discriminate above noise', () => {
        const fps = new FunctionalPersonaSignatures();
        const base = { ...BRAVE };
        const neighbor = { ...BRAVE, neuroticism: 0.25 };
        const d = fps.distance(base, neighbor);
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(fps.distance(BRAVE, TIMID));
        const id = fps.identify(base, [{ id: 'self', traits: base }, { id: 'neighbor', traits: neighbor }]);
        expect(id.predictedId).toBe('self');
        expect(id.margin).toBeGreaterThanOrEqual(0);
        expect(id.strongestDiscriminator.function).not.toBe(null);
    });

    test('3. Confusion analysis names runner-up and discriminator', () => {
        const fps = new FunctionalPersonaSignatures();
        const pop = [
            { id: 'brave', traits: BRAVE },
            { id: 'timid', traits: TIMID },
            { id: 'mid', traits: { ...BRAVE, neuroticism: 0.5, resilience: 0.5 } }
        ];
        const res = fps.identify({ ...BRAVE, neuroticism: 0.18 }, pop);
        expect(res.predictedId).toBe('brave');
        expect(res.runnerUpId).not.toBe(null);
        expect(res.strongestDiscriminator.gap).toBeGreaterThanOrEqual(0);
        expect(() => fps.identify(BRAVE, [])).toThrow();
    });

    test('4. Collapse score flags flatliners, clears distinct personas', () => {
        const fps = new FunctionalPersonaSignatures();
        const pop = fps.generatePopulation(60, 7);
        const distinct = fps.collapseScore(BRAVE, pop);
        expect(distinct).toBeGreaterThan(0.15);
        const flat = fps.collapseScore({ neuroticism: 0.5, resilience: 0.5, agreeableness: 0.5, openness: 0.5, extraversion: 0.5, leadership: 0.5, riskTolerance: 0.5, conscientiousness: 0.5 }, pop);
        expect(flat).toBeLessThan(distinct);
        expect(() => fps.collapseScore(BRAVE, [{ id: 'one', traits: BRAVE }])).toThrow();
    });

    test('5. Population generation deterministic and bounded', () => {
        const fps = new FunctionalPersonaSignatures();
        const a = fps.generatePopulation(100, 99);
        const b = fps.generatePopulation(100, 99);
        expect(a).toEqual(b);
        expect(a.length).toBe(100);
        expect(() => fps.generatePopulation(0)).toThrow();
        expect(fps.auditImmutability().isClean).toBe(true);
        expect(fps.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
