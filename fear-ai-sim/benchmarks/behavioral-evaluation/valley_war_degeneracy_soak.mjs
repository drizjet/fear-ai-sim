#!/usr/bin/env node
/**
 * NEXT-22: Long-horizon war-degeneracy soak for the Frontier Valley.
 *
 * Runs the canonical valley 5000 ticks across frozen seeds and watches for
 * degenerate attractors: permanent all-pairs WAR/ATTACK, grievance pinned
 * at 1.0, unbounded advisory-state growth, NaN/non-finite leakage.
 *
 * Scenario backstory (setup-hardened Settlers>Bandits grievance 0.80) puts
 * the valley at SKIRMISH within the first ticks, so warsDeclared=1 is a
 * setup artifact. Emergent dynamics are measured post-transient (tick >=
 * 500): visited stages, max composite pressure, first emergent SKIRMISH+.
 * The sticky warsDeclared counter catches transient SKIRMISH/ATTACK that
 * sparse sampling could miss.
 *
 * The valley has balancing dynamics (grievance half-life 60 ticks, route
 * danger half-life 80 ticks), so the expected finding is a stable simmer,
 * not runaway. Any degeneracy flag is a real bug report, not a tuning
 * opinion. Fully deterministic: reruns are identical.
 */

import { fileURLToPath } from 'node:url';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../../packages/core/src/FrontierValleySimulation.js';

export const SOAK_SEEDS = Object.freeze([11, 424242, 7]);
export const SOAK_TICKS = 5000;
export const SOAK_SAMPLE_EVERY = 10;
/** Tick from which dynamics count as emergent (setup transient excluded). */
export const SOAK_TRANSIENT_TICKS = 500;
const PAIRS = [
    [FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS],
    [FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.NOMADS],
    [FRONTIER_VALLEY_FACTIONS.BANDITS, FRONTIER_VALLEY_FACTIONS.NOMADS]
];

function isFiniteNumber(v) {
    return typeof v === 'number' && Number.isFinite(v);
}

function pairKey(a, b) {
    return `${a}>${b}`;
}

