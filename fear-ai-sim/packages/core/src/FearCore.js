/**
 * FearCore - Authoritative owner of fear-band state and hysteresis transitions.
 * Zero external dependencies. Fully deterministic.
 */

import { DeterministicRng } from './DeterministicRng.js';

export const FEAR_BANDS = Object.freeze([
    'CALM',
    'ALERT',
    'ANXIOUS',
    'PANIC',
    'PRESENCE_BREAK',
    'RECOVER',
    'AGGRESSIVE',
    'HIDE',
    'FREEZE',
    'VAULTING',
    'CRAWLING'
]);

export const CORE_BANDS = Object.freeze(['CALM', 'ALERT', 'ANXIOUS', 'PANIC']);
export const EXTENDED_BANDS = Object.freeze([
    'PRESENCE_BREAK', 'RECOVER', 'AGGRESSIVE',
    'HIDE', 'FREEZE', 'VAULTING', 'CRAWLING'
]);

export const DEFAULT_FEARCORE_CONFIG = Object.freeze({
    enter: Object.freeze({
        ALERT: 0.8,
        ANXIOUS: 1.4,
        PANIC: 3.8
    }),
    exit: Object.freeze({
        CALM: 0.55,
        ALERT: 0.8,
        ANXIOUS: 1.2
    }),
    panicLockTicks: 10,
    extended: Object.freeze({
        PRESENCE_BREAK: {
            enterFear: 0.95,
            enterStateTimer: 200,
            exitFear: 0.5
        },
        RECOVER: {
            exitFear: 0.2,
            exitRecovery: 0.8
        },
        AGGRESSIVE: {
            enterAnger: 0.6,
            exitAnger: 0.4
        },
        HIDE: {
            enterSkill: 0.6,
            enterMinThreats: 1,
            exitThreats: 0,
            exitPanicFear: 0.85
        },
        FREEZE: {
            enterMorale: 0.4,
            exitProbability: 0.02
        },
        VAULTING: {
            enterSkill: 0.5,
            exitObstacleCleared: true
        },
        CRAWLING: {
            enterObstaclePresent: true,
            exitObstacleCleared: true
        }
    })
});

const finite = (val, fallback) => (Number.isFinite(val) ? val : fallback);

export class FearCore {
    /**
     * @param {object} [config={}]
     * @param {string|number} [config.seed] - fallback RNG seed (CCIII fix)
     */
    constructor(config = {}) {
        const userExtended = config.extended || {};
        this.config = {
            enter: { ...DEFAULT_FEARCORE_CONFIG.enter, ...(config.enter || {}) },
            exit: { ...DEFAULT_FEARCORE_CONFIG.exit, ...(config.exit || {}) },
            panicLockTicks: Math.max(0, Math.floor(finite(
                config.panicLockTicks,
                DEFAULT_FEARCORE_CONFIG.panicLockTicks
            ))),
            extended: {}
        };

        for (const band of EXTENDED_BANDS) {
            const defaults = DEFAULT_FEARCORE_CONFIG.extended[band];
            const userCfg = userExtended[band] || {};
            this.config.extended[band] = { ...defaults, ...userCfg };
        }

        this.state = 'CALM';
        this.tickCount = 0;
        this.panicLockedUntil = null;
        this.recoveryProgress = 0;
        this.stateTimer = 0;
        this.decisionTrace = [];
        this.maxTraceLength = Math.max(1, Math.floor(finite(config.maxTraceLength, 100)));
        // Deterministic fallback RNG (CCIII red-team fix): Math.random default
        // made cross-process replays diverge on extended-band branches.
        this._rngSeed = config.seed ?? 'fearcore-default';
        this._defaultRng = new DeterministicRng(this._rngSeed);
        this._defaultRngFn = () => this._defaultRng.random();
    }
    /**
     * Reset state
     * @param {string} [state='CALM']
     */
    reset(state = 'CALM') {
        if (!FEAR_BANDS.includes(state)) {
            throw new RangeError(`Unknown fear band: ${state}`);
        }
        this.state = state;
        this.tickCount = 0;
        this.panicLockedUntil = state === 'PANIC' ? this.config.panicLockTicks : null;
        this.recoveryProgress = 0;
        this.stateTimer = 0;
        this.decisionTrace = [];
        this._defaultRng = new DeterministicRng(this._rngSeed);
        return this.state;
    }

