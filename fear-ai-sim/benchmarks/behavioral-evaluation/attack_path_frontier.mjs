#!/usr/bin/env node
/**
 * NEXT-39: ATTACK-path reachability for the escalation ladder.
 *
 * A rate sweep (pre-fuel) proved the top rung was unreachable: raids at
 * ANY rate, including every tick, peaked at SKIRMISH, because grievance +
 * territorial cap composite pressure at 0.70 while ATTACK needs 0.75 and
 * no incident type produced economicPressure. Raids now burn the economic
 * base (+0.25, decaying), so chronic raiding totalizes while sparse raids
 * still simmer.
 *
 * This benchmark maps the raid-rate frontier (which sustained rates reach
 * SKIRMISH / ATTACK) and checks proportionality: single raids must NOT
 * reach ATTACK. Fully deterministic.
 */

import { fileURLToPath } from 'node:url';
import { FactionSystem, FACTION_CULTURES, INCIDENT_TYPES } from '../../packages/core/src/FactionSystem.js';

export const ATTACK_RATE_KS = Object.freeze([1, 3, 7, 15, 30, 60, 120]);
export const ATTACK_HORIZON = 2000;

export function raidRateFrontier(options = {}) {
    const ks = options.ks ?? ATTACK_RATE_KS;
    const horizon = options.horizon ?? ATTACK_HORIZON;
    const rows = [];
    for (const k of ks) {
        const fs = new FactionSystem();
        fs.registerFaction({ id: 'S', culture: FACTION_CULTURES.HONORABLE, militaryReadiness: 0.7, economicStockpile: 0.65 });
        fs.registerFaction({ id: 'B', culture: FACTION_CULTURES.MILITARISTIC, militaryReadiness: 0.55, economicStockpile: 0.3 });
        const seen = new Set();
        let firstAttack = -1;
        for (let t = 0; t < horizon; t++) {
            if (t % k === 0) fs.recordIncident('B', 'S', INCIDENT_TYPES.RAID_CONFIRMED, {});
            fs.advanceTick(1);
            const stage = fs.evaluateStance('S', 'B').toStage;
            seen.add(stage);
            if (stage === 'ATTACK' && firstAttack < 0) firstAttack = t;
        }
        rows.push({ everyTicks: k, stages: [...seen].sort(), firstAttackTick: firstAttack });
    }
    // Single-raid proportionality: one raid must never yield ATTACK.
    const single = new FactionSystem();
    single.registerFaction({ id: 'S', culture: FACTION_CULTURES.HONORABLE, militaryReadiness: 0.7, economicStockpile: 0.65 });
    single.registerFaction({ id: 'B', culture: FACTION_CULTURES.MILITARISTIC, militaryReadiness: 0.55, economicStockpile: 0.3 });
    single.recordIncident('B', 'S', INCIDENT_TYPES.RAID_CONFIRMED, {});
    single.advanceTick(1);
    const singleRaidStage = single.evaluateStance('S', 'B').toStage;
    return { config: { ks: [...ks], horizon }, rows, singleRaidStage };
}

export function printAttackFrontier(result) {
    console.log('=== NEXT-39: ATTACK-path raid-rate frontier ===');
    for (const r of result.rows) {
        console.log(`  every ${r.everyTicks}: [${r.stages.join(',')}] firstATTACK=${r.firstAttackTick}`);
    }
    console.log(`  single raid -> ${result.singleRaidStage} (must not be ATTACK)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    printAttackFrontier(raidRateFrontier());
}
