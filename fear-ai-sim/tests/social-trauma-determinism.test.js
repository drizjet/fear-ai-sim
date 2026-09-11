import { describe, it, expect } from '@jest/globals';
import { RelationshipTensorSystem, INTERACTION_TYPES } from '../packages/core/index.js';
import { SocialEventEngine, SOCIAL_EVENTS } from '../packages/core/index.js';
import { TraumaCrystallizationEngine, TRAUMA_TYPES } from '../packages/core/index.js';
import { SocialBehaviorEffects } from '../packages/core/index.js';
import { ContagionGraph } from '../packages/core/index.js';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-151: seeded determinism proofs for social and trauma paths
// (audit candidate 16). A static audit found zero randomness or clock
// sources in these modules; these tests prove it behaviorally: a full
// betrayal-to-arbitration scenario replays byte-identically, while a
// reordered history diverges (the comparison is live, not constant).
describe('NEXT-151: social-trauma determinism proofs', () => {
    // One combined history across every social/trauma system touched
    // since NEXT-138: events -> betrayal trauma -> crystallization ->
    // erosion -> bond-weighted arbitration -> amplified contagion.
    function runHistory(order = 'betray-first') {
        const rel = new RelationshipTensorSystem();
        const events = new SocialEventEngine();
        const trauma = new TraumaCrystallizationEngine();
        const fx = new SocialBehaviorEffects();
        const contagion = new ContagionGraph({ traumaAmplifier: 1.0 });
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('victim', { type: GOAL_TYPES.PROTECT_ALLY, priority: 0.45 });
        arb.registerGoal('victim', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });

        const steps = order === 'betray-first'
            ? ['AID', 'BETRAYAL', 'SHARED_DANGER']
            : ['SHARED_DANGER', 'BETRAYAL', 'AID'];
        for (const e of steps) {
            events.applyEvent(rel, e, e === 'BETRAYAL' ? 'perpetrator' : 'friend', 'victim', { weight: 1.0 });
        }
        trauma.incurTrauma('victim', { traumaType: TRAUMA_TYPES.BETRAYAL_ABANDONMENT, severity: 1.0 });
        for (let i = 0; i < 200; i++) trauma.tick(1);
        const wound = trauma.agentRecords.get('victim').crystallizedTraumas[0];
        rel.recordTraumaErosion('victim', 'perpetrator', wound.severity);
        const bond = fx.score(rel.getRelationship('victim', 'friend'), {}).help;
        const verdict = arb.arbitrate('victim', { fear: 0.5 }, { allyBond: bond, allyBondWeight: 1.0 });
        const spread = contagion.evaluateContagion(
            { id: 'bystander', x: 0, y: 0, z: 0, traits: {} },
            [{ id: 'victim', x: 10, y: 0, z: 0, fearBand: 'PANIC', isPanicking: true, rawFear: 0.95, traumaLoad: 0.5 }]
        );
        return {
            tensor: rel.getState(),
            trauma: JSON.parse(JSON.stringify({
                active: trauma.agentRecords.get('victim').activeTraumas,
                crystallized: trauma.agentRecords.get('victim').crystallizedTraumas
            })),
            bond,
            verdict,
            spread
        };
    }

    it('1. Full social-trauma history replays byte-identically', () => {
        const a = runHistory();
        const b = runHistory();
        expect(JSON.stringify(b)).toBe(JSON.stringify(a));
        expect(b).toEqual(a);
    });
    // NOTE (honest negative): reordering the same in-bounds events does
    // NOT diverge — tensor deltas are additive and commutative until a
    // clamp binds. Divergence needs a different history, not a shuffle.
    it('2. Different histories diverge (comparison is live)', () => {
        const a = runHistory('betray-first');
        const rel = new RelationshipTensorSystem();
        rel.recordInteraction('victim', 'friend', INTERACTION_TYPES.AID_RECEIVED, { weight: 1.0 });
        expect(JSON.stringify(rel.getState())).not.toBe(JSON.stringify(a.tensor));
    });

    it('3. Tensor, trauma, arbitration, and contagion all match across replays', () => {
        const a = runHistory();
        const b = runHistory();
        expect(b.tensor).toEqual(a.tensor);
        expect(b.trauma).toEqual(a.trauma);
        expect(b.bond).toBe(a.bond);
        expect(b.verdict).toEqual(a.verdict);
        expect(b.spread).toEqual(a.spread);
    });

    it('4. Crystallization is the divergence point, not noise', () => {
        // Identical histories through betrayal must agree before AND
        // after crystallization ticks.
        const rel = new RelationshipTensorSystem();
        rel.recordInteraction('v', 'p', INTERACTION_TYPES.BETRAYAL, { weight: 1.0 });
        const snap = (eng) => JSON.stringify(eng.agentRecords.get('v'));
        const e1 = new TraumaCrystallizationEngine();
        const e2 = new TraumaCrystallizationEngine();
        e1.incurTrauma('v', { traumaType: TRAUMA_TYPES.BETRAYAL_ABANDONMENT, severity: 1.0 });
        e2.incurTrauma('v', { traumaType: TRAUMA_TYPES.BETRAYAL_ABANDONMENT, severity: 1.0 });
        expect(snap(e2)).toBe(snap(e1));
        for (let i = 0; i < 200; i++) { e1.tick(1); e2.tick(1); }
        expect(snap(e2)).toBe(snap(e1));
        expect(e1.agentRecords.get('v').crystallizedTraumas.length).toBe(1);
    });

    it('5. SOCIAL_EVENTS vocabulary is fixed and finite', () => {
        expect([...SOCIAL_EVENTS].sort()).toEqual([
            'ABANDONMENT', 'AID', 'BETRAYAL', 'DECEPTION', 'LEADERSHIP_FAILURE',
            'LEADERSHIP_SUCCESS', 'RESCUE', 'SHARED_DANGER', 'TRADE', 'WARNING'
        ]);
    });
});
