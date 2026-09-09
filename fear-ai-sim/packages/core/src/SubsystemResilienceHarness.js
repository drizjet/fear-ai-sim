/**
 * packages/core/src/SubsystemResilienceHarness.js
 *
 * Front E / Sections 138–139, 197, 199:
 * Modular Subsystem Isolation & Graceful Degradation Harness.
 *
 * Proves the reliability claim: any optional subsystem (memory,
 * relationships, groups, factions, economy, world) may throw, hang
 * (simulated via injected failure), or be disabled via feature flag —
 * and core affect still resolves a safe advisory intent.
 *
 * Design:
 * - Subsystems register as pure contributor functions:
 *     evaluate(ctx) -> modifier | throws
 * - `core` is the single critical contributor (affect → intent).
 *   A core throw surfaces as CORE_FAILURE and is never masked (§126:
 *   host retains safe legal behavior; middleware reports, never freezes).
 * - Optional contributors run in registration order inside isolated
 *   try/catch boundaries. A throw records FAILED + fallbackUsed and
 *   contributes its neutral fallback instead of poisoning the tick.
 * - Feature flags (§139) skip disabled modules as SKIPPED.
 * - Versioned capabilities (§140): each module declares a version;
 *   negotiate() filters to host-compatible modules.
 * - Bounded history (ring cap); deterministic ordering and rounding.
 *
 * STRICT INVARIANT: advisory aggregation only. Zero host state mutation.
 */

export const MODULE_STATUS = Object.freeze({
    OK: 'OK',
    FAILED: 'FAILED',
    SKIPPED: 'SKIPPED',
    CORE_FAILURE: 'CORE_FAILURE'
});

export const CANONICAL_OPTIONAL_MODULES = Object.freeze([
    'memory',
    'relationships',
    'groups',
    'factions',
    'economy',
    'world'
]);

const MAX_TICK_HISTORY = 128;

function round4(n) {
    return Number(Number(n).toFixed(4));
}

function compareVersions(a, b) {
    const pa = String(a || '0.0.0').split('.').map((x) => parseInt(x, 10) || 0);
    const pb = String(b || '0.0.0').split('.').map((x) => parseInt(x, 10) || 0);
    for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pa[i] - pb[i];
    }
    return 0;
}

export class SubsystemResilienceHarness {
    constructor(options = {}) {
        this.modules = new Map();
        this.tickHistory = [];
        this.totalTicks = 0;
        this.totalFailures = 0;
        if (options.coreEvaluate) {
            this.registerModule('core', options.coreEvaluate, { critical: true, version: options.coreVersion || '1.0.0', fallback: options.coreFallback ?? null });
        }
    }

    registerModule(name, evaluate, opts = {}) {
        if (!name) throw new Error('registerModule requires a name.');
        if (typeof evaluate !== 'function') throw new Error(`Module "${name}" requires an evaluate(ctx) function.`);
        if (this.modules.has(name)) throw new Error(`Module "${name}" already registered.`);
        this.modules.set(name, {
            name: String(name),
            evaluate,
            critical: opts.critical === true,
            version: opts.version || '1.0.0',
            fallback: opts.fallback !== undefined ? opts.fallback : 0,
            enabled: opts.enabled !== false,
            failing: false,
            failureError: null
        });
        return this;
    }

    setEnabled(name, enabled) {
        const m = this.modules.get(name);
        if (!m) throw new Error(`Unknown module "${name}".`);
        if (m.critical && enabled === false) throw new Error('Core module cannot be disabled.');
        m.enabled = enabled !== false;
        return m.enabled;
    }

    injectFailure(name, error) {
        const m = this.modules.get(name);
        if (!m) throw new Error(`Unknown module "${name}".`);
        if (m.critical) throw new Error('Cannot inject failure into the critical core module via injectFailure; test core paths explicitly.');
        m.failing = true;
        m.failureError = error instanceof Error ? error : new Error(String(error || 'INJECTED_MODULE_FAILURE'));
        return true;
    }

    clearFailure(name) {
        const m = this.modules.get(name);
        if (!m) throw new Error(`Unknown module "${name}".`);
        m.failing = false;
        m.failureError = null;
        return true;
    }

