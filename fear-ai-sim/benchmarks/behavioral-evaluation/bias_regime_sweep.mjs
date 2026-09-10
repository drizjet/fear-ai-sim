#!/usr/bin/env node
/**
 * NEXT-51: Large-bias regime-crossing review (NEXT-40 gap).
 *
 * Bias was pinned at ±0.10 only (harmless everywhere). This sweep maps
 * larger miscalibrations over [-0.50, +1.00] on the persona-battery tiny
 * grid. Findings (measurement only, no retune):
 * - N/C/L/R hold everywhere (R softens to 80/100 at +0.50/+1.00).
 * - E collapses at -0.50 (20/20*): halved contagionFear hits the
 *   response floor (both neighbors score 0.00) — floor compression.
 *   Positive bias strengthens the signal (100/100 at +0.50).
 * - A collapses at +0.50/+1.00 (20/40*): scaled geometry saturates
 *   both neighbors at identical scores (4.75 = 4.75) — saturation tie.
 * Fully deterministic (seeded families runner).
 */

import { fileURLToPath } from 'node:url';
import { runNoiseFamilies } from './near_neighbor_noise_families.mjs';

export const BIAS_LEVELS = Object.freeze([-0.5, -0.25, -0.1, 0.1, 0.25, 0.5, 1.0]);

const condKey = (l) => `bias_${String(l).replace('-', 'm').replace('.', 'p')}`;

export function runBiasRegimes(options = {}) {
    const levels = options.levels ?? BIAS_LEVELS;
    const result = runNoiseFamilies({
        traitIdxs: options.traitIdxs ?? [0, 1, 2, 3, 4, 5, 6],
        deltas: options.deltas ?? [0.05, 0.20],
        conds: levels.map(l => ['bias', l]),
        reps: options.reps ?? 2
    });
    const table = {};
    for (const [t, d] of Object.entries(result.traits)) {
        table[t] = levels.map(l => {
            const c = d.perCond[condKey(l)];
            return {
                level: l,
                fine: c.rows['delta_0.05'].accuracyPct,
                coarse: c.rows['delta_0.20'].accuracyPct,
                star: c.deltaStar
            };
        });
    }
    return { config: { levels: [...levels] }, table };
}

export function printBiasRegimes(result) {
    console.log('=== NEXT-51: large-bias regime sweep ===');
    for (const [t, rows] of Object.entries(result.table)) {
        console.log(`  ${t}: ` + rows.map(r =>
            `${r.level >= 0 ? '+' : ''}${r.level}:${r.fine}/${r.coarse}${r.star === null ? '*' : ''}`).join(' '));
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printBiasRegimes(runBiasRegimes());
}
