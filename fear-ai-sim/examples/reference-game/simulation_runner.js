/**
 * examples/reference-game/simulation_runner.js
 *
 * Automated 50-turn simulation runner for the Reference Game Integration.
 * Executes the complete dungeon scenario and records metrics for the Integration Audit.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { performance } from 'perf_hooks';
import { DungeonGameSimulation, DungeonEntity } from './DungeonEngine.js';
import { FearAIAdapter } from './FearAIAdapter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function runDungeonSimulation() {
    console.log('=== Reference Game Integration Simulation: Dungeon Crawler 2D ===');

    const sim = new DungeonGameSimulation();
    const adapter = new FearAIAdapter(sim);

    // 1. Spawn Host Game Entities
    const guard = new DungeonEntity('guard_01', 'Captain Vane (Guard)', 5, 5, 120, 'GUARD');
    const miner = new DungeonEntity('miner_01', 'Boran (Civilian Miner)', 11, 10, 80, 'CIVILIAN');
    const scout = new DungeonEntity('scout_01', 'Lyra (Rogue Scout)', 8, 5, 90, 'SCOUT');
    const stalker = new DungeonEntity('stalker_01', 'Shadow Stalker (Monster)', 15, 10, 150, 'MONSTER');

    sim.spawnEntity(guard);
    sim.spawnEntity(miner);
    sim.spawnEntity(scout);
    sim.spawnEntity(stalker);

    // 2. Register NPCs with Big-Five Personality Profiles
    adapter.registerNPC('guard_01', {
        neuroticism: 0.20,
        resilience: 0.85,
        leadership: 0.80,
        agreeableness: 0.70,
        fear: 0.20
    });

    adapter.registerNPC('miner_01', {
        neuroticism: 0.85,
        resilience: 0.25,
        leadership: 0.15,
        agreeableness: 0.75,
        fear: 0.80
    });

    adapter.registerNPC('scout_01', {
        neuroticism: 0.35,
        resilience: 0.60,
        openness: 0.90,
        extraversion: 0.65,
        fear: 0.30
    });

    console.log('Initialized DungeonWorld (20x20). Registered 3 NPCs into Fear AI.');

    const turnLatencies = [];
    const eventLog = [];

    // 3. Execute 50-Turn Simulation
    for (let turn = 0; turn < 50; turn++) {
        sim.turn = turn;
        const tStart = performance.now();

        // Monster behavior (Host controlled)
        if (turn >= 3 && stalker.alive) {
            // Stalker stalks toward miner
            const path = sim.world.findPathBFS(stalker.x, stalker.y, miner.x, miner.y);
            if (path.length > 0) {
                sim.moveEntity('stalker_01', path[0].x, path[0].y);
                // If adjacent, attack
                if (Math.hypot(stalker.x - miner.x, stalker.y - miner.y) <= 1.5) {
                    sim.resolveAuthoritativeAttack('stalker_01', 'miner_01', 15);
                }
            }
        }

        // Fear AI updates for NPCs
        const minerStep = adapter.stepEntity('miner_01');
        const guardStep = adapter.stepEntity('guard_01');
        const scoutStep = adapter.stepEntity('scout_01');

        const elapsed = performance.now() - tStart;
        turnLatencies.push(elapsed);

        if (turn === 5 || turn === 15 || turn === 30 || turn === 49) {
            eventLog.push({
                turn,
                miner_pos: `${miner.x},${miner.y}`,
                miner_fear: minerStep?.intelligence?.affective_state?.raw_fear ?? 0,
                miner_intent: minerStep?.intelligence?.action_intent?.type,
                guard_action: guardStep?.hostActionExecuted,
                combat_events: sim.combatLog.length
            });
        }
    }

    const avgLatency = Number((turnLatencies.reduce((a, b) => a + b, 0) / turnLatencies.length).toFixed(4));
    const maxLatency = Number(Math.max(...turnLatencies).toFixed(4));

    console.log(`Simulation completed 50 turns.`);
    console.log(`- Average Frame / Turn Time: ${avgLatency} ms`);
    console.log(`- Max Frame / Turn Time:     ${maxLatency} ms`);
    console.log(`- Final Combat Engagements:  ${sim.combatLog.length}`);
    console.log(`- Miner Final Health:        ${miner.health} / ${miner.maxHealth}`);
    console.log(`- Miner Position:            (${miner.x}, ${miner.y})`);

    const report = {
        name: 'Reference Game Integration: 2D Dungeon Crawler',
        turns_executed: 50,
        average_latency_ms: avgLatency,
        max_latency_ms: maxLatency,
        authoritative_combat_log: sim.combatLog,
        milestone_snapshots: eventLog,
        status: 'SUCCESS'
    };

    return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    runDungeonSimulation();
}
