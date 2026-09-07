import { describe, it, expect } from '@jest/globals';
import {
    FPS_SPEC,
    extractThreatAppraisalResponse,
    extractRecoveryResponse,
    extractSocialResponse,
    extractAltruismResponse,
    extractDisciplineResponse,
    extractCuriosityResponse,
    extractReferenceFPS,
    extractObservationalFPS,
    runAgentInScenarioFPS
} from '../benchmarks/behavioral-evaluation/fabe_functional_persona_signatures.mjs';
import { CANONICAL_ARCHETYPES } from '../benchmarks/behavioral-evaluation/fabe_v2_benchmark.mjs';
import { SCENARIO_FAMILIES } from '../benchmarks/behavioral-evaluation/cross_scenario_invariance_benchmark.mjs';

describe('FABE Functional Persona Signatures (FPS v1)', () => {
    const cowardly = CANONICAL_ARCHETYPES.find(a => a.id === 'cowardly_civilian');
    const stoic = CANONICAL_ARCHETYPES.find(a => a.id === 'stoic_veteran');
    const follower = CANONICAL_ARCHETYPES.find(a => a.id === 'compliant_follower');
    const watcher = CANONICAL_ARCHETYPES.find(a => a.id === 'paranoid_watcher');
    const scholar = CANONICAL_ARCHETYPES.find(a => a.id === 'curious_scholar');

    it('defines FPS_SPEC with 6 surfaces and 10 parameters', () => {
        expect(FPS_SPEC.surfacesCount).toBe(6);
        expect(FPS_SPEC.signatureDimension).toBe(10);
        expect(FPS_SPEC.parameterNames).toHaveLength(10);
    });

    describe('Surface 1: Threat-Appraisal Sensitivity', () => {
        it('measures D50 distance threshold and threat gain', () => {
            const respCowardly = extractThreatAppraisalResponse(cowardly);
            const respStoic = extractThreatAppraisalResponse(stoic);

            expect(respCowardly.d50).toBeGreaterThanOrEqual(20);
            expect(respStoic.d50).toBeLessThanOrEqual(5);
            expect(respCowardly.threatGain).toBeGreaterThan(respStoic.threatGain);
        });
    });

    describe('Surface 2: Recovery Dynamics & Half-Life', () => {
        it('verifies stoic veteran decays faster than cowardly civilian', () => {
            const recStoic = extractRecoveryResponse(stoic);
            const recCowardly = extractRecoveryResponse(cowardly);

            expect(recStoic.tauHalf).toBeLessThan(recCowardly.tauHalf);
            expect(recStoic.tauCalm).toBeLessThan(recCowardly.tauCalm);
            expect(recStoic.empiricalLambda).toBeLessThan(recCowardly.empiricalLambda);
        });
    });

    describe('Surface 3: Social Contagion & Reassurance', () => {
        it('verifies compliant follower has strong leader reassurance response', () => {
            const socFollower = extractSocialResponse(follower);
            const socCowardly = extractSocialResponse(cowardly);

            expect(socFollower.betaReassure).toBeGreaterThan(0.3);
            expect(socCowardly.betaSocial).toBeGreaterThan(0.5);
        });
    });

    describe('Surface 4: Altruism Response Function', () => {
        it('verifies agreeable archetypes exhibit pro-social intents while selfish ones do not', () => {
            const altFollower = extractAltruismResponse(follower);
            const altCowardly = extractAltruismResponse(cowardly);

            expect(altFollower.altruismRate).toBeGreaterThan(0.5);
            expect(altCowardly.altruismRate).toBe(0.0);
        });
    });

    describe('Surface 5: Tactical Discipline Retention', () => {
        it('verifies high conscientiousness persona confronts at point blank instead of flailing', () => {
            const discWatcher = extractDisciplineResponse(watcher);
            const discCowardly = extractDisciplineResponse(cowardly);

            expect(discWatcher.cqbConfrontRate).toBeGreaterThan(0.5);
            expect(discCowardly.cqbConfrontRate).toBe(0.0);
            expect(discCowardly.flailRate).toBeGreaterThan(0.5);
        });
    });

    describe('Surface 6: Curiosity Under Ambiguity', () => {
        it('verifies curious scholar investigates faint sounds while cowardly ignores them', () => {
            const curScholar = extractCuriosityResponse(scholar);
            const curCowardly = extractCuriosityResponse(cowardly);

            expect(curScholar.acousticSensitivity).toBeGreaterThan(0.7);
            expect(curCowardly.acousticSensitivity).toBe(0.0);
        });
    });

    describe('Combined Reference FPS Extraction', () => {
        it('extracts a normalized 10-dimensional vector in [0, 1]', () => {
            for (const persona of CANONICAL_ARCHETYPES) {
                const sig = extractReferenceFPS(persona);
                expect(sig).toHaveLength(10);
                for (let i = 0; i < sig.length; i++) {
                    expect(Number.isFinite(sig[i])).toBe(true);
                    expect(sig[i]).toBeGreaterThanOrEqual(0.0);
                    expect(sig[i]).toBeLessThanOrEqual(1.0);
                }
            }
        });

        it('is strictly deterministic across repeated invocations', () => {
            const sig1 = extractReferenceFPS(stoic);
            const sig2 = extractReferenceFPS(stoic);
            expect(sig1).toEqual(sig2);
        });
    });

    describe('Observational FPS Extraction from Scenario Trace', () => {
        it('extracts bounded 10D functional signature from uncontrolled scenario run', () => {
            const scenario = SCENARIO_FAMILIES[0];
            const { rawVector, obsFpsVector } = runAgentInScenarioFPS(stoic, scenario, 1337);

            expect(rawVector).toHaveLength(8);
            expect(obsFpsVector).toHaveLength(10);
            for (let i = 0; i < obsFpsVector.length; i++) {
                expect(Number.isFinite(obsFpsVector[i])).toBe(true);
                expect(obsFpsVector[i]).toBeGreaterThanOrEqual(0.0);
                expect(obsFpsVector[i]).toBeLessThanOrEqual(1.0);
            }
        });
    });
});
