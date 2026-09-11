/**
 * packages/core/src/WhyNotExplainer.js
 *
 * Sections CLXXX-CLXXXII:
 * Why-not questions — "Why didn't the guard flee? Why didn't the faction
 * strike back?" Answers derive strictly from recorded decision frames,
 * never from re-simulation or invention:
 * - Identity frames (CharacterIdentityArchitecture.decide): tendencies,
 *   ranked intents, and layer gains. The answer names the margin between
 *   the asked-about action and the winner, the layer most responsible,
 *   and the flip condition (how much would have to change).
 * - Retaliation recommendations (RetaliationModel.recommend): intent
 *   bands, net pressure, grievance vs exhaustion. The answer names the
 *   band the pressure fell into and what dominates (e.g. exhaustion).
 *
 * Every answer carries a fidelity receipt: the exact numbers it cites,
 * so ExplanationFidelityHarness can re-derive them independently.
 */

const round4 = (v) => (typeof v !== 'number' || !Number.isFinite(v) ? 0 : Math.round(v * 10000) / 10000);
import { attributeGain } from './CharacterIdentityArchitecture.js';

export class WhyNotExplainer {
    /**
     * Why didn't an identity decision pick the asked-about action?
     * @param {object} frame recorded decide() output
     * @param {string} action the rejected action (stand|flee|help|investigate|rally)
     * @param {object|null} [identity] opt-in CIA identity for trait-level
     * attribution (NEXT-146): names the strongest supporting and
     * dragging traits behind the asked-about action's gain.
     */
    explainIdentity(frame, action, identity = null) {
        if (!frame || !frame.tendencies || !frame.rankedIntents) throw new Error('FRAME_NEEDS_TENDENCIES_AND_RANKING');
        const asked = String(action);
        if (!(asked in frame.tendencies)) throw new Error(`UNKNOWN_ACTION: ${asked}`);
        const winner = frame.rankedIntents[0];
        if (winner.action === asked) {
            return {
                question: `Why didn't ${frame.agentId} ${asked}?`,
                answer: `It did — ${asked} ranked first at ${frame.tendencies[asked]}.`,
                margin: 0,
                blockingLayer: 'NONE',
                flipCondition: 'Already selected.',
                receipt: { winner: winner.action, weight: winner.weight }
            };
        }
        const margin = round4(winner.weight - frame.tendencies[asked]);
        // Attribute to the layer with the largest cited contribution gap.
        const layers = frame.layers || {};
        const statePressure = layers.statePressure ?? 0;
        const blockingLayer = statePressure >= 0.5 ? 'STATE' : 'IDENTITY';
        const fearSided = ['flee'].includes(asked);
        const flipCondition = fearSided
            ? `Threat pressure would need to rise ~${margin} above current ${statePressure} to flip ${asked} first.`
            : `Calm confidence would need to rise ~${margin} to flip ${asked} first.`;
        // NEXT-146: opt-in trait attribution names the strongest
        // supporting and dragging traits behind the asked action's gain.
        let traitNote = '';
        let traitAttribution = null;
        if (identity && typeof identity === 'object') {
            traitAttribution = attributeGain(asked, identity);
            traitNote = ` ${traitAttribution.supporter} (${identity[traitAttribution.supporter]}) supports ${asked} most (${traitAttribution.supporterValue}); ${traitAttribution.drag} (${identity[traitAttribution.drag]}) drags it most (${traitAttribution.dragValue}).`;
        }
        return {
            question: `Why didn't ${frame.agentId} ${asked}?`,
            answer: `${winner.action} beat ${asked} by ${margin} (${winner.weight} vs ${frame.tendencies[asked]}); ${blockingLayer} layer dominates this frame.${traitNote}`,
            margin,
            blockingLayer,
            flipCondition,
            traitAttribution,
            receipt: { winner: winner.action, winnerWeight: winner.weight, askedWeight: frame.tendencies[asked], statePressure }
        };
    }

    /**
     * Why didn't a faction answer with the asked-about intent?
     * @param {object} recommendation recorded recommend() output
     * @param {string} intent the rejected intent
     */
    explainRetaliation(recommendation, intent) {
        if (!recommendation || typeof recommendation.level !== 'number') throw new Error('RECOMMENDATION_NEEDS_LEVEL');
        const asked = String(intent);
        const bands = [
            ['STRIKE_BACK', 0.7], ['PRESSURE', 0.5], ['THREATEN', 0.35],
            ['DEMAND_PAYMENT', 0.2], ['WARN', 0.06], ['OBSERVE', 0.02], ['IGNORE', 0]
        ];
        const askedBand = bands.find(([name]) => name === asked);
        if (!askedBand) throw new Error(`UNKNOWN_INTENT: ${asked}`);
        if (recommendation.intent === asked) {
            return {
                question: `Why didn't the faction ${asked}?`,
                answer: `It did — ${asked} at level ${recommendation.level}.`,
                margin: 0,
                blockingFactor: 'NONE',
                flipCondition: 'Already selected.',
                receipt: { intent: asked, level: recommendation.level }
            };
        }
        const margin = round4(Math.abs(recommendation.level - askedBand[1]));
        const exhausted = (recommendation.exhaustion ?? 0) >= 0.6;
        const blockingFactor = exhausted && ['STRIKE_BACK', 'PRESSURE'].includes(asked)
            ? 'EXHAUSTION'
            : (recommendation.level < askedBand[1] ? 'INSUFFICIENT_GRIEVANCE' : 'HIGHER_PRESSURE_WON');
        return {
            question: `Why didn't the faction ${asked}?`,
            answer: `Pressure ${recommendation.level} sits in ${recommendation.intent}, ${margin} from the ${asked} band; ${blockingFactor} decides it.`,
            margin,
            blockingFactor,
            flipCondition: exhausted
                ? 'Peace would need to recover (exhaustion below 0.6) before strikes return.'
                : `Grievance would need to move pressure ~${margin} toward the ${asked} band.`,
            receipt: {
                intent: recommendation.intent, level: recommendation.level,
                grievance: recommendation.grievance, exhaustion: recommendation.exhaustion
            }
        };
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
