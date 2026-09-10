#!/usr/bin/env node
/**
 * NEXT-43: Valley setup-sweep harness (CCX outcome knobs).
 *
 * NEXT-22b proved seeds alone produce one macro class. This harness varies
 * designer setup stances (nomad trust x settler-bandit grievance x seed)
 * via FrontierValleySimulation setupStances overrides and reports the
 * outcome class per cell. If setup variation splits classes where seeds
 * could not, the CCX knob hypothesis is confirmed. Fully deterministic.
 */

import { fileURLToPath } from 'node:url';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../../packages/core/src/FrontierValleySimulation.js';

export const SWEEP_TRUSTS = Object.freeze([0.30, 0.60, 0.90]);
export const SWEEP_GRIEVANCES = Object.freeze([0.30, 0.80]);
export const SWEEP_SEEDS = Object.freeze([11, 7]);
export const SWEEP_TICKS = 2000;
const F = FRONTIER_VALLEY_FACTIONS;
const PAIRS = [
    [F.SETTLERS, F.BANDITS],
    [F.SETTLERS, F.NOMADS],
    [F.BANDITS, F.NOMADS]
];

export function runSetupSweep(options = {}) {
    const trusts = options.trusts ?? SWEEP_TRUSTS;
    const grievances = options.grievances ?? SWEEP_GRIEVANCES;
    const seeds = options.seeds ?? SWEEP_SEEDS;
    const ticks = options.ticks ?? SWEEP_TICKS;
    const cells = [];
    for (const trust of trusts) {
        for (const grievance of grievances) {
            for (const seed of seeds) {
                const sim = new FrontierValleySimulation({
                    seed,
                    setupStances: [
                        { source: F.SETTLERS, target: F.NOMADS, patch: { trust } },
                        { source: F.SETTLERS, target: F.BANDITS, patch: { grievance } }
                    ]
                });
                sim.advance(ticks);
                const stages = PAIRS.map(([a, b]) => sim.factionSystem.getBilateralStance(a, b).stage);
                cells.push({
                    trust, grievance, seed,
                    outcomeClass: `${stages.join('/')}|wars=${sim.macroMetrics.warsDeclared}|ally=${sim.macroMetrics.alliancesFormed}`,
                    stages,
                    warsDeclared: sim.macroMetrics.warsDeclared,
                    alliancesFormed: sim.macroMetrics.alliancesFormed,
                    deliveries: sim.macroMetrics.deliveries ?? 0,
                    routeFailures: sim.macroMetrics.routeFailures
                });
            }
        }
    }
    const classes = {};
    for (const c of cells) {
        if (!classes[c.outcomeClass]) classes[c.outcomeClass] = [];
        classes[c.outcomeClass].push(`t${c.trust}/g${c.grievance}/s${c.seed}`);
    }
    return {
        config: { trusts: [...trusts], grievances: [...grievances], seeds: [...seeds], ticks },
        cellCount: cells.length,
        classCount: Object.keys(classes).length,
        classes,
        cells
    };
}

export function setupSweepDigest(result) {
    return result.cells.map(c => [c.trust, c.grievance, c.seed, c.outcomeClass, c.deliveries, c.routeFailures].join('|')).join('\n');
}

export function printSetupSweep(result) {
    console.log('=== NEXT-43: Valley setup sweep ===');
    console.log(`cells: ${result.cellCount}, classes: ${result.classCount}`);
    for (const [cls, members] of Object.entries(result.classes)) {
        console.log(`  [${cls}] ${members.join(' ')}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printSetupSweep(runSetupSweep());
}
