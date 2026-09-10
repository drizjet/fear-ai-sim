#!/usr/bin/env node
/**
 * NEXT-50: --expose-gc leak assay (LATER-21 precursor).
 *
 * Distinguishes designed retained growth (archive at the true-anchor
 * rate, bounded summaries) from an unbounded leak (heap detaching from
 * retained-state size). One sim per seed drains its ledger into rolling
 * compaction; with --expose-gc the assay forces collection before each
 * leg so legs measure retained state, not GC timing. Without the flag
 * the assay still runs (gc:false) for trend comparison.
 * Fully deterministic modulo wall clock and GC timing (excluded from
 * the digest; pins assert retained-state counts only).
 */

import { fileURLToPath } from 'node:url';
import { FrontierValleySimulation } from '../../packages/core/src/FrontierValleySimulation.js';
import {
    compactEventLog,
    mergeColdSummaries,
    mergeColdPairSummaries
} from '../../packages/core/src/EventLogCompactor.js';
import {
    VALLEY_ANCHORS,
    VALLEY_BULK
} from './valley_compaction_soak.mjs';

export const ASSAY_SEEDS = Object.freeze([11]);
export const ASSAY_TICKS = 20000;
export const ASSAY_WINDOW = 100;
export const ASSAY_LEG_EVERY = 5000;
export const COLD_PAIRS = Object.freeze([
    { open: 'CAMP_ESTABLISHED', close: 'CAMP_ABANDONED', key: 'primaryId' }
]);

function evtNum(id) {
    const m = /^evt_(\d+)$/.exec(String(id));
    return m ? Number(m[1]) : -1;
}

const r1 = (v) => Math.round(v * 10) / 10;

export function runLeakAssay(options = {}) {
    const seeds = options.seeds ?? ASSAY_SEEDS;
    const ticks = options.ticks ?? ASSAY_TICKS;
    const window = options.window ?? ASSAY_WINDOW;
    const legEvery = options.legEvery ?? ASSAY_LEG_EVERY;
    const cold = options.cold ?? true;
    const canGc = typeof global.gc === 'function';
    const runs = [];
    for (const seed of seeds) {
        const sim = new FrontierValleySimulation({ seed });
        let archived = [];
        let summaries = [];
        let coldPairs = [];
        let maxN = 0;
        const legs = [];
        for (let t = 0; t < ticks; t += window) {
            sim.advance(Math.min(window, ticks - t));
            for (const row of sim.worldSystem.historyLedger) {
                const n = evtNum(row.id);
                if (n > maxN) {
                    maxN = n;
                    archived.push({
                        eventId: row.id, type: row.eventType, tick: row.tick,
                        parentEventIds: row.causalEventId ? [row.causalEventId] : [],
                        primaryId: row.primaryId
                    });
                }
            }
            const out = compactEventLog(archived, {
                anchorTypes: [...VALLEY_ANCHORS],
                bulkTypes: [...VALLEY_BULK],
                ...(cold ? { coldAgeTicks: 5000, coldPairRollup: [...COLD_PAIRS] } : {})
            });
            archived = out.events;
            const cutoff = (t + window) - 5000;
            summaries = mergeColdSummaries(summaries.concat(out.summaries), cutoff).entries;
            coldPairs = mergeColdPairSummaries(coldPairs.concat(out.coldPairSummaries ?? []));
            if ((t + window) % legEvery === 0) {
                if (canGc) global.gc();
                legs.push({
                    tick: t + window,
                    heapMB: r1(process.memoryUsage().heapUsed / 1048576),
                    archive: archived.length,
                    summaries: summaries.length,
                    coldPairs: coldPairs.length
                });
            }
        }
        const first = legs[0];
        const last = legs[legs.length - 1];
        runs.push({
            seed, ticks, cold, gc: canGc, legs,
            heapDeltaMB: r1(last.heapMB - first.heapMB),
            archiveDelta: last.archive - first.archive
        });
    }
    return { config: { seeds: [...seeds], ticks, window, legEvery, cold }, runs };
}

export function leakDigest(result) {
    return result.runs.map(r => [
        r.seed, r.ticks, r.cold,
        ...r.legs.flatMap(l => [l.tick, l.archive, l.summaries, l.coldPairs])
    ].join('|')).join('\n');
}

export function printLeakAssay(result) {
    console.log(`=== NEXT-50: leak assay (gc=${result.runs[0]?.gc ?? false}) ===`);
    for (const r of result.runs) {
        console.log(`  seed ${r.seed} cold=${r.cold}: ` +
            r.legs.map(l => `${l.tick}:${l.heapMB}MB/a${l.archive}+s${l.summaries}`).join(' '));
        console.log(`  heapΔ=${r.heapDeltaMB}MB archiveΔ=${r.archiveDelta} (designed: heap flat-ish, archive at anchor rate)`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printLeakAssay(runLeakAssay());
}
