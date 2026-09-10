#!/usr/bin/env node
/**
 * NEXT-48: Mauling-vs-scuffle differentiation (retaliatory-fuel gap).
 *
 * NEXT-44 left fight-back casualties undifferentiated: every ambush
 * combat recorded a full SKIRMISH_CASUALTY regardless of power ratio, so
 * a mauled warband fueled the same retaliatory grievance as one that
 * suffered a scuffle. FactionSystem SKIRMISH_CASUALTY now scales by
 * details.severity (default 1, NaN-safe: bitwise-identical old behavior),
 * and the valley ambush fight-back path derives severity from the
 * victim's strength share (parity-or-better mauls at 1.0, unarmed
 * scuffles at the 0.25 floor). Measurement helper; the behavior lives
 * in FactionSystem + FrontierValleySimulation. Fully deterministic.
 */

import { fileURLToPath } from 'node:url';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../../packages/core/src/FrontierValleySimulation.js';

export const MAUL_SEED = 4242;
export const MAUL_VICTIM_STRENGTHS = Object.freeze([0, 0.3, 0.5, 0.7]);

function round4(v) {
    return Math.round(v * 10000) / 10000;
}

export function runMaulingScuffle(options = {}) {
    const seed = options.seed ?? MAUL_SEED;
    const victimStrengths = options.victimStrengths ?? MAUL_VICTIM_STRENGTHS;
    const S = FRONTIER_VALLEY_FACTIONS.SETTLERS;
    const B = FRONTIER_VALLEY_FACTIONS.BANDITS;
    const rows = victimStrengths.map(vStr => {
        const sim = new FrontierValleySimulation({ seed });
        sim.worldSystem.groups.get('caravan_merchant_1').militaryStrength = vStr;
        sim._recordEncounterConsequences([{
            encounterId: 'ms',
            partyAId: 'bandit_warband_1',
            partyBId: 'caravan_merchant_1',
            advisoryResolution: 'COMBAT_ENGAGEMENT',
            encounterType: 'AMBUSH_INTERCEPTION'
        }]);
        const g = sim.factionSystem.getBilateralStance(B, S);
        return { vStr, griev: round4(g.grievance), fear: round4(g.fear) };
    });
    return { config: { seed, victimStrengths: [...victimStrengths] }, rows };
}

export function printMaulingScuffle(result) {
    console.log('=== NEXT-48: mauling-vs-scuffle differentiation ===');
    for (const r of result.rows) {
        console.log(`  victimStr=${r.vStr} banditGriev=${r.griev} banditFear=${r.fear}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printMaulingScuffle(runMaulingScuffle());
}
