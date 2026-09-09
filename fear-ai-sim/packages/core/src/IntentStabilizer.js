/**
 * packages/core/src/IntentStabilizer.js
 *
 * Front B / Sections 294–296:
 * Intent Stability, Responsiveness & Chatter Metric.
 *
 * Frame-rate arbitration oscillates without damping (FLEE→HIDE→FLEE
 * every tick); naive damping ignores new danger. This module holds
 * the current intent through a cooldown window unless the candidate's
 * urgency beats it by a hysteresis margin — and measures chatter
 * (intent flips per window) as a diagnostic, never as a blind target.
 */

function round4(n) {
    return Number(Number(n).toFixed(4));
}

export class IntentStabilizer {
    constructor(options = {}) {
        this.cooldownTicks = options.cooldownTicks ?? 5;
        this.hysteresisMargin = options.hysteresisMargin ?? 0.15;
        this.states = new Map();
    }

    ensureAgent(agentId) {
        let st = this.states.get(agentId);
        if (!st) {
            st = { current: null, lockedUntil: -1, flips: [], window: 64 };
            this.states.set(agentId, st);
        }
        return st;
    }

    update(agentId, tick, candidate) {
        if (!candidate || !candidate.type) throw new Error('update requires candidate.type.');
        const st = this.ensureAgent(agentId);
        const urgency = Number.isFinite(candidate.urgency) ? candidate.urgency : 0.5;

        if (!st.current) {
            st.current = { type: String(candidate.type), urgency: round4(urgency), sinceTick: tick };
            st.lockedUntil = tick + this.cooldownTicks;
            return { intent: { ...st.current }, switched: true, held: false, reason: 'FIRST_INTENT' };
        }

        const same = st.current.type === String(candidate.type);
        if (same) {
            st.current.urgency = round4(Math.max(st.current.urgency, urgency));
            return { intent: { ...st.current }, switched: false, held: true, reason: 'CONFIRMED' };
        }

        const inCooldown = tick < st.lockedUntil;
        const urgencyJump = urgency - st.current.urgency;
        if (inCooldown && urgencyJump < this.hysteresisMargin) {
            return { intent: { ...st.current }, switched: false, held: true, reason: 'COOLDOWN_HOLD' };
        }

        st.flips.push(tick);
        while (st.flips.length > 0 && st.flips[0] <= tick - st.window) st.flips.shift();
        st.current = { type: String(candidate.type), urgency: round4(urgency), sinceTick: tick };
        st.lockedUntil = tick + this.cooldownTicks;
        return { intent: { ...st.current }, switched: true, held: false, reason: inCooldown ? 'OVERRIDE_DANGER' : 'COOLDOWN_EXPIRED' };
    }

    chatter(agentId, tick) {
        const st = this.states.get(agentId);
        if (!st) return { flips: 0, rate: 0 };
        while (st.flips.length > 0 && st.flips[0] <= tick - st.window) st.flips.shift();
        return { flips: st.flips.length, rate: round4(st.flips.length / st.window) };
    }

    reset(agentId) {
        if (agentId) {
            this.states.delete(agentId);
            return;
        }
        this.states.clear();
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            agentsTracked: this.states.size
        };
    }
}
