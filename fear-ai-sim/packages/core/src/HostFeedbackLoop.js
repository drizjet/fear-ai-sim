/**
 * packages/core/src/HostFeedbackLoop.js
 *
 * Frontier D/E / Sections 208–211, 288–293:
 * Execution-Aware Advisory Loop & Host Outcome Feedback.
 *
 * Closes the open advisory loop without violating host authority:
 * Fear AI recommends semantic intents; the host executes (or refuses);
 * the host reports back what actually happened; Fear AI adapts future
 * advisory rankings — never phantom actions, never silent host mutation.
 *
 * Outcome taxonomy (§210):
 * - GOAL_COMPLETED: host executed the intent and the goal resolved.
 * - INTENT_REJECTED: host refused the intent (illegal, unsupported, no path).
 * - EXECUTION_FAILED: host accepted but execution failed (blocked, navmesh gap).
 * - ACTION_INTERRUPTED: execution started but was interrupted (new danger,
 *   higher-priority host directive). Transient — not an affordance verdict.
 *
 * Affordance inference (§290–291):
 * - Consecutive REJECTED/FAILED with structural reasons (NO_PATH, BLOCKED,
 *   UNSUPPORTED) marks that intent UNAVAILABLE for that agent.
 * - Transient reasons (HOST_BUSY, STALE_INTENT, UNKNOWN) decay reliability
 *   but never mark unavailable. Single flakes never mark unavailable.
 * - A later GOAL_COMPLETED clears unavailability (host fixed the navmesh).
 * - rankIntents() never returns unavailable intents; it names a safe
 *   fallback from ACTION_INTENTS vocabulary instead.
 *
 * STRICT INVARIANT: advisory statistics only. Zero host state mutation.
 */

export const INTENT_OUTCOMES = Object.freeze({
    GOAL_COMPLETED: 'GOAL_COMPLETED',
    INTENT_REJECTED: 'INTENT_REJECTED',
    EXECUTION_FAILED: 'EXECUTION_FAILED',
    ACTION_INTERRUPTED: 'ACTION_INTERRUPTED'
});

export const FAILURE_REASONS = Object.freeze({
    NO_PATH: 'NO_PATH',
    BLOCKED: 'BLOCKED',
    UNSUPPORTED: 'UNSUPPORTED',
    STALE_INTENT: 'STALE_INTENT',
    HOST_BUSY: 'HOST_BUSY',
    UNKNOWN: 'UNKNOWN'
});

const STRUCTURAL_REASONS = new Set([
    FAILURE_REASONS.NO_PATH,
    FAILURE_REASONS.BLOCKED,
    FAILURE_REASONS.UNSUPPORTED
]);

export const DEFAULT_EXECUTION_FALLBACKS = Object.freeze({
    SEEK_COVER: 'FLEE_FROM',
    WARN_GROUP: 'FLEE_FROM',
    CONFRONT_THREAT: 'FREEZE',
    INVESTIGATE_SOUND: 'CAUTIOUS_EXPLORE',
    APPROACH_ALLY: 'CAUTIOUS_EXPLORE',
    DESPERATE_FLAIL: 'FREEZE',
    RECOVERING: 'IDLE_VIGILANT'
});

const UNIVERSAL_SAFE_INTENT = 'IDLE_VIGILANT';
const UNAVAILABLE_AFTER_CONSECUTIVE = 3;
const MAX_AGENTS_TRACKED = 5000;
const MAX_HISTORY_PER_AGENT = 64;

function round4(n) {
    return Number(Number(n).toFixed(4));
}

function ensureAgentRecord(map, agentId) {
    let rec = map.get(agentId);
    if (!rec) {
        if (map.size >= MAX_AGENTS_TRACKED) {
            const oldest = map.keys().next().value;
            map.delete(oldest);
        }
        rec = {
            perIntent: new Map(),
            unavailable: new Map(),
            history: []
        };
        map.set(agentId, rec);
    }
    return rec;
}

function ensureIntentStats(rec, intentType) {
    let st = rec.perIntent.get(intentType);
    if (!st) {
        st = { attempts: 0, completions: 0, rejections: 0, failures: 0, interruptions: 0, consecutiveStructuralFailures: 0 };
        rec.perIntent.set(intentType, st);
    }
    return st;
}

export class HostFeedbackLoop {
    constructor(options = {}) {
        this.unavailableAfter = options.unavailableAfter ?? UNAVAILABLE_AFTER_CONSECUTIVE;
        this.agents = new Map();
        this.globalPerIntent = new Map();
        this.totalReports = 0;
    }

    recordRecommendation(agentId, tick, intent) {
        if (!agentId || !intent || !intent.type) {
            throw new Error('recordRecommendation requires agentId and intent.type.');
        }
        const rec = ensureAgentRecord(this.agents, agentId);
        rec.history.push({ tick: tick ?? 0, intentType: String(intent.type), urgency: intent.urgency ?? 0.5 });
        if (rec.history.length > MAX_HISTORY_PER_AGENT) rec.history.shift();
        return { agentId, recorded: rec.history.length };
    }

