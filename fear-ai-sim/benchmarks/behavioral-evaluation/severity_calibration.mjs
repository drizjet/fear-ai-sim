#!/usr/bin/env node
/**
 * NEXT-56: Casualty-severity designer calibration surface (NEXT-48 gap).
 *
 * The 0.25 floor / 0.5 knee were judgment calls. This sweep maps what
 * they control: single-incident magnitudes move monotonically with both
 * knobs, while the 5000-tick reverse-ladder ceiling (MOBILIZE visited,
 * ATTACK never, peak 0.989) is INVARIANT across the whole grid — the
 * ceiling verdict does not depend on the calibration. Designers can
 * therefore tune per-incident feel freely without destabilizing the
 * ladder. Measurement only. Deterministic.
 */

import { fileURLToPath } from 'node:url';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS
} from '../../packages/core/src/FrontierValleySimulation.js';
import { ESCALATION_STAGES } from '../../packages/core/src/FactionSystem.js';

export const SEV_FLOORS = Object.freeze([0, 0.25, 0.5]);
export const SEV_KNEES = Object.freeze([0.25, 0.5, 0.75]);

const S = FRONTIER_VALLEY_FACTIONS.SETTLERS;
const B = FRONTIER_VALLEY_FACTIONS.BANDITS;
const r4 = (v) => Math.round(v * 10000) / 10000;

function singleIncident(floor, knee) {
    const sim = new FrontierValleySimulation({ seed: 4242 });
    sim.severityParams = { floor, knee };
    sim._recordEncounterConsequences([{
        encounterId: 'cal', partyAId: 'bandit_warband_1', partyBId: 'caravan_merchant_1',
        advisoryResolution: 'COMBAT_ENGAGEMENT', encounterType: 'AMBUSH_INTERCEPTION'
    }]);
    return r4(sim.factionSystem.getBilateralStance(B, S).grievance);
}

function ladder(floor, knee, ticks = 5000) {
    const sim = new FrontierValleySimulation({ seed: 11 });
    sim.severityParams = { floor, knee };
    let maxG = 0;
    let mobilize = false;
    let attack = false;
    for (let t = 0; t < ticks; t += 10) {
        sim.advance(10);
        const st = sim.factionSystem.getBilateralStance(B, S);
        maxG = Math.max(maxG, st.grievance);
        mobilize = mobilize || st.stage === ESCALATION_STAGES.MOBILIZE;
        attack = attack || st.stage === ESCALATION_STAGES.ATTACK;
    }
    return { maxGriev: r4(maxG), mobilize, attack };
}

export function runSeverityCalibration(options = {}) {
    const floors = options.floors ?? SEV_FLOORS;
    const knees = options.knees ?? SEV_KNEES;
    const ticks = options.ticks ?? 5000;
    const cells = [];
    for (const floor of floors) {
        for (const knee of knees) {
            cells.push({
                floor, knee,
                incident: singleIncident(floor, knee),
                ...ladder(floor, knee, ticks)
            });
        }
    }
    return { config: { floors: [...floors], knees: [...knees], ticks }, cells };
}

export function printSeverityCalibration(r) {
    console.log('=== NEXT-56: severity calibration surface ===');
    for (const c of r.cells) {
        console.log(`  floor=${c.floor} knee=${c.knee}: incident=${c.incident} maxGriev=${c.maxGriev} MOBILIZE=${c.mobilize} ATTACK=${c.attack}`);
    }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printSeverityCalibration(runSeverityCalibration());
}
