import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/index.js';
import { GroupContagionSystem } from '../packages/core/index.js';
import { WorldSimulationSystem } from '../packages/core/index.js';
import { ROAMING_PARTY_TYPES } from '../packages/core/index.js';

// NEXT-121: leader-death x crowd-panic x rumor triple pin (CCI-28 frontier 5).
// Three real systems composed: GroupContagionSystem (squad + leader),
// AffectiveAgent members (contagion + leader-calm + rumor dread), and
// WorldSimulationSystem (threat rumor via live encounter into drivers).
// Timeline: rumor heard tick 8, leader casualty tick 10 (no successor),
// physical threat ticks 12+.
describe('NEXT-121: leader-death x panic x rumor triple collision', () => {
    const IDS = ['lead', 'm1', 'm2', 'm3', 'm4', 'm5'];
    const THREAT = { threats: [{ id: 't', type: 'WOLF', intensity: 0.85, distance: 10 }] };

    function run(arm) {
        const gs = new GroupContagionSystem();
        gs.createGroup('sq', 'SQUAD', 'DISCIPLINED_STAND', 'lead', IDS);
        const agents = {};
        for (const id of IDS) {
            agents[id] = new AffectiveAgent(id + arm, {
                neuroticism: id === 'lead' ? 0.2 : 0.55,
                resilience: 0.5,
                leadership: id === 'lead' ? 0.85 : 0.3
            }, { seed: id + arm });
        }
        const world = new WorldSimulationSystem({ seed: 7 });
        const msg = world.registerGroup('msg', {
            type: ROAMING_PARTY_TYPES.CARAVAN, position: { x: 0, y: 0, z: 0 }
        });
        const recv = world.registerGroup('recv', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 5, y: 0, z: 0 },
            traits: { neuroticism: 0.6 }
        });
        let dread = 0;
        let leaderAlive = true;
        let contag = 0;
        const out = { dread: 0, frac18: 0, frac24: 0, state18: '', cohesion18: 0, finite: true };
        for (let tick = 1; tick <= 24; tick++) {
            if (arm.includes('rumor') && tick === 8) {
                world.createRumor('WAR_DECLARED', {
                    sourceEntityId: 'msg', severity: 0.9, description: 'army marches'
                });
                world._generateSystemicEncounter(msg, recv, {
                    distance: 5, factionSystem: null, relationshipTensorSystem: null
                });
                dread = recv.drivers.threatPressure;
            }
            if (arm.includes('death') && tick === 10) {
                gs.removeMember('sq', 'lead');
                gs.setLeader('sq', null);
                leaderAlive = false;
            }
            const obs = tick >= 12 ? THREAT : {};
            const states = new Map();
            let panic = 0;
            let n = 0;
            for (const id of IDS) {
                if (!leaderAlive && id === 'lead') continue;
                const r = agents[id].tick(0.016, obs, {
                    contagionFear: contag,
                    leaderCalm: leaderAlive ? 0.6 : 0,
                    traumaDread: dread
                });
                const fear = r.affective_state.raw_fear;
                if (!Number.isFinite(fear) || fear < 0 || fear > 1) out.finite = false;
                states.set(id, {
                    id,
                    fear,
                    isPanicking: r.fear_band === 'PANIC',
                    traits: { leadership: id === 'lead' ? 0.85 : 0.3, resilience: 0.5 }
                });
                n += 1;
                if (r.fear_band === 'PANIC') panic += 1;
            }
            const rep = gs.evaluateGroup('sq', states);
            contag = rep.panickingRatio;
            if (tick === 18) {
                out.frac18 = panic / n;
                out.state18 = rep.state;
                out.cohesion18 = rep.cohesion;
            }
            if (tick === 24) out.frac24 = panic / n;
        }
        out.dread = dread;
        return out;
    }

    it('1. Control squad holds: no panic, cohesion intact', () => {
        const r = run('control');
        expect(r.frac18).toBe(0);
        expect(r.frac24).toBe(0);
        expect(r.cohesion18).toBe(1);
        expect(r.finite).toBe(true);
    });

    it('2. Leader death collapses the group under threat', () => {
        const r = run('death');
        expect(r.state18).toBe('SCATTERED_STAMPEDE');
        expect(r.cohesion18).toBeLessThan(1);
        expect(r.frac24).toBe(1);
        expect(r.finite).toBe(true);
    });

    it('3. Rumor alone informs without collapsing (sub-threshold honesty)', () => {
        const r = run('rumor');
        expect(r.dread).toBeGreaterThan(0);
        expect(r.frac24).toBe(0);
        expect(r.cohesion18).toBe(1);
        expect(r.finite).toBe(true);
    });

    it('4. Rumor accelerates leaderless collapse (interaction effect)', () => {
        const death = run('death');
        const both = run('death_rumor');
        // Death alone: nothing panicking at 18. With rumor dread added:
        // full panic at 18. Information pressure compounds command loss.
        expect(death.frac18).toBe(0);
        expect(both.frac18).toBe(1);
        expect(both.dread).toBeGreaterThan(0);
        expect(both.finite).toBe(true);
    });

    it('5. Triple run is deterministic on identical inputs', () => {
        expect(run('death_rumor')).toEqual(run('death_rumor'));
    });
});
