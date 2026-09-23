import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-EVENT-CAUSALITY-001 — decisions happen INSIDE world history.
// Mutants pinned: decisions bypass the event graph; parents not linked to TURN;
// deterministic RNG not shared with the decision core.

describe('decision causality', () => {
    it('a DECISION action is committed as a canonical event child of the TURN', () => {
        const s = new SocietyCore();
        s.tick({ actions: [{ kind: 'DECISION', context: { actorId: 'merchant-1', curiosity: .8 }, actions: [{ id: 'observe', considerations: [{ name: 'curiosity', value: 'curiosity' }] }, { id: 'greet', considerations: [{ name: 'trust', value: .2 }] }] }] });
        const turn = s.events.find(e => e.type === 'TURN');
        const decision = s.events.find(e => e.type === 'DECISION');
        expect(decision).toBeDefined();
        expect(decision.parentId).toBe(turn.id);            // real parentage, not orphan
        expect(decision.tick).toBe(turn.tick);              // stamped from the world clock
        expect(decision.actorId).toBe('merchant-1');
        expect(decision.selected).toBe('observe');          // highest score wins
        expect(typeof decision.score).toBe('number');
    });

    it('records rejected alternatives for why-not explainability', () => {
        const s = new SocietyCore();
        s.tick({ actions: [{ kind: 'DECISION', context: { actorId: 'a', trust: 1 }, actions: [{ id: 'greet', considerations: [{ name: 'trust', value: 'trust' }] }, { id: 'observe', considerations: [{ name: 'trust', value: .3 }] }] }] });
        const decision = s.events.find(e => e.type === 'DECISION');
        expect(Array.isArray(decision.alternatives)).toBe(true);
        expect(decision.alternatives.some(a => a.action === 'observe')).toBe(true);
        expect(decision.alternatives[0].score).toBeLessThanOrEqual(decision.score);
    });

    it('blocked actions are recorded truthfully (selected null, blockers kept)', () => {
        const s = new SocietyCore();
        s.tick({ actions: [{ kind: 'DECISION', context: { actorId: 'a', hunger: 0 }, actions: [{ id: 'feed', prerequisites: ['targetAlive'] }] }] });
        const decision = s.events.find(e => e.type === 'DECISION');
        expect(decision.selected).toBeNull();
        expect(decision.valid).toBe(false);
        expect(decision.blockers.length).toBeGreaterThan(0);
    });

    it('multiple decisions in one turn keep ordered parentage under the same TURN', () => {
        const s = new SocietyCore();
        s.tick({ actions: [
            { kind: 'DECISION', context: { actorId: 'a' }, actions: [{ id: 'observe' }] },
            { kind: 'DECISION', context: { actorId: 'b' }, actions: [{ id: 'observe' }] },
        ] });
        const turn = s.events.find(e => e.type === 'TURN');
        const decisions = s.events.filter(e => e.type === 'DECISION');
        expect(decisions.length).toBe(2);
        expect(decisions.every(d => d.parentId === turn.id)).toBe(true);
        expect(decisions[0].seq < decisions[1].seq).toBe(true);
    });

    it('shares the world RNG so identical seeds produce identical decisions', () => {
        const run = () => {
            const s = new SocietyCore();
            const events = [];
            for (let i = 0; i < 5; i++) {
                s.tick({ actions: [{ kind: 'DECISION', context: { actorId: 'a', trust: .5, impulsiveness: .9 }, actions: [{ id: 'observe' }, { id: 'greet' }, { id: 'flee' }] }] });
                events.push(s.events.filter(e => e.type === 'DECISION').map(d => d.selected));
            }
            return events;
        };
        expect(run()).toEqual(run()); // determinism through the shared serializable RNG
    });

    it('decisions survive save/load and continue with unique ids', () => {
        const s = new SocietyCore();
        s.tick({ actions: [{ kind: 'DECISION', context: { actorId: 'a' }, actions: [{ id: 'observe' }] }] });
        const clone = SocietyCore.deserialize(JSON.parse(JSON.stringify(s.serialize())));
        clone.tick({ actions: [{ kind: 'DECISION', context: { actorId: 'b' }, actions: [{ id: 'greet', considerations: [{ name: 'trust', value: 1 }] }] }] });
        const ids = clone.events.map(e => e.id);
        expect(new Set(ids).size).toBe(ids.length);           // no duplicate ids after restore
        const decision = clone.events.filter(e => e.type === 'DECISION')[1];
        expect(decision.selected).toBe('greet');
    });
});
