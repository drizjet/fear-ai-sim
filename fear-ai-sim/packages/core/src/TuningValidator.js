/**
 * packages/core/src/TuningValidator.js
 *
 * Front B / Sections 227–230:
 * Boundary Testing, Config Validation, Defaults & Zero-Config Experience.
 *
 * Pathological designer tuning (instant panic locks, zero recovery,
 * runaway sensitization) must fail fast with actionable errors —
 * never as NaN cascades mid-simulation. New developers get one
 * working NPC with zero configuration.
 */

export const TRAIT_BOUNDS = Object.freeze({
    neuroticism: [0, 1],
    resilience: [0, 1],
    bravery: [0, 1],
    agreeableness: [0, 1],
    discipline: [0, 1],
    curiosity: [0, 1]
});

export const DESIGNER_DEFAULTS = Object.freeze({
    neuroticism: 0.5,
    resilience: 0.5,
    bravery: 0.5,
    agreeableness: 0.5,
    discipline: 0.5,
    curiosity: 0.5,
    habituationRate: 0.02,
    recoveryRate: 0.05
});

function isFiniteNumber(n) {
    return typeof n === 'number' && Number.isFinite(n);
}

export class TuningValidator {
    static defaults() {
        return { ...DESIGNER_DEFAULTS };
    }

    static quickstart(overrides = {}) {
        const traits = { ...TuningValidator.defaults(), ...overrides };
        return {
            agentId: overrides.agentId || 'npc_first_steps',
            traits: TuningValidator.sanitize(traits),
            goal: 'CAUTIOUS_EXPLORE',
            note: 'Zero-config starter: calm civilian, holds under mild threat, flees lethal threat.'
        };
    }

    static validate(traits = {}) {
        const errors = [];
        for (const [key, [lo, hi]] of Object.entries(TRAIT_BOUNDS)) {
            const v = traits[key];
            if (v === undefined) continue;
            if (!isFiniteNumber(v)) {
                errors.push(`${key} must be a finite number, got ${String(v)}.`);
            } else if (v < lo || v > hi) {
                errors.push(`${key} must be within [${lo}, ${hi}], got ${v}.`);
            }
        }
        for (const key of ['habituationRate', 'recoveryRate']) {
            const v = traits[key];
            if (v === undefined) continue;
            if (!isFiniteNumber(v) || v < 0 || v > 1) {
                errors.push(`${key} must be within [0, 1], got ${String(v)}.`);
            }
        }
        if (traits.habituationRate !== undefined && traits.habituationRate < 0) {
            errors.push('habituationRate must not be negative (runaway sensitization risk).');
        }
        if (traits.neuroticism !== undefined && traits.resilience !== undefined) {
            if (traits.neuroticism >= 0.9 && traits.resilience <= 0.05) {
                errors.push('INSTANT_PANIC_LOCK: neuroticism >= 0.9 with resilience <= 0.05 locks agents in irreversible panic.');
            }
            if (traits.neuroticism <= 0.05 && traits.bravery !== undefined && traits.bravery >= 0.95) {
                errors.push('PERMANENT_IMMUNITY: near-zero neuroticism with max bravery prevents any fear response.');
            }
        }
        return { valid: errors.length === 0, errors };
    }

    static assertValid(traits = {}) {
        const report = TuningValidator.validate(traits);
        if (!report.valid) {
            throw new Error(`Invalid agent tuning:\n- ${report.errors.join('\n- ')}`);
        }
        return true;
    }

    static sanitize(traits = {}) {
        const out = { ...traits };
        for (const [key, [lo, hi]] of Object.entries(TRAIT_BOUNDS)) {
            if (out[key] === undefined) {
                out[key] = DESIGNER_DEFAULTS[key];
            } else if (!isFiniteNumber(out[key])) {
                out[key] = DESIGNER_DEFAULTS[key];
            } else {
                out[key] = Math.max(lo, Math.min(hi, out[key]));
            }
        }
        for (const key of ['habituationRate', 'recoveryRate']) {
            if (out[key] === undefined || !isFiniteNumber(out[key])) {
                out[key] = DESIGNER_DEFAULTS[key];
            } else {
                out[key] = Math.max(0, Math.min(1, out[key]));
            }
        }
        return out;
    }
}
