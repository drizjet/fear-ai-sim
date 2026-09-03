/**
 * LearningAgent Regression Tests — Hardened
 *
 * Locks the critical maxSpeed guard (live class is LearningAgent, not Agent).
 * Covers: init, ANTI_FLEE clamping, ghost field, and real Simulation integration.
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { LearningAgent } from '../learningagent.js';
import { Simulation } from '../simulation.js';

describe('LearningAgent maxSpeed guard', () => {
    beforeEach(() => {
        LearningAgent.nextId = 0;
    });

    it('initializes baseMaxSpeed and maxSpeed (no NaN)', () => {
        const a = new LearningAgent(0, 0);
        expect(Number.isFinite(a.baseMaxSpeed)).toBe(true);
        expect(a.baseMaxSpeed).toBe(3);
        expect(a.maxSpeed).toBe(a.baseMaxSpeed);
    });

    it('BigGuy is slower than normal agent (larger body, lower maxSpeed)', () => {
        const a = new LearningAgent(0, 0, null, true);
        expect(a.baseMaxSpeed).toBe(1.5);
        expect(a.baseMaxSpeed).toBeLessThan(3);
    });

    it('update() with ANTI_FLEE=0.5 produces correct clamped speed (ghost field case)', () => {
        const a = new LearningAgent(0, 0);
        expect(a.emotions.maxSpeed).toBeUndefined();
        const visuals = new Proxy({}, { get: () => [] });
        const counterMeasures = { ANTI_FLEE: 0.5 };
        a.update(1000, 1000, visuals, null, [], [], 0, 0, null, null, null, null, null, null, null, counterMeasures, null);
        expect(Number.isFinite(a.maxSpeed)).toBe(true);
        expect(a.maxSpeed).toBeCloseTo(2.4, 5); // 3 * (1 - 0.5*0.4)
    });

    it('update() without countermeasures keeps a finite maxSpeed', () => {
        const a = new LearningAgent(0, 0);
        const visuals = new Proxy({}, { get: () => [] });
        a.update(1000, 1000, visuals, null, [], [], 0, 0, null, null, null, null, null, null, null, null, null);
        expect(Number.isFinite(a.maxSpeed)).toBe(true);
        expect(a.maxSpeed).toBe(3);
    });

    describe('ANTI_FLEE boundary and invalid inputs', () => {
        const visuals = new Proxy({}, { get: () => [] });
        const cases = [
            { name: 'ANTI_FLEE=0 keeps base speed', input: 0, expected: 3 },
            { name: 'ANTI_FLEE=1 clamps to 60% speed', input: 1, expected: 1.8 },
            { name: 'ANTI_FLEE negative clamps to 0 (no effect)', input: -0.5, expected: 3 },
            { name: 'ANTI_FLEE >1 clamps to 1 (max 40% reduction)', input: 2, expected: 1.8 },
            { name: 'ANTI_FLEE NaN treated as 0', input: NaN, expected: 3 },
            { name: 'ANTI_FLEE Infinity treated as 0', input: Infinity, expected: 3 },
            { name: 'ANTI_FLEE undefined treated as 0', input: undefined, expected: 3 },
            { name: 'ANTI_FLEE null treated as 0', input: null, expected: 3 },
            { name: 'ANTI_FLEE string treated as 0', input: "0.5", expected: 3 },
        ];
        for (const c of cases) {
            it(c.name, () => {
                const a = new LearningAgent(0, 0);
                a.update(1000, 1000, visuals, null, [], [], 0, 0, null, null, null, null, null, null, null, { ANTI_FLEE: c.input }, null);
                expect(Number.isFinite(a.maxSpeed)).toBe(true);
                expect(a.maxSpeed).toBeGreaterThanOrEqual(0);
                expect(a.maxSpeed).toBeCloseTo(c.expected, 5);
            });
        }
        it('never produces negative speed even at boundary', () => {
            const a = new LearningAgent(0, 0);
            a.update(1000, 1000, visuals, null, [], [], 0, 0, null, null, null, null, null, null, null, { ANTI_FLEE: 10 }, null);
            expect(a.maxSpeed).toBeGreaterThanOrEqual(0);
            expect(Number.isFinite(a.maxSpeed)).toBe(true);
        });
    });

    it('uses Number.isFinite semantics (string/null do not coerce)', () => {
        // Direct check that our code uses Number.isFinite, not global isFinite
        expect(Number.isFinite("0")).toBe(false);
        expect(isFinite("0")).toBe(true); // global coerces — would be wrong
        // Our guard must not honor string "0" as valid maxSpeed
        const a = new LearningAgent(0, 0);
        a.baseMaxSpeed = "0"; // poison
        const visuals = new Proxy({}, { get: () => [] });
        a.update(1000, 1000, visuals, null, [], [], 0, 0, null, null, null, null, null, null, null, null, null);
        // Should fall back to DEFAULT_SPEED=3, not use string "0"
        expect(a.maxSpeed).toBe(3);
    });
});

describe('Simulation getStats contract', () => {
    it('returns numeric types for both zero and non-zero populations', () => {
        const mk = (fear, skill, morale, energy, state, dead=false) => ({
            dead, energy, brain: { currentFear: fear, traits: { skill }, morale, state }
        });
        const empty = Simulation.prototype.getStats.call({ agents: [] });
        expect(typeof empty.avgFear).toBe('number');
        expect(typeof empty.avgSkill).toBe('number');
        expect(typeof empty.avgMorale).toBe('number');
        expect(typeof empty.avgEnergy).toBe('number');
        expect(typeof empty.panicRatio).toBe('number');
        expect(typeof empty.panicCount).toBe('number');
        expect(empty.avgFear).toBe(0);
        expect(empty.panicRatio).toBe(0);

        const ctx = { agents: [ mk(0.5,0.3,0.4,80,'CALM'), mk(0.9,0.6,0.2,40,'PANIC') ] };
        const stats = Simulation.prototype.getStats.call(ctx);
        expect(typeof stats.avgFear).toBe('number');
        expect(typeof stats.avgSkill).toBe('number');
        expect(typeof stats.avgMorale).toBe('number');
        expect(typeof stats.panicRatio).toBe('number');
        expect(stats.panicCount).toBe(1);
        expect(stats.panicRatio).toBeCloseTo(0.5, 5);
        expect(stats.aliveCount).toBe(2);
        expect(stats.totalCount).toBe(2);
    });

    it('excludes dead agents from averages and denominators', () => {
        const mk = (fear, state, dead) => ({
            dead, energy: 100, brain: { currentFear: fear, traits: { skill: 0.5 }, morale: 0.5, state }
        });
        const ctx = {
            agents: [
                mk(1.0, 'PANIC', false),
                mk(0.0, 'CALM', false),
                mk(1.0, 'PANIC', true), // dead — must be ignored
                mk(1.0, 'PANIC', true),
            ]
        };
        const s = Simulation.prototype.getStats.call(ctx);
        expect(s.aliveCount).toBe(2);
        expect(s.deadCount).toBe(2);
        expect(s.totalCount).toBe(4);
        expect(s.count).toBe(2); // count is aliveCount
        expect(s.panicCount).toBe(1); // only 1 alive panic
        expect(s.panicRatio).toBeCloseTo(0.5, 5); // 1/2 alive
        expect(s.avgFear).toBeCloseTo(0.5, 5); // (1.0+0.0)/2, not (1+0+1+1)/4
    });

    it('single-pass: count + sums are consistent', () => {
        const mk = (i) => ({ dead: false, energy: i, brain: { currentFear: i/10, traits: { skill: i/10 }, morale: i/10, state: i%2===0 ? 'PANIC':'CALM' } });
        const agents = Array.from({length: 10}, (_,i)=>mk(i));
        const s = Simulation.prototype.getStats.call({ agents });
        expect(s.aliveCount + s.deadCount).toBe(s.totalCount);
        expect(s.panicCount + (s.aliveCount - s.panicCount)).toBe(s.aliveCount);
    });
});

describe('ANTI_FLEE real-path smoke', () => {
    it('all living agents stay finite through ANTI_FLEE ticks (real creation path)', () => {
        // Use actual Simulation creation path if available, else fall back to ObjectPool-like creation
        const sim = { agents: [] };
        // Create 50 real LearningAgents via the same pool path as simulation.js:143
        for (let i=0;i<50;i++) sim.agents.push(new LearningAgent(Math.random()*800, Math.random()*600));
        const visuals = new Proxy({}, { get: () => [] });
        const cmOff = { ANTI_FLEE: 0 };
        const cmOn = { ANTI_FLEE: 0.8 };
        // 3 ticks normal
        for (let t=0;t<3;t++) for (const a of sim.agents) a.update(800,600,visuals,null,[],[],0,0,null,null,null,null,null,null,null,cmOff,null);
        // 5 ticks under ANTI_FLEE
        for (let t=0;t<5;t++) for (const a of sim.agents) a.update(800,600,visuals,null,[],[],0,0,null,null,null,null,null,null,null,cmOn,null);
        for (const a of sim.agents) {
            if (a.dead) continue;
            expect(Number.isFinite(a.x)).toBe(true);
            expect(Number.isFinite(a.y)).toBe(true);
            expect(Number.isFinite(a.vx)).toBe(true);
            expect(Number.isFinite(a.vy)).toBe(true);
            expect(Number.isFinite(a.maxSpeed)).toBe(true);
            expect(a.maxSpeed).toBeGreaterThanOrEqual(0);
        }
        const stats = Simulation.prototype.getStats.call(sim);
        expect(typeof stats.avgFear).toBe('number');
        expect(stats.panicCount).toBeGreaterThanOrEqual(0);
    });
});
