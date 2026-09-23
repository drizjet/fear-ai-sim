import { describe, expect, it } from '@jest/globals';
import { AffordanceRegistry, UtilityRuntime } from '../utilitycore.js';
import { DecisionCore } from '../decisioncore.js';
import { INTERACTION_ACTIONS, InteractionCore } from '../interactioncore.js';
import { AdvisoryGate } from '../advisorygate.js';
import { SocietyCore } from '../societycore.js';

// RESP-UTILITY-AFFORDANCE-RUNTIME-001 — one shared module owns affordance registration and
// utility scoring; DecisionCore/InteractionCore/AdvisoryGate are facades over it.
// Mutants pinned: registry type gate removed; response-curve math altered; advisory source tampered.

const sampleActions = [
    { id: 'attack', prerequisites: ['alive'], considerations: [{ name: 'fear', value: 'fear', weight: 2 }] },
    { id: 'observe', considerations: [{ name: 'calm', value: 1 }] },
    { id: 'flee', considerations: [{ name: 'threat', value: 'threat', curve: 'inverse' }] },
];

describe('RESP-UTILITY-AFFORDANCE-RUNTIME-001: shared utility/affordance runtime', () => {
    it('AffordanceRegistry registers, gates by actor/target type, and rejects duplicates', () => {
        const registry = new AffordanceRegistry(INTERACTION_ACTIONS);
        expect(registry.list().map(item => item.id)).toEqual(['observe', 'greet', 'feed', 'transform', 'protect', 'flee']);
        expect(registry.get('feed')).toMatchObject({ id: 'feed', actorTypes: ['VAMPIRE'] });
        expect(() => registry.register({ id: 'feed' })).toThrow(/Duplicate affordance/);
        expect(() => registry.register({ considerations: [] })).toThrow(/id is required/);

        const vampire = { id: 'v', type: 'VAMPIRE' };
        const human = { id: 'h', type: 'HUMAN' };
        expect(registry.applicableFor(vampire, human).map(item => item.id)).toEqual(['observe', 'greet', 'feed', 'transform', 'protect', 'flee']);
        expect(registry.applicableFor(human, human).map(item => item.id)).not.toContain('feed'); // actorTypes gate
        expect(registry.applicableFor(human, vampire).map(item => item.id)).not.toContain('feed'); // targetTypes gate
        expect(registry.applicableFor(vampire, human).find(item => item.id === 'observe').target).toBe('h'); // target attached
        expect(registry.unregister('feed')).toBe(true);
        expect(registry.get('feed')).toBeNull();
    });

    it('scoring through UtilityRuntime is identical to DecisionCore (delegation parity)', () => {
        const context = { alive: false, fear: .8, threat: .4, personality: { impulsiveness: .5 } };
        const utility = new UtilityRuntime({ random: () => 0 });
        const decision = new DecisionCore({ random: () => 0 });
        for (const action of sampleActions) expect(utility.evaluateAction(context, action)).toEqual(decision.evaluateAction(context, action));
        expect(utility.evaluate(context, sampleActions)).toEqual(decision.evaluate(context, sampleActions));

        // the shared math itself is asserted, not just parity
        const blocked = decision.evaluateAction({ alive: false, fear: 1 }, sampleActions[0]);
        expect(blocked.valid).toBe(false);
        expect(blocked.blockers).toContain('alive');
        expect(blocked.explanation).toContain('blocked: alive');
        const observed = decision.evaluate({ alive: true, fear: 1 }, sampleActions).candidates.find(item => item.action === 'observe');
        expect(observed.finalScore).toBeGreaterThan(0);
        expect(observed.considerations[0].responseCurve).toBe('linear');
        const curved = utility.evaluateAction({ threat: .5 }, sampleActions[2]);
        expect(curved.considerations[0].contribution).toBeCloseTo(1 - .5); // inverse curve through shared math
    });

    it('band selection draws from the shared serializable RNG deterministically', () => {
        const actions = [
            { id: 'a', considerations: [{ name: 'x', value: .9 }] },
            { id: 'b', considerations: [{ name: 'y', value: .8 }] },
        ];
        const run = runtime => Array.from({ length: 10 }, () => runtime.evaluate({ personality: { impulsiveness: 1 } }, actions).selected);
        expect(run(new UtilityRuntime({ seed: 42, bandWidth: 1 }))).toEqual(run(new UtilityRuntime({ seed: 42, bandWidth: 1 })));
        const oneDraw = new UtilityRuntime({ random: () => 0 }).evaluate({ personality: { impulsiveness: 1 } }, actions);
        expect(oneDraw.selected).toBe('a'); // cursor 0 lands on the first candidate — RNG consumption order preserved
    });

    it('production wiring: InteractionCore registers affordances through the shared runtime', () => {
        const core = new InteractionCore({ random: () => 0 });
        expect(core.registry).toBeInstanceOf(AffordanceRegistry);
        expect(core.decisionCore.runtime).toBeInstanceOf(UtilityRuntime);
        const vampire = { id: 'v', type: 'VAMPIRE' };
        const human = { id: 'h', type: 'HUMAN' };

        // registered at runtime → immediately applicable to decide/validate
        core.register({ id: 'recruit', actorTypes: ['VAMPIRE'], targetTypes: ['HUMAN'], considerations: [{ name: 'effort', value: 1 }] });
        expect(core.getActions(vampire, human).map(item => item.id)).toContain('recruit');
        expect(core.decide(vampire, human, { targetAlive: false }).selected).toBe('recruit');
        expect(core.validate('recruit', vampire, human, {})).toMatchObject({ valid: true, blockers: [], action: 'recruit' });
        core.unregister('recruit');
        expect(core.validate('recruit', vampire, human, {})).toEqual({ valid: false, blockers: ['action_unavailable'] });

        // advisory gate flows through the same runtime and never mutates state
        const gate = new AdvisoryGate({ interactionCore: core });
        core.register({ id: 'pledge', actorTypes: ['*'], targetTypes: ['*'], considerations: [{ name: 'trust', value: 1 }] });
        const approved = gate.validate({ action: 'pledge' }, vampire, human, {});
        expect(approved).toMatchObject({ approved: true, action: 'pledge', actorId: 'v', targetId: 'h', source: 'ADVISORY_VALIDATOR' });
        expect(approved.blockers).toEqual([]);
        const rejected = gate.validate({ action: 'feed' }, { id: 'x', type: 'HUMAN' }, human, {});
        expect(rejected).toMatchObject({ approved: false, action: null });
        expect(rejected.blockers).toContain('action_unavailable');
    });

    it('SocietyCore production paths run through the shared runtime', () => {
        const society = new SocietyCore({ seed: 5 });
        expect(society.decisions.runtime).toBeInstanceOf(UtilityRuntime);
        expect(society.interactions.registry).toBeInstanceOf(AffordanceRegistry);

        // world INTERACTION_EVALUATION: society → interactions → DecisionCore → UtilityRuntime
        society.tick({ actions: [{ kind: 'INTERACTION_EVALUATION', actor: { id: 'v', type: 'VAMPIRE' }, target: { id: 'h', type: 'HUMAN' }, context: { targetAlive: true, hunger: 1 } }] });
        const interaction = society.events.find(event => event.type === 'INTERACTION_EVALUATION');
        expect(interaction).toMatchObject({ selected: 'feed', valid: true });

        // faction decisions share the same scoring implementation
        const faction = society.addFaction('clan', {});
        const evaluated = faction.evaluateAction({ id: 'rival' }, { legitimacy: .4 });
        expect(evaluated).toMatchObject({ target: 'rival', actorId: 'clan', selected: 'PATROL' });
        expect(evaluated.candidates).toHaveLength(3);
        expect(Array.isArray(evaluated.explanation)).toBe(true);
    });
});
