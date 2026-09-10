#!/usr/bin/env node
/**
 * NEXT-40: Near-neighbor discrimination under noise FAMILIES.
 *
 * NEXT-8 covered Weber-proportional Gaussian stimulus noise only. This
 * benchmark extends to: systematic BIAS (miscalibrated sensor, same offset
 * both arms — any accuracy change reveals signature nonlinearity), SPIKE
 * (rare large glitches, Bernoulli per field), DROPOUT (missing fields as
 * undefined, engaging signature defaults — verified non-crashing), and
 * CORRelated proportional noise (one draw shared across fields, testing
 * whether the independence assumption matters).
 *
 * Same paired-trial machinery, stats gates, and Bonferroni discipline as
 * NEXT-8 (alpha over the full condition grid). Fully deterministic via
 * per-trial-coordinate seeded streams. The NEXT-8 runner is untouched:
 * its frozen numbers stay valid.
 */

import { fileURLToPath } from 'node:url';
import {
    TRAIT_DEFINITIONS,
    wilsonScoreInterval,
    clopperPearsonInterval,
    exactBinomialPValue
} from './construct_validity_sweeps.mjs';
import { trialRng } from './near_neighbor_noise_robustness.mjs';

export const FAMILY_DELTAS = Object.freeze([0.05, 0.10, 0.15, 0.20]);
export const FAMILY_BASES = Object.freeze([0.15, 0.30, 0.45, 0.60, 0.75]);
// [family, level]: bias offset, spike (p, K=1.0), dropout p, zero-reads p, corr sigma.
export const FAMILY_CONDS = Object.freeze([
    ['clean', 0],
    ['gauss', 0.10],
    ['gauss', 0.20],
    ['bias', -0.10],
    ['bias', 0.10],
    ['spike', 0.05],
    ['spike', 0.15],
    ['dropout', 0.10],
    ['dropout', 0.30],
    ['zero', 0.10],
    ['zero', 0.30],
    ['corr', 0.10]
]);
export const FAMILY_SEED = 20261024;

function perturbScen(scen, family, level, rng) {
    if (family === 'clean') return scen;
    const out = {};
    const shared = family === 'corr' ? rng.gauss() : 0;
    for (const [k, v] of Object.entries(scen)) {
        if (typeof v !== 'number') { out[k] = v; continue; }
        if (family === 'gauss') out[k] = v * (1 + level * rng.gauss());
        else if (family === 'bias') out[k] = v * (1 + level);
        else if (family === 'spike') out[k] = rng.next() < level ? v * (1 + Math.sign(rng.gauss() || 1) * 1.0) : v;
        else if (family === 'dropout') out[k] = rng.next() < level ? undefined : v;
        else if (family === 'zero') out[k] = rng.next() < level ? 0 : v;
        else if (family === 'corr') out[k] = v * (1 + level * shared);
        else out[k] = v;
    }
    return out;
}

function makeNeutral() {
    return {
        neuroticism: 0.5, resilience: 0.5, openness: 0.5,
        extraversion: 0.5, agreeableness: 0.5,
        conscientiousness: 0.5, leadership: 0.5
    };
}

