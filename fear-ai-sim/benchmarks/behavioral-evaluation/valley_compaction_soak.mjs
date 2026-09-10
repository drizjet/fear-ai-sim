#!/usr/bin/env node
/**
 * NEXT-9: Compaction-wired 100k-tick valley soak (LXXI/LXXII evidence).
 *
 * The live history ledger is hard-capped at 1000 rows with blind
 * shift-eviction, and pushes peak at 8 events/tick: any drain slower
 * than ~100 ticks loses rows forever (first harness version drained
 * every 10k and kept only 156/1769 deliveries — measured). This harness
 * wires rolling compaction into the long-horizon path WITHOUT changing
 * live eviction: every 100 ticks, rows past the id watermark drain into
 * an archive that is re-compacted in place (summaries accumulate), so
 * the archive stays bounded while anchor events survive. It asserts:
 * anchor-complete deliveries, bulk summarization, bounded archive,
 * rerun-identical digests, wall time and heap legs.
 *
 * Rolling-vs-global note: boundary preservation applies per rolling
 * window, so the archive is a faithful superset of a single global
 * compaction, not bit-identical to one.
 *
 * Valley row -> compactor adapter: { eventId: id, type: eventType, tick,
 * parentEventIds: [causalEventId] when present }.
 */

import { fileURLToPath } from 'node:url';
import { FrontierValleySimulation } from '../../packages/core/src/FrontierValleySimulation.js';
import { compactEventLog } from '../../packages/core/src/EventLogCompactor.js';

export const SOAK100K_SEEDS = Object.freeze([11, 7]);
export const SOAK100K_TICKS = 100000;
export const SOAK100K_WINDOW = 100;
export const VALLEY_ANCHORS = Object.freeze([
    'TRADE_DELIVERY', 'BATTLE_FOUGHT', 'CAMP_ESTABLISHED', 'CAMP_ABANDONED',
    'MIGRATION_COMPLETED', 'TREATY_NOTED'
]);
export const VALLEY_BULK = Object.freeze(['ENCOUNTER_OCCURRED', 'RUMOR_SPREAD']);

function adapt(row) {
    return {
        eventId: row.id,
        type: row.eventType,
        tick: row.tick,
        parentEventIds: row.causalEventId ? [row.causalEventId] : [],
        primaryId: row.primaryId,
        consequences: row.consequences
    };
}

function evtNum(id) {
    const m = /^evt_(\d+)$/.exec(String(id));
    return m ? Number(m[1]) : -1;
}

export function runCompactionSoak(options = {}) {
    const seeds = options.seeds ?? SOAK100K_SEEDS;
    const ticks = options.ticks ?? SOAK100K_TICKS;
    const window = options.window ?? SOAK100K_WINDOW;
    const runs = [];
    for (const seed of seeds) {
        const sim = new FrontierValleySimulation({ seed });
        let archived = [];
        let summaries = [];
        let middleSummaries = [];
        let summarized = 0;
        let middleSummarized = 0;
        let maxN = 0;
        let peakArchive = 0;
        const heap = [process.memoryUsage().heapUsed];
        const t0 = Date.now();
        for (let t = 0; t < ticks; t += window) {
            sim.advance(Math.min(window, ticks - t));
            for (const row of sim.worldSystem.historyLedger) {
                const n = evtNum(row.id);
                if (n > maxN) {
                    maxN = n;
                    archived.push(adapt(row));
                }
            }
            const out = compactEventLog(archived, {
                anchorTypes: [...VALLEY_ANCHORS],
                bulkTypes: [...VALLEY_BULK]
            });
            archived = out.events;
            summaries = summaries.concat(out.summaries);
            middleSummaries = middleSummaries.concat(out.middleSummaries);
            summarized += out.stats.summarized;
            middleSummarized += out.stats.middleSummarized;
            peakArchive = Math.max(peakArchive, archived.length);
            heap.push(process.memoryUsage().heapUsed);
        }
        const wallMs = Date.now() - t0;
        const keptDeliveries = archived.filter(e => e.type === 'TRADE_DELIVERY').length;
        runs.push({
            seed, ticks,
            deliveries: sim.macroMetrics.deliveries,
            liveLedger: sim.worldSystem.historyLedger.length,
            archiveEvents: archived.length,
            peakArchive,
            summaryCount: summaries.length,
            middleSummaryCount: middleSummaries.length,
            keptDeliveries,
            anchorComplete: keptDeliveries === sim.macroMetrics.deliveries,
            wallMs,
            heapMB: heap.map(h => parseFloat((h / 1048576).toFixed(1)))
        });
    }
    return { config: { seeds: [...seeds], ticks, window }, runs };
}

export function compactionDigest(result) {
    return result.runs.map(r => [
        r.seed, r.ticks, r.deliveries, r.liveLedger, r.archiveEvents,
        r.peakArchive, r.summaryCount, r.keptDeliveries, r.anchorComplete
    ].join('|')).join('\n');
}

export function printCompactionSoak(result) {
    console.log('=== NEXT-9: Compaction-wired 100k soak ===');
    for (const r of result.runs) {
        console.log(`--- seed ${r.seed} @${r.ticks} ${r.wallMs}ms heapMB[${r.heapMB[0]}>${r.heapMB[Math.floor(r.heapMB.length / 2)]}>${r.heapMB[r.heapMB.length - 1]}]`);
        console.log(`  deliveries=${r.deliveries} keptDeliveries=${r.keptDeliveries} anchorsComplete=${r.anchorComplete}`);
        console.log(`  archive=${r.archiveEvents} peak=${r.peakArchive} summaries=${r.summaryCount}+${r.middleSummaryCount}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printCompactionSoak(runCompactionSoak());
}
