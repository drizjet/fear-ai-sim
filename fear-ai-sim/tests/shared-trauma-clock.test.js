import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/index.js';
import { TraumaCrystallizationEngine } from '../packages/core/index.js';
import { SharedTraumaClock } from '../packages/core/index.js';

// NEXT-131: multi-agent trauma clock ownership (CCI-28 frontier 15).
// One shared engine, many attached agents, exactly one tick per world
// tick: consolidation runs at true speed and records stay independent.
describe('NEXT-131: shared trauma clock ownership', () => {
    const TRAITS = { neuroticism: 0.8, fear: 0.9, resilience: 0.3 };
    const TERROR = { threats: [{ id: 't', type: 'WOLF', intensity: 1.0, distance: 2 }] };

    function squad(n, engine) {
        const agents = [];
        for (let i = 0; i < n; i++) {
            agents.push(new AffectiveAgent(`sq${i}`, TRAITS, {
                seed: `sq${i}-seed`,
                traumaEngine: engine,
                traumaAdvanceClock: false
            }));
        }
        return agents;
    }

    it('1. Shared clock advances once per world tick for N agents', () => {
        const engine = new TraumaCrystallizationEngine();
        const clock = new SharedTraumaClock(engine);
        const agents = squad(3, engine);
        for (const a of agents) clock.claim(a.id);
        for (let tick = 1; tick <= 200; tick++) {
            for (const a of agents) a.tick(0.016, TERROR);
            clock.step(tick);
        }
        expect(engine.currentTick).toBe(200);
        expect(clock.stats()).toEqual({ owners: 3, steps: 200, engineTick: 200 });
    });

    it('2. Repeated steps with the same tick id advance only once', () => {
        const engine = new TraumaCrystallizationEngine();
        const clock = new SharedTraumaClock(engine);
        clock.step(7);
        clock.step(7);
        clock.step(7);
        expect(engine.currentTick).toBe(1);
        expect(clock.step(6).advanced).toBe(false);
        expect(engine.currentTick).toBe(1);
    });

    it('3. Per-agent trauma records stay independent under sharing', () => {
        const engine = new TraumaCrystallizationEngine();
        const clock = new SharedTraumaClock(engine);
        const agents = squad(2, engine);
        for (const a of agents) clock.claim(a.id);
        // Only the first agent meets terror; the second stays calm.
        for (let tick = 1; tick <= 200; tick++) {
            agents[0].tick(0.016, TERROR);
            agents[1].tick(0.016, {});
            clock.step(tick);
        }
        const r0 = engine.agentRecords.get('sq0');
        const r1 = engine.agentRecords.get('sq1');
        expect(r0.crystallizedTraumas.length).toBeGreaterThanOrEqual(1);
        expect(r1.crystallizedTraumas.length + r1.activeTraumas.length).toBe(0);
        expect(engine.evaluateAgentState('sq1', { sensoryCues: [] }).phobicDread).toBe(0);
    });

    it('4. Ownership transfers without losing continuity', () => {
        const engine = new TraumaCrystallizationEngine();
        const clock = new SharedTraumaClock(engine);
        clock.claim('a');
        clock.step(1);
        clock.release('a');
        clock.claim('b');
        clock.step(2);
        expect(engine.currentTick).toBe(2);
        expect(clock.stats().owners).toBe(1);
    });

    it('5. Constructor rejects engines without a tick method', () => {
        expect(() => new SharedTraumaClock(null)).toThrow();
        expect(() => new SharedTraumaClock({})).toThrow();
        expect(() => new SharedTraumaClock({ tick: 1 })).toThrow();
    });
});
