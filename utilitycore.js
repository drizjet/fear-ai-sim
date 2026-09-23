// Shared utility/affordance runtime for the Fear AI world.
// RESP-UTILITY-AFFORDANCE-RUNTIME-001: this module is the canonical owner of (a) affordance
// registration/applicability and (b) utility scoring — prerequisites → considerations →
// response curves → narrow-band selection through the injectable serializable RNG.
// DecisionCore (society DECISION and faction paths), InteractionCore (character affordances
// and AdvisoryGate validation) are thin facades over it, so every production decision shares
// one scoring implementation and one RNG consumption order.
import { randomSource } from './randomcore.js';

const clamp = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const curve = (kind, value) => { const x = clamp(value); return kind === 'inverse' ? 1 - x : kind === 'square' ? x * x : kind === 'sqrt' ? Math.sqrt(x) : x; };

// Registered affordance catalog: id-keyed, insertion-ordered, duplicate-rejecting.
// Applicability is the shared actor/target type gate ('*' or a missing list matches any).
export class AffordanceRegistry {
    constructor(initial = []) { this.catalog = new Map(); for (const item of initial) this.register(item); }
    register(affordance) {
        const id = affordance?.id || affordance?.name;
        if (!id) throw new Error('An affordance id is required');
        if (this.catalog.has(id)) throw new Error(`Duplicate affordance "${id}"`);
        this.catalog.set(id, Object.freeze({ ...affordance, id }));
        return this;
    }
    unregister(id) { return this.catalog.delete(id); }
    get(id) { return this.catalog.get(id) ?? null; }
    list() { return [...this.catalog.values()]; }
    applicableFor(actor = {}, target = {}) {
        return this.list()
            .filter(item => (item.actorTypes?.includes('*') || !item.actorTypes || item.actorTypes.includes(actor.type))
                && (item.targetTypes?.includes('*') || !item.targetTypes || item.targetTypes.includes(target.type)))
            .map(item => ({ ...item, target: target.id ?? null }));
    }
}

// Utility scoring: prerequisites hard-block, considerations contribute through response
// curves and weights, finalScore is the clamped mean of positive contributions, and
// selection runs a weighted draw inside a narrow band around the best score (band width
// widens with personality impulsiveness).
export class UtilityRuntime {
    constructor({ random, rng, seed, bandWidth = 0 } = {}) { this.rng = randomSource(rng ?? random, seed); this.random = () => this.rng.next(); this.bandWidth = Math.max(0, Number.isFinite(bandWidth) ? bandWidth : 0); this.registry = new AffordanceRegistry(); }
    evaluateAction(context, action) { const blockers = (action.prerequisites || []).filter(rule => !(typeof rule === 'function' ? rule(context) : Boolean(context[rule]))).map(rule => typeof rule === 'string' ? rule : 'prerequisite_failed'); const considerations = (action.considerations || []).map(item => { const rawValue = typeof item.value === 'function' ? item.value(context) : (typeof item.value === 'string' ? (context[item.value] ?? 0) : (context[item.value] ?? item.value ?? 0)); const normalizedValue = clamp(rawValue); return { name: item.name, rawValue, normalizedValue, responseCurve: item.curve || 'linear', contribution: curve(item.curve, normalizedValue) * (Number.isFinite(item.weight) ? item.weight : 1) }; }); const finalScore = blockers.length ? 0 : clamp(considerations.reduce((sum, item) => sum + Math.max(0, item.contribution), 0) / Math.max(1, considerations.length)); return { action: action.id || action.name, target: action.target ?? context.targetId ?? null, valid: blockers.length === 0 && finalScore > 0, finalScore, blockers, considerations, explanation: [...considerations.filter(item => item.contribution > 0).map(item => `+${item.name} ${item.contribution.toFixed(2)}`), ...blockers.map(item => `blocked: ${item}`)] }; }
    evaluate(context = {}, actions = []) { const candidates = actions.map(action => this.evaluateAction(context, action)); const valid = candidates.filter(item => item.valid); const best = valid.reduce((max, item) => Math.max(max, item.finalScore), 0); const width = Math.max(this.bandWidth, context.personality?.decisionBandWidth ? clamp(context.personality.decisionBandWidth()) : clamp(context.personality?.impulsiveness) * .15); const selected = this.select(valid.filter(item => item.finalScore >= best - width)); return { actorId: context.actorId ?? context.actor?.id ?? null, targetId: context.targetId ?? context.target?.id ?? null, selected: selected?.action ?? null, valid: Boolean(selected), candidates, alternatives: candidates.filter(item => item !== selected).sort((a, b) => b.finalScore - a.finalScore), explanation: selected?.explanation || ['All actions blocked'] }; }
    select(items) { if (!items.length) return null; const total = items.reduce((sum, item) => sum + item.finalScore, 0); let cursor = this.random() * total; for (const item of items) { cursor -= item.finalScore; if (cursor <= 0) return item; } return items.at(-1); }
}
