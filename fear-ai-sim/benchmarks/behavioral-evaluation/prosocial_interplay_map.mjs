#!/usr/bin/env node
/**
 * NEXT-70: WARN vs APPROACH prosocial interplay map.
 *
 * The two A-slopes never compete directly (WARN needs visible threats,
 * APPROACH needs their absence with lingering anxiety). The interplay is
 * TEMPORAL: high-A agents WARN during threat and APPROACH after it
 * clears; low-A agents FLEE during and APPROACH after. Both urgencies
 * scale with A through the extracted shipped formulas. Measurement only.
 * Deterministic (fixed agent seeds).
 */

import { fileURLToPath } from 'node:url';
import { AffectiveAgent } from '../../packages/core/src/AffectiveAgent.js';

export const INTERPLAY_A = Object.freeze([0.3, 0.5, 0.7, 0.9]);

function runAgent(a, phases) {
    const agent = new AffectiveAgent('interplay', { agreeableness: a }, { seed: `interplay:${a}` });
    const peers = [{ id: 'p1', x: 2, y: 0, z: 0 }];
    const out = {};
    for (const [name, ticks, threats] of phases) {
        let res;
        for (let t = 0; t < ticks; t++) res = agent.tick(0.016, { threats, peers }, {});
        out[name] = { type: res.action_intent.type, urgency: res.action_intent.urgency, band: res.fear_band };
    }
    return out;
}

const THREAT = [{ id: 't1', distance: 10, intensity: 0.6, x: 10, y: 0, z: 0 }];

export function runProsocialInterplay(options = {}) {
    const aVals = options.aVals ?? INTERPLAY_A;
    const table = {};
    for (const a of aVals) {
        table[String(a)] = runAgent(a, [
            ['during', 8, THREAT],
            ['after2', 2, []],
            ['after8', 6, []]
        ]);
    }
    return { config: { aVals: [...aVals] }, table };
}

export function printProsocialInterplay(r) {
    console.log('=== NEXT-70: WARN vs APPROACH interplay ===');
    for (const [a, ph] of Object.entries(r.table)) {
        console.log(`  A=${a}: ` + Object.entries(ph).map(([k, v]) => `${k}=${v.type}@${v.urgency}[${v.band}]`).join(' '));
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printProsocialInterplay(runProsocialInterplay());
}