    negotiate(hostVersions = {}) {
        const compatible = [];
        const incompatible = [];
        for (const [modName, mod] of this.modules) {
            const required = hostVersions[modName];
            if (required === undefined || compareVersions(mod.version, required) >= 0) {
                compatible.push({ name: modName, version: mod.version });
            } else {
                incompatible.push({ name: modName, version: mod.version, required });
            }
        }
        compatible.sort((a, b) => (a.name < b.name ? -1 : 1));
        incompatible.sort((a, b) => (a.name < b.name ? -1 : 1));
        return { compatible, incompatible };
    }

    tick(ctx = {}) {
        const perModule = [];
        let coreResult = null;
        let coreAlive = true;
        let coreError = null;
        const contributions = {};

        for (const [name, m] of this.modules) {
            if (!m.enabled) {
                perModule.push({ name, status: MODULE_STATUS.SKIPPED, fallbackUsed: true, version: m.version });
                contributions[name] = m.fallback;
                continue;
            }
            try {
                if (m.failing) throw m.failureError || new Error(`INJECTED_FAILURE:${name}`);
                const out = m.evaluate(ctx);
                perModule.push({ name, status: MODULE_STATUS.OK, fallbackUsed: false, version: m.version });
                contributions[name] = out === undefined ? m.fallback : out;
                if (m.critical) coreResult = contributions[name];
            } catch (err) {
                this.totalFailures += 1;
                if (m.critical) {
                    coreAlive = false;
                    coreError = String(err && err.message ? err.message : err);
                    perModule.push({ name, status: MODULE_STATUS.CORE_FAILURE, fallbackUsed: false, version: m.version, error: coreError });
                } else {
                    perModule.push({ name, status: MODULE_STATUS.FAILED, fallbackUsed: true, version: m.version, error: String(err && err.message ? err.message : err) });
                    contributions[name] = m.fallback;
                }
            }
        }

        const failedModules = perModule.filter((r) => r.status === MODULE_STATUS.FAILED).map((r) => r.name);
        const skippedModules = perModule.filter((r) => r.status === MODULE_STATUS.SKIPPED).map((r) => r.name);
        const degraded = failedModules.length > 0 || skippedModules.length > 0;
        const advisoryIntent = coreAlive ? this.deriveAdvisoryIntent(coreResult, contributions) : null;

        const report = {
            tick: ctx.tick ?? this.totalTicks,
            coreAlive,
            coreError,
            degraded,
            failedModules,
            skippedModules,
            perModule,
            contributions: this.roundContributions(contributions),
            advisoryIntent
        };
        this.totalTicks += 1;
        this.tickHistory.push({ tick: report.tick, coreAlive, failedModules: [...failedModules], skippedModules: [...skippedModules] });
        if (this.tickHistory.length > MAX_TICK_HISTORY) this.tickHistory.shift();
        return report;
    }

    deriveAdvisoryIntent(coreResult, contributions) {
        let fear = 0.2;
        if (typeof coreResult === 'number' && Number.isFinite(coreResult)) {
            fear = Math.max(0, Math.min(1, coreResult));
        } else if (coreResult && typeof coreResult.fear === 'number' && Number.isFinite(coreResult.fear)) {
            fear = Math.max(0, Math.min(1, coreResult.fear));
        }
        let modifier = 0;
        for (const [name, value] of Object.entries(contributions)) {
            if (name === 'core') continue;
            if (typeof value === 'number' && Number.isFinite(value)) modifier += value;
        }
        modifier = Math.max(-0.5, Math.min(0.5, modifier));
        const adjusted = round4(Math.max(0, Math.min(1, fear + modifier)));
        return {
            type: adjusted >= 0.6 ? 'FLEE_FROM' : adjusted >= 0.35 ? 'CAUTIOUS_EXPLORE' : 'IDLE_VIGILANT',
            fear,
            modifier: round4(modifier),
            adjustedFear: adjusted,
            confidence: 0.85
        };
    }

    roundContributions(contributions) {
        const out = {};
        for (const [k, v] of Object.entries(contributions)) {
            out[k] = typeof v === 'number' ? round4(v) : v;
        }
        return out;
    }

    getHealth() {
        const byModule = {};
        for (const [name, m] of this.modules) {
            byModule[name] = { enabled: m.enabled, failing: m.failing, critical: m.critical, version: m.version };
        }
        return {
            totalTicks: this.totalTicks,
            totalFailures: this.totalFailures,
            recentTicks: this.tickHistory.slice(-8),
            byModule
        };
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            modulesRegistered: this.modules.size,
            totalTicks: this.totalTicks,
            totalFailures: this.totalFailures
        };
    }
}
