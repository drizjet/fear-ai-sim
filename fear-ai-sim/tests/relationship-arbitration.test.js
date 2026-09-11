import { describe, it, expect } from '@jest/globals';
import { RelationshipTensorSystem, INTERACTION_TYPES } from '../packages/core/index.js';
import { SocialBehaviorEffects } from '../packages/core/index.js';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-138: relationship-weighted goal arbitration (CCI audit candidate 1).
// The directed bond with a specific ally bends PROTECT_ALLY / AID_VICTIM
// scoring: trusted allies are held longer under rising fear, resented
// ones are abandoned earlier. Opt-in; blend 0 is legacy scoring.
describe('NEXT-138: ally bond bends arbitration', () => {
    // End-to-end: tensor events -> help willingness -> arbitration context.
    function bondAfter(events) {
        const rel = new RelationshipTensorSystem();
        for (const e of events) rel.recordInteraction('g', 'ally', e);
        return new SocialBehaviorEffects().score(rel.getRelationship('g', 'ally'), {}).help;
    }

    function crossover(bond, protectPriority = 0.45) {
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('g', { type: GOAL_TYPES.PROTECT_ALLY, priority: protectPriority });
        arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        for (let f = 0; f <= 1.0001; f += 0.05) {
            const r = arb.arbitrate('g', { fear: f }, { allyBond: bond, allyBondWeight: 1.0 });
            if (r.winningGoal !== GOAL_TYPES.PROTECT_ALLY) return Math.round(f * 100) / 100;
        }
        return Infinity;
    }

    it('1. Prosocial history builds a high bond; betrayal destroys it', () => {
        const trusted = bondAfter([
            ...Array(5).fill(INTERACTION_TYPES.SHARED_SURVIVAL),
            ...Array(5).fill(INTERACTION_TYPES.AID_RECEIVED),
            INTERACTION_TYPES.RESCUE_CONFIRMED
        ]);
        const betrayed = bondAfter([INTERACTION_TYPES.SHARED_SURVIVAL, INTERACTION_TYPES.BETRAYAL]);
        expect(trusted).toBeGreaterThan(0.9);
        expect(betrayed).toBeLessThan(0.1);
    });

    it('2. Bond moves the protect crossover monotonically', () => {
        expect(crossover(0.0)).toBeLessThan(crossover(0.5));
        expect(crossover(0.5)).toBeLessThan(crossover(1.0));
    });

    it('3. Pinned bond crossover ladder', () => {
        expect([0.0, 0.1, 0.5, 1.0].map((b) => crossover(b))).toEqual([0.2, 0.3, 0.7, Infinity]);
    });

    it('4. End-to-end: trusted ally held, betrayed ally abandoned at same fear', () => {
        const trusted = bondAfter([
            ...Array(5).fill(INTERACTION_TYPES.SHARED_SURVIVAL),
            ...Array(5).fill(INTERACTION_TYPES.AID_RECEIVED),
            INTERACTION_TYPES.RESCUE_CONFIRMED
        ]);
        const betrayed = bondAfter([INTERACTION_TYPES.SHARED_SURVIVAL, INTERACTION_TYPES.BETRAYAL]);
        const run = (bond) => {
            const arb = new GoalArbitrationEngine();
            arb.registerGoal('g', { type: GOAL_TYPES.PROTECT_ALLY, priority: 0.45 });
            arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
            return arb.arbitrate('g', { fear: 0.5 }, { allyBond: bond, allyBondWeight: 1.0 }).winningGoal;
        };
        expect(run(trusted)).toBe(GOAL_TYPES.PROTECT_ALLY);
        expect(run(betrayed)).toBe(GOAL_TYPES.SURVIVE);
    });

    it('5. Blend 0 keeps legacy scoring bond-invariant', () => {
        const run = (bond) => {
            const arb = new GoalArbitrationEngine();
            arb.registerGoal('g', { type: GOAL_TYPES.PROTECT_ALLY, priority: 0.45 });
            arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
            return arb.arbitrate('g', { fear: 0.5 }, { allyBond: bond, allyBondWeight: 0 }).winningGoal;
        };
        expect(run(0.0)).toBe(run(1.0));
    });

    it('6. Bond bends AID_VICTIM while SURVIVE stays at weight 1', () => {
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('g', { type: GOAL_TYPES.AID_VICTIM, priority: 0.5 });
        arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.5 });
        const hi = arb.arbitrate('g', { fear: 0.5 }, { allyBond: 1.0, allyBondWeight: 1.0 });
        const lo = arb.arbitrate('g', { fear: 0.5 }, { allyBond: 0.0, allyBondWeight: 1.0 });
        expect(hi.rankedGoals.find((e) => e.goal === 'AID_VICTIM').allyBondWeight).toBe(1.5);
        expect(lo.rankedGoals.find((e) => e.goal === 'AID_VICTIM').allyBondWeight).toBe(0.5);
        expect(hi.rankedGoals.find((e) => e.goal === 'SURVIVE').allyBondWeight).toBe(1);
        expect(lo.rankedGoals.find((e) => e.goal === 'SURVIVE').allyBondWeight).toBe(1);
    });
});
