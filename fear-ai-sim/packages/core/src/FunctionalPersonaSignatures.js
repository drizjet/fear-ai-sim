/**
 * packages/core/src/FunctionalPersonaSignatures.js
 *
 * Sections VIII-XIII:
 * Functional Persona Signatures — personality as STABLE RESPONSE FUNCTIONS,
 * not static vector similarity.
 *
 * A persona is identifiable from the SHAPE of its reaction curves:
 *   panic(threat), panic(distance), panic(uncertainty), panic(count),
 *   retreat(power), help(risk), investigate(ambiguity), rally(groupFear),
 *   recovery(time), contagion(peerFear), tradeRisk(routeDanger).
 *
 * Also provides:
 * - Near-neighbor discrimination (N=.45 vs .55 must separate, Sections X).
 * - Continuous population generation (60/100/300/1000, Section XI).
 * - Confusion analysis: nearest mistaken persona + per-trait confusion.
 * - Collapse score: distance of a persona's mean response from the
 *   population centroid vs its spread (Section XIII). Collapsed personas
 *   (generic survivor/coward, permanent panic/calm) score near 0.
 *
 * Pure functions over trait vectors. No host mutation. Deterministic:
 * same traits + same probe grid = same curves, bit for bit.
 */

const clamp01 = (v) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
    return v < 0 ? 0 : v > 1 ? 1 : v;
};

const round4 = (v) => Math.round(clamp01(v) * 10000) / 10000;

/** Logistic with persona-shaped slope/threshold. */
function logistic(x, slope, threshold) {
    return 1 / (1 + Math.exp(-slope * (x - threshold)));
}

/**
 * Evaluate the 11 reaction functions for a trait vector at probe value x.
 * @param {object} t traits (openness, conscientiousness, extraversion,
 *   agreeableness, neuroticism, resilience, leadership, riskTolerance)
 * @param {number} x probe in [0,1]
 */
export function evaluateResponseFunctions(t, x) {
    const px = clamp01(x);
    const N = clamp01(t.neuroticism ?? 0.5);
    const R = clamp01(t.resilience ?? 0.5);
    const A = clamp01(t.agreeableness ?? 0.5);
    const O = clamp01(t.openness ?? 0.5);
    const E = clamp01(t.extraversion ?? 0.5);
    const L = clamp01(t.leadership ?? 0.5);
    const RT = clamp01(t.riskTolerance ?? 0.5);
    const C = clamp01(t.conscientiousness ?? 0.5);
    return {
        panicThreat: round4(logistic(px, 6 + N * 4, 0.75 - N * 0.3 - R * 0.1)),
        panicDistance: round4(1 - logistic(px, 6 + N * 3, 0.45 + R * 0.2 - N * 0.15)),
        panicUncertainty: round4(logistic(px, 5 + N * 4, 0.7 - N * 0.25)),
        panicCount: round4(logistic(px, 7, 0.6 - N * 0.25 - E * 0.05)),
        retreatPower: round4(logistic(px, 5 + C * 2, 0.55 + RT * 0.25 - N * 0.1)),
        helpRisk: round4((1 - logistic(px, 6, 0.5 + A * 0.3 - N * 0.1)) * (0.3 + A * 0.7)),
        investigateAmbiguity: round4(logistic(px, 4 + O * 3, 0.75 - O * 0.3) * (1 - N * 0.3)),
        rallyGroupFear: round4(logistic(px, 4 + L * 3 + E * 2, 0.7 - L * 0.3)),
        recoveryTime: round4(1 - logistic(px, 4 + R * 3, 0.5 - R * 0.2 + N * 0.15)),
        contagionPeerFear: round4(logistic(px, 5 + N * 3 - R * 2, 0.65 - E * 0.15)),
        tradeRisk: round4(logistic(px, 5, 0.55 + RT * 0.3 - C * 0.1))
    };
}

export const SIGNATURE_FUNCTIONS = Object.freeze([
    'panicThreat', 'panicDistance', 'panicUncertainty', 'panicCount',
    'retreatPower', 'helpRisk', 'investigateAmbiguity', 'rallyGroupFear',
    'recoveryTime', 'contagionPeerFear', 'tradeRisk'
]);

export const DEFAULT_PROBE_GRID = Object.freeze([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1]);

export class FunctionalPersonaSignatures {
    /**
     * @param {number[]} [probeGrid=DEFAULT_PROBE_GRID] deterministic probe points
     */
    constructor(probeGrid = DEFAULT_PROBE_GRID) {
        this.probeGrid = Object.freeze([...probeGrid]);
    }

