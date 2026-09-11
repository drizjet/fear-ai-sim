import { describe, it, expect } from '@jest/globals';
import { ContagionGraph } from '../packages/core/index.js';
import { RuntimeSimulation } from '../packages/runtime/src/RuntimeSimulation.js';

// NEXT-139: traumatized agents as panic amplifiers (audit candidate 15).
// Peers carrying crystallized trauma transmit harder through an opt-in
// amplifier; default config is legacy transmission exactly.
describe('NEXT-139: trauma-amplified contagion', () => {
    const focal = { id: 'f', x: 0, y: 0, z: 0, traits: {} };
    const peer = (load) => [{
        id: 'p', x: 10, y: 0, z: 0,
        fearBand: 'PANIC', isPanicking: true, rawFear: 0.95, traumaLoad: load
    }];

    it('1. Default config ignores trauma load (legacy)', () => {
        const g = new ContagionGraph({});
        expect(g.evaluateContagion(focal, peer(1)).contagionFear)
            .toBe(g.evaluateContagion(focal, peer(0)).contagionFear);
    });

    it('2. Amplifier doubles transmission at full load', () => {
        const g = new ContagionGraph({ traumaAmplifier: 1.0 });
        const fresh = g.evaluateContagion(focal, peer(0)).contagionFear;
        const loaded = g.evaluateContagion(focal, peer(1)).contagionFear;
        expect(loaded).toBeCloseTo(fresh * 2, 4);
    });

    it('3. Amplification scales monotonically with load', () => {
        const g = new ContagionGraph({ traumaAmplifier: 1.0 });
        const c = (l) => g.evaluateContagion(focal, peer(l)).contagionFear;
        expect(c(0)).toBeLessThan(c(0.5));
        expect(c(0.5)).toBeLessThan(c(1));
    });

    it('4. Invalid loads clamp safely', () => {
        const g = new ContagionGraph({ traumaAmplifier: 1.0 });
        const base = g.evaluateContagion(focal, peer(0)).contagionFear;
        for (const bad of [undefined, NaN, -2, 99]) {
            const v = g.evaluateContagion(focal, [{ ...peer(0)[0], traumaLoad: bad }]).contagionFear;
            expect(v).toBeGreaterThanOrEqual(base);
            expect(v).toBeLessThanOrEqual(base * 2 + 1e-9);
        }
    });

    it('5. Runtime: crystallized peer amplifies a calm focal agent', () => {
        const mk = () => {
            const sim = new RuntimeSimulation({ seed: 11, contagionConfig: { traumaAmplifier: 1.0 } });
            sim.registerAgent('focal', {});
            sim.registerAgent('source', {});
            return sim;
        };
        const run = (traumatize) => {
            const sim = mk();
            if (traumatize) {
                sim.reportSocialEvent({ event: 'BETRAYAL', actorId: 'focal', targetId: 'source', weight: 2.0, severity: 1.0 });
                // Crystallize the betrayal wound under calm.
                for (let t = 0; t < 250; t++) {
                    sim.batchTick([{ agent_id: 'focal' }, { agent_id: 'source' }], 0.0166);
                }
            }
            // Panicking source beside a calm focal agent; several threat
            // ticks let the source reach panic and contagion land.
            let out;
            for (let k = 0; k < 4; k++) {
                out = sim.batchTick([
                    { agent_id: 'focal' },
                    { agent_id: 'source', threats: [{ id: 'w', type: 'WOLF', intensity: 1.0, distance: 2 }] }
                ], 0.0166);
            }
            return out.find((o) => o.agent_id === 'focal' || o.agentId === 'focal');
        };
        const fresh = run(false);
        const loaded = run(true);
        const fearOf = (o) => o?.affective_state?.raw_fear ?? o?.fear ?? o?.currentFear;
        expect(fearOf(loaded)).toBeGreaterThan(fearOf(fresh));
    });

    it('6. Evaluations are exactly reproducible', () => {
        const g = new ContagionGraph({ traumaAmplifier: 1.0 });
        expect(g.evaluateContagion(focal, peer(0.7))).toEqual(g.evaluateContagion(focal, peer(0.7)));
    });
});
