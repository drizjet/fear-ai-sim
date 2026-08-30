/**
 * FearCore — explicit normalized fear-band transition contract.
 *
 * The §260 single-owner rule. The §261 contract: "The latest project
 * history indicates Brain/FearCore ownership remains an active risk.
 * Resolve before building deep new systems that depend on fear state."
 *
 * This module is the SOLE authoritative owner of fear-band state.
 * Brain.js no longer maintains a parallel `this.state` field; it
 * reads `this.fearCore.state` after each `update()` call. Inline
 * state mutations in brain.js have been removed (see
 * `tests/brain-fearcore-authority.test.js`).
 *
 * The band vocabulary has 11 states:
 *
 *   Core 4 (raw-fear driven):
 *     CALM, ALERT, ANXIOUS, PANIC
 *
 *   Extended 7 (context-driven, not raw-fear driven):
 *     PRESENCE_BREAK   (extreme sustained fear, freezes for cooldown)
 *     RECOVER          (recovering from HIDE / FREEZE / PRESENCE_BREAK)
 *     AGGRESSIVE       (high anger overrides fear)
 *     HIDE             (skilled + threatened, exits when threats gone)
 *     FREEZE           (low morale + PANIC, exits randomly)
 *     VAULTING         (movement skill: jumping over obstacles)
 *     CRAWLING         (movement skill: low profile while hiding)
 *
 * The core 4 transitions are exactly the documented enter/exit
 * thresholds. The extended 7 are documented separately in
 * `EXTENDED_BAND_CONFIG` and have their own enter/exit logic.
 *
 * The `update(rawFear, context)` signature is the only state
 * mutation entry point. It returns a result describing the
 * transition and appends a record to `decisionTrace`.
 */

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
    // Core 4 transitions. The enter/exit asymmetry produces
    // hysteresis (§23): the same fear level can produce
    // different transitions depending on the current state.
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
    // Extended 7. Each is a context-driven rule, not a raw-fear
    // threshold. The "enter" field is the condition predicate's
    // threshold (or null when N/A); "exit" is the leave rule.
    extended: Object.freeze({
        PRESENCE_BREAK: {
            // Enter: sustained extreme fear while in PANIC.
            enterFear: 0.95,
            enterStateTimer: 200,
            // Exit: fear has dropped below the exit threshold.
            exitFear: 0.5
        },
        RECOVER: {
            // RECOVER is a transitional state, entered from
            // PRESENCE_BREAK, HIDE, FREEZE. Exit: fear low +
            // recovery progress high.
            exitFear: 0.2,
            exitRecovery: 0.8
        },
        AGGRESSIVE: {
            // Enter: currentAnger > angerThreshold overrides
            // fear-band state.
            enterAnger: 0.6,
            // Exit: anger drops.
            exitAnger: 0.4
        },
        HIDE: {
            // Enter: PANIC + skill > 0.6 + threats > 0.
            enterSkill: 0.6,
            enterMinThreats: 1,
            // Exit: threats == 0 OR fear > panic-escape threshold.
            exitThreats: 0,
            exitPanicFear: 0.85
        },
        FREEZE: {
            // Enter: PANIC + morale < moraleLow.
            enterMorale: 0.4,
            // Exit: random with low probability.
            exitProbability: 0.02
        },
        VAULTING: {
            // Enter: obstacle ahead + skill > 0.5. Driven by
            // context.obstacleAhead.
            enterSkill: 0.5,
            // Exit: obstacle cleared (handled by context).
            exitObstacleCleared: true
        },
        CRAWLING: {
            // Enter: HIDE was active and obstacles present. Driven
            // by context.crawlingMode.
            enterObstaclePresent: true,
            // Exit: HIDE exits and obstacles cleared.
            exitObstacleCleared: true
        }
    })
});

