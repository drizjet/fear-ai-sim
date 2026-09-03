const clamp = value => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

// Deterministic action id generator. The §121 contract requires
// the same inputs produce the same actionId across runs. The id
// is a function of the (tick, factionId, targetId, prior-execution-count)
// tuple. The prior-execution-count is the faction's
// `executedActions.size` at the time the plan is created, which
// is also deterministic. The previous module-level counter
// (`_actionCounter`) violated §121 because it was a global
// mutable state that persisted across test runs and was not
// reproducible.
function nextActionId({ tick, factionId, targetId, executionIndex }) {
    return `act-${tick}-${factionId}-${targetId}-${executionIndex}`;
}

export function relocateBandit(bandit, routes = [], { pressure = 0, threshold = 0.7 } = {}) {
    if (!bandit) return { ok: false, reason: 'NO_BANDIT' };
    if (pressure < threshold || !bandit.alternateRoadId) return { ok: true, relocated: false, roadId: bandit.roadId };
    // If the bandit is already on the alternate road, the "move"
    // would be a no-op. This guards against the bandit oscillating
    // back to the road it just left and the merchant rerouting in
    // lockstep.
    if (bandit.roadId === bandit.alternateRoadId) {
        return { ok: true, relocated: false, roadId: bandit.roadId, reason: 'ALREADY_ON_ALTERNATE' };
    }
    const route = routes.find(item => item.id === bandit.alternateRoadId);
    if (!route) return { ok: false, reason: 'INVALID_ALTERNATE_ROAD' };
    bandit.roadId = route.id;
    bandit.relocations = (bandit.relocations ?? 0) + 1;
    return { ok: true, relocated: true, roadId: route.id, relocations: bandit.relocations };
}

// Pure: returns a plan describing what a faction would do against a target
// without mutating any state. The plan carries a fresh `actionId` that
// downstream events can cite. Pass this plan to `executeRetaliation(plan)`
// to apply the mutation exactly once.
export function planRetaliation(faction, target, { tick = 0 } = {}) {
    if (!faction || !target) {
        return { ok: false, action: null, reason: 'INVALID_INPUT' };
    }
    if (faction.lastDecision !== 'RAID') {
        return { ok: false, action: null, reason: 'NOT_RAID_DECISION' };
    }
    const resources = Number(faction.resources);
    if (!Number.isFinite(resources) || resources <= 0) {
        return { ok: false, action: null, reason: 'INSUFFICIENT_RESOURCES' };
    }
    return {
        ok: true,
        action: {
            actionId: nextActionId({
                tick,
                factionId: faction.id,
                targetId: target.id,
                executionIndex: (faction.executedActions?.size ?? 0),
            }),
            type: faction.escalation >= 6 ? 'RETALIATION' : 'RAID',
            factionId: faction.id,
            targetId: target.id,
            tick
        }
    };
}

// Mutating: applies a plan. If the plan's `actionId` is already recorded
// in the faction's `executedActions` set, the call is a no-op (idempotency).
// Otherwise the faction loses 1 resource, the target is marked threatened,
// and the `actionId` is recorded so the same plan cannot be applied twice.
// PHASE 16: per-target memory. The audit:
// "Migrate scalar memoryOfLoss toward source/target-specific
// memory where required. A faction harmed by Bandit A should
// not automatically attach equal grievance to every bandit
// or every faction. At minimum distinguish: known actor;
// known faction; unknown attacker."
//
// `recordHarmByActor` stores harm in `faction.memoryByActor`
// (a map keyed by actor id). The scalar `faction.memoryOfLoss`
// is retained as a fallback for legacy callers and as the
// "generalized fear" signal.

export function recordHarmByActor(faction, actorId, { severity = 0.5, tick = 0, known = true } = {}) {
    if (!faction) return null;
    if (!faction.memoryByActor) faction.memoryByActor = {};
    // Unknown attackers contribute less to specific memory.
    // The scalar `memoryOfLoss` is managed separately by
    // `advanceEmotion` (the per-tick stock-flow update in
    // `factioncore.js`). We do NOT touch the scalar here to
    // avoid double-counting — the scalar is the generalized
    // fear signal, and the per-target map is the specific
    // grievance signal. They are complementary, not
    // duplicate.
    const factor = known ? 1 : 0.3;
    const current = faction.memoryByActor[actorId] ?? 0;
    const next = Math.min(1, current + severity * factor);
    faction.memoryByActor[actorId] = next;
    return next;
}

export function getMemoryOfLoss(faction, actorId) {
    if (!faction || !faction.memoryByActor) return 0;
    return faction.memoryByActor[actorId] ?? 0;
}

/**
 * Aggregate an actor's violence reputation across the observer network.
 *
 * Reputation is deliberately separate from the acting faction's direct
 * memory: direct memory answers "whom did I experience?", while this
 * aggregate answers "what does the network remember this actor doing?".
 * Missing memory is a real zero observation, so every supplied observer
 * contributes to the mean. The result is bounded for callers that provide
 * hand-authored or restored state.
 *
 * @param {string} targetId actor whose reputation is being queried
 * @param {Array<object>} observers factions or other memory-bearing actors
 * @returns {number} mean known violence memory in [0, 1]
 */
export function computeReputation(targetId, observers = []) {
    if (!targetId || !Array.isArray(observers) || observers.length === 0) return 0;
    const values = observers
        .map(observer => getMemoryOfLoss(observer, targetId))
        .filter(value => Number.isFinite(value))
        .map(value => clamp(value));
    if (values.length === 0) return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function executeRetaliation(faction, target, plan) {
    if (!faction || !target) {
        return { ok: false, action: null, reason: 'INVALID_INPUT' };
    }
    if (!plan || !plan.action) {
        return { ok: false, action: null, reason: 'NO_PLAN' };
    }
    const action = plan.action;
    if (faction.lastDecision !== 'RAID' && plan.ok) {
        return { ok: false, action, reason: 'NOT_RAID_DECISION' };
    }
    if (!faction.executedActions) faction.executedActions = new Set();
    if (faction.executedActions.has(action.actionId)) {
        // Same plan was already applied; refuse to double-execute.
        return { ok: false, action, reason: 'ALREADY_EXECUTED' };
    }
    const resources = Number(faction.resources);
    if (!Number.isFinite(resources) || resources <= 0) {
        return { ok: false, action, reason: 'INSUFFICIENT_RESOURCES' };
    }
    faction.executedActions.add(action.actionId);
    faction.resources = Math.max(0, resources - 1);
    if (target && typeof target === 'object') {
        target.threatened = true;
    }
    return { ok: true, action };
}

export { clamp };
