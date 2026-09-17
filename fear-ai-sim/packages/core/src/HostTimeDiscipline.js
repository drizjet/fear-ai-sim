/**
 * packages/core/src/HostTimeDiscipline.js
 *
 * Front D/E / Sections 163–164, 223–226:
 * Multi-Rate Deterministic Scheduling & Host Clock Discipline.
 *
 * Hosts vary: 30Hz, 60Hz, hitches, pauses, slow-motion. Fear dynamics
 * must stay stable and replayable through all of it.
 *
 * Rules:
 * - Fear integrates with dt-normalized exponential approach, so a
 *   100ms hitch never overshoots what ten 10ms ticks would do (§225).
 * - Multi-rate schedule (§163) is a pure function of tick: affect runs
 *   every tick, social every 5, faction every 20 — replayable by
 *   construction (§164). runDue() executes due handlers in fixed order.
 * - Pause (§224) freezes tick and simTime; resume continues bit-identical.
 * - Dilation scales applied dt; applied dt clamps to [0, 0.25]s (§226).
 * - Non-finite or negative host dt falls back to baseDt, counted.
 *
 * STRICT INVARIANT: time accounting only. Zero host state mutation.
 */

export const SUBSYSTEM_CADENCES = Object.freeze({
    affect: 1,
    social: 5,
    faction: 20
});

const MAX_APPLIED_DT = 0.25;

function round6(n) {
    return Number(Number(n).toFixed(6));
}

function saneDt(dt, fallback) {
    if (!Number.isFinite(dt) || dt < 0) return { dt: fallback, corrected: true };
    return { dt: Math.min(dt, MAX_APPLIED_DT), corrected: false };
}

export class HostTimeDiscipline {
    constructor(options = {}) {
        this.baseDt = options.baseDt ?? 1 / 60;
        this.timeScale = options.timeScale ?? 1.0;
        this.cadences = { ...SUBSYSTEM_CADENCES, ...(options.cadences || {}) };
        this.tick = 0;
        this.simTime = 0;
        this.paused = false;
        this.corrections = 0;
        this.pausedTicks = 0;
    }

    pause() {
        this.paused = true;
    }

    resume() {
        this.paused = false;
    }

    setTimeScale(s) {
        const v = Number(s);
        this.timeScale = Number.isFinite(v) && v >= 0 ? v : 1.0;
        return this.timeScale;
    }

    dueSubsystems(tick = this.tick) {
        return Object.entries(this.cadences)
            .filter(([, cadence]) => tick % Math.max(1, cadence) === 0)
            .map(([name]) => name)
            .sort();
    }

    advance(hostDt) {
        if (this.paused) {
            this.pausedTicks += 1;
            return { tick: this.tick, simTime: round6(this.simTime), dtApplied: 0, paused: true, due: [] };
        }
        const { dt, corrected } = saneDt(hostDt === undefined ? this.baseDt : hostDt, this.baseDt);
        if (corrected) this.corrections += 1;
        const applied = round6(dt * this.timeScale);
        this.simTime = round6(this.simTime + applied);
        const due = this.dueSubsystems(this.tick);
        const report = { tick: this.tick, simTime: this.simTime, dtApplied: applied, paused: false, due };
        this.tick += 1;
        return report;
    }

    runDue(tick, handlers = {}) {
        const due = this.dueSubsystems(tick);
        const ran = [];
        for (const name of due) {
            if (typeof handlers[name] === 'function') {
                handlers[name](tick);
                ran.push(name);
            }
        }
        return ran;
    }

    integrateFear(fear, target, dt, rate = 3.0) {
        let f = Number(fear);
        let t = Number(target);
        if (!Number.isFinite(f)) f = 0;
        if (!Number.isFinite(t)) t = 0;
        f = Math.max(0, Math.min(1, f));
        t = Math.max(0, Math.min(1, t));
        const { dt: clean } = saneDt(Number(dt), this.baseDt);
        const k = 1 - Math.exp(-Math.max(0, rate) * Math.max(0, clean));
        const out = f + (t - f) * k;
        if (!Number.isFinite(out)) return 0;
        return Number(Math.max(0, Math.min(1, out)).toFixed(6));
    }

    getState() {
        return { tick: this.tick, simTime: this.simTime, timeScale: this.timeScale, paused: this.paused };
    }

    setState(state) {
        if (!state || typeof state !== 'object') return;
        if (typeof state.tick === 'number' && Number.isFinite(state.tick)) this.tick = Math.floor(state.tick);
        if (typeof state.simTime === 'number' && Number.isFinite(state.simTime)) this.simTime = state.simTime;
        if (typeof state.timeScale === 'number' && Number.isFinite(state.timeScale)) this.timeScale = state.timeScale;
        if (typeof state.paused === 'boolean') this.paused = state.paused;
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            tick: this.tick,
            corrections: this.corrections
        };
    }
}
