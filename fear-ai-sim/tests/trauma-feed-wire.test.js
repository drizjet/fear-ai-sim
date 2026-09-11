import { describe, it, expect } from '@jest/globals';
import { AffectiveAgent } from '../packages/core/index.js';
import { TraumaCrystallizationEngine } from '../packages/core/index.js';

// NEXT-115: trauma-engine feed (wire-or-retire triage execution).
// Extreme-fear episodes incur exactly one trauma per episode; crystallized
// state (phobic dread, resting floor, panic offset) feeds back through the
// pre-existing traumaDread / panicFearBias inputs via max().
describe('NEXT-115: opt-in trauma feed', () => {
    const T = { neuroticism: 0.8, fear: 0.9, resilience: 0.3 };
    const TERROR = { threats: [{ id: 't', type: 'WOLF', intensity: 1.0, distance: 2 }] };
    const MILD = { threats: [{ id: 't', type: 'WOLF', intensity: 0.3, distance: 20 }] };
    const mk = (id, opts = {}) => new AffectiveAgent(id, T, { seed: `${id}-seed`, ...opts });

    it('1. Detached agents carry no trauma frame', () => {
        const r = mk('n115_plain').tick(0.016, TERROR);
        expect('trauma_frame' in r).toBe(false);
    });

    it('2. Attached pre-episode output matches detached output', () => {
        const plain = new AffectiveAgent('n115_pre', T, { seed: 'n115-pre' });
        const on = new AffectiveAgent('n115_pre', T, {
            seed: 'n115-pre',
            traumaEngine: new TraumaCrystallizationEngine(),
            traumaAdvanceClock: false
        });
        let rp;
        let ro;
        for (let i = 0; i < 6; i++) {
            rp = plain.tick(0.016, MILD);
            ro = on.tick(0.016, MILD);
        }
        const { trauma_frame, ...rest } = ro;
        expect(rest).toEqual(rp);
        expect(trauma_frame.isTraumatized).toBe(false);
    });

    it('3. One terror episode incurs exactly one trauma (no farming)', () => {
        const eng = new TraumaCrystallizationEngine();
        const a = mk('n115_farm', { traumaEngine: eng });
        let sawEpisode = false;
        for (let i = 0; i < 60; i++) {
            const r = a.tick(0.016, TERROR);
            if (r.trauma_frame.episode) sawEpisode = true;
        }
        const rec = eng.agentRecords.get('n115_farm');
        expect(sawEpisode).toBe(true);
        expect(rec.activeTraumas.length + rec.crystallizedTraumas.length).toBe(1);
    });

    it('4. Crystallized trauma feeds dread and panic offset back live', () => {
        const eng = new TraumaCrystallizationEngine();
        const a = mk('n115_crys', { traumaEngine: eng });
        for (let i = 0; i < 200; i++) a.tick(0.016, TERROR);
        const rec = eng.agentRecords.get('n115_crys');
        expect(rec.crystallizedTraumas.length).toBe(1);
        expect(rec.quiescentFearFloor).toBeGreaterThan(0);
        expect(rec.panicOnsetOffset).toBeGreaterThan(0);
        const r = a.tick(0.016, MILD);
        expect(r.trauma_frame.isTraumatized).toBe(true);
        expect(r.trauma_frame.phobicDread).toBeGreaterThan(0);
        expect(r.trauma_frame.panicOffset).toBeGreaterThan(0);
    });

    it('5. Traumatized agent panics earlier than a fresh twin', () => {
        const eng = new TraumaCrystallizationEngine();
        const vet = mk('n115_vet', { traumaEngine: eng });
        for (let i = 0; i < 200; i++) vet.tick(0.016, TERROR);
        const fresh = mk('n115_vet');
        const probe = { threats: [{ id: 't', type: 'WOLF', intensity: 0.6, distance: 8 }] };
        const onset = (agent) => {
            for (let t = 1; t <= 120; t++) {
                const r = agent.tick(0.016, probe);
                if (r.fear_band === 'PANIC') return t;
            }
            return -1;
        };
        const vetOnset = onset(vet);
        const freshOnset = onset(fresh);
        expect(vetOnset).toBeGreaterThan(0);
        expect(freshOnset).toBeGreaterThan(0);
        expect(vetOnset).toBeLessThan(freshOnset);
    });

    it('6. Attached runs are deterministic at fixed seed', () => {
        const run = () => {
            const a = mk('n115_det', { traumaEngine: new TraumaCrystallizationEngine() });
            let r;
            for (let i = 0; i < 30; i++) r = a.tick(0.016, TERROR);
            return r;
        };
        expect(run()).toEqual(run());
    });
});
