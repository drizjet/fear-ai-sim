import { describe, it, expect } from '@jest/globals';
import {
    GoalArbitrationEngine,
    GOAL_TYPES,
} from '../packages/core/index.js';
import { ProtocolValidator } from '../packages/protocol/index.js';

// NEXT-182: protocol context forwarding for the six dropped opt-in fields.
// ProtocolValidator.validateObservation sanitized observations to a fixed
// key set and DROPPED trust, trustGain, calmTrustGain, traumaLoad,
// memoryLoad, identityWeight (pinned by tests/godot-recent-joints.test.js).
// The validator now accepts an opt-in `context` object on the raw
// observation and forwards it — sanitized — as `value.context` (JSON path
// only; Binary Wire v2 fixed 32-byte records cannot carry these).

const LEGACY_KEYS = [
    'agent_id', 'energy', 'health', 'inSafeHaven', 'obstacleAhead',
    'obstaclePresent', 'sounds', 'threats', 'velocity', 'x', 'y', 'z',
];

function arbitrateWinner(fear, ctx) {
    const arb = new GoalArbitrationEngine();
    arb.registerGoal('g', { type: GOAL_TYPES.HOLD_POST, priority: 0.45 });
    arb.registerGoal('g', { type: GOAL_TYPES.SURVIVE, priority: 0.6 });
    return arb.arbitrate('g', { fear }, ctx).winningGoal;
}

