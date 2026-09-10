#!/usr/bin/env node
/**
 * NEXT-42: Post-cap rumor flood dynamics (bounding-gap characterization).
 *
 * The sibling-bound sweep capped InformationPropagationEngine rumors with
 * terminal-first eviction plus inbox pruning, but spread dynamics past the
 * cap were uncharacterized. This benchmark floods past maxRetainedRumors
 * and measures: spread throughput vs load, fresh-rumor propagation under
 * flood, eviction order (terminal-first, then oldest-active FIFO), and
 * per-tick work scaling. Measurement only; zero behavior change.
 * Fully deterministic.
 */

import { fileURLToPath } from 'node:url';
import {
    InformationPropagationEngine,
    RUMOR_STATUS
} from '../../packages/core/src/InformationPropagationEngine.js';

export const FLOOD_CAP = 500;
export const FLOOD_SIZES = Object.freeze([10, 600]);
export const FLOOD_SEED = 20261102;

function chainNet(cap, seed) {
    const eng = new InformationPropagationEngine({ maxRetainedRumors: cap }, seed);
    for (const a of ['a', 'b', 'c', 'd']) eng.registerAgent(a, 0.9);
    eng.addListenEdge('b', 'a');
    eng.addListenEdge('c', 'b');
    eng.addListenEdge('d', 'c');
    return eng;
}

export function runFloodDynamics(options = {}) {
    const cap = options.cap ?? FLOOD_CAP;
    const sizes = options.sizes ?? FLOOD_SIZES;
    const seed = options.seed ?? FLOOD_SEED;
    const spreadTicks = options.spreadTicks ?? 10;
    const loads = sizes.map(n => {
        const eng = chainNet(cap, seed);
        for (let i = 0; i < n; i++) eng.injectRumor('ROAD_AMBUSH', `c${i}`, 'a');
        const t0 = Date.now();
        let heard = 0;
        for (let t = 0; t < spreadTicks; t++) heard += eng.advanceTick().length;
        const stats = eng.networkStats();
        return {
            injected: n,
            retained: eng.rumors.size,
            active: stats.rumorsActive,
            heard,
            heardPerRumor: parseFloat((heard / Math.max(1, eng.rumors.size)).toFixed(3)),
            wallMs: Date.now() - t0
        };
    });
    // Fresh-rumor propagation under flood: injected after the flood, must
    // still traverse the full 3-hop chain.
    const fresh = chainNet(cap, seed);
    const floodN = Math.max(...sizes);
    for (let i = 0; i < floodN; i++) fresh.injectRumor('ROAD_AMBUSH', `c${i}`, 'a');
    const freshId = fresh.injectRumor('ROAD_AMBUSH', 'fresh-after-flood', 'a');
    for (let t = 0; t < 3; t++) fresh.advanceTick();
    const freshReached = fresh.heldBy('d').some(h => h.rumorId === freshId);
    // Terminal-first eviction: decayed rumors must go before live ones.
    const term = new InformationPropagationEngine({ maxRetainedRumors: 100 }, seed);
    for (const a of ['a', 'b']) term.registerAgent(a, 0.9);
    term.addListenEdge('b', 'a');
    for (let i = 0; i < 30; i++) term.injectRumor('ROAD_AMBUSH', `old${i}`, 'a', { confidence: 0.06 });
    for (let t = 0; t < 3; t++) term.advanceTick();
    const decayedBefore = [...term.rumors.values()].filter(r => r.status === RUMOR_STATUS.DECAYED).length;
    for (let i = 0; i < 120; i++) term.injectRumor('ROAD_AMBUSH', `new${i}`, 'a');
    const kept = [...term.rumors.values()];
    return {
        config: { cap, sizes: [...sizes], seed, spreadTicks },
        loads,
        freshReached,
        terminalFirst: {
            decayedBefore,
            decayedRetained: kept.filter(r => r.status === RUMOR_STATUS.DECAYED).length,
            oldestRetained: kept.length ? kept[0].claim : null
        }
    };
}

export function printFloodDynamics(result) {
    console.log('=== NEXT-42: Post-cap rumor flood dynamics ===');
    for (const l of result.loads) {
        console.log(`  injected=${l.injected} retained=${l.retained} active=${l.active} heard=${l.heard} heardPerRumor=${l.heardPerRumor}`);
    }
    console.log(`  fresh-after-flood reached d: ${result.freshReached}`);
    const t = result.terminalFirst;
    console.log(`  terminal-first: decayedBefore=${t.decayedBefore} decayedRetained=${t.decayedRetained} oldest=${t.oldestRetained}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printFloodDynamics(runFloodDynamics());
}

// NEXT-59/NEXT-60: dense-topology flood plus per-tick spread budget.
export const DENSE_N = 8;
export const DENSE_FLOOD = 600;

export function denseNet(n, cap, seed, budget) {
    const eng = new InformationPropagationEngine(
        budget === undefined ? { maxRetainedRumors: cap } : { maxRetainedRumors: cap, maxSpreadPerTick: budget },
        seed
    );
    const ids = [];
    for (let i = 0; i < n; i++) {
        const a = `a${i}`;
        ids.push(a);
        eng.registerAgent(a, 0.9);
    }
    for (const l of ids) for (const s of ids) if (l !== s) eng.addListenEdge(l, s);
    return { eng, ids };
}

export function runDenseFlood(options = {}) {
    const n = options.n ?? DENSE_N;
    const floodN = options.floodN ?? DENSE_FLOOD;
    const cap = options.cap ?? FLOOD_CAP;
    const seed = options.seed ?? FLOOD_SEED;
    const spreadTicks = options.spreadTicks ?? 10;
    const budget = options.budget;
    const { eng, ids } = denseNet(n, cap, seed, budget);
    for (let i = 0; i < floodN; i++) eng.injectRumor('ROAD_AMBUSH', `c${i}`, 'a0');
    let heard = 0;
    let peakPerTick = 0;
    for (let t = 0; t < spreadTicks; t++) {
        const h = eng.advanceTick().length;
        heard += h;
        peakPerTick = Math.max(peakPerTick, h);
    }
    const freshId = eng.injectRumor('ROAD_AMBUSH', 'fresh-after-flood', 'a0');
    for (let t = 0; t < 3; t++) eng.advanceTick();
    let freshHolders = 0;
    for (const [, inbox] of eng.inboxes) if (inbox.has(freshId)) freshHolders++;
    return {
        config: { n, floodN, cap, seed, spreadTicks, budget: budget ?? null },
        retained: eng.rumors.size,
        heard,
        peakPerTick,
        freshHolders,
        agentCount: ids.length
    };
}

export function printDenseFlood(r) {
    console.log(`=== NEXT-59/60: dense flood (budget=${r.config.budget ?? 'none'}) ===`);
    console.log(`  retained=${r.retained} heard=${r.heard} peakPerTick=${r.peakPerTick} freshHolders=${r.freshHolders}/${r.agentCount}`);
}
