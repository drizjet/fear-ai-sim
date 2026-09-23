import { DecisionCore } from './decisioncore.js';
import { AffordanceRegistry } from './utilitycore.js';
export const INTERACTION_ACTIONS = Object.freeze([{ id: 'observe', actorTypes: ['*'], targetTypes: ['*'], considerations: [{ name: 'curiosity', value: 'curiosity' }] }, { id: 'greet', actorTypes: ['*'], targetTypes: ['*'], considerations: [{ name: 'trust', value: 'trust' }] }, { id: 'feed', actorTypes: ['VAMPIRE'], targetTypes: ['HUMAN'], prerequisites: ['targetAlive'], considerations: [{ name: 'hunger', value: 'hunger' }, { name: 'targetFear', value: 'targetFear', curve: 'inverse' }] }, { id: 'transform', actorTypes: ['VAMPIRE'], targetTypes: ['HUMAN'], prerequisites: ['targetAlive', 'convertible', 'knowsTransformation', 'hasResource', 'offCooldown'], considerations: [{ name: 'recruitmentNeed', value: 'recruitmentNeed' }, { name: 'targetValue', value: 'targetValue' }, { name: 'witnessRisk', value: 'witnessRisk', curve: 'inverse' }, { name: 'retaliationRisk', value: 'retaliationRisk', curve: 'inverse' }] }, { id: 'protect', actorTypes: ['*'], targetTypes: ['*'], prerequisites: ['canProtect'], considerations: [{ name: 'loyalty', value: 'loyalty' }, { name: 'threat', value: 'threat' }] }, { id: 'flee', actorTypes: ['*'], targetTypes: ['*'], considerations: [{ name: 'actorFear', value: 'actorFear' }] }]);
// RESP-UTILITY-AFFORDANCE-RUNTIME-001: the catalog lives in the shared AffordanceRegistry,
// so registered affordances extend character interactions at runtime and every evaluation
// (decide/validate → DecisionCore → UtilityRuntime) runs through one scoring implementation.
export class InteractionCore {
    constructor(options = {}) { this.decisionCore = new DecisionCore(options); this.registry = new AffordanceRegistry(INTERACTION_ACTIONS); }
    register(affordance) { this.registry.register(affordance); return this; }
    unregister(id) { return this.registry.unregister(id); }
    getActions(actor = {}, target = {}) { return this.registry.applicableFor(actor, target); }
    decide(actor, target, context = {}) { return this.decisionCore.evaluate({ ...context, actor, target, targetId: target?.id }, this.getActions(actor, target)); }
    validate(action, actor, target, context = {}) { const item = this.getActions(actor, target).find(candidate => candidate.id === action); if (!item) return { valid: false, blockers: ['action_unavailable'] }; const result = this.decisionCore.evaluateAction({ ...context, actor, target }, item); return { valid: result.valid, blockers: result.blockers, action: result.action }; }
}
