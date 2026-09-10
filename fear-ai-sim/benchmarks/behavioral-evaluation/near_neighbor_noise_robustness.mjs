#!/usr/bin/env node
/**
 * NEXT-8: Near-Neighbor Persona Discrimination Under Sensor Noise.
 *
 * The noiseless near-neighbor sweep in construct_validity_sweeps.mjs compares
 * deterministic signature outputs, so any monotonic trait always discriminates.
 * This benchmark injects Weber-style proportional noise into the scenario
 * stimulus (distances, intensities, counts) with a seeded per-trial RNG and
 * measures paired discrimination accuracy at deltas {0.05..0.20} across noise
 * levels sigma {0, 0.05, 0.10, 0.20}.
 *
 * Reports per (trait, sigma) delta-star with the same significance gates as
 * the noiseless sweep (binomial p < 0.05 AND Wilson lower bound > 0.50;
 * Bonferroni over the full cell grid), plus the per-trait resolution
 * frontier: the highest noise level at which any delta still resolves.
 *
 * Fully deterministic: every trial RNG stream derives from a frozen seed
 * mixed with its cell coordinates, so reruns are bit-identical and trial
 * order cannot affect results.
 */

import { fileURLToPath } from 'node:url';
import {
    TRAIT_DEFINITIONS,
    wilsonScoreInterval,
    clopperPearsonInterval,
    exactBinomialPValue
} from './construct_validity_sweeps.mjs';

export const NOISE_DELTAS = Object.freeze([0.05, 0.10, 0.15, 0.20]);
export const NOISE_SIGMAS = Object.freeze([0, 0.05, 0.10, 0.20]);
export const NOISE_BASES = Object.freeze([0.15, 0.30, 0.45, 0.60, 0.75]);
export const NOISE_SEED = 20260910;

/** Deterministic 32-bit stream per trial coordinate (no shared state). */
export function trialRng(seed, traitIdx, deltaIdx, sigmaIdx, baseIdx, scenIdx, rep, arm) {
    let s = (seed >>> 0)
        ^ (Math.imul(traitIdx + 1, 0x9E3779B1) >>> 0)
        ^ (Math.imul(deltaIdx + 1, 0x85EBCA6B) >>> 0)
        ^ (Math.imul(sigmaIdx + 1, 0xC2B2AE35) >>> 0)
        ^ (Math.imul(baseIdx + 1, 0x27D4EB2F) >>> 0)
        ^ (Math.imul(scenIdx + 1, 0x165667B1) >>> 0)
        ^ (Math.imul(rep + 1, 0xD3A2646C) >>> 0)
        ^ (Math.imul(arm + 1, 0xFD7046C5) >>> 0);
    if (s === 0) s = 0x1B873593;
    const next = () => {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        return s / 0x100000000;
    };
    // Box-Muller normals from the stream.
    let spare = null;
    const gauss = () => {
        if (spare !== null) { const v = spare; spare = null; return v; }
        const u = Math.max(next(), 1e-12);
        const v = next();
        const r = Math.sqrt(-2 * Math.log(u));
        spare = r * Math.sin(2 * Math.PI * v);
        return r * Math.cos(2 * Math.PI * v);
    };
    return { next, gauss };
}

function noisyScenario(scen, sigma, rng) {
    if (sigma === 0) return scen;
    const out = {};
    for (const [k, v] of Object.entries(scen)) {
        out[k] = typeof v === 'number' ? v * (1 + sigma * rng.gauss()) : v;
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

export function runNoiseRobustness(options = {}) {
    const deltas = options.deltas ?? NOISE_DELTAS;
    const sigmas = options.sigmas ?? NOISE_SIGMAS;
    const bases = options.bases ?? NOISE_BASES;
    const reps = options.reps ?? 2;
    const traitIdxs = options.traitIdxs ?? TRAIT_DEFINITIONS.map((_, i) => i);
    const seed = options.seed ?? NOISE_SEED;
    const cells = deltas.length * sigmas.length;
    const bonferroniAlpha = 0.05 / (traitIdxs.length * cells || 1);

    const traits = {};
    for (const ti of traitIdxs) {
        const def = TRAIT_DEFINITIONS[ti];
        const perSigma = {};
        for (let si = 0; si < sigmas.length; si++) {
            const sigma = sigmas[si];
            let deltaStar = null;
            let deltaStarProvisional = false;
            const rows = {};
            for (let di = 0; di < deltas.length; di++) {
                const delta = deltas[di];
                let correct = 0;
                let total = 0;
                for (let bi = 0; bi < bases.length; bi++) {
                    const valA = bases[bi];
                    const valB = Math.min(1.0, valA + delta);
                    for (let ci = 0; ci < def.scenarios.length; ci++) {
                        for (let rep = 0; rep < reps; rep++) {
                            total++;
                            const traitsA = makeNeutral();
                            traitsA[def.key] = valA;
                            const traitsB = makeNeutral();
                            traitsB[def.key] = valB;
                            const rngA = trialRng(seed, ti, di, si, bi, ci, rep, 0);
                            const rngB = trialRng(seed, ti, di, si, bi, ci, rep, 1);
                            // NEXT-53: shared per-trial agent stream (arm
                            // differences from traits only).
                            const trialSeed = `${seed}:${ti}:${di}:${si}:${bi}:${ci}:${rep}`;
                            const scoreA = def.signature(traitsA, noisyScenario(def.scenarios[ci], sigma, rngA), trialSeed);
                            const scoreB = def.signature(traitsB, noisyScenario(def.scenarios[ci], sigma, rngB), trialSeed);
                            if (scoreB > scoreA) correct++;
                        }
                    }
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
                rows[`delta_${delta.toFixed(2)}`] = {
                    correct, total, accuracyPct, wilson, clopper,
                    pValue, survivesBonferroni
                };
            }
            perSigma[`sigma_${sigma.toFixed(2)}`] = {
                deltaStar, deltaStarProvisional, rows
            };
        }
        // Resolution frontier: highest sigma with any resolving delta.
        let frontierSigma = null;
        for (let si = 0; si < sigmas.length; si++) {
            if (perSigma[`sigma_${sigmas[si].toFixed(2)}`].deltaStar !== null) {
                frontierSigma = sigmas[si];
            }
        }
        traits[def.key] = { name: def.name, perSigma, frontierSigma };
    }
    return {
        config: { deltas: [...deltas], sigmas: [...sigmas], seed, bonferroniAlpha },
        traits
    };
}

export function printNoiseRobustnessReport(results) {
    console.log('=== NEXT-8: Near-Neighbor Discrimination Under Noise ===');
    console.log(`Bonferroni alpha: ${results.config.bonferroniAlpha.toExponential(2)}`);
    for (const [key, t] of Object.entries(results.traits)) {
        console.log(`--- ${t.name} [${key}] frontier sigma: ${t.frontierSigma ?? 'NONE'}`);
        for (const [sKey, s] of Object.entries(t.perSigma)) {
            const accs = Object.entries(s.rows)
                .map(([d, r]) => `${d.replace('delta_', 'd')}=${r.accuracyPct}%${r.survivesBonferroni ? '*' : ''}`)
                .join(' ');
            console.log(`  ${sKey}: delta*=${s.deltaStar ?? 'none'}${s.deltaStarProvisional ? ' (provisional)' : ''} | ${accs}`);
        }
    }
    console.log('(* survives Bonferroni)');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printNoiseRobustnessReport(runNoiseRobustness());
}