    /**
     * Evaluate state transition
     * @param {number} rawFear - fear value (0..5 scale, where 3.8+ is panic)
     * @param {object} [context={}]
     * @returns {object} transition result
     */
    update(rawFear, context = {}) {
        const fear = Math.max(0, finite(rawFear, 0));
        const previous = this.state;
        this.tickCount++;
        this.stateTimer++;

        const rng = typeof context.rng === 'function' ? context.rng : this._defaultRngFn;

        // Phase 0: PRESENCE_BREAK bypass
        if (
            this.state === 'PANIC' &&
            fear >= this.config.extended.PRESENCE_BREAK.enterFear &&
            this.stateTimer >= this.config.extended.PRESENCE_BREAK.enterStateTimer
        ) {
            this.state = 'PRESENCE_BREAK';
            return this._result(previous, fear, {
                from: previous,
                to: 'PRESENCE_BREAK',
                reason: 'EXTREME_FEAR_LOCK',
                threshold: this.config.extended.PRESENCE_BREAK.enterFear
            });
        }

        // Phase 1: Panic Lock Check
        if (this.state === 'PANIC' && this.tickCount < this.panicLockedUntil) {
            return this._result(previous, fear, {
                from: previous,
                to: previous,
                reason: 'PANIC_LOCK',
                threshold: this.config.exit.ANXIOUS
            });
        }

        // Phase 2: Extended Bands Evaluation
        const extendedTransition = this._evaluateExtendedBands(fear, context, rng);
        if (extendedTransition) {
            this.state = extendedTransition.to;
            if (extendedTransition.to === 'PANIC') {
                this.panicLockedUntil = this.tickCount + this.config.panicLockTicks;
            }
            return this._result(previous, fear, extendedTransition);
        }

        // Phase 2.5: Stay in extended band if still active. RECOVER is
        // exempt: its progress/completion branch lives in Phase 3, and
        // holding it here made recovery uncompletable (dead exit branch).
        if (this.state !== 'RECOVER' && EXTENDED_BANDS.includes(this.state)) {
            return this._result(previous, fear, {
                from: previous,
                to: previous,
                reason: 'EXTENDED_BAND_STAY',
                threshold: null
            });
        }

        // Phase 3: Core 4-band transitions with hysteresis
        let reason = 'NO_TRANSITION';
        let threshold = null;

        if (this.state === 'CALM' && fear >= this.config.enter.ALERT) {
            threshold = this.config.enter.ALERT;
            reason = 'ENTER_ALERT';
            this.state = 'ALERT';
        } else if (this.state === 'ALERT') {
            if (fear >= this.config.enter.ANXIOUS) {
                threshold = this.config.enter.ANXIOUS;
                reason = 'ENTER_ANXIOUS';
                this.state = 'ANXIOUS';
            } else if (fear < this.config.exit.CALM) {
                threshold = this.config.exit.CALM;
                reason = 'EXIT_TO_CALM';
                this.state = 'CALM';
            }
        } else if (this.state === 'ANXIOUS') {
            if (fear >= this.config.enter.PANIC) {
                threshold = this.config.enter.PANIC;
                reason = 'ENTER_PANIC';
                this.state = 'PANIC';
                this.panicLockedUntil = this.tickCount + this.config.panicLockTicks;
            } else if (fear < this.config.exit.ALERT) {
                threshold = this.config.exit.ALERT;
                reason = 'EXIT_TO_ALERT';
                this.state = 'ALERT';
            }
        } else if (this.state === 'PANIC' && fear < this.config.exit.ANXIOUS) {
            threshold = this.config.exit.ANXIOUS;
            reason = 'EXIT_TO_ANXIOUS';
            this.state = 'ANXIOUS';
            this.panicLockedUntil = null;
        } else if (this.state === 'RECOVER') {
            // NOW-20: renewed lethal threat overrides convalescence (mirrors
            // the FORCE_PANIC sibling pattern below; previously RECOVER was
            // the only extended band with no escalation path at all).
            if (fear >= this.config.enter.PANIC) {
                this.state = 'PANIC';
                this.panicLockedUntil = this.tickCount + this.config.panicLockTicks;
                this.recoveryProgress = 0;
                reason = 'RECOVER_PANIC_OVERRIDE';
                threshold = this.config.enter.PANIC;
            } else {
                this.recoveryProgress = Math.min(1, this.recoveryProgress + 0.1);
                if (
                    fear < this.config.extended.RECOVER.exitFear &&
                    this.recoveryProgress >= this.config.extended.RECOVER.exitRecovery
                ) {
                    reason = 'RECOVER_COMPLETE';
                    threshold = this.config.extended.RECOVER.exitFear;
                    this.state = 'CALM';
                    this.recoveryProgress = 0;
                } else {
                    return this._result(previous, fear, {
                        from: previous,
                        to: previous,
                        reason: 'RECOVER_PROGRESS',
                        threshold: this.config.extended.RECOVER.exitFear,
                        recoveryProgress: this.recoveryProgress
                    });
                }
            }
        } else if (EXTENDED_BANDS.includes(this.state)) {
            if (fear >= this.config.enter.PANIC) {
                this.state = 'PANIC';
                this.panicLockedUntil = this.tickCount + this.config.panicLockTicks;
                reason = 'FORCE_PANIC';
                threshold = this.config.enter.PANIC;
            } else if (fear >= this.config.enter.ANXIOUS) {
                this.state = 'ANXIOUS';
                reason = 'FORCE_ANXIOUS';
                threshold = this.config.enter.ANXIOUS;
            } else if (fear >= this.config.enter.ALERT) {
                this.state = 'ALERT';
                reason = 'FORCE_ALERT';
                threshold = this.config.enter.ALERT;
            } else {
                this.state = 'CALM';
                reason = 'FORCE_CALM';
                threshold = this.config.exit.CALM;
            }
        }

        if (!FEAR_BANDS.includes(this.state)) {
            this.state = 'CALM';
            reason = 'SNAP_TO_CALM';
        }

        return this._result(previous, fear, { from: previous, to: this.state, reason, threshold });
    }

