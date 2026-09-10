#!/usr/bin/env node
/**
 * NEXT-68: zero-misordered-fraction decomposition (NOW-38 gap).
 *
 * Zero-reads un-tie trials but leave ~17% misordered. This benchmark
 * classifies the misorders by gate pair-class using the runner's own
 * per-base tallies: below-gate pairs (asymmetric masks flip ties at
 * coin-flip rates), straddling pairs (real gaps, stay ordered),
 * above-gate pairs (mostly ordered, small residual). Measurement only.
 * Deterministic for a fixed grid (coordinate-hashed streams).
 */

import { fileURLToPath } from 'node:url';
import { runNoiseFamilies } from './near_neighbor_noise_families.mjs';

export const MISORDER_GATE = 0.65;
export const MISORDER_GRID = Object.freeze({
    traitIdxs: [4],
    deltas: [0.05, 0.15],
    conds: [['clean', 0], ['zero', 0.30]],
    reps: 2
});

const cls = (a, b, gate) => (a > gate && b > gate) ? 'above' : (b > gate ? 'straddle' : 'below');

export function runMisorderBreakdown(options = {}) {
    const gate = options.gate ?? MISORDER_GATE;
    const result = runNoiseFamilies({
        traitIdxs: options.traitIdxs ?? [...MISORDER_GRID.traitIdxs],
        deltas: options.deltas ?? [...MISORDER_GRID.deltas],
        conds: (options.conds ?? MISORDER_GRID.conds).map(c => [...c]),
        reps: options.reps ?? MISORDER_GRID.reps
    });
    const classes = {};
    for (const [ck, cond] of Object.entries(result.traits.agreeableness.perCond)) {
        for (const [dk, row] of Object.entries(cond.rows)) {
            for (const b of (row.byBase ?? [])) {
                const c = cls(b.valA, b.valB, gate);
                classes[c] = classes[c] || {};
                classes[c][`${ck}/${dk}`] = classes[c][`${ck}/${dk}`] || { correct: 0, tied: 0, wrong: 0, total: 0 };
                const cell = classes[c][`${ck}/${dk}`];
                cell.correct += b.correct;
                cell.tied += b.ties;
                cell.wrong += b.total - b.correct - b.ties;
                cell.total += b.total;
            }
        }
    }
    return { config: { gate }, classes };
}

export function printMisorderBreakdown(r) {
    console.log(`=== NEXT-68: misordered-fraction breakdown (gate ${r.config.gate}) ===`);
    for (const [c, cells] of Object.entries(r.classes)) {
        console.log(`  ${c}: ` + Object.entries(cells).map(([k, v]) =>
            `${k}=${v.correct}ok/${v.tied}tie/${v.wrong}wrong`).join(' '));
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printMisorderBreakdown(runMisorderBreakdown());
}