export function runWarSoak(options = {}) {
    const seeds = options.seeds ?? SOAK_SEEDS;
    const ticks = options.ticks ?? SOAK_TICKS;
    const sampleEvery = options.sampleEvery ?? SOAK_SAMPLE_EVERY;
    const transient = options.transientTicks ?? SOAK_TRANSIENT_TICKS;
    const runs = [];
    for (const seed of seeds) {
        const sim = new FrontierValleySimulation({ seed });
        const samples = [];
        const visitedEmergent = {};
        for (const [a, b] of PAIRS) visitedEmergent[pairKey(a, b)] = new Set();
        let maxPressureEmergent = 0;
        let firstEmergentWarTick = -1;
        const take = () => {
            const stages = {};
            const grievances = {};
            const pressures = {};
            let allWar = true;
            const emergent = sim.currentTick >= transient;
            for (const [a, b] of PAIRS) {
                const s = sim.factionSystem.getBilateralStance(a, b);
                const k = pairKey(a, b);
                stages[k] = s.stage;
                grievances[k] = s.grievance;
                pressures[k] = s.compositePressure ?? 0;
                if (emergent) {
                    visitedEmergent[k].add(s.stage);
                    if (isFiniteNumber(s.compositePressure)) {
                        maxPressureEmergent = Math.max(maxPressureEmergent, s.compositePressure);
                    }
                    if ((s.stage === 'SKIRMISH' || s.stage === 'ATTACK' || s.stage === 'WAR')
                        && firstEmergentWarTick < 0) {
                        firstEmergentWarTick = sim.currentTick;
                    }
                }
                if (s.stage !== 'WAR' && s.stage !== 'ATTACK') allWar = false;
            }
            const dangers = {};
            for (const [id, r] of sim.civSystem.routes) dangers[id] = r.perceivedDanger;
            samples.push({
                tick: sim.currentTick,
                stages, grievances, pressures, dangers, allWar,
                routeFailures: sim.macroMetrics.routeFailures,
                warsDeclared: sim.macroMetrics.warsDeclared,
                warsActive: sim.macroMetrics.warsActive,
                alliancesFormed: sim.macroMetrics.alliancesFormed,
                tradeRows: sim.tradeLedger.length,
                historyRows: sim.worldSystem.historyLedger.length,
                rumors: sim.worldSystem.rumors.size
            });
        };
        take();
        for (let t = 0; t < ticks; t += sampleEvery) {
            sim.advance(Math.min(sampleEvery, ticks - t));
            take();
        }
        // Degeneracy audit over the final fifth of the run.
        const tail = samples.slice(Math.max(1, Math.floor(samples.length * 0.8)));
        const allWarLocked = tail.every(s => s.allWar);
        let maxGrievance = 0;
        let minDangerTail = Infinity;
        let nonFinite = 0;
        for (const s of tail) {
            for (const g of Object.values(s.grievances)) {
                if (!isFiniteNumber(g)) nonFinite++;
                else maxGrievance = Math.max(maxGrievance, g);
            }
            for (const d of Object.values(s.dangers)) {
                if (!isFiniteNumber(d)) nonFinite++;
                else minDangerTail = Math.min(minDangerTail, d);
            }
            for (const p of Object.values(s.pressures)) {
                if (!isFiniteNumber(p)) nonFinite++;
            }
        }
        const last = samples[samples.length - 1];
        const firstTail = tail[0];
        const failuresPerTickTail = (last.routeFailures - firstTail.routeFailures)
            / Math.max(1, last.tick - firstTail.tick);
        const visitedStages = {};
        for (const [k, v] of Object.entries(visitedEmergent)) visitedStages[k] = [...v].sort();
        const flags = [];
        if (allWarLocked) flags.push('ALL_WAR_LOCKED');
        if (maxGrievance >= 1.0 && tail.every(s => Object.values(s.grievances).every(g => g >= 1.0))) {
            flags.push('GRIEVANCE_PINNED_MAX');
        }
        if (nonFinite > 0) flags.push('NON_FINITE_STATE');
        if (last.tradeRows > 1000 || last.historyRows > 1000 || last.rumors > 500) {
            flags.push('ADVISORY_STATE_OVER_CAP');
        }
        runs.push({
            seed, ticks, samples: samples.length,
            finalTick: last.tick,
            finalStages: last.stages,
            finalGrievances: last.grievances,
            finalDangers: last.dangers,
            routeFailures: last.routeFailures,
            failuresPerTickTail: parseFloat(failuresPerTickTail.toFixed(4)),
            warsDeclared: last.warsDeclared,
            firstEmergentWarTick,
            warsActive: last.warsActive,
            alliancesFormed: last.alliancesFormed,
            tradeRows: last.tradeRows,
            historyRows: last.historyRows,
            rumors: last.rumors,
            visitedStages,
            maxPressureEmergent: parseFloat(maxPressureEmergent.toFixed(4)),
            allWarLocked,
            maxGrievanceTail: parseFloat(maxGrievance.toFixed(4)),
            minDangerTail: parseFloat(minDangerTail.toFixed(4)),
            flags
        });
    }
    return { config: { seeds: [...seeds], ticks, sampleEvery, transient }, runs };
}

/** Short digest for determinism comparison and regression pins. */
export function soakDigest(result) {
    return result.runs.map(r => [
        r.seed, r.finalTick, JSON.stringify(r.finalStages),
        JSON.stringify(r.finalGrievances), JSON.stringify(r.finalDangers),
        r.routeFailures, r.warsDeclared, r.firstEmergentWarTick,
        JSON.stringify(r.visitedStages), r.maxPressureEmergent,
        r.tradeRows, r.historyRows, r.rumors, r.flags.join('+')
    ].join('|')).join('\n');
}

function shortPair(k) {
    return k.split('>').map(s => s.slice(0, 4)).join('v');
}

export function printWarSoakReport(result) {
    console.log('=== NEXT-22: Valley War-Degeneracy Soak ===');
    for (const r of result.runs) {
        console.log(`--- seed ${r.seed} @${r.finalTick} flags: ${r.flags.length ? r.flags.join(',') : 'none'}`);
        console.log(`  stages: ${Object.entries(r.finalStages).map(([k, v]) => `${shortPair(k)}=${v}`).join(' ')}`);
        console.log(`  griev: ${Object.values(r.finalGrievances).map(g => Number(g).toFixed(2)).join(' ')} maxTail=${r.maxGrievanceTail} maxPressEmergent=${r.maxPressureEmergent} firstEmergentWar=${r.firstEmergentWarTick} alliances=${r.alliancesFormed}`);
        console.log(`  visitedEmergent: ${Object.entries(r.visitedStages).map(([k, v]) => `${shortPair(k)}[${v.join(',')}]`).join(' ')}`);
        console.log(`  danger: ${Object.entries(r.finalDangers).map(([k, v]) => `${k}=${Number(v).toFixed(2)}`).join(' ')} minTail=${r.minDangerTail} failRateTail=${r.failuresPerTickTail}/tick`);
        console.log(`  state: trade=${r.tradeRows} history=${r.historyRows} rumors=${r.rumors}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printWarSoakReport(runWarSoak());
}
