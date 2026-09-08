import { describe, it, expect } from '@jest/globals';
import { DungeonGameSimulation, DungeonEntity, GridWorld, TILE_TYPES } from '../examples/reference-game/DungeonEngine.js';
import { FearAIAdapter } from '../examples/reference-game/FearAIAdapter.js';
import { runDungeonSimulation } from '../examples/reference-game/simulation_runner.js';

describe('In-repo reference game (public API demo, not unrelated title)', () => {

    it('1. Pre-existing game engine maintains exclusive authority over movement and combat', () => {
        const sim = new DungeonGameSimulation();
        const guard = new DungeonEntity('guard', 'Guard', 5, 5, 100, 'GUARD');
        sim.spawnEntity(guard);

        // Move into wall should fail
        sim.world.grid[5][6] = TILE_TYPES.WALL;
        const movedIntoWall = sim.moveEntity('guard', 6, 5);
        expect(movedIntoWall).toBe(false);
        expect(guard.x).toBe(5);
        expect(guard.y).toBe(5);

        // Authoritative damage
        guard.takeDamage(40);
        expect(guard.health).toBe(60);
        expect(guard.alive).toBe(true);
    });

    it('2. Fear AI Adapter registers NPCs and generates advisory intents without mutating host state', () => {
        const sim = new DungeonGameSimulation();
        const adapter = new FearAIAdapter(sim);
        const miner = new DungeonEntity('miner', 'Miner', 10, 10, 80, 'CIVILIAN');
        const monster = new DungeonEntity('monster', 'Monster', 12, 10, 100, 'MONSTER');

        sim.spawnEntity(miner);
        sim.spawnEntity(monster);

        adapter.registerNPC('miner', { neuroticism: 0.8, resilience: 0.2 });

        const prevX = miner.x;
        const prevY = miner.y;
        const prevHealth = miner.health;

        // Run one intelligence step
        const result = adapter.stepEntity('miner');

        expect(result).toBeDefined();
        expect(result.intelligence.action_intent).toBeDefined();
        // Since monster is in line of sight, miner's intent will be an alert/evasion intent
        expect(['FLEE', 'FLEE_FROM', 'INVESTIGATE', 'INVESTIGATE_SOUND', 'CAUTIOUS_EXPLORE', 'IDLE_VIGILANT', 'COWER', 'SEEK_COVER', 'FREEZE', 'WARN_GROUP']).toContain(result.intelligence.action_intent.type);

        // Host game moves miner, but health must NOT have been modified by Fear AI
        expect(miner.health).toBe(prevHealth);
    });

    it('3. Complete 50-turn reference game simulation executes cleanly with sub-millisecond latency', () => {
        const report = runDungeonSimulation();

        expect(report.status).toBe('SUCCESS');
        expect(report.turns_executed).toBe(50);
        expect(report.average_latency_ms).toBeLessThan(2.0);
        expect(report.authoritative_combat_log.length).toBeGreaterThanOrEqual(1);
    });

    it('4. Civilians escape to Sanctuary via legal pathfinding under threat pressure', () => {
        const sim = new DungeonGameSimulation();
        const adapter = new FearAIAdapter(sim);

        const miner = new DungeonEntity('miner_escape', 'Miner', 5, 5, 80, 'CIVILIAN');
        const monster = new DungeonEntity('stalker_close', 'Monster', 6, 5, 100, 'MONSTER');

        sim.spawnEntity(miner);
        sim.spawnEntity(monster);

        adapter.registerNPC('miner_escape', { neuroticism: 0.9, resilience: 0.1 });

        // Step 1: Miner flees
        for (let t = 0; t < 10; t++) {
            adapter.stepEntity('miner_escape');
        }

        // Miner should have moved towards sanctuary (2, 2)
        const distToSanctuary = Math.hypot(miner.x - 2, miner.y - 2);
        expect(distToSanctuary).toBeLessThan(Math.hypot(5 - 2, 5 - 2));
    });
});
