import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-REPUTATION-PUBLIC-PRIVATE-001 — judgments flow through two channels (world-public
// standing vs observer-private opinion) as canonical parent-chained events, and production
// DECISIONs consume the book through the evaluation context. All guards precede mutation;
// both channels round-trip save/load with seeded-identical continuation.
// Mutants pinned: private channel folded into public; parent chain dropped; private channel
// missing from serialize; reputation wiring dropped from evaluationContext.

const eventsOf = (society, type) => society.events.filter(event => event.type === type);
const world = ({ seed = 41 } = {}) => new SocietyCore({ seed });

const judge = (extra = {}) => ({ kind: 'REPUTATION_JUDGE', subjectId: 'mira', value: .75, weight: 1, ...extra });
// One-candidate production DECISION whose score reads the target's public standing.
const weigh = (extra = {}) => ({
    kind: 'DECISION',
    actorId: 'evaluator',
    context: { targetId: 'mira' },
    actions: [{ id: 'approach', considerations: [{ name: 'standing', value: context => context.reputationOf?.(context.targetId) ?? 0 }] }],
    ...extra,
});

describe('RESP-REPUTATION-PUBLIC-PRIVATE-001: public/private reputation flows', () => {
    it('blends the public channel with weighted math as a chained canonical event', () => {
        const society = world();
        society.tick({ actions: [judge()] });
        society.tick({ actions: [judge({ value: .25 })] });

        const updates = eventsOf(society, 'REPUTATION_UPDATE');
        expect(updates).toHaveLength(2);
        expect(updates[0].scope).toBe('public');
        expect(updates[0].observerId).toBeNull();
        expect(updates[0].valueBefore).toBe(.5);
        expect(updates[0].valueAfter).toBe(.75); // first blend: (.5*0 + .75*1) / 1
        expect(updates[1].valueBefore).toBe(.75);
        expect(updates[1].valueAfter).toBe(.5); // (.75 + .25) / 2, exact in binary
        expect(updates[1].parentId).toBe(updates[0].id); // successive judgments chain
        expect(society.reputation.get('mira')).toBe(.5);

        const chain = society.causalChain(updates[1].id);
        expect(chain.lineage.map(event => event.type)).toEqual(['TURN', 'REPUTATION_UPDATE', 'REPUTATION_UPDATE']);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('keeps the private channel isolated per observer and invisible to the public read', () => {
        const society = world();
        society.tick({ actions: [judge({ scope: 'private', observerId: 'ada', value: .75 })] });
        society.tick({ actions: [judge({ scope: 'private', observerId: 'bo', value: .25 })] });

        expect(society.reputation.getPrivate('ada', 'mira')).toBe(.75);
        expect(society.reputation.getPrivate('bo', 'mira')).toBe(.25); // observers independent
        expect(society.reputation.get('mira')).toBe(.5); // public untouched
        expect(society.reputation.getPrivate('cleo', 'mira')).toBe(.5); // no observer leakage

        const updates = eventsOf(society, 'REPUTATION_UPDATE');
        expect(updates.map(event => event.scope)).toEqual(['private', 'private']);
        expect(updates.map(event => event.observerId)).toEqual(['ada', 'bo']);
        expect(updates[1].parentId).toBe(updates[0].id); // same subject chains across observers
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('rejects invalid judgments before mutating either channel', () => {
        const society = world();
        expect(() => society.tick({ actions: [judge({ scope: 'secret' })] })).toThrow(/scope/);
        expect(() => society.tick({ actions: [judge({ subjectId: undefined })] })).toThrow(/subjectId/);
        expect(() => society.tick({ actions: [judge({ value: 1.5 })] })).toThrow(/0\.\.1/);
        expect(() => society.tick({ actions: [judge({ value: NaN })] })).toThrow(/0\.\.1/);
        expect(() => society.tick({ actions: [judge({ weight: -1 })] })).toThrow(/non-negative/);
        expect(() => society.tick({ actions: [judge({ scope: 'private', observerId: undefined })] })).toThrow(/observerId/);
        expect(eventsOf(society, 'REPUTATION_UPDATE')).toHaveLength(0);
        expect(society.reputation.get('mira')).toBe(.5);
        expect(society.reputation.privateValues.size).toBe(0);
    });

    it('feeds production DECISIONs through the evaluation context', () => {
        const society = world();
        society.tick({ actions: [weigh()] });
        const [baseline] = eventsOf(society, 'DECISION');
        expect(baseline.score).toBe(.5); // untouched book: default standing

        society.tick({ actions: [judge({ value: .75 })] });
        society.tick({ actions: [weigh()] });
        const [, after] = eventsOf(society, 'DECISION');
        expect(after.score).toBe(.75); // decision score moved with the public standing
        expect(after.selected).toBe('approach');
        expect(after.valid).toBe(true);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('round-trips both channels across save/load with seeded-identical continuation', () => {
        const society = world();
        society.tick({ actions: [judge({ value: .75 }), judge({ scope: 'private', observerId: 'ada', subjectId: 'mira', value: .25 })] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(society.serialize())));
        expect(restored.reputation.get('mira')).toBe(.75);
        expect(restored.reputation.getPrivate('ada', 'mira')).toBe(.25);
        expect(restored.reputation.getPrivate('bo', 'mira')).toBe(.5);
        expect(restored.events).toHaveLength(society.events.length);
        // seeded-identical continuation: the DECISION select draws the shared RNG
        society.tick({ actions: [weigh()] });
        restored.tick({ actions: [weigh()] });
        expect(restored.serialize()).toEqual(society.serialize());
    });

    it('reproduces identical books and events from the same seed', () => {
        const a = world();
        const b = world();
        const script = [judge(), judge({ value: .25 }), judge({ scope: 'private', observerId: 'ada', value: 1 }), weigh()];
        a.tick({ actions: [script[0], script[1]] });
        b.tick({ actions: [script[0], script[1]] });
        a.tick({ actions: [script[2]] });
        b.tick({ actions: [script[2]] });
        a.tick({ actions: [script[3]] });
        b.tick({ actions: [script[3]] });
        expect(b.serialize()).toEqual(a.serialize());
    });
});