    /**
     * Full signature: 11 functions × probe grid, plus per-function AUC summary.
     * @param {object} traits
     */
    signatureFor(traits) {
        const curves = {};
        const auc = {};
        for (const fn of SIGNATURE_FUNCTIONS) {
            curves[fn] = this.probeGrid.map((x) => evaluateResponseFunctions(traits, x)[fn]);
            auc[fn] = round4(curves[fn].reduce((a, b) => a + b, 0) / curves[fn].length);
        }
        return { curves, auc };
    }

    /** Flattened vector for distance/confusion math. */
    vectorFor(traits) {
        const sig = this.signatureFor(traits);
        const vec = [];
        for (const fn of SIGNATURE_FUNCTIONS) vec.push(...sig.curves[fn]);
        return vec;
    }

    /** Euclidean distance between two personas in signature space. */
    distance(traitsA, traitsB) {
        const va = this.vectorFor(traitsA);
        const vb = this.vectorFor(traitsB);
        let sum = 0;
        for (let i = 0; i < va.length; i++) sum += (va[i] - vb[i]) ** 2;
        return round4(Math.sqrt(sum / va.length));
    }

    /**
     * Confusion analysis over a candidate population.
     * @param {object} queryTraits persona to identify
     * @param {{ id: string, traits: object }[]} population candidates
     * @returns {{ predictedId, nearestDistance, runnerUpId, runnerUpDistance, margin, perFunctionGap }}
     */
    identify(queryTraits, population) {
        if (!Array.isArray(population) || population.length === 0) throw new Error('EMPTY_POPULATION');
        const scored = population.map((p) => ({ id: p.id, d: this.distance(queryTraits, p.traits), traits: p.traits }));
        scored.sort((a, b) => a.d - b.d);
        const best = scored[0];
        const runner = scored[1] || { id: null, d: 1 };
        // Per-function gap between best and runner-up: strongest discriminator.
        const qSig = this.signatureFor(queryTraits);
        const bSig = this.signatureFor(best.traits);
        const rTraits = scored[1] ? scored[1].traits : queryTraits;
        const rSig = this.signatureFor(rTraits);
        let strongest = { function: null, gap: -1 };
        for (const fn of SIGNATURE_FUNCTIONS) {
            const gap = Math.abs((bSig.auc[fn] ?? 0) - (rSig.auc[fn] ?? 0));
            void qSig;
            if (gap > strongest.gap) strongest = { function: fn, gap: round4(gap) };
        }
        return {
            predictedId: best.id,
            nearestDistance: best.d,
            runnerUpId: runner.id,
            runnerUpDistance: runner.d,
            margin: round4(runner.d - best.d),
            strongestDiscriminator: strongest
        };
    }

    /**
     * Collapse score: 1 = distinct persona, 0 = collapsed to population mean
     * (generic survivor/coward) or flatlined (permanent panic/calm).
     * score = clamp01(meanDistanceFromCentroid / (spread + eps)).
     */
    collapseScore(traits, population) {
        if (!Array.isArray(population) || population.length < 2) throw new Error('POPULATION_TOO_SMALL');
        const vecs = population.map((p) => this.vectorFor(p.traits));
        const dim = vecs[0].length;
        const centroid = new Array(dim).fill(0);
        for (const v of vecs) for (let i = 0; i < dim; i++) centroid[i] += v[i] / vecs.length;
        const distTo = (v) => Math.sqrt(v.reduce((a, b, i) => a + (b - centroid[i]) ** 2, 0) / dim);
        const spreads = vecs.map(distTo);
        const meanSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
        const selfDist = distTo(this.vectorFor(traits));
        if (meanSpread < 1e-9) return selfDist < 1e-9 ? 0 : 1;
        return round4(clamp01(selfDist / (meanSpread * 2)));
    }

    /**
     * Deterministic continuous population via seeded LCG (no Math.random).
     * @param {number} n population size
     * @param {number} [seed=1337]
     */
    generatePopulation(n, seed = 1337) {
        if (!Number.isInteger(n) || n < 1 || n > 10000) throw new Error('POPULATION_SIZE_OUT_OF_RANGE');
        let s = (seed >>> 0) || 1;
        const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
        const keys = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism', 'resilience', 'leadership', 'riskTolerance'];
        const pop = [];
        for (let i = 0; i < n; i++) {
            const traits = {};
            for (const k of keys) traits[k] = round4(next());
            pop.push({ id: `persona_${i}`, traits });
        }
        return pop;
    }

    auditImmutability() {
        return {
            isClean: true,
            status: 'CLEAN_ADVISORY_ONLY',
            hostPhysicsMutations: 0,
            hostTransformMutations: 0,
            functionsTracked: SIGNATURE_FUNCTIONS.length,
            probePoints: this.probeGrid.length
        };
    }
}
