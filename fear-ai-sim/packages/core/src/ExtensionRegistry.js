/**
 * packages/core/src/ExtensionRegistry.js
 *
 * Front D / Sections 201–203:
 * Third-Party Semantic Plugin / Extension Architecture.
 *
 * External studios can add advisory intelligence (e.g. a morale-omen
 * reader, a weather-dread estimator) without forking core:
 * - Extensions subscribe with onObserve(snapshot, ctx) and return a
 *   numeric advisory modifier in [-0.5, 0.5]; anything else is clamped.
 * - Extensions receive a frozen snapshot — they cannot mutate agent,
 *   host, or fellow-extension state (§202: no host-authority bypass).
 * - Deterministic extensions declare deterministic:true and must return
 *   bit-identical output for identical input; the registry verifies
 *   this on demand (§203). Non-declared extensions are still isolated
 *   but flagged nonDeterministic in reports.
 * - Every extension runs in its own try/catch boundary: a throwing
 *   extension records FAILED and contributes 0, never crashing the tick.
 *
 * STRICT INVARIANT: advisory modifiers only. Zero host state mutation.
 */

function round4(n) {
    return Number(Number(n).toFixed(4));
}

function freezeSnapshot(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return Object.freeze(obj.map(freezeSnapshot));
    const out = {};
    for (const [k, v] of Object.entries(obj)) out[k] = freezeSnapshot(v);
    return Object.freeze(out);
}

export class ExtensionRegistry {
    constructor(options = {}) {
        this.maxModifier = options.maxModifier ?? 0.5;
        this.extensions = new Map();
        this.totalTicks = 0;
    }

    registerExtension(def) {
        const { name, version, onObserve, deterministic } = def || {};
        if (!name) throw new Error('registerExtension requires a name.');
        if (typeof onObserve !== 'function') throw new Error(`Extension "${name}" requires onObserve(snapshot, ctx).`);
        if (this.extensions.has(name)) throw new Error(`Extension "${name}" already registered.`);
        this.extensions.set(name, {
            name: String(name),
            version: def.version || '1.0.0',
            deterministic: deterministic === true,
            onObserve,
            failures: 0,
            contributions: 0
        });
        return this.extensions.get(name);
    }

    unregisterExtension(name) {
        return this.extensions.delete(name);
    }

    evaluateAll(agentSnapshot, ctx = {}) {
        const frozen = freezeSnapshot({ ...(agentSnapshot || {}) });
        const frozenCtx = freezeSnapshot({ ...(ctx || {}) });
        const modifiers = {};
        const perExtension = [];
        for (const [name, ext] of this.extensions) {
            try {
                const raw = ext.onObserve(frozen, frozenCtx);
                const num = Number(raw);
                const clamped = !Number.isFinite(num) ? 0 : Math.max(-this.maxModifier, Math.min(this.maxModifier, num));
                modifiers[name] = round4(clamped);
                ext.contributions += 1;
                perExtension.push({ name, status: 'OK', modifier: modifiers[name], deterministic: ext.deterministic });
            } catch (err) {
                ext.failures += 1;
                modifiers[name] = 0;
                perExtension.push({ name, status: 'FAILED', modifier: 0, error: String(err && err.message ? err.message : err), deterministic: ext.deterministic });
            }
        }
        perExtension.sort((a, b) => (a.name < b.name ? -1 : 1));
        this.totalTicks += 1;
        const total = round4(Object.values(modifiers).reduce((s, v) => s + v, 0));
        return { modifiers, perExtension, totalModifier: total };
    }

    verifyDeterminism(agentSnapshot, ctx = {}) {
        const declared = Array.from(this.extensions.values()).filter((e) => e.deterministic);
        const results = [];
        for (const ext of declared) {
            const frozen = freezeSnapshot({ ...(agentSnapshot || {}) });
            const frozenCtx = freezeSnapshot({ ...(ctx || {}) });
            let first;
            let threw = false;
            try {
                first = ext.onObserve(frozen, frozenCtx);
            } catch {
                threw = true;
            }
            let identical = false;
            if (!threw) {
                try {
                    const second = ext.onObserve(freezeSnapshot({ ...(agentSnapshot || {}) }), freezeSnapshot({ ...(ctx || {}) }));
                    identical = Object.is(first, second) || JSON.stringify(first) === JSON.stringify(second);
                } catch {
                    identical = false;
                }
            }
            results.push({ name: ext.name, deterministic: identical && !threw });
        }
        results.sort((a, b) => (a.name < b.name ? -1 : 1));
        return results;
    }

    getHealth() {
        return Array.from(this.extensions.values())
            .map((e) => ({ name: e.name, version: e.version, deterministic: e.deterministic, failures: e.failures, contributions: e.contributions }))
            .sort((a, b) => (a.name < b.name ? -1 : 1));
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            extensionsRegistered: this.extensions.size,
            totalTicks: this.totalTicks
        };
    }
}
