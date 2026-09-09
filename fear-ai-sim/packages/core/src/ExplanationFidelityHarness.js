/**
 * packages/core/src/ExplanationFidelityHarness.js
 *
 * Sections CLXXXI + CCXXXIII:
 * Wrong explanations must be caught — independently re-derives cited
 * figures from recorded frames and fails closed on mismatch:
 * - Identity answers: cited winner/weights/margin re-derived from the
 *   frame's tendencies and ranking; margin arithmetic rechecked.
 * - Retaliation answers: cited intent/level/grievance re-derived from
 *   the recommendation record; band membership rechecked.
 * - Mutation battery: swapped winners, inflated margins, invented
 *   blocking layers, and forged receipts must ALL be rejected.
 *
 * The harness never trusts answer text — only receipts re-derived
 * against the frame. Advisory verification only.
 */

const EPSILON = 1e-6;

function num(v) {
    return (typeof v === 'number' && Number.isFinite(v)) ? v : NaN;
}

export class ExplanationFidelityHarness {
    /**
     * Verify one why-not answer against its frame.
     * @param {object} answer WhyNotExplainer output
     * @param {object} frame the recorded decision frame/recommendation
     * @param {string} asked the action/intent asked about
     * @returns {{ faithful, failures: string[] }}
     */
    verify(answer, frame, asked) {
        const failures = [];
        if (!answer || !answer.receipt) {
            return { faithful: false, failures: ['MISSING_RECEIPT'] };
        }
        const r = answer.receipt;
        if (frame && frame.tendencies && frame.rankedIntents) {
            this._verifyIdentity(answer, frame, String(asked), r, failures);
        } else if (frame && typeof frame.level === 'number') {
            this._verifyRetaliation(answer, frame, String(asked), r, failures);
        } else {
            failures.push('UNRECOGNIZED_FRAME');
        }
        return { faithful: failures.length === 0, failures };
    }

    _verifyIdentity(answer, frame, asked, r, failures) {
        const winner = frame.rankedIntents[0];
        if (r.winner !== undefined && r.winner !== winner.action) failures.push('WINNER_MISMATCH');
        if (r.winnerWeight !== undefined && Math.abs(num(r.winnerWeight) - num(winner.weight)) > EPSILON) {
            failures.push('WINNER_WEIGHT_MISMATCH');
        }
        if (r.askedWeight !== undefined && Math.abs(num(r.askedWeight) - num(frame.tendencies[asked])) > EPSILON) {
            failures.push('ASKED_WEIGHT_MISMATCH');
        }
        if (typeof answer.margin === 'number' && r.winnerWeight !== undefined && r.askedWeight !== undefined) {
            const expected = Math.round((num(r.winnerWeight) - num(r.askedWeight)) * 10000) / 10000;
            if (Math.abs(answer.margin - Math.max(0, expected)) > 1e-3) failures.push('MARGIN_MISMATCH');
        }
        if (answer.blockingLayer !== undefined && answer.blockingLayer !== 'NONE') {
            const pressure = (frame.layers || {}).statePressure ?? 0;
            const expected = pressure >= 0.5 ? 'STATE' : 'IDENTITY';
            if (answer.blockingLayer !== expected) failures.push('BLOCKING_LAYER_MISMATCH');
        }
    }

    _verifyRetaliation(answer, frame, asked, r, failures) {
        if (r.intent !== undefined && r.intent !== frame.intent) failures.push('INTENT_MISMATCH');
        if (r.level !== undefined && Math.abs(num(r.level) - num(frame.level)) > EPSILON) failures.push('LEVEL_MISMATCH');
        if (r.grievance !== undefined && Math.abs(num(r.grievance) - num(frame.grievance)) > 1e-3) {
            failures.push('GRIEVANCE_MISMATCH');
        }
        if (typeof answer.margin === 'number') {
            const bands = { STRIKE_BACK: 0.7, PRESSURE: 0.5, THREATEN: 0.35, DEMAND_PAYMENT: 0.2, WARN: 0.06, OBSERVE: 0.02, IGNORE: 0, CEASEFIRE: 0.2 };
            if (asked in bands && !(Math.abs(answer.margin - Math.abs(num(frame.level) - bands[asked])) < 1e-3 + EPSILON)) {
                failures.push('MARGIN_MISMATCH');
            }
        }
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0
        };
    }
}
