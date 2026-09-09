/**
 * @file moral-dissonance-engine.test.js
 * 
 * Unit and integration tests for Frontier B / Sections 141–145:
 * Dynamic Moral Alignment, Cognitive Dissonance, Guilt Accumulation & Moral Injury Engine.
 */

import {
    MoralDissonanceEngine,
    MORAL_FOUNDATIONS,
    DEFAULT_MORAL_PROFILES,
    TRANSGRESSION_TYPES,
    ATONEMENT_TYPES,
    AffectiveAgent
} from '../packages/core/index.js';

describe('Frontier B / Sections 141–145: Moral Alignment, Cognitive Dissonance & Moral Injury Engine', () => {
    let engine;

    beforeEach(() => {
        engine = new MoralDissonanceEngine({
            seed: 133742,
            decayRate: 0.005,
            severeGuiltThreshold: 0.75,
            injuryThresholdTicks: 50
        });
    });

    test('1. Moral foundation profiles modulate cognitive dissonance for identical transgressions', () => {
        engine.registerAgentMoralProfile('guardian_01', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
        engine.registerAgentMoralProfile('utilitarian_01', DEFAULT_MORAL_PROFILES.COLD_UTILITARIAN);

        const resGuardian = engine.computeDissonance('guardian_01', TRANSGRESSION_TYPES.EXECUTE_DEFENSELESS);
        const resUtilitarian = engine.computeDissonance('utilitarian_01', TRANSGRESSION_TYPES.EXECUTE_DEFENSELESS);

        expect(resGuardian.rawDissonance).toBeGreaterThan(resUtilitarian.rawDissonance);
        expect(resGuardian.netDissonance).toBeGreaterThan(0.50);
        expect(resGuardian.foundationBreakdown[MORAL_FOUNDATIONS.CARE]).toBeGreaterThan(
            resUtilitarian.foundationBreakdown[MORAL_FOUNDATIONS.CARE]
        );
    });

    test('2. Contextual rationalization mitigates immediate dissonance but leaves residual guilt', () => {
        engine.registerAgentMoralProfile('soldier_01', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);

        const calmCalc = engine.computeDissonance('soldier_01', TRANSGRESSION_TYPES.ABANDON_COMRADE, {
            fear: 0.0,
            isDirectOrder: false
        });

        const panickedCalc = engine.computeDissonance('soldier_01', TRANSGRESSION_TYPES.ABANDON_COMRADE, {
            fear: 0.90,
            isDirectOrder: true
        });

        expect(panickedCalc.rationalization.total).toBeGreaterThan(calmCalc.rationalization.total);
        expect(panickedCalc.netDissonance).toBeLessThan(calmCalc.netDissonance);
        // Even under extreme panic and direct orders, net dissonance is strictly positive (residual guilt)
        expect(panickedCalc.netDissonance).toBeGreaterThan(0.15);
    });

    test('3. Continuous guilt integration and passive temporal decay follow differential dynamics', () => {
        engine.registerAgentMoralProfile('scout_01', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);

        const rep = engine.recordTransgression('scout_01', TRANSGRESSION_TYPES.LOOT_SETTLEMENT);
        const g0 = rep.currentGuilt;
        expect(g0).toBeGreaterThan(0.30);

        // Advance 30 ticks
        engine.tick(30);

        const stateAfter30 = engine.getAgentMoralState('scout_01');
        expect(stateAfter30.guilt).toBeLessThan(g0);
        expect(stateAfter30.guilt).toBeGreaterThan(0);
        // Exponential decay verification: G_t = G_0 * (1 - 0.005)^30 approx G_0 * 0.860
        const expectedRatio = Math.pow(1.0 - 0.005, 30);
        expect(stateAfter30.guilt / g0).toBeCloseTo(expectedRatio, 2);
    });

    test('4. Prolonged severe guilt triggers irreversible Moral Injury and character remodeling', () => {
        engine.registerAgentMoralProfile('knight_01', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);

        // Drive guilt above severe threshold (0.75)
        engine.recordTransgression('knight_01', TRANSGRESSION_TYPES.EXECUTE_DEFENSELESS);
        engine.recordTransgression('knight_01', TRANSGRESSION_TYPES.BREAK_SWORN_TREATY);
        engine.recordTransgression('knight_01', TRANSGRESSION_TYPES.LOOT_SETTLEMENT);

        let state = engine.getAgentMoralState('knight_01');
        expect(state.guilt).toBeGreaterThanOrEqual(0.75);
        expect(state.moralInjury).toBe(false);

        // Advance 40 ticks - still under injury threshold (50 ticks)
        engine.tick(40);
        state = engine.getAgentMoralState('knight_01');
        expect(state.consecutiveSevereTicks).toBe(40);
        expect(state.moralInjury).toBe(false);

        // Advance 15 more ticks (total 55 >= 50) -> triggers Moral Injury
        const tickRes = engine.tick(15);
        expect(tickRes.injuredAgentsCount).toBe(1);

        state = engine.getAgentMoralState('knight_01');
        expect(state.moralInjury).toBe(true);
        expect(state.personalityDeltas.neuroticism).toBeCloseTo(0.15, 2);
        expect(state.personalityDeltas.agreeableness).toBeCloseTo(-0.20, 2);
        expect(state.personalityDeltas.dominance).toBeCloseTo(-0.15, 2);

        // Affective agent modulation test
        const agent = new AffectiveAgent('knight_01', {}, { x: 0, y: 0, z: 0 });
        agent.valence = 0.80;
        engine.applyMoralAffectModulation('knight_01', agent);
        // Moral injury enforces valence ceiling of 0.40
        expect(agent.valence).toBeLessThanOrEqual(0.40);
    });

    test('5. Restorative atonement relieves guilt and restores psychological equilibrium', () => {
        engine.registerAgentMoralProfile('penitent_01', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);

        engine.recordTransgression('penitent_01', TRANSGRESSION_TYPES.ABANDON_COMRADE);
        const stateBefore = engine.getAgentMoralState('penitent_01');
        const gBefore = stateBefore.guilt;

        const atoneRep = engine.recordAtonement('penitent_01', ATONEMENT_TYPES.DEFEND_THE_HELPLESS);
        expect(atoneRep.reliefAmount).toBe(0.35);

        const stateAfter = engine.getAgentMoralState('penitent_01');
        expect(stateAfter.guilt).toBeCloseTo(Math.max(0, gBefore - 0.35), 3);
        expect(stateAfter.historyCount).toBe(2);
    });

    test('6. Moral defiance accurately evaluates refusal probability against unethical orders', () => {
        // Agent A: Uninjured, low guilt, high authority deference
        engine.registerAgentMoralProfile('obedient_soldier', DEFAULT_MORAL_PROFILES.ZEALOUS_CRUSADER);

        // Agent B: Morally injured, high guilt
        engine.registerAgentMoralProfile('traumatized_veteran', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
        engine.recordTransgression('traumatized_veteran', TRANSGRESSION_TYPES.EXECUTE_DEFENSELESS);
        engine.recordTransgression('traumatized_veteran', TRANSGRESSION_TYPES.LOOT_SETTLEMENT);
        engine.tick(55); // Trigger moral injury

        const evalA = engine.evaluateOrderCompliance('obedient_soldier', TRANSGRESSION_TYPES.LOOT_SETTLEMENT);
        const evalB = engine.evaluateOrderCompliance('traumatized_veteran', TRANSGRESSION_TYPES.LOOT_SETTLEMENT);

        expect(evalA.refusalProbability).toBeLessThan(0.35);
        expect(evalB.refusalProbability).toBeGreaterThan(0.70);
        expect(evalB.moralInjury).toBe(true);
        expect(evalB.rationale).toContain('Moral Defiance');
    });

    test('7. Host Game Authority Invariant is strictly preserved', () => {
        const audit = engine.auditImmutability();
        expect(audit.isClean).toBe(true);
        expect(audit.status).toBe('CLEAN_ADVISORY_ONLY');
        expect(audit.hostPhysicsMutations).toBe(0);
        expect(audit.hostTransformMutations).toBe(0);
    });
});
