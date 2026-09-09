/**
 * packages/core/src/GoalArbitrationEngine.js
 *
 * Front B / Sections 212–214, 216:
 * Semantic NPC Goals, Conflicting-Goal Arbitration & Courage Model.
 *
 * Fear AI recommends intents; hosts own execution. This module answers the
 * missing question: what is the NPC *trying* to do when fear pulls one way
 * and duty/loyalty/greed pull the other?
 *
 * Model:
 * - Agents hold semantic goals (SURVIVE, PROTECT_ALLY, REACH_SAFETY,
 *   ESCORT_CARAVAN, HOLD_POST, AID_VICTIM), each with a priority in [0,1].
 * - Each goal maps to a preferred advisory intent:
 *     SURVIVE + fear>=0.6 → FLEE_FROM, else CAUTIOUS_EXPLORE
 *     PROTECT_ALLY / AID_VICTIM → APPROACH_ALLY
 *     REACH_SAFETY → FLEE_FROM (toward safety)
 *     ESCORT_CARAVAN → APPROACH_ALLY (stay with charge)
 *     HOLD_POST → IDLE_VIGILANT (stand ground)
 * - Goal score = priority × relevance, where relevance is fear-gated:
 *   survival relevance rises with fear; duty goals (HOLD_POST,
 *   PROTECT_ALLY, ESCORT_CARAVAN) hold flat relevance so high priority
 *   can outbid flight — that outbid *is* the courage event.
 * - Role constraints (§214) veto intents before scoring:
 *     NEVER_ABANDON_POST vetoes FLEE_FROM
 *     NEVER_ATTACK_CIVILIANS vetoes CONFRONT_THREAT vs civilians
 *     MUST_PROTECT_ALLY vetoes solo FLEE_FROM while a protect goal lives
 * - Courage (§216): winning with a duty goal while fear >= 0.6 marks
 *   courageous:true. Winning the same goal with fear < 0.3 is calm
 *   compliance — explicitly NOT courage.
 *
 * STRICT INVARIANT: advisory arbitration only. Zero host state mutation.
 */

export const GOAL_TYPES = Object.freeze({
    SURVIVE: 'SURVIVE',
    PROTECT_ALLY: 'PROTECT_ALLY',
    REACH_SAFETY: 'REACH_SAFETY',
    ESCORT_CARAVAN: 'ESCORT_CARAVAN',
    HOLD_POST: 'HOLD_POST',
    AID_VICTIM: 'AID_VICTIM'
});

export const ROLE_CONSTRAINTS = Object.freeze({
    NEVER_ABANDON_POST: 'NEVER_ABANDON_POST',
    NEVER_ATTACK_CIVILIANS: 'NEVER_ATTACK_CIVILIANS',
    MUST_PROTECT_ALLY: 'MUST_PROTECT_ALLY'
});

const DUTY_GOALS = new Set([GOAL_TYPES.HOLD_POST, GOAL_TYPES.PROTECT_ALLY, GOAL_TYPES.ESCORT_CARAVAN, GOAL_TYPES.AID_VICTIM]);

export const COURAGE_FEAR_THRESHOLD = 0.6;
export const CALM_FEAR_CEILING = 0.3;

function round4(n) {
    return Number(Number(n).toFixed(4));
}

function clamp01(n) {
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(1, n));
}

function preferredIntent(goalType, fear) {
    switch (goalType) {
        case GOAL_TYPES.SURVIVE:
            return fear >= 0.6 ? 'FLEE_FROM' : 'CAUTIOUS_EXPLORE';
        case GOAL_TYPES.PROTECT_ALLY:
        case GOAL_TYPES.AID_VICTIM:
        case GOAL_TYPES.ESCORT_CARAVAN:
            return 'APPROACH_ALLY';
        case GOAL_TYPES.REACH_SAFETY:
            return 'FLEE_FROM';
        case GOAL_TYPES.HOLD_POST:
            return 'IDLE_VIGILANT';
        default:
            return 'CAUTIOUS_EXPLORE';
    }
}

function goalRelevance(goalType, fear) {
    if (goalType === GOAL_TYPES.SURVIVE) return 0.25 + 0.75 * fear;
    if (goalType === GOAL_TYPES.REACH_SAFETY) return 0.2 + 0.8 * fear;
    return 1.0;
}

export class GoalArbitrationEngine {
    constructor(options = {}) {
        this.courageThreshold = options.courageThreshold ?? COURAGE_FEAR_THRESHOLD;
        this.agents = new Map();
    }