const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export class FearCore {
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
        // Merge extended config with defaults.
        for (const band of EXTENDED_BANDS) {
            const defaults = DEFAULT_FEARCORE_CONFIG.extended[band];
            const userCfg = userExtended[band] || {};
            this.config.extended[band] = { ...defaults, ...userCfg };
        }
        this.state = 'CALM';
        this.tick = 0;
        this.panicLockedUntil = null;
        this.recoveryProgress = 0;
        this.stateTimer = 0;
        this.decisionTrace = [];
        this.maxTraceLength = Math.max(1, Math.floor(finite(config.maxTraceLength, 100)));
    }

    reset(state = 'CALM') {
        if (!FEAR_BANDS.includes(state)) {
            throw new RangeError(`Unknown fear band: ${state}`);
        }
        this.state = state;
        this.tick = 0;
        this.panicLockedUntil = state === 'PANIC'
            ? this.config.panicLockTicks
            : null;
        this.recoveryProgress = 0;
        this.stateTimer = 0;
        this.decisionTrace = [];
        return this.state;
    }

    /**
     * The SOLE state-mutation entry point. Every production read
     * and write of `state` for fear-band logic goes through here.
     *
     * @param {number} rawFear - 0..1 fear level.
     * @param {object} context - {
     *   currentAnger: 0..1,       // drives AGGRESSIVE
     *   morale: 0..1,             // drives FREEZE
     *   threats: number,          // drives HIDE
     *   skill: 0..1,              // drives HIDE, VAULTING
     *   obstacleAhead: boolean,   // drives VAULTING
     *   obstaclePresent: boolean, // drives CRAWLING
     *   rng: () => 0..1           // injected deterministic RNG
     * }
     * @returns {object} result describing the transition
     */
    update(rawFear, context = {}) {
        const fear = Math.max(0, finite(rawFear, 0));
        const previous = this.state;
        this.tick++;
        this.stateTimer += 1;

        // Phase 0: PRESENCE_BREAK bypass. The §260 contract:
        // PRESENCE_BREAK is the highest-priority state and
        // must fire even when the panic lock is active. The
        // check runs before the panic-lock guard.
        if (this.state === 'PANIC' && fear >= this.config.extended.PRESENCE_BREAK.enterFear && this.stateTimer >= this.config.extended.PRESENCE_BREAK.enterStateTimer) {
            this.state = 'PRESENCE_BREAK';
            return this._result(previous, fear, {
                from: previous, to: 'PRESENCE_BREAK', reason: 'EXTREME_FEAR_LOCK',
                threshold: this.config.extended.PRESENCE_BREAK.enterFear
            });
        }

        // Phase 1: panic lock check (§23). If we are in PANIC and
        // the lock is still active, no transition fires.
        if (this.state === 'PANIC' && this.tick < this.panicLockedUntil) {
            return this._result(previous, fear, {
                from: previous, to: previous, reason: 'PANIC_LOCK',
                threshold: this.config.exit.ANXIOUS
            });
        }

        // Phase 2: extended-band transitions first (the §7/§13
        // pattern: behavioral sub-states take precedence over the
        // core fear-band when the context drives them).
        const extendedTransition = this._evaluateExtendedBands(fear, context);
        if (extendedTransition) {
            this.state = extendedTransition.to;
            if (extendedTransition.to === 'PANIC') {
                this.panicLockedUntil = this.tick + this.config.panicLockTicks;
            }
            return this._result(previous, fear, extendedTransition);
        }

        // Phase 2.5: if we are currently in an extended band and
        // the evaluator returned null (no transition), the
        // §260 contract says we STAY in the extended band. The
        // core 4-band transitions and the force-fallback below
        // apply only when the state is a core band.
        if (EXTENDED_BANDS.includes(this.state)) {
            return this._result(previous, fear, {
                from: previous, to: previous, reason: 'EXTENDED_BAND_STAY',
                threshold: null
            });
        }

        // Phase 3: core 4-band transition (raw-fear driven).
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
                this.panicLockedUntil = this.tick + this.config.panicLockTicks;
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
            // RECOVER is a transitional state. Exit to CALM if
            // fear is low and recoveryProgress has accumulated.
            this.recoveryProgress = Math.min(1, this.recoveryProgress + 0.1);
            if (fear < this.config.extended.RECOVER.exitFear && this.recoveryProgress >= this.config.extended.RECOVER.exitRecovery) {
                reason = 'RECOVER_COMPLETE';
                threshold = this.config.extended.RECOVER.exitFear;
                this.state = 'CALM';
                this.recoveryProgress = 0;
            } else {
                // Stay in RECOVER.
                return this._result(previous, fear, {
                    from: previous, to: previous, reason: 'RECOVER_PROGRESS',
                    threshold: this.config.extended.RECOVER.exitFear,
                    recoveryProgress: this.recoveryProgress
                });
            }
        } else if (EXTENDED_BANDS.includes(this.state)) {
            // We were in an extended state but the extended
            // evaluator decided not to keep us there. Fall back
            // to a core band based on raw fear.
            if (fear >= this.config.enter.PANIC) {
                this.state = 'PANIC';
                this.panicLockedUntil = this.tick + this.config.panicLockTicks;
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

        // Sanity guard: if the state somehow drifted off the band
        // list, snap to CALM.
        if (!FEAR_BANDS.includes(this.state)) {
            this.state = 'CALM';
            reason = 'SNAP_TO_CALM';
        }
        return this._result(previous, fear, { from: previous, to: this.state, reason, threshold });
    }

    _evaluateExtendedBands(fear, context) {
        const { currentAnger = 0, morale = 1, threats = 0, skill = 0, obstacleAhead = false, obstaclePresent = false, rng = Math.random } = context;
        const ext = this.config.extended;

        // AGGRESSIVE: high anger overrides fear-band.
        if (this.state !== 'AGGRESSIVE' && currentAnger > ext.AGGRESSIVE.enterAnger) {
            return { from: this.state, to: 'AGGRESSIVE', reason: 'ANGER_OVERRIDE', threshold: ext.AGGRESSIVE.enterAnger };
        }
        if (this.state === 'AGGRESSIVE' && currentAnger < ext.AGGRESSIVE.exitAnger) {
            // Exit AGGRESSIVE. Fall back to a core band.
            if (fear >= this.config.enter.PANIC) return { from: 'AGGRESSIVE', to: 'PANIC', reason: 'EXIT_AGGRESSIVE_TO_PANIC', threshold: this.config.enter.PANIC };
            if (fear >= this.config.enter.ANXIOUS) return { from: 'AGGRESSIVE', to: 'ANXIOUS', reason: 'EXIT_AGGRESSIVE_TO_ANXIOUS', threshold: this.config.enter.ANXIOUS };
            if (fear >= this.config.enter.ALERT) return { from: 'AGGRESSIVE', to: 'ALERT', reason: 'EXIT_AGGRESSIVE_TO_ALERT', threshold: this.config.enter.ALERT };
            return { from: 'AGGRESSIVE', to: 'CALM', reason: 'EXIT_AGGRESSIVE_TO_CALM', threshold: this.config.exit.CALM };
        }

        // PRESENCE_BREAK: sustained extreme fear in PANIC.
        if (this.state === 'PANIC' && fear >= ext.PRESENCE_BREAK.enterFear && this.stateTimer >= ext.PRESENCE_BREAK.enterStateTimer) {
            return { from: 'PANIC', to: 'PRESENCE_BREAK', reason: 'EXTREME_FEAR_LOCK', threshold: ext.PRESENCE_BREAK.enterFear };
        }
        if (this.state === 'PRESENCE_BREAK' && fear < ext.PRESENCE_BREAK.exitFear) {
            return { from: 'PRESENCE_BREAK', to: 'RECOVER', reason: 'EXIT_PRESENCE_BREAK', threshold: ext.PRESENCE_BREAK.exitFear };
        }

        // HIDE: PANIC + skill + threats.
        if (this.state === 'PANIC' && skill > ext.HIDE.enterSkill && threats >= ext.HIDE.enterMinThreats && rng() < 0.3) {
            return { from: 'PANIC', to: 'HIDE', reason: 'HIDE_UNDER_THREAT', threshold: ext.HIDE.enterSkill };
        }
        if (this.state === 'HIDE') {
            if (threats === 0) return { from: 'HIDE', to: 'RECOVER', reason: 'EXIT_HIDE_NO_THREATS', threshold: 0 };
            if (fear > ext.HIDE.exitPanicFear) return { from: 'HIDE', to: 'PANIC', reason: 'EXIT_HIDE_PANIC_ESCAPE', threshold: ext.HIDE.exitPanicFear };
        }

        // FREEZE: PANIC + low morale.
        if (this.state === 'PANIC' && morale < ext.FREEZE.enterMorale && rng() < ext.FREEZE.exitProbability * 10) {
            return { from: 'PANIC', to: 'FREEZE', reason: 'FREEZE_UNDER_PANIC', threshold: ext.FREEZE.enterMorale };
        }
        if (this.state === 'FREEZE' && rng() < ext.FREEZE.exitProbability) {
            return { from: 'FREEZE', to: 'RECOVER', reason: 'EXIT_FREEZE', threshold: 0 };
        }

        // VAULTING: obstacle ahead + skill.
        if (obstacleAhead && skill > ext.VAULTING.enterSkill && this.state !== 'VAULTING') {
            return { from: this.state, to: 'VAULTING', reason: 'OBSTACLE_VAULT', threshold: ext.VAULTING.enterSkill };
        }
        if (this.state === 'VAULTING' && !obstacleAhead) {
            // Exit: fall back to a core band.
            if (fear >= this.config.enter.PANIC) return { from: 'VAULTING', to: 'PANIC', reason: 'EXIT_VAULTING_PANIC', threshold: this.config.enter.PANIC };
            return { from: 'VAULTING', to: 'ALERT', reason: 'EXIT_VAULTING', threshold: 0 };
        }

        // CRAWLING: HIDE + obstacle present.
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
            tick: this.tick,
            panicLocked: this.state === 'PANIC' && this.tick < this.panicLockedUntil,
            panicLockedUntil: this.panicLockedUntil,
            // The decision trace uses `from`/`to` (newer convention)
            // and keeps `previousState` (legacy convention) for
            // backward compatibility with the existing tests.
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
}
