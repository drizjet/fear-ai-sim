#!/usr/bin/env node
/**
 * NEXT-22b: Valley outcome-distribution across seeds (CCX evidence).
 *
 * CCX requires different seeds/configurations to MAY produce different
 * outcomes. This benchmark runs the canonical valley N seeds x 5000 ticks
 * and classifies macro outcomes: categorical outcome class per run
 * (final stage triple + warsDeclared + alliancesFormed) plus numeric
 * dispersion (encounters, route failures, deliveries, final grievance).
 *
 * Current finding it must report honestly either way: the valley
 * converges to a single macro class across seeds (robust simmer, but no
 * multi-outcome repertoire — setup variation, not seed variation, is the
 * missing knob). Fully deterministic: reruns are identical.
 */

import { fileURLToPath } from 'node:url';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../../packages/core/src/FrontierValleySimulation.js';

export const OUTCOME_SEEDS = Object.freeze([11, 424242, 7, 99, 1234, 555, 7777, 31337, 2718, 1618, 42, 2026]);
export const OUTCOME_TICKS = 5000;
const PAIRS = [
    [FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS],
    [FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.NOMADS],
    [FRONTIER_VALLEY_FACTIONS.BANDITS, FRONTIER_VALLEY_FACTIONS.NOMADS]
];

export function runOutcomeDistribution(options = {}) {
    const seeds = options.seeds ?? OUTCOME_SEEDS;
    const ticks = options.ticks ?? OUTCOME_TICKS;
    const runs = seeds.map(seed => {
        const sim = new FrontierValleySimulation({ seed });
        sim.advance(ticks);
        const stages = PAIRS.map(([a, b]) => sim.factionSystem.getBilateralStance(a, b).stage);
        const grievSB = sim.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS, FRONTIER_VALLEY_FACTIONS.BANDITS).grievance;
        return {
            seed,
            outcomeClass: `${stages.join('/')}|wars=${sim.macroMetrics.warsDeclared}|ally=${sim.macroMetrics.alliancesFormed}`,
            stages,
            warsDeclared: sim.macroMetrics.warsDeclared,
            alliancesFormed: sim.macroMetrics.alliancesFormed,
            deliveries: sim.macroMetrics.deliveries ?? 0,
            routeFailures: sim.macroMetrics.routeFailures,
            totalEncounters: sim.macroMetrics.totalEncounters,
            finalGrievanceSB: grievSB
        };
    });
    const classes = {};
    for (const r of runs) {
        if (!classes[r.outcomeClass]) classes[r.outcomeClass] = [];
        classes[r.outcomeClass].push(r.seed);
    }
    const nums = (f) => runs.map(f);
    const spread = (vals) => {
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length);
        return { min, max, mean: parseFloat(mean.toFixed(2)), cv: mean === 0 ? 0 : parseFloat((sd / mean).toFixed(4)) };
    };
    return {
        config: { seeds: [...seeds], ticks },
        runs,
        classCount: Object.keys(classes).length,
        classes,
        dispersion: {
            totalEncounters: spread(nums(r => r.totalEncounters)),
            routeFailures: spread(nums(r => r.routeFailures)),
            deliveries: spread(nums(r => r.deliveries)),
            finalGrievanceSB: spread(nums(r => r.finalGrievanceSB))
        }
    };
}

export function outcomeDigest(result) {
    return result.runs.map(r => [r.seed, r.outcomeClass, r.deliveries, r.routeFailures, r.totalEncounters].join('|')).join('\n');
}

export function printOutcomeReport(result) {
    console.log('=== NEXT-22b: Valley Outcome Distribution ===');
    console.log(`seeds: ${result.config.seeds.length}, classes: ${result.classCount}`);
    for (const [cls, seeds] of Object.entries(result.classes)) {
        console.log(`  [${cls}] seeds=${seeds.join(',')}`);
    }
    for (const [metric, s] of Object.entries(result.dispersion)) {
        console.log(`  ${metric}: min=${s.min} max=${s.max} mean=${s.mean} CV=${s.cv}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printOutcomeReport(runOutcomeDistribution());
}
