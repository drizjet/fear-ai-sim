#!/usr/bin/env node
/**
 * NEXT-52: Economy calibration review (NEXT-45 gap).
 *
 * NEXT-45 left production rates, sink caps, and upkeep "uncalibrated
 * scenario params". This map sweeps them on a 5000-tick valley run and
 * finds a wide slack plateau: deliveries are identical across upkeep
 * 0x-200x and production 0.5x-2x (caravan cycle time binds, stocks
 * never hit bounds in-regime). Cliffs exist only at starvation
 * (production 0 -> initial-stock drain) and tiny sink caps. Verdict:
 * calibration does not matter until flows scale ~2x or runs lengthen
 * ~2x — no retune, plateau plus cliff edges pinned. Measurement only.
 * Deterministic for a fixed seed and construction order.
 */

import { fileURLToPath } from 'node:url';
import { FrontierValleySimulation } from '../../packages/core/src/FrontierValleySimulation.js';

export const ECON_SEED = 11;
export const ECON_TICKS = 5000;

function runCell({ upkeepMult = 1, prodMult = 1, tinyCaps = false, seed = ECON_SEED, ticks = ECON_TICKS }) {
    const sim = new FrontierValleySimulation({ seed });
    if (upkeepMult !== 1) {
        for (const b of Object.values(sim.upkeep)) for (const k of Object.keys(b)) b[k] *= upkeepMult;
    }
    if (prodMult !== 1) {
        for (const p of Object.values(sim.production)) for (const c of Object.values(p)) c.rate *= prodMult;
    }
    if (tinyCaps) {
        sim.storageCaps.Oakhaven.food = 2;
        sim.storageCaps.Oakhaven.timber = 2;
    }
    sim.advance(ticks);
    return sim.macroMetrics.deliveries;
}

export function runEconomyCalibration(options = {}) {
    const seed = options.seed ?? ECON_SEED;
    const ticks = options.ticks ?? ECON_TICKS;
    const plateau = {};
    for (const u of (options.upkeepMults ?? [0, 1, 5])) {
        for (const p of (options.prodMults ?? [0.5, 1, 2])) {
            plateau[`u${u}/p${p}`] = runCell({ upkeepMult: u, prodMult: p, seed, ticks });
        }
    }
    return {
        config: { seed, ticks },
        plateau,
        cliffs: {
            productionZero: runCell({ upkeepMult: 1, prodMult: 0, seed, ticks }),
            tinyCaps: runCell({ upkeepMult: 1, prodMult: 1, tinyCaps: true, seed, ticks })
        }
    };
}

export function printEconomyCalibration(r) {
    console.log('=== NEXT-52: economy calibration map ===');
    console.log('  plateau: ' + Object.entries(r.plateau).map(([k, v]) => `${k}=${v}`).join(' '));
    console.log(`  cliffs: productionZero=${r.cliffs.productionZero} tinyCaps=${r.cliffs.tinyCaps}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printEconomyCalibration(runEconomyCalibration());
}

// NEXT-67: satiation-boundary mapping. The NEXT-52 count-plateau holds to
// 5k ticks; at 4x run length the upkeep-0 cell satiates (sink fills, flow
// stalls) while upkeep>=1 flows forever. Legs are per-window delivery
// deltas; oakFood tracks the normal-run sink against its 150 cap.
export function runSatiationBoundary(options = {}) {
    const seed = options.seed ?? ECON_SEED;
    const ticks = options.ticks ?? 20000;
    const legEvery = options.legEvery ?? 5000;
    function legs(mut) {
        const sim = new FrontierValleySimulation({ seed });
        mut(sim);
        const deltas = [];
        const volumes = [];
        let prev = 0;
        let prevVol = 0;
        const r1 = (v) => Math.round(v * 100) / 100;
        for (let t = 0; t < ticks; t += legEvery) {
            sim.advance(Math.min(legEvery, ticks - t));
            deltas.push(sim.macroMetrics.deliveries - prev);
            prev = sim.macroMetrics.deliveries;
            volumes.push(r1(sim.macroMetrics.deliveredVolume - prevVol));
            prevVol = sim.macroMetrics.deliveredVolume;
        }
        return { deltas, volumes, oakFood: Math.round(sim.civSystem.nodes.get('Oakhaven').market.food * 10) / 10 };
    }
    const noUpkeep = (s) => { for (const b of Object.values(s.upkeep)) for (const k of Object.keys(b)) b[k] = 0; };
    const tinyCaps = (s) => { s.storageCaps.Oakhaven.food = 2; s.storageCaps.Oakhaven.timber = 2; };
    return {
        config: { seed, ticks, legEvery },
        upkeepZero: legs(noUpkeep),
        upkeepNormal: legs(() => {}),
        tinyCaps: legs(tinyCaps)
    };
}
export function printSatiationBoundary(r) {
    console.log('=== NEXT-67: satiation boundary ===');
    for (const [k, v] of Object.entries(r)) {
        if (k === 'config') continue;
        console.log(`  ${k} legs=${v.deltas} vol=${v.volumes} oakFood=${v.oakFood}`);
    }
}

// NEXT-72: upkeep-law formalization. Steady volume has two regimes:
// upkeep-limited (volume rises with the drain rate) and inflow-limited
// (drains clear faster than caravans deliver; volume caps at caravan
// capacity). Absolute upkeep rates here; the shipped rate is 0.012.
export const UPKEEP_LAW_RATES = Object.freeze([0.002, 0.012, 0.02]);
export const UPKEEP_LAW_HORIZONS = Object.freeze([10000, 20000]);

export function runUpkeepLaw(options = {}) {
    const seed = options.seed ?? ECON_SEED;
    const rates = options.rates ?? UPKEEP_LAW_RATES;
    const horizons = options.horizons ?? UPKEEP_LAW_HORIZONS;
    const r1 = (v) => Math.round(v * 10) / 10;
    const table = {};
    for (const ticks of horizons) {
        for (const u of rates) {
            const sim = new FrontierValleySimulation({ seed });
            for (const b of Object.values(sim.upkeep)) for (const k of Object.keys(b)) b[k] = u;
            sim.advance(ticks);
            table[`T${ticks}/u${u}`] = r1(sim.macroMetrics.deliveredVolume);
        }
    }
    return { config: { seed, rates: [...rates], horizons: [...horizons] }, table };
}
export function printUpkeepLaw(r) {
    console.log('=== NEXT-72: upkeep law ===');
    console.log('  volume: ' + Object.entries(r.table).map(([k, v]) => `${k}=${v}`).join(' '));
}
