/**
 * @file social-event-engine.test.js
 *
 * Section XXIV: events move relationships, witnesses learn reputation.
 */

import { SocialEventEngine } from '../packages/core/index.js';
import { RelationshipTensorSystem } from '../packages/core/index.js';

function setup() {
    return new RelationshipTensorSystem();
}

describe('Section XXIV: Social Event Engine', () => {
    test('1. Rescue builds trust and obligation in the direct pair', () => {
        const tensor = setup();
        const eng = new SocialEventEngine();
        const { direct } = eng.applyEvent(tensor, 'RESCUE', 'alice', 'bob');
        expect(direct.trust).toBeGreaterThan(0.4);
        expect(direct.obligation).toBeGreaterThan(0.3);
        expect(eng.auditImmutability().eventsApplied).toBe(1);
    });

    test('2. Betrayal craters trust while trade builds it slowly', () => {
        const tensor = setup();
        const eng = new SocialEventEngine();
        eng.applyEvent(tensor, 'BETRAYAL', 'alice', 'bob');
        expect(tensor.getRelationship('bob', 'alice').trust).toBeLessThan(-0.5);
        const t2 = setup();
        eng.applyEvent(t2, 'TRADE', 'alice', 'bob');
        expect(t2.getRelationship('bob', 'alice').trust).toBeGreaterThan(0);
        expect(t2.getRelationship('bob', 'alice').trust).toBeLessThan(0.5);
    });

    test('3. Witnesses learn reputation scaled by reporter credibility', () => {
        const tensor = setup();
        const eng = new SocialEventEngine();
        // Carol trusts Bob (reporter), so she believes the rescue story.
        tensor.getRelationship('carol', 'bob').trust = 0.8;
        const { witnessUpdates } = eng.applyEvent(tensor, 'RESCUE', 'alice', 'bob', { witnesses: ['carol'] });
        expect(witnessUpdates.length).toBe(1);
        expect(tensor.getRelationship('carol', 'alice').trust).toBeGreaterThan(0);
        // Dave distrusts Bob, so the same story barely moves him.
        const t2 = setup();
        t2.getRelationship('dave', 'bob').trust = -0.8;
        eng.applyEvent(t2, 'RESCUE', 'alice', 'bob', { witnesses: ['dave'] });
        expect(t2.getRelationship('dave', 'alice').trust).toBeLessThan(tensor.getRelationship('carol', 'alice').trust);
    });

    test('4. Deception grants trust now, betrayal with interest on exposure', () => {
        const tensor = setup();
        const eng = new SocialEventEngine();
        eng.applyEvent(tensor, 'DECEPTION', 'alice', 'bob');
        expect(tensor.getRelationship('bob', 'alice').trust).toBeGreaterThan(0.2);
        eng.applyEvent(tensor, 'DECEPTION', 'alice', 'bob', { exposed: true, witnesses: ['carol'] });
        expect(tensor.getRelationship('bob', 'alice').trust).toBeLessThan(-0.3);
        expect(tensor.getRelationship('carol', 'alice').trust).toBeLessThan(0);
        expect(eng.auditImmutability().exposures).toBe(1);
    });

    test('5. Invalid events and participants fail loudly', () => {
        const tensor = setup();
        const eng = new SocialEventEngine();
        expect(() => eng.applyEvent(tensor, 'MIND_CONTROL', 'a', 'b')).toThrow(/UNKNOWN_SOCIAL_EVENT/);
        expect(() => eng.applyEvent(tensor, 'AID', 'a', 'a')).toThrow(/INVALID_EVENT_PARTICIPANTS/);
        expect(() => eng.applyEvent(null, 'AID', 'a', 'b')).toThrow(/INVALID_TENSOR/);
        expect(eng.auditImmutability().isClean).toBe(true);
        expect(eng.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