export function runNoiseFamilies(options = {}) {
    const deltas = options.deltas ?? FAMILY_DELTAS;
    const conds = options.conds ?? FAMILY_CONDS;
    const bases = options.bases ?? FAMILY_BASES;
    const reps = options.reps ?? 2;
    const traitIdxs = options.traitIdxs ?? TRAIT_DEFINITIONS.map((_, i) => i);
    const seed = options.seed ?? FAMILY_SEED;
    const bonferroniAlpha = 0.05 / (traitIdxs.length * conds.length * deltas.length || 1);

    const traits = {};
    for (const ti of traitIdxs) {
        const def = TRAIT_DEFINITIONS[ti];
        const perCond = {};
        for (let ci = 0; ci < conds.length; ci++) {
            const [family, level] = conds[ci];
            let deltaStar = null;
            let deltaStarProvisional = false;
            const rows = {};
            for (let di = 0; di < deltas.length; di++) {
                const delta = deltas[di];
                let correct = 0;
                let ties = 0;
                let total = 0;
                for (let bi = 0; bi < bases.length; bi++) {
                    const valA = bases[bi];
                    const valB = Math.min(1.0, valA + delta);
                    // NEXT-68: per-base tallies for pair-class decomposition
                    // (additive; aggregate pins unaffected).
                    const base = { valA, valB, correct: 0, ties: 0, total: 0 };
                    (rows[`delta_${delta.toFixed(2)}`] ??= {}).byBase ??= [];
                    for (let si = 0; si < def.scenarios.length; si++) {
                        for (let rep = 0; rep < reps; rep++) {
                            total++;
                            const traitsA = makeNeutral();
                            traitsA[def.key] = valA;
                            const traitsB = makeNeutral();
                            traitsB[def.key] = valB;
                            const rngA = trialRng(seed, ti, di, ci, bi, si, rep, 0);
                            const rngB = trialRng(seed, ti, di, ci, bi, si, rep, 1);
                            // NEXT-53: both arms share one agent fallback
                            // stream (no arm coordinate): arm differences
                            // come purely from traits, never from
                            // construction order. Perturbation streams stay
                            // per-arm (independent corruption is the point).
                            const trialSeed = `${seed}:${ti}:${di}:${ci}:${bi}:${si}:${rep}`;
                            const scoreA = def.signature(traitsA, perturbScen(def.scenarios[si], family, level, rngA), trialSeed);
                            const scoreB = def.signature(traitsB, perturbScen(def.scenarios[si], family, level, rngB), trialSeed);
                            // NOW-37 tie convention: strictly greater counts.
                            // A tie is a failure to distinguish, so floor and
                            // saturation ties read as 0% (total tie) or
                            // below-chance (tie-dominated cells like E at
                            // bias -0.50 or A at bias +1.00) — never as
                            // capable-but-backwards. Below-chance cells are
                            // indistinguishability, not inversion.
                            if (scoreB > scoreA) correct++;
                            else if (scoreB === scoreA) ties++;
                            if (scoreB > scoreA) base.correct++;
                            else if (scoreB === scoreA) base.ties++;
                            base.total++;
                        }
                    }
                    rows[`delta_${delta.toFixed(2)}`].byBase.push(base);
                }
                const accuracyPct = parseFloat(((correct / total) * 100).toFixed(1));
                const wilson = wilsonScoreInterval(correct, total);
                const clopper = clopperPearsonInterval(correct, total);
                const pValue = exactBinomialPValue(correct, total, 0.50);
                const isSignificant = pValue < 0.05 && wilson[0] > 0.50;
                const survivesBonferroni = pValue < bonferroniAlpha;
                if (isSignificant && deltaStar === null) {
                    deltaStar = delta;
                    deltaStarProvisional = !survivesBonferroni;
                }
                Object.assign(rows[`delta_${delta.toFixed(2)}`], {
                    correct, total, ties, accuracyPct, wilson, clopper,
                    pValue, survivesBonferroni
                });
            }
            perCond[`${family}_${String(level).replace('-', 'm').replace('.', 'p')}`] = {
                family, level, deltaStar, deltaStarProvisional, rows
            };
        }
        traits[def.key] = { name: def.name, perCond };
    }
    return {
        config: { deltas: [...deltas], conds: conds.map(c => [...c]), seed, bonferroniAlpha },
        traits
    };
}

export function printNoiseFamilies(result) {
    console.log('=== NEXT-40: Near-neighbor discrimination under noise families ===');
    console.log(`Bonferroni alpha: ${result.config.bonferroniAlpha.toExponential(2)}`);
    for (const [key, t] of Object.entries(result.traits)) {
        console.log(`--- ${t.name} [${key}]`);
        for (const [cKey, c] of Object.entries(t.perCond)) {
            const accs = Object.entries(c.rows)
                .map(([d, r]) => `${d.replace('delta_', 'd')}=${r.accuracyPct}%${r.survivesBonferroni ? '*' : ''}`)
                .join(' ');
            console.log(`  ${cKey}: delta*=${c.deltaStar ?? 'none'}${c.deltaStarProvisional ? ' (prov)' : ''} | ${accs}`);
        }
    }
    console.log('(* survives Bonferroni)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printNoiseFamilies(runNoiseFamilies());
}
