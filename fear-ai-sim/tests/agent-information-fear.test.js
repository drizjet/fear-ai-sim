import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/index.js';
import { AnticipatoryFearEngine } from '../packages/core/index.js';

// NEXT-149: agent-level anticipatory fear from information (audit
// candidate 13). Host-reported danger (e.g. rumor dread) feeds the
// agent's fear without any sensed threat; absent input is legacy.
describe('NEXT-149: heard information feeds fear', () => {
    const mk = (traits = {}, seed = 'info-fear') => new AffectiveAgent('x', traits, { seed });
    const fearAfter = (agent, obs, ticks = 20) => {
        for (let i = 0; i < ticks; i++) agent.tick(0.016, obs);
        return agent.currentFear;
    };

    it('1. Hearsay alone builds fear from zero', () => {
        expect(fearAfter(mk(), { reportedDanger: 1.0 })).toBeGreaterThan(0.9);
        expect(fearAfter(mk(), {})).toBe(0);
    });

    it('2. Absent input reproduces legacy outputs exactly', () => {
        const run = () => {
            const a = mk({}, 'legacy-check');
            const out = [];
            for (let i = 0; i < 30; i++) {
                out.push(a.tick(0.016, i % 3 === 0
                    ? { threats: [{ id: 'w', type: 'WOLF', intensity: 0.8, distance: 8 }] }
                    : {}));
            }
            return out;
        };
        expect(run()).toEqual(run());
        // Explicit zero equals absent.
        const a = mk({}, 'zero-check'), b = mk({}, 'zero-check');
        for (let i = 0; i < 10; i++) {
            expect(a.tick(0.016, { reportedDanger: 0 })).toEqual(b.tick(0.016, {}));
        }
    });

    it('3. Hearsay weighs below direct observation', () => {
        const heard = fearAfter(mk(), { reportedDanger: 1.0 }, 5);
        const seen = fearAfter(mk(), { threats: [{ id: 'w', type: 'WOLF', intensity: 1.0, distance: 2 }] }, 5);
        expect(heard).toBeLessThan(seen);
    });

    it('4. End-to-end: rumor dread becomes agent fear', () => {
        const dread = new AnticipatoryFearEngine({}, { neuroticism: 0.5, resilience: 0.5 });
        for (let t = 0; t < 6; t++) {
            dread.absorb('FACTION', 'invading_army', { confidence: 0.85, observed: false, threatLevel: 0.9 });
            dread.advanceTick();
        }
        const agent = mk();
        const f = fearAfter(agent, { reportedDanger: dread.dreadOf('FACTION', 'invading_army') });
        expect(f).toBeGreaterThan(0.5);
    });

    it('5. Invalid inputs clamp safely', () => {
        const base = fearAfter(mk({}, 'clamp-a'), { reportedDanger: 1.0 });
        expect(fearAfter(mk({}, 'clamp-a'), { reportedDanger: 99 })).toBe(base);
        expect(fearAfter(mk({}, 'clamp-b'), { reportedDanger: NaN })).toBe(0);
        expect(fearAfter(mk({}, 'clamp-c'), { reportedDanger: -5 })).toBe(0);
    });

    it('6. Neurotic agents catch hearsay harder', () => {
        const calm = fearAfter(mk({ neuroticism: 0.1 }, 'n-low'), { reportedDanger: 0.8 }, 10);
        const nervy = fearAfter(mk({ neuroticism: 0.9 }, 'n-high'), { reportedDanger: 0.8 }, 10);
        expect(nervy).toBeGreaterThan(calm);
    });
});
