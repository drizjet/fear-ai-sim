import { describe, it, expect } from '@jest/globals';
import {
    CausalEventGraph,
    GoalArbitrationEngine,
    GOAL_TYPES,
    recordDecisionOutcome,
    tendencyAxisFor,
} from '../packages/core/index.js';

// NEXT-164 (post-25 candidate 4): causal explanations citing identity.
// recordDecisionOutcome gains opt-in options.identity ({ tendencies,
// blend }): the winning goal's tendency axis, value, blend, and computed
// weight land on the node payload and description, so root-cause traces
// can cite identity. Without weighing identity the node stays
// legacy-exact.
const TENDENCIES = { flee: 0.1, stand: 0.9, help: 0.5, rally: 0.5 };

function arbitrate() {
    const arb = new GoalArbitrationEngine();
    arb.registerGoal('g', { type: GOAL_TYPES.HOLD_POST, priority: 0.6 });
    arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
    return arb.arbitrate(
        'g',
        { fear: 0.5 },
        { identityWeight: 1, identityTendencies: TENDENCIES }
    );
}

describe('NEXT-164: identity-citing causal nodes', () => {
    it('1. Axis helper maps goals to tendency axes', () => {
        expect(tendencyAxisFor(GOAL_TYPES.HOLD_POST)).toBe('stand');
        expect(tendencyAxisFor(GOAL_TYPES.SURVIVE)).toBe('flee');
        expect(tendencyAxisFor(GOAL_TYPES.PROTECT_ALLY)).toBe('help');
        expect(tendencyAxisFor(GOAL_TYPES.ESCORT_CARAVAN)).toBe('rally');
    });

    it('2. Legacy nodes carry no identity key', () => {
        const g = new CausalEventGraph();
        const node = recordDecisionOutcome(g, arbitrate(), { tick: 5, eventId: 'n-legacy' });
        expect(Object.keys(node.payload).sort()).toEqual(
            ['courageous', 'fear', 'winningGoal', 'winningIntent', 'winningScore']);
        expect(node.description).not.toMatch(/identity/);
    });

    it('3. Weighing identity is recorded on payload and description', () => {
        const g = new CausalEventGraph();
        const node = recordDecisionOutcome(g, arbitrate(), {
            tick: 5, eventId: 'n-id', identity: { tendencies: TENDENCIES, blend: 1 },
        });
        expect(node.payload.winningGoal).toBe(GOAL_TYPES.HOLD_POST);
        expect(node.payload.identity).toEqual({ axis: 'stand', tendency: 0.9, blend: 1, weight: 1.4 });
        expect(node.description).toMatch(/identity stand x1\.4/);
    });

    it('4. Zero blend or missing tendencies record nothing', () => {
        const g = new CausalEventGraph();
        const d = arbitrate();
        const cases = [
            { tendencies: TENDENCIES, blend: 0 },
            { tendencies: null, blend: 1 },
            { tendencies: {}, blend: 1 },
            undefined,
        ];
        cases.forEach((identity, i) => {
            const node = recordDecisionOutcome(g, d, {
                tick: 5, eventId: `n-plain-${i}`, identity,
            });
            expect(node.payload.identity).toBeUndefined();
        });
    });

    it('5. Malformed identity degrades safely without throwing', () => {
        const g = new CausalEventGraph();
        const d = arbitrate();
        const bad = recordDecisionOutcome(g, d, {
            tick: 5, eventId: 'n-bad',
            identity: { tendencies: { stand: NaN }, blend: 'high' },
        });
        expect(bad.payload.identity).toBeUndefined();
        const clamped = recordDecisionOutcome(g, d, {
            tick: 6, eventId: 'n-clamp',
            identity: { tendencies: { stand: 9 }, blend: 99 },
        });
        expect(clamped.payload.identity).toEqual({ axis: 'stand', tendency: 1, blend: 1, weight: 1.5 });
    });

    it('6. Identity attribution survives root-cause tracing and replay', () => {
        const run = () => {
            const g = new CausalEventGraph();
            const anchor = g.recordEvent({ id: 'rumor', tick: 0, domain: 'INFORMATION', type: 'RUMOR_INJECTED' });
            void anchor;
            const node = recordDecisionOutcome(g, arbitrate(), {
                tick: 5, eventId: 'n-trace',
                identity: { tendencies: TENDENCIES, blend: 1 },
                causes: [{ id: 'rumor', weight: 0.8, mechanism: 'HEARSAY_DREAD' }],
            });
            return node.payload.identity;
        };
        expect(run()).toEqual({ axis: 'stand', tendency: 0.9, blend: 1, weight: 1.4 });
        expect(run()).toEqual(run());
    });
});
