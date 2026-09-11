import { describe, it, expect } from '@jest/globals';
import { RelationshipTensorSystem, INTERACTION_TYPES } from '../packages/core/index.js';
import { TraumaCrystallizationEngine, TRAUMA_TYPES } from '../packages/core/index.js';
import { SocialBehaviorEffects } from '../packages/core/index.js';

// NEXT-145: trauma-eroded trust (audit candidate 9). When a betrayal
// wound crystallizes, the host calls recordTraumaErosion once: trust
// drops past the event damage and stays down (trust has no passive
// decay) while grievance still forgives on the normal clock.
describe('NEXT-145: crystallized trauma erodes trust', () => {
    // Full live path: betrayal event -> trauma -> crystallization -> erosion.
    function crystallizedPair(weight = 0.5, severity = 1.0) {
        const rel = new RelationshipTensorSystem();
        const eng = new TraumaCrystallizationEngine();
        rel.recordInteraction('victim', 'betrayer', INTERACTION_TYPES.BETRAYAL, { weight });
        const postEvent = { ...rel.getRelationship('victim', 'betrayer') };
        eng.incurTrauma('victim', { traumaType: TRAUMA_TYPES.BETRAYAL_ABANDONMENT, severity });
        for (let i = 0; i < 200; i++) eng.tick(1);
        const wound = eng.agentRecords.get('victim').crystallizedTraumas[0];
        rel.recordTraumaErosion('victim', 'betrayer', wound.severity);
        return { rel, postEvent, wound };
    }

    it('1. Erosion deepens distrust past the event damage', () => {
        const { rel, postEvent } = crystallizedPair();
        const r = rel.getRelationship('victim', 'betrayer');
        expect(postEvent.trust).toBeCloseTo(-0.425, 6);
        expect(r.trust).toBeCloseTo(-0.675, 6);
        expect(r.grievance).toBeGreaterThan(postEvent.grievance);
    });

    it('2. Erosion scales with wound severity', () => {
        const mild = crystallizedPair(0.5, 0.4);
        const severe = crystallizedPair(0.5, 1.0);
        const tm = mild.rel.getRelationship('victim', 'betrayer').trust;
        const ts = severe.rel.getRelationship('victim', 'betrayer').trust;
        expect(ts).toBeLessThan(tm);
        expect(tm).toBeCloseTo(-0.425 - 0.25 * 0.4, 6);
    });

    it('3. Eroded trust persists while grievance forgives', () => {
        const { rel } = crystallizedPair();
        for (let i = 0; i < 2000; i++) rel.tick(1);
        const r = rel.getRelationship('victim', 'betrayer');
        expect(r.trust).toBeCloseTo(-0.675, 6);
        expect(r.grievance).toBe(0);
    });

    it('4. Erosion lowers downstream helping willingness', () => {
        const fx = new SocialBehaviorEffects();
        const rel = new RelationshipTensorSystem();
        rel.recordInteraction('victim', 'betrayer', INTERACTION_TYPES.BETRAYAL, { weight: 0.5 });
        const before = fx.score(rel.getRelationship('victim', 'betrayer'), {}).help;
        rel.recordTraumaErosion('victim', 'betrayer', 1.0);
        const after = fx.score(rel.getRelationship('victim', 'betrayer'), {}).help;
        expect(after).toBeLessThan(before);
    });

    it('5. Self-erosion is rejected, invalid severity degrades safely', () => {
        const rel = new RelationshipTensorSystem();
        expect(rel.recordTraumaErosion('a', 'a', 1.0)).toBeNull();
        rel.recordInteraction('a', 'b', INTERACTION_TYPES.PEACEFUL_COEXISTENCE);
        const base = { ...rel.getRelationship('a', 'b') };
        rel.recordTraumaErosion('a', 'b', NaN);
        expect(rel.getRelationship('a', 'b')).toEqual(base);
    });

    it('6. The full path is exactly reproducible', () => {
        const run = () => crystallizedPair().rel.getRelationship('victim', 'betrayer').trust;
        expect(run()).toBe(run());
    });
});
