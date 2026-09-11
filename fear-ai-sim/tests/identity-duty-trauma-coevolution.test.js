import { describe, it, expect } from '@jest/globals';
import { CharacterIdentityArchitecture } from '../packages/core/index.js';
import { GoalArbitrationEngine, GOAL_TYPES } from '../packages/core/index.js';

// NEXT-136: long-horizon duty-trauma co-evolution (CCI-28 frontier 20).
// After trauma load, long safety must recover the duty advantage
// monotonically toward the fresh value: no overshoot, no collapse, and
// identity itself untouched across ten thousand ticks.
describe('NEXT-136: duty-trauma co-evolution over 10k ticks', () => {
    function traumatizedGuard() {
        const cia = new CharacterIdentityArchitecture();
        cia.registerCharacter('g', { duty: 1.0 });
        for (let i = 0; i < 20; i++) cia.tick('g', { trauma: 0.2 }, {});
        return cia;
    }

    function crossover(cia) {
        const arb = new GoalArbitrationEngine();
        arb.registerGoal('g', { type: GOAL_TYPES.HOLD_POST, priority: 0.6 });
        arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
        for (let f = 0; f <= 1.0001; f += 0.05) {
            const t = cia.tick('g', {}, { fear: f, perceivedDanger: f }).tendencies;
            const r = arb.arbitrate('g', { fear: f }, { identityTendencies: t, identityWeight: 1.0 });
            if (r.winningGoal !== GOAL_TYPES.HOLD_POST) return Math.round(f * 100) / 100;
        }
        return Infinity;
    }

    function recover(cia, ticks) {
        for (let i = 0; i < ticks; i++) cia.tick('g', {}, {});
    }

    it('1. Trauma decays monotonically under staged safety', () => {
        const cia = traumatizedGuard();
        const levels = [cia.adaptiveFor('g').trauma];
        for (const leg of [100, 400, 1500, 8000]) {
            recover(cia, leg);
            levels.push(cia.adaptiveFor('g').trauma);
        }
        for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThan(levels[i - 1]);
        expect(levels[levels.length - 1]).toBeLessThan(0.01);
    });

    it('2. Crossover recovers monotonically to the fresh value', () => {
        const cia = traumatizedGuard();
        const crosses = [crossover(cia)];
        for (const leg of [100, 400, 1500, 8000]) {
            recover(cia, leg);
            crosses.push(crossover(cia));
        }
        expect(crosses[0]).toBe(0.55);
        for (let i = 1; i < crosses.length; i++) expect(crosses[i]).toBeGreaterThanOrEqual(crosses[i - 1]);
        expect(crosses[crosses.length - 1]).toBe(0.8);
    });

    it('3. Identity is untouched across the full 10k-tick history', () => {
        const cia = traumatizedGuard();
        const before = cia.identityFor('g');
        recover(cia, 10000);
        crossover(cia);
        expect(cia.identityFor('g')).toEqual(before);
        expect(cia.drift('g')).toBeLessThan(0.01);
    });

    it('4. The full life history is exactly reproducible', () => {
        const run = () => {
            const cia = traumatizedGuard();
            const out = [crossover(cia)];
            for (const leg of [100, 400, 1500, 8000]) {
                recover(cia, leg);
                out.push(crossover(cia));
            }
            return out;
        };
        expect(run()).toEqual(run());
    });
});
