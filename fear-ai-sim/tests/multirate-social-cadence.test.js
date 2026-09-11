import { describe, it, expect } from '@jest/globals';
import { RuntimeSimulation } from '../packages/runtime/src/RuntimeSimulation.js';

// NEXT-152: multi-rate social and trauma cadences (audit candidate 17).
// Opt-in socialCadence / traumaCadence step those subsystems through
// HostTimeDiscipline due ticks; 1 (default) is every-tick legacy.
// Cadenced dynamics run slower but deterministically and converge.
describe('NEXT-152: multi-rate social and trauma cadences', () => {
    const THREAT = [{ agent_id: 'a1', threats: [{ type: 'PREDATOR', distance: 2, intensity: 1.0 }] }, { agent_id: 'a2' }];
    function mk(opts = {}) {
        const sim = new RuntimeSimulation({ seed: 77, ...opts });
        sim.registerAgent('a1', { neuroticism: 0.9, resilience: 0.1 });
        sim.registerAgent('a2', {});
        return sim;
    }
    function run(sim, n) {
        let out;
        for (let t = 0; t < n; t++) out = sim.batchTick(THREAT, 0.0166);
        return out;
    }

    it('1. Default cadences preserve legacy trajectories exactly', () => {
        const a = mk(), b = mk();
        const oa = run(a, 150), ob = run(b, 150);
        expect(oa).toEqual(ob);
        expect(a.coreTrauma.agentRecords.get('a1').crystallizedTraumas.length).toBeGreaterThanOrEqual(1);
        // Explicit cadence 1 matches the default.
        const c = mk({ socialCadence: 1, traumaCadence: 1 });
        expect(run(c, 150)).toEqual(oa);
    });

    it('2. Cadenced trauma crystallizes later but converges', () => {
        const slow = mk({ socialCadence: 5, traumaCadence: 5 });
        run(slow, 250);
        expect(slow.coreTrauma.agentRecords.get('a1').crystallizedTraumas.length).toBe(0);
        run(slow, 950);
        expect(slow.coreTrauma.agentRecords.get('a1').crystallizedTraumas.length).toBeGreaterThanOrEqual(1);
    });

    it('3. Cadenced grievance forgives slower', () => {
        const fast = mk();
        const slow = mk({ socialCadence: 5 });
        for (const s of [fast, slow]) {
            s.reportSocialEvent({ event: 'BETRAYAL', actorId: 'a2', targetId: 'a1', weight: 1.0 });
        }
        for (let t = 0; t < 100; t++) {
            fast.batchTick([{ agent_id: 'a1' }, { agent_id: 'a2' }], 0.0166);
            slow.batchTick([{ agent_id: 'a1' }, { agent_id: 'a2' }], 0.0166);
        }
        const gf = fast.social.getRelationship('a1', 'a2').grievance;
        const gs = slow.social.getRelationship('a1', 'a2').grievance;
        expect(gs).toBeGreaterThan(gf);
    });

    it('4. Cadenced runs are exactly reproducible', () => {
        const runC = () => {
            const s = mk({ socialCadence: 5, traumaCadence: 5 });
            return run(s, 300);
        };
        expect(runC()).toEqual(runC());
    });

    it('5. Invalid cadences degrade to every-tick legacy', () => {
        const bad = mk({ socialCadence: 0, traumaCadence: -3 });
        const good = mk({});
        expect(run(bad, 150)).toEqual(run(good, 150));
    });
});