    _evaluateExtendedBands(fear, context, rng) {
        const {
            currentAnger = 0,
            morale = 1,
            threats = 0,
            skill = 0,
            obstacleAhead = false,
            obstaclePresent = false
        } = context;
        const ext = this.config.extended;

        // AGGRESSIVE
        if (this.state !== 'AGGRESSIVE' && currentAnger > ext.AGGRESSIVE.enterAnger) {
            return { from: this.state, to: 'AGGRESSIVE', reason: 'ANGER_OVERRIDE', threshold: ext.AGGRESSIVE.enterAnger };
        }
        if (this.state === 'AGGRESSIVE' && currentAnger < ext.AGGRESSIVE.exitAnger) {
            if (fear >= this.config.enter.PANIC) return { from: 'AGGRESSIVE', to: 'PANIC', reason: 'EXIT_AGGRESSIVE_TO_PANIC', threshold: this.config.enter.PANIC };
            if (fear >= this.config.enter.ANXIOUS) return { from: 'AGGRESSIVE', to: 'ANXIOUS', reason: 'EXIT_AGGRESSIVE_TO_ANXIOUS', threshold: this.config.enter.ANXIOUS };
            if (fear >= this.config.enter.ALERT) return { from: 'AGGRESSIVE', to: 'ALERT', reason: 'EXIT_AGGRESSIVE_TO_ALERT', threshold: this.config.enter.ALERT };
            return { from: 'AGGRESSIVE', to: 'CALM', reason: 'EXIT_AGGRESSIVE_TO_CALM', threshold: this.config.exit.CALM };
        }

        // PRESENCE_BREAK
        if (this.state === 'PANIC' && fear >= ext.PRESENCE_BREAK.enterFear && this.stateTimer >= ext.PRESENCE_BREAK.enterStateTimer) {
            return { from: 'PANIC', to: 'PRESENCE_BREAK', reason: 'EXTREME_FEAR_LOCK', threshold: ext.PRESENCE_BREAK.enterFear };
        }
        if (this.state === 'PRESENCE_BREAK' && fear < ext.PRESENCE_BREAK.exitFear) {
            return { from: 'PRESENCE_BREAK', to: 'RECOVER', reason: 'EXIT_PRESENCE_BREAK', threshold: ext.PRESENCE_BREAK.exitFear };
        }

        // HIDE
        if (this.state === 'PANIC' && skill > ext.HIDE.enterSkill && threats >= ext.HIDE.enterMinThreats && rng() < 0.3) {
            return { from: 'PANIC', to: 'HIDE', reason: 'HIDE_UNDER_THREAT', threshold: ext.HIDE.enterSkill };
        }
        if (this.state === 'HIDE') {
            if (threats === 0) return { from: 'HIDE', to: 'RECOVER', reason: 'EXIT_HIDE_NO_THREATS', threshold: 0 };
            if (fear > ext.HIDE.exitPanicFear) return { from: 'HIDE', to: 'PANIC', reason: 'EXIT_HIDE_PANIC_ESCAPE', threshold: ext.HIDE.exitPanicFear };
        }

        // FREEZE
        if (this.state === 'PANIC' && morale < ext.FREEZE.enterMorale && rng() < ext.FREEZE.exitProbability * 10) {
            return { from: 'PANIC', to: 'FREEZE', reason: 'FREEZE_UNDER_PANIC', threshold: ext.FREEZE.enterMorale };
        }
        if (this.state === 'FREEZE' && rng() < ext.FREEZE.exitProbability) {
            return { from: 'FREEZE', to: 'RECOVER', reason: 'EXIT_FREEZE', threshold: 0 };
        }

        // VAULTING
        if (obstacleAhead && skill > ext.VAULTING.enterSkill && this.state !== 'VAULTING') {
            return { from: this.state, to: 'VAULTING', reason: 'OBSTACLE_VAULT', threshold: ext.VAULTING.enterSkill };
        }
        if (this.state === 'VAULTING' && !obstacleAhead) {
            if (fear >= this.config.enter.PANIC) return { from: 'VAULTING', to: 'PANIC', reason: 'EXIT_VAULTING_PANIC', threshold: this.config.enter.PANIC };
            return { from: 'VAULTING', to: 'ALERT', reason: 'EXIT_VAULTING', threshold: 0 };
        }

        // CRAWLING
        if (this.state === 'HIDE' && obstaclePresent && this.state !== 'CRAWLING') {
            return { from: 'HIDE', to: 'CRAWLING', reason: 'CRAWL_UNDER_OBSTACLE', threshold: 0 };
        }
        if (this.state === 'CRAWLING' && (!obstaclePresent || this.state === 'HIDE')) {
            return { from: 'CRAWLING', to: 'HIDE', reason: 'EXIT_CRAWLING', threshold: 0 };
        }

        return null;
    }

