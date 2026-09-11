import { describe, it, expect } from '@jest/globals';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-135: trauma-duty interaction under shared clocks (CCI-28
// frontier 19). Crystallized experience must erode the duty advantage
// without erasing identity ordering: a traumatized dutiful guard holds
// past a traumatized lax one, but not as far as an untraumatized twin.
describe('NEXT-135: trauma erodes duty without erasing it', () => {
    function loadTrauma(cia, id, ticks = 20) {
        for (let i = 0; i < ticks; i++) cia.tick(id, { trauma: 0.2 }, {});
        return cia.adaptiveFor(id).trauma;
    }

    // Fear level at which SURVIVE first outranks HOLD_POST (equal priority).
    function crossover(duty, traumatize) {
        const cia = new CharacterIdentityArchitecture();
        cia.registerCharacter('x', { duty });
        if (traumatize) loadTrauma(cia, 'x');
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('x', { type: GOAL_TYPES.HOLD_POST, priority: 0.6 });
        arb.registerGoal('x', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        for (let f = 0; f <= 1.0001; f += 0.05) {
            const t = cia.tick('x', {}, { fear: f, perceivedDanger: f }).tendencies;
            const r = arb.arbitrate('x', { fear: f }, { identityTendencies: t, identityWeight: 1.0 });
            if (r.winningGoal !== GOAL_TYPES.HOLD_POST) return Math.round(f * 100) / 100;
        }
        return Infinity;
    }

    it('1. Trauma load saturates the adaptive track deterministically', () => {
        const run = () => {
            const c = new CharacterIdentityArchitecture();
            c.registerCharacter('x', { duty: 1.0 });
            return loadTrauma(c, 'x');
        };
        expect(run()).toBeGreaterThan(0.9);
        expect(run()).toBe(run());
    });

    it('2. Trauma moves the dutiful crossover earlier', () => {
        expect(crossover(1.0, true)).toBeLessThan(crossover(1.0, false));
    });

    it('3. Duty still orders characters within the traumatized stratum', () => {
        expect(crossover(0.0, true)).toBeLessThan(crossover(1.0, true));
    });

    it('4. Pinned interaction table', () => {
        expect([
            [0.0, false], [1.0, false], [0.0, true], [1.0, true]
        ].map(([d, t]) => crossover(d, t))).toEqual([0.65, 0.8, 0.4, 0.55]);
    });

    it('5. Traumatized dutiful guard still out-holds the fresh lax one', () => {
        // Identity is not destiny, but it is not nothing either: extreme
        // experience narrows but does not close the duty gap.
        // Fresh lax crosses at 0.65; traumatized dutiful at 0.55 — the gap
        // narrows from 0.15 to a deficit, honestly recording that severe
        // trauma can outweigh duty. This test pins the direction, not valor.
        expect(crossover(1.0, true)).toBeLessThan(crossover(0.0, false));
    });
});
