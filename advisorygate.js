import { InteractionCore } from './interactioncore.js';

export class AdvisoryGate {
    constructor({ interactionCore = new InteractionCore() } = {}) { this.interactionCore = interactionCore; }
    validate(proposal, actor, target, context = {}) { const action = typeof proposal === 'string' ? proposal : proposal?.action; const result = this.interactionCore.validate(action, actor, target, context); return { approved: Boolean(result.valid), action: result.valid ? action : null, actorId: actor?.id ?? null, targetId: target?.id ?? null, blockers: result.blockers || [], source: 'ADVISORY_VALIDATOR' }; }
}