describe('NEXT-182: protocol context forwarding', () => {
    it('1. Each of the six fields round-trips with exact values', () => {
        const v = ProtocolValidator.validateObservation({
            agent_id: 'agent_7',
            x: 1.5,
            context: {
                trust: 0.7,
                trustGain: 0.6,
                calmTrustGain: 0.6,
                traumaLoad: 0.5,
                memoryLoad: 0.25,
                identityWeight: 1,
            },
        });
        expect(v.valid).toBe(true);
        expect(v.value.context).toEqual({
            trust: 0.7,
            trustGain: 0.6,
            calmTrustGain: 0.6,
            traumaLoad: 0.5,
            memoryLoad: 0.25,
            identityWeight: 1,
        });
        // Pinned individually: exact values, no drift.
        expect(v.value.context.trust).toBe(0.7);
        expect(v.value.context.trustGain).toBe(0.6);
        expect(v.value.context.calmTrustGain).toBe(0.6);
        expect(v.value.context.traumaLoad).toBe(0.5);
        expect(v.value.context.memoryLoad).toBe(0.25);
        expect(v.value.context.identityWeight).toBe(1);
        // Existing keys untouched.
        expect(v.value.agent_id).toBe('agent_7');
        expect(v.value.x).toBe(1.5);
    });

    it('2. Unknown keys dropped; malformed values sanitized per rule', () => {
        const v = ProtocolValidator.validateObservation({
            agent_id: 'a',
            context: {
                trust: 5, // clamps to 1
                trustGain: -2, // clamps to 0
                calmTrustGain: 99, // clamps to 1
                traumaLoad: NaN, // absent
                memoryLoad: Infinity, // absent
                identityWeight: 'high', // absent
                evil: 1, // unknown: dropped
                __proto__: { polluted: true }, // unknown: dropped
            },
        });
        expect(v.valid).toBe(true);
        expect(v.value.context).toEqual({ trust: 1, trustGain: 0, calmTrustGain: 1 });
        expect(v.value.context.traumaLoad).toBe(undefined);
        expect(v.value.context.memoryLoad).toBe(undefined);
        expect(v.value.context.identityWeight).toBe(undefined);
        expect(v.value.context.evil).toBe(undefined);

        // Negative trust clamps to -1, not dropped.
        expect(
            ProtocolValidator.validateObservation({ agent_id: 'a', context: { trust: -2 } })
                .value.context
        ).toEqual({ trust: -1 });
        // Null / non-finite singles become absent.
        for (const bad of [null, undefined, NaN, Infinity, -Infinity, 'high', true]) {
            const r = ProtocolValidator.validateObservation({ agent_id: 'a', context: { trust: bad } });
            expect('context' in r.value).toBe(false);
        }
        // Non-object contexts mean no context; unknown-only means no context.
        for (const badCtx of [null, undefined, 'nope', 42, [0.5], { nope: 1 }]) {
            const r = ProtocolValidator.validateObservation({ agent_id: 'a', context: badCtx });
            expect(r.valid).toBe(true);
            expect('context' in r.value).toBe(false);
        }
    });

    it('3. Legacy observations without context produce NO context key', () => {
        const v = ProtocolValidator.validateObservation({ agent_id: 'agent_7', x: 1.5 });
        expect(v.valid).toBe(true);
        expect(Object.keys(v.value).sort()).toEqual([...LEGACY_KEYS].sort());
        expect('context' in v.value).toBe(false);
        expect(v.value).toEqual({
            agent_id: 'agent_7',
            x: 1.5,
            y: 0,
            z: 0,
            velocity: null,
            health: 1.0,
            energy: 1.0,
            inSafeHaven: false,
            obstacleAhead: false,
            obstaclePresent: false,
            threats: [],
            sounds: [],
        });
        // Top-level opt-in fields (pre-NEXT-182 shape) are still dropped —
        // only the `context` object is forwarded.
        const top = ProtocolValidator.validateObservation({
            agent_id: 'agent_7', x: 1.5, trust: 0.7, traumaLoad: 0.5,
        });
        expect('context' in top.value).toBe(false);
        expect(top.value.trust).toBe(undefined);
        expect(top.value.traumaLoad).toBe(undefined);
    });

    it('4. End-to-end: forwarded context drives the identical arbitration winner', () => {
        // Pinned flip: at fear 0.6 the legacy default holds post while the
        // loaded context (trauma 0.5 + memory 0.25) flees to SURVIVE.
        expect(arbitrateWinner(0.6, {})).toBe(GOAL_TYPES.HOLD_POST);
        const direct = arbitrateWinner(0.6, { traumaLoad: 0.5, memoryLoad: 0.25 });
        expect(direct).toBe(GOAL_TYPES.SURVIVE);
        const v = ProtocolValidator.validateObservation({
            agent_id: 'g',
            context: { traumaLoad: 0.5, memoryLoad: 0.25 },
        });
        expect(arbitrateWinner(0.6, v.value.context)).toBe(direct);
        // Batch tick carries the forwarded context through untouched.
        const batch = ProtocolValidator.validateBatchTick({
            type: 'BATCH_TICK_REQUEST',
            dt: 0.016,
            observations: [{ agent_id: 'g', context: { traumaLoad: 0.5, memoryLoad: 0.25 } }],
        });
        expect(batch.valid).toBe(true);
        expect(arbitrateWinner(0.6, batch.value.observations[0].context)).toBe(direct);
    });

    it('5. Forwarded context survives the JSON transport bit-exactly', () => {
        const v = ProtocolValidator.validateObservation({
            agent_id: 'agent_7',
            context: {
                trust: 0.7,
                trustGain: 0.6,
                calmTrustGain: 0.6,
                traumaLoad: 0.5,
                memoryLoad: 0.25,
                identityWeight: 1,
            },
        });
        const back = JSON.parse(JSON.stringify(v.value));
        expect(back.context).toEqual(v.value.context);
        expect(arbitrateWinner(0.6, back.context)).toBe(arbitrateWinner(0.6, v.value.context));
    });

    it('6. Exact replay: validation and arbitration are deterministic', () => {
        const raw = {
            agent_id: 'agent_7',
            x: 1.5,
            context: { trust: 0.7, traumaLoad: 0.5, memoryLoad: 0.25 },
        };
        const run = () => {
            const v = ProtocolValidator.validateObservation(JSON.parse(JSON.stringify(raw)));
            return {
                value: v.value,
                winner: arbitrateWinner(0.6, v.value.context),
            };
        };
        const a = run();
        expect(run()).toEqual(a);
        expect(a.winner).toBe(GOAL_TYPES.SURVIVE);
    });
});