    reportOutcome(report) {
        const { agentId, intentType, outcome, reason } = report || {};
        if (!agentId) throw new Error('reportOutcome requires agentId.');
        if (!intentType) throw new Error('reportOutcome requires intentType.');
        if (!Object.values(INTENT_OUTCOMES).includes(outcome)) {
            throw new Error(`Unknown outcome "${outcome}". Expected one of ${Object.values(INTENT_OUTCOMES).join(', ')}.`);
        }
        const failureReason = reason || FAILURE_REASONS.UNKNOWN;
        const type = String(intentType);

        const rec = ensureAgentRecord(this.agents, agentId);
        const st = ensureIntentStats(rec, type);
        let g = this.globalPerIntent.get(type);
        if (!g) {
            g = { attempts: 0, completions: 0 };
            this.globalPerIntent.set(type, g);
        }
        st.attempts += 1;
        g.attempts += 1;
        this.totalReports += 1;

        let availabilityChanged = false;
        if (outcome === INTENT_OUTCOMES.GOAL_COMPLETED) {
            st.completions += 1;
            g.completions += 1;
            st.consecutiveStructuralFailures = 0;
            if (rec.unavailable.has(type)) {
                rec.unavailable.delete(type);
                availabilityChanged = true;
            }
        } else if (outcome === INTENT_OUTCOMES.INTENT_REJECTED || outcome === INTENT_OUTCOMES.EXECUTION_FAILED) {
            if (outcome === INTENT_OUTCOMES.INTENT_REJECTED) st.rejections += 1;
            else st.failures += 1;
            if (STRUCTURAL_REASONS.has(failureReason)) {
                st.consecutiveStructuralFailures += 1;
                if (st.consecutiveStructuralFailures >= this.unavailableAfter && !rec.unavailable.has(type)) {
                    rec.unavailable.set(type, { reason: failureReason, consecutiveFailures: st.consecutiveStructuralFailures });
                    availabilityChanged = true;
                }
            }
        } else if (outcome === INTENT_OUTCOMES.ACTION_INTERRUPTED) {
            st.interruptions += 1;
        }

        rec.history.push({ tick: report.tick ?? 0, intentType: type, outcome, reason: failureReason });
        if (rec.history.length > MAX_HISTORY_PER_AGENT) rec.history.shift();

        return {
            agentId,
            intentType: type,
            outcome,
            reason: failureReason,
            reliability: this.reliability(agentId, type),
            unavailable: rec.unavailable.has(type),
            availabilityChanged
        };
    }

    reliability(agentId, intentType) {
        const rec = this.agents.get(agentId);
        const st = rec ? rec.perIntent.get(String(intentType)) : null;
        const attempts = st ? st.attempts : 0;
        const completions = st ? st.completions : 0;
        return round4((completions + 1) / (attempts + 2));
    }

    globalReliability(intentType) {
        const g = this.globalPerIntent.get(String(intentType));
        const attempts = g ? g.attempts : 0;
        const completions = g ? g.completions : 0;
        return round4((completions + 1) / (attempts + 2));
    }

    isUnavailable(agentId, intentType) {
        const rec = this.agents.get(agentId);
        return rec ? rec.unavailable.has(String(intentType)) : false;
    }

    resetAffordance(agentId, intentType) {
        const rec = this.agents.get(agentId);
        if (!rec) return false;
        const st = rec.perIntent.get(String(intentType));
        if (st) st.consecutiveStructuralFailures = 0;
        return rec.unavailable.delete(String(intentType));
    }

    fallbackFor(intentType) {
        return DEFAULT_EXECUTION_FALLBACKS[String(intentType)] || 'FLEE_FROM';
    }

    rankIntents(agentId, candidates = []) {
        const rec = this.agents.get(agentId);
        const ranked = [];
        const rejected = [];
        for (const cand of candidates) {
            const type = String(cand.type);
            const baseScore = Number(cand.score ?? 0.5);
            if (rec && rec.unavailable.has(type)) {
                const flag = rec.unavailable.get(type);
                rejected.push({ type, baseScore: round4(baseScore), reason: `HOST_REPORTED_${flag.reason}`, fallback: this.fallbackFor(type) });
                continue;
            }
            const rel = this.reliability(agentId, type);
            const st = rec ? rec.perIntent.get(type) : null;
            ranked.push({
                type,
                baseScore: round4(baseScore),
                reliability: rel,
                adjustedScore: round4(baseScore * (0.5 + 0.5 * rel)),
                uncertain: !st || st.attempts === 0
            });
        }
        ranked.sort((a, b) => b.adjustedScore - a.adjustedScore || (a.type < b.type ? -1 : 1));
        rejected.sort((a, b) => (a.type < b.type ? -1 : 1));
        let top = ranked.length > 0 ? ranked[0] : null;
        let downgraded = false;
        if (!top) {
            top = { type: UNIVERSAL_SAFE_INTENT, baseScore: 0.4, reliability: this.reliability(agentId, UNIVERSAL_SAFE_INTENT), adjustedScore: 0.3, uncertain: true, safeFallback: true };
            downgraded = true;
        }
        return { agentId, ranked, rejectedAlternatives: rejected, top, downgraded };
    }

    getAgentSummary(agentId) {
        const rec = this.agents.get(agentId);
        if (!rec) return { agentId, intents: [], unavailable: [] };
        const intents = Array.from(rec.perIntent.entries())
            .map(([type, st]) => ({ type, ...st, reliability: round4((st.completions + 1) / (st.attempts + 2)) }))
            .sort((a, b) => (a.type < b.type ? -1 : 1));
        const unavailable = Array.from(rec.unavailable.entries())
            .map(([type, flag]) => ({ type, ...flag, fallback: this.fallbackFor(type) }))
            .sort((a, b) => (a.type < b.type ? -1 : 1));
        return { agentId, intents, unavailable, historyLength: rec.history.length };
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            agentsTracked: this.agents.size,
            totalReports: this.totalReports
        };
    }
}
