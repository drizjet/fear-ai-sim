/**
 * @file explanation-fidelity.test.js
 *
 * Sections CLXXXI + CCXXXIII: faithful answers pass, forgeries fail.
 */

import { WhyNotExplainer, ExplanationFidelityHarness } from '../packages/core/index.js';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';
import { RetaliationModel } from '../packages/core/index.js';

function guardCase() {
    const arch = new CharacterIdentityArchitecture();
    arch.registerCharacter('guard', { neuroticism: 0.3, resilience: 0.8, loyalty: 0.85 });
    const frame = arch.tick('guard', {}, { fear: 0.7, perceivedDanger: 0.7, urgency: 0.5 });
    const loser = frame.rankedIntents[frame.rankedIntents.length - 1].action;
    return { frame, loser };
}

function raidCase() {
    const model = new RetaliationModel();
    model.provoke('a', 'b', 'RAID');
    return model.recommend('a', 'b');
}

describe('Sections CLXXXI + CCXXXIII: Explanation Fidelity', () => {
    test('1. Genuine identity answers verify clean', () => {
        const explainer = new WhyNotExplainer();
        const harness = new ExplanationFidelityHarness();
        const { frame, loser } = guardCase();
        const ans = explainer.explainIdentity(frame, loser);
        const verdict = harness.verify(ans, frame, loser);
        expect(verdict).toEqual({ faithful: true, failures: [] });
    });

    test('2. Swapped winners and inflated margins are caught', () => {
        const explainer = new WhyNotExplainer();
        const harness = new ExplanationFidelityHarness();
        const { frame, loser } = guardCase();
        const ans = explainer.explainIdentity(frame, loser);
        const swapped = { ...ans, receipt: { ...ans.receipt, winner: loser } };
        expect(harness.verify(swapped, frame, loser).failures).toContain('WINNER_MISMATCH');
        const inflated = { ...ans, margin: ans.margin + 0.5 };
        expect(harness.verify(inflated, frame, loser).failures).toContain('MARGIN_MISMATCH');
    });

    test('3. Forged blocking layers are caught', () => {
        const explainer = new WhyNotExplainer();
        const harness = new ExplanationFidelityHarness();
        const { frame, loser } = guardCase();
        const ans = explainer.explainIdentity(frame, loser);
        const forged = { ...ans, blockingLayer: ans.blockingLayer === 'STATE' ? 'IDENTITY' : 'STATE' };
        expect(harness.verify(forged, frame, loser).failures).toContain('BLOCKING_LAYER_MISMATCH');
        expect(harness.verify({ answer: 'lies' }, frame, loser).failures).toContain('MISSING_RECEIPT');
    });

    test('4. Genuine retaliation answers verify; forged levels fail', () => {
        const explainer = new WhyNotExplainer();
        const harness = new ExplanationFidelityHarness();
        const rec = raidCase();
        const ans = explainer.explainRetaliation(rec, 'STRIKE_BACK');
        expect(harness.verify(ans, rec, 'STRIKE_BACK').faithful).toBe(true);
        const forged = { ...ans, receipt: { ...ans.receipt, level: 0.99 } };
        expect(harness.verify(forged, rec, 'STRIKE_BACK').failures).toContain('LEVEL_MISMATCH');
    });

    test('5. Unrecognized frames fail closed', () => {
        const harness = new ExplanationFidelityHarness();
        expect(harness.verify({ receipt: {} }, { nonsense: 1 }, 'flee').failures).toContain('UNRECOGNIZED_FRAME');
        expect(harness.auditImmutability().isClean).toBe(true);
        expect(harness.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});
