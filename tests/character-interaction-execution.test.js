import { describe, expect, it } from '@jest/globals';
import { Market, RouteNetwork, SocietyCore } from '../societycore.js';

// RESP-CHARACTER-INTERACTION-AFFORDANCES-001 — registered affordances execute end-to-end
// through the advisory gate as canonical events; only declared effects mutate world state.
// Mutants pinned: advisory approval gate bypassed.

const world = () => {
    const society = new SocietyCore({ seed: 33 });
    society.routes = new RouteNetwork([{ id: 'road', travelTime: 1 }]);
    society.addMarket('south', new Market({ prices: { grain: 1 }, stock: { grain: 10 } }));
    society.actors.set('v', { id: 'v', type: 'VAMPIRE' });
    society.actors.set('h', { id: 'h', type: 'HUMAN' });
    return society;
};

const EXECUTIONS = [
    { action: 'observe', context: { curiosity: .4 } },
    { action: 'greet', context: { trust: .6 } },
    { action: 'feed', context: { targetAlive: true, hunger: 1 } },
    { action: 'protect', context: { canProtect: true, loyalty: .8, threat: .5 } },
    { action: 'flee', context: { actorFear: .7 } },
    { action: 'transform', context: { targetAlive: true, convertible: true, knowsTransformation: true, hasResource: true, offCooldown: true, recruitmentNeed: 1, targetValue: 1, witnessRisk: 0, retaliationRisk: 0 } },
];
const script = list => list.map(({ action, context }) => ({ kind: 'INTERACTION_EXECUTION', actorId: 'v', targetId: 'h', action, context }));

describe('RESP-CHARACTER-INTERACTION-AFFORDANCES-001: interaction execution loop', () => {
    it('executes every catalog affordance end-to-end as TURN children', () => {
        const society = world();
        society.tick({ actions: script(EXECUTIONS) });
        const turn = society.events.find(event => event.type === 'TURN');
        const events = society.events.filter(event => event.type === 'INTERACTION_EXECUTION');
        expect(events).toHaveLength(6);
        expect(events.every(event => event.approved && event.parentId === turn.id)).toBe(true);
        expect(events.every(event => event.source === 'ADVISORY_VALIDATOR')).toBe(true);
        expect(events.map(event => event.action)).toEqual(['observe', 'greet', 'feed', 'protect', 'flee', 'transform']);
        // only transform is material in this model — it ran LAST, so the others saw a HUMAN target
        const transform = events.at(-1);
        expect(transform.effects).toEqual([{ subject: 'target', field: 'type', from: 'HUMAN', to: 'VAMPIRE' }]);
        expect(events.slice(0, 5).every(event => event.effects.length === 0)).toBe(true);
        expect(society.actors.get('h').type).toBe('VAMPIRE');
    });

    it('rejects at the gate without mutating world state', () => {
        const society = world();
        society.tick({ actions: [{ kind: 'INTERACTION_EXECUTION', actorId: 'v', targetId: 'h', action: 'transform', context: { targetAlive: true } }] });
        const rejected = society.events.find(event => event.type === 'INTERACTION_EXECUTION');
        expect(rejected).toMatchObject({ approved: false, action: 'transform', effects: [] });
        expect(rejected.blockers).toContain('convertible');
        expect(society.actors.get('h').type).toBe('HUMAN'); // untouched

        society.tick({ actions: [{ kind: 'INTERACTION_EXECUTION', actorId: 'h', targetId: 'v', action: 'feed', context: { targetAlive: true, hunger: 1 } }] });
        const wrongType = society.events.filter(event => event.type === 'INTERACTION_EXECUTION').at(-1);
        expect(wrongType).toMatchObject({ approved: false, effects: [] });
        expect(wrongType.blockers).toContain('action_unavailable');
    });

    it('closes the loop: a converted target rejects further transforms, world state stable', () => {
        const society = world();
        society.tick({ actions: script([EXECUTIONS.at(-1)]) });
        expect(society.actors.get('h').type).toBe('VAMPIRE');

        const stateBefore = JSON.stringify([...society.actors.entries()]);
        society.tick({ actions: script([EXECUTIONS.at(-1)]) });
        const repeat = society.events.filter(event => event.type === 'INTERACTION_EXECUTION').at(-1);
        expect(repeat).toMatchObject({ approved: false, effects: [] });
        expect(repeat.blockers).toContain('action_unavailable');
        expect(JSON.stringify([...society.actors.entries()])).toBe(stateBefore);
    });

    it('survives save/load: events, transformed type, and the loop continue after restore', () => {
        const society = world();
        society.tick({ actions: script(EXECUTIONS) });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));

        expect(restored.actors.get('h').type).toBe('VAMPIRE'); // actor types now persist
        expect(restored.events.map(event => event.type)).toEqual(society.events.map(event => event.type));
        expect(restored.auditEventGraph().ok).toBe(true);

        restored.tick({ actions: script([EXECUTIONS.at(-1)]) });
        const repeat = restored.events.filter(event => event.type === 'INTERACTION_EXECUTION').at(-1);
        expect(repeat.approved).toBe(false); // conversion survived the round-trip
        const ids = restored.events.map(event => event.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('executes a runtime-registered recruit affordance through the declared effect table', () => {
        const society = world();
        society.interactions.register({ id: 'recruit', actorTypes: ['VAMPIRE'], targetTypes: ['HUMAN'], considerations: [{ name: 'recruitmentNeed', value: 'recruitmentNeed' }] });
        society.tick({ actions: [{ kind: 'INTERACTION_EXECUTION', actorId: 'v', targetId: 'h', action: 'recruit', context: { recruitmentNeed: 1 } }] });
        const event = society.events.find(candidate => candidate.type === 'INTERACTION_EXECUTION');
        expect(event).toMatchObject({ approved: true, action: 'recruit', source: 'ADVISORY_VALIDATOR' });
        expect(event.effects).toEqual([{ subject: 'target', field: 'type', from: 'HUMAN', to: 'VAMPIRE' }]);
        expect(society.actors.get('h').type).toBe('VAMPIRE');
    });

    it('is deterministic across identical seeded worlds', () => {
        const run = () => JSON.stringify((() => {
            const society = world();
            society.tick({ actions: script(EXECUTIONS) });
            return society.serialize();
        })());
        expect(run()).toBe(run());
    });
});