    _result(previous, fear, metadata = {}) {
        const result = {
            state: this.state,
            previousState: previous,
            changed: previous !== this.state,
            fear,
            tick: this.tickCount,
            panicLocked: this.state === 'PANIC' && this.tickCount < this.panicLockedUntil,
            panicLockedUntil: this.panicLockedUntil,
            from: metadata.from !== undefined ? metadata.from : previous,
            to: metadata.to !== undefined ? metadata.to : this.state,
            reason: metadata.reason || 'NO_TRANSITION',
            threshold: metadata.threshold ?? null,
            recoveryProgress: metadata.recoveryProgress ?? null
        };
        this.decisionTrace.push({ ...result });
        if (this.decisionTrace.length > this.maxTraceLength) this.decisionTrace.shift();
        return result;
    }

    getDecisionTrace() {
        return this.decisionTrace.map(entry => ({ ...entry }));
    }

    getState() {
        return {
            config: JSON.parse(JSON.stringify(this.config)),
            maxTraceLength: this.maxTraceLength,
            rng: this._defaultRng.getState(),
            state: this.state,
            tickCount: this.tickCount,
            panicLockedUntil: this.panicLockedUntil,
            recoveryProgress: this.recoveryProgress,
            stateTimer: this.stateTimer,
            traceCount: this.decisionTrace.length
        };
    }

    setState(snapshot) {
        if (!snapshot) return;
        if (snapshot.config && typeof snapshot.config === 'object') {
            const nextConfig = snapshot.config;
            this.config = {
                enter: { ...this.config.enter, ...(nextConfig.enter || {}) },
                exit: { ...this.config.exit, ...(nextConfig.exit || {}) },
                panicLockTicks: Number.isFinite(nextConfig.panicLockTicks)
                    ? Math.max(0, Math.floor(nextConfig.panicLockTicks))
                    : this.config.panicLockTicks,
                extended: { ...this.config.extended }
            };
            for (const band of EXTENDED_BANDS) {
                this.config.extended[band] = {
                    ...(this.config.extended[band] || {}),
                    ...((nextConfig.extended && nextConfig.extended[band]) || {})
                };
            }
        }
        if (Number.isFinite(snapshot.maxTraceLength) && snapshot.maxTraceLength >= 1) {
            this.maxTraceLength = Math.floor(snapshot.maxTraceLength);
        }
        if (snapshot.rng) this._defaultRng.setState(snapshot.rng);
        this.state = snapshot.state || 'CALM';
        this.tickCount = snapshot.tickCount || 0;
        this.panicLockedUntil = snapshot.panicLockedUntil ?? null;
        this.recoveryProgress = snapshot.recoveryProgress || 0;
        this.stateTimer = snapshot.stateTimer || 0;
    }
}

export default FearCore;