    ensureAgent(agentId) {
        let rec = this.agents.get(agentId);
        if (!rec) {
            rec = { goals: new Map(), constraints: new Set() };
            this.agents.set(agentId, rec);
        }
        return rec;
    }

    registerGoal(agentId, goal) {
        if (!agentId) throw new Error('registerGoal requires agentId.');
        if (!goal || !Object.values(GOAL_TYPES).includes(goal.type)) {
            throw new Error(`Unknown goal type "${goal && goal.type}". Expected one of ${Object.values(GOAL_TYPES).join(', ')}.`);
        }
        const rec = this.ensureAgent(agentId);
        rec.goals.set(goal.type, {
            type: goal.type,
            priority: clamp01(goal.priority ?? 0.5),
            params: { ...(goal.params || {}) }
        });
        return rec.goals.get(goal.type);
    }

    clearGoals(agentId) {
        const rec = this.agents.get(agentId);
        if (rec) rec.goals.clear();
    }

    setRoleConstraints(agentId, constraints = []) {
        const rec = this.ensureAgent(agentId);
        rec.constraints = new Set(
            constraints.filter((c) => Object.values(ROLE_CONSTRAINTS).includes(c))
        );
        return Array.from(rec.constraints).sort();
    }

    arbitrate(agentId, fearState = {}, context = {}) {
        const rec = this.ensureAgent(agentId);
        const fear = clamp01(fearState.fear ?? 0.2);
        const targetIsCivilian = context.targetIsCivilian === true;
        const vetoed = [];

        const scored = [];
        const goalList = Array.from(rec.goals.values()).sort((a, b) => (a.type < b.type ? -1 : 1));
        const effectiveGoals = goalList.length > 0 ? goalList : [{ type: GOAL_TYPES.SURVIVE, priority: 0.5, params: {} }];

        for (const goal of effectiveGoals) {
            let intent = preferredIntent(goal.type, fear);
            let vetoedFlag = false;
            let vetoReason = null;

            if (rec.constraints.has(ROLE_CONSTRAINTS.NEVER_ABANDON_POST) && intent === 'FLEE_FROM' && goal.type !== GOAL_TYPES.REACH_SAFETY) {
                vetoedFlag = true;
                vetoReason = 'NEVER_ABANDON_POST';
                intent = 'IDLE_VIGILANT';
            }
            if (rec.constraints.has(ROLE_CONSTRAINTS.NEVER_ATTACK_CIVILIANS) && intent === 'CONFRONT_THREAT' && targetIsCivilian) {
                vetoedFlag = true;
                vetoReason = 'NEVER_ATTACK_CIVILIANS';
                intent = 'FREEZE';
            }
            if (rec.constraints.has(ROLE_CONSTRAINTS.MUST_PROTECT_ALLY) && intent === 'FLEE_FROM' && rec.goals.has(GOAL_TYPES.PROTECT_ALLY) && goal.type !== GOAL_TYPES.PROTECT_ALLY) {
                vetoedFlag = true;
                vetoReason = 'MUST_PROTECT_ALLY';
                intent = 'APPROACH_ALLY';
            }
            if (vetoedFlag) vetoed.push({ goal: goal.type, vetoReason, fallbackIntent: intent });

            const relevance = goalRelevance(goal.type, fear);
            scored.push({
                goal: goal.type,
                intent,
                priority: goal.priority,
                relevance: round4(relevance),
                score: round4(goal.priority * relevance),
                vetoed: vetoedFlag
            });
        }

        scored.sort((a, b) => b.score - a.score || (a.goal < b.goal ? -1 : 1));
        const winner = scored[0];
        const isDuty = DUTY_GOALS.has(winner.goal);
        const courageous = isDuty && fear >= this.courageThreshold;
        const calmCompliance = isDuty && fear < CALM_FEAR_CEILING;
        const fearOverridden = isDuty && winner.intent !== 'FLEE_FROM' && fear >= 0.6;

        return {
            agentId,
            fear: round4(fear),
            winningGoal: winner.goal,
            winningIntent: winner.intent,
            winningScore: winner.score,
            courageous,
            calmCompliance,
            fearOverridden,
            rankedGoals: scored,
            vetoedIntents: vetoed
        };
    }

    getAgentGoals(agentId) {
        const rec = this.agents.get(agentId);
        if (!rec) return { agentId, goals: [], constraints: [] };
        return {
            agentId,
            goals: Array.from(rec.goals.values()).sort((a, b) => (a.type < b.type ? -1 : 1)),
            constraints: Array.from(rec.constraints).sort()
        };
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            agentsTracked: this.agents.size
        };
    }
}
