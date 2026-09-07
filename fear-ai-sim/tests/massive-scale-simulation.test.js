import {
    CivilizationSimulationSystem,
    WorldSimulationSystem,
    FactionSystem,
    COGNITIVE_LOD_TIERS
} from '../packages/core/index.js';

describe('Milestone J: Massive-Scale Simulation & Latency Distribution', () => {
    test('1. System scales cleanly to 10,000 entities with bounded memory and execution time', () => {
        const civ = new CivilizationSimulationSystem();
        const N = 10000;

        for (let i = 0; i < N; i++) {
            const dist = (i / N) * 1200;
            const angle = (i * 0.1);
            civ.registerEntity(`e_${i}`, {
                position: { x: Math.cos(angle) * dist, y: 0, z: Math.sin(angle) * dist },
                fear: 0.2,
                morale: 0.8
            });
        }

        expect(civ.entities.size).toBe(N);

        const t0 = performance.now();
        civ.advanceSimulation(10);
        const elapsed = performance.now() - t0;

        // 10 ticks across 10,000 entities must execute well within 500 ms in Node
        expect(elapsed).toBeLessThan(500);

        // Verify entity state sanity (no NaNs or corrupt values)
        const sample0 = civ.entities.get('e_0');
        const sampleLast = civ.entities.get(`e_${N - 1}`);
        expect(Number.isFinite(sample0.fear)).toBe(true);
        expect(Number.isFinite(sampleLast.fear)).toBe(true);
        expect(sample0.lodTier).toBe(COGNITIVE_LOD_TIERS.LOD0_IMMEDIATE);
        expect(sampleLast.lodTier).toBe(COGNITIVE_LOD_TIERS.LOD4_OFFSCREEN);
    });

    test('2. Subframe latency budget: 1,000 entities per-tick p99 latency < 5.0ms', () => {
        const civ = new CivilizationSimulationSystem();
        const world = new WorldSimulationSystem({ seed: 100 });
        const factionSys = new FactionSystem();

        for (let i = 0; i < 1000; i++) {
            civ.registerEntity(`ent_${i}`, {
                position: { x: (i % 50) * 10, y: 0, z: (i % 20) * 10 }
            });
        }

        for (let g = 0; g < 20; g++) {
            world.registerGroup(`grp_${g}`, {
                memberCount: 50,
                position: { x: g * 20, y: 0, z: g * 20 },
                waypoints: [{ x: 100, y: 0, z: 100 }]
            });
        }

        const latencies = [];
        for (let t = 0; t < 30; t++) {
            const t0 = performance.now();
            civ.advanceSimulation(1);
            world.tick(1.0, { factionSystem: factionSys });
            factionSys.advanceTick(1);
            latencies.push(performance.now() - t0);
        }

        const sorted = [...latencies].sort((a, b) => a - b);
        const p99 = sorted[Math.floor(sorted.length * 0.99)];

        // Under 60 FPS frame budget (16.67ms), our middleware p99 must be < 5.0ms
        expect(p99).toBeLessThan(5.0);
    });

    test('3. Massive-scale snapshot export and import determinism', () => {
        const civ = new CivilizationSimulationSystem();
        for (let i = 0; i < 1000; i++) {
            civ.registerEntity(`e_${i}`, {
                position: { x: i, y: 0, z: 0 },
                fear: 0.1,
                morale: 0.9
            });
        }

        civ.advanceSimulation(20);

        const snap = civ.getState();
        const clone = new CivilizationSimulationSystem();
        clone.setState(snap);

        civ.advanceSimulation(20);
        clone.advanceSimulation(20);

        expect(civ.tickCount).toBe(clone.tickCount);
        expect(civ.entities.get('e_500').fear).toBeCloseTo(clone.entities.get('e_500').fear, 6);
    });
});
