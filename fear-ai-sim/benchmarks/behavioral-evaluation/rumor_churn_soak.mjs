#!/usr/bin/env node
/**
 * NEXT-104: Rumor-churn soak for exoneration memory bounds.
 *
 * Long-horizon companion to the CCIR-25 fix: continuous rumor creation,
 * hearing, correction, and bound-eviction pressure while asserting the
 * exoneration ledgers stay bounded by live rumor count, snapshots stop
 * growing under steady churn, reruns are digest-identical, and no
 * non-finite stance fields appear. Fast (~1s): the 100k-tick compaction
 * soak covers deep time; this covers churn turnover the deep soak lacks
 * (it corrects almost nothing, so the exonerated set would stay empty).
 */

import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../../packages/core/src/FrontierValleySimulation.js';

export const CHURN_SEEDS = Object.freeze([42, 11]);
export const CHURN_CYCLES = 40;
export const CHURN_PER_CYCLE = 25;
export const CHURN_TICKS = 50;

export function runChurnSoak({ seeds = CHURN_SEEDS, cycles = CHURN_CYCLES, perCycle = CHURN_PER_CYCLE, ticksPerCycle = CHURN_TICKS } = {}) {
    const runs = [];
    for (const seed of seeds) {
        const sim = new FrontierValleySimulation({ seed });
        const sizes = [];
        const t0 = Date.now();
        for (let c = 0; c < cycles; c++) {
            const batch = [];
            for (let k = 0; k < perCycle; k++) {
                batch.push(sim.worldSystem.createRumor('WAR_DECLARED', {
                    sourceEntityId: 'bandit_warband_1', severity: 0.9,
                    subjectFactionId: FRONTIER_VALLEY_FACTIONS.BANDITS,
                    originLocation: { x: 250, y: 0, z: 175 }
                }).id);
            }
            sim.advance(ticksPerCycle);
            // Refute after hearings so ledgers fill before retraction.
            if (c % 2 === 0) {
                for (const id of batch) sim.worldSystem.correctRumor(id, { confirmed: false, byGroupId: 'bandit_warband_1' });
            }
            if (c === Math.floor(cycles / 2) - 1) sizes.push(JSON.stringify(sim.getState()).length);
        }
        sim.advance(100);
        sizes.push(JSON.stringify(sim.getState()).length);
        let nonfinite = 0;
        for (const [, m] of sim.factionSystem.stances ?? []) {
            for (const [, s] of m) {
                for (const k of ['grievance', 'trust', 'fear']) {
                    if (!Number.isFinite(s[k])) nonfinite++;
                }
            }
        }
        const digest = createHash('sha256').update(JSON.stringify(sim.getState())).digest('hex').slice(0, 16);
        runs.push({
            seed, ms: Date.now() - t0, tick: sim.currentTick,
            live: sim.worldSystem.rumors.size,
            ledger: sim._hearsayLedger.size, routes: sim._hearsayRoutes.size, exon: sim._exoneratedRumors.size,
            sizes, digest, nonfinite,
            heapMB: Number((process.memoryUsage().heapUsed / 1048576).toFixed(1))
        });
    }
    return { runs };
}

export function churnDigest(result) {
    return result.runs.map((r) => [r.seed, r.tick, r.live, r.ledger, r.routes, r.exon,
        r.sizes.join(':'), r.digest, r.nonfinite].join('|')).join('\n');
}

export function printChurnSoakReport(result) {
    console.log('=== NEXT-104: Rumor-Churn Soak ===');
    for (const r of result.runs) {
        console.log(`--- seed ${r.seed} @${r.tick} ${r.ms}ms heap=${r.heapMB}MB digest=${r.digest}`);
        console.log(`  bounds: live=${r.live} ledger=${r.ledger} routes=${r.routes} exon=${r.exon} nonfinite=${r.nonfinite}`);
        console.log(`  snapshot bytes mid/end: ${r.sizes.join(' / ')}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printChurnSoakReport(runChurnSoak());
}
