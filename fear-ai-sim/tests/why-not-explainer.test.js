/**
 * @file why-not-explainer.test.js
 *
 * Sections CLXXX-CLXXXII: rejected alternatives accounted for.
 */

import { WhyNotExplainer } from '../packages/core/index.js';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';
import { RetaliationModel } from '../packages/core/index.js';

function guardFrame() {
    const arch = new CharacterIdentityArchitecture();
    arch.registerCharacter('guard', { neuroticism: 0.3, resilience: 0.8, loyalty: 0.85 });
    return arch.tick('guard', {}, { fear: 0.7, perceivedDanger: 0.7, urgency: 0.5 });
}

describe('Sections CLXXX-CLXXXII: Why-Not Explainer', () => {
    test('1. Losing actions get margins and blocking layers', () => {
        const explainer = new WhyNotExplainer();
        const frame = guardFrame();
        const loser = frame.rankedIntents[frame.rankedIntents.length - 1].action;
        const ans = explainer.explainIdentity(frame, loser);
        expect(ans.margin).toBeGreaterThan(0);
        expect(['STATE', 'IDENTITY']).toContain(ans.blockingLayer);
        expect(ans.flipCondition.length).toBeGreaterThan(10);
        expect(ans.receipt.winner).toBe(frame.topIntent);
    });

    test('2. Winning actions are reported as selected, not excused', () => {
        const explainer = new WhyNotExplainer();
        const frame = guardFrame();
        const ans = explainer.explainIdentity(frame, frame.topIntent);
        expect(ans.margin).toBe(0);
        expect(ans.blockingLayer).toBe('NONE');
    });

    test('3. Exhaustion names itself in retaliation answers', () => {
        const explainer = new WhyNotExplainer();
        const model = new RetaliationModel();
        model.provoke('a', 'b', 'MASSACRE');
        model.provoke('a', 'b', 'RAID');
        model.advanceTick(60, true);
        const rec = model.recommend('a', 'b');
        expect(rec.intent).toBe('CEASEFIRE');
        const ans = explainer.explainRetaliation(rec, 'STRIKE_BACK');
        expect(ans.blockingFactor).toBe('EXHAUSTION');
        expect(ans.flipCondition).toContain('exhaustion');
    });

    test('4. Fresh grievances blame insufficiency with a distance', () => {
        const explainer = new WhyNotExplainer();
        const model = new RetaliationModel();
        model.provoke('a', 'b', 'INSULT');
        const rec = model.recommend('a', 'b');
        const ans = explainer.explainRetaliation(rec, 'STRIKE_BACK');
        expect(ans.blockingFactor).toBe('INSUFFICIENT_GRIEVANCE');
        expect(ans.margin).toBeGreaterThan(0.4);
    });

    test('5. Unknown actions and frames fail loudly', () => {
        const explainer = new WhyNotExplainer();
        const frame = guardFrame();
        expect(() => explainer.explainIdentity(frame, 'TELEPORT')).toThrow(/UNKNOWN_ACTION/);
        expect(() => explainer.explainIdentity({}, 'flee')).toThrow(/FRAME_NEEDS_TENDENCIES/);
        expect(() => explainer.explainRetaliation({ level: 0.5 }, 'NUKE')).toThrow(/UNKNOWN_INTENT/);
        expect(explainer.auditImmutability().isClean).toBe(true);
        expect(explainer.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
