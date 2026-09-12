import { describe, it, expect } from '@jest/globals';
import { RuntimeSimulation } from '../packages/runtime/src/RuntimeSimulation.js';

// NEXT-176 (post-25 candidate 16): contagion at its own cadence through
// HostTimeDiscipline. contagionCadence 1 (default) is legacy every-tick
// evaluation; higher values re-evaluate on due ticks and reuse each
// agent's last result between them. Dynamics run slower but stay
// deterministic.
const THREAT = [{ agent_id: 'panicker', threats: [{ type: 'PREDATOR', distance: 2, intensity: 1.0 }] }];
const BOTH = [{ agent_id: 'panicker' }, { agent_id: 'focal' }];

function world(opts = {}) {
    const sim = new RuntimeSimulation({ seed: 7, ...opts });
    sim.registerAgent('panicker', { neuroticism: 0.9, resilience: 0.1 });
    sim.registerAgent('focal', { neuroticism: 0.5, resilience: 0.5 });
    return sim;
}

function focalSeries(sim, ticks = 12, threatTicks = 3) {
    const out = [];
    for (let t = 0; t < ticks; t++) {
        sim.batchTick(t < threatTicks ? THREAT : BOTH, 0.0166);
        out.push(sim.agents.get('focal').currentFear);
    }
    return out;
}

describe('NEXT-176: contagion at its own cadence', () => {
    it('1. Default and cadence 1 are exactly legacy', () => {
        expect(focalSeries(world({ contagionCadence: 1 }))).toEqual(focalSeries(world({})));
    });

    it('2. Evaluations land only on due ticks', () => {
        const sim = world({ contagionCadence: 5 });
        const edges = [];
        for (let t = 0; t < 12; t++) {
            sim.batchTick(t < 3 ? THREAT : BOTH, 0.0166);
            edges.push(sim.contagion.activeEdges.length > 0 ? 1 : 0);
        }
        expect(edges).toEqual([0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0]);
    });

    it('3. Slower cadence stays close and replays exactly', () => {
        const fast = focalSeries(world({}));
        const slow = focalSeries(world({ contagionCadence: 5 }));
        expect(Math.abs(slow[11] - fast[11])).toBeLessThan(0.1);
        expect(focalSeries(world({ contagionCadence: 5 }))).toEqual(slow);
    });

    it('4. Malformed cadences degrade to every-tick legacy', () => {
        const legacy = focalSeries(world({}));
        for (const bad of [0, -3, NaN, 'fast']) {
            expect(focalSeries(world({ contagionCadence: bad }))).toEqual(legacy);
        }
    });

    it('5. Fresh agents evaluate immediately on cache miss', () => {
        const sim = world({ contagionCadence: 5 });
        for (let t = 0; t < 7; t++) sim.batchTick(t < 3 ? THREAT : BOTH, 0.0166);
        sim.registerAgent('latecomer', { neuroticism: 0.5, resilience: 0.5 });
        sim.batchTick(BOTH, 0.0166);
        expect(sim.lastContagion.has('latecomer')).toBe(true);
    });

    it('6. Disabled contagion stays silent at any cadence', () => {
        const sim = world({ contagionCadence: 5, enableContagion: false });
        for (let t = 0; t < 6; t++) sim.batchTick(t < 3 ? THREAT : BOTH, 0.0166);
        expect(sim.contagion.activeEdges.length).toBe(0);
    });
});
