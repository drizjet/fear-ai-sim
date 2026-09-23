// DecisionCore is a thin facade over the shared utility/affordance runtime.
// RESP-UTILITY-AFFORDANCE-RUNTIME-001: scoring math, response curves, band selection, and
// RNG ownership live in utilitycore.js so every production consumer (society DECISION and
// faction paths, InteractionCore affordances, AdvisoryGate validation) shares one
// implementation. The public API and RNG consumption order are unchanged.
import { UtilityRuntime } from './utilitycore.js';

export class DecisionCore {
    constructor(options = {}) {
        this.runtime = new UtilityRuntime(options);
        this.rng = this.runtime.rng;
        this.random = this.runtime.random;
        this.bandWidth = this.runtime.bandWidth;
    }
    evaluateAction(context, action) { return this.runtime.evaluateAction(context, action); }
    evaluate(context = {}, actions = []) { return this.runtime.evaluate(context, actions); }
    select(items) { return this.runtime.select(items); }
}
