// World-Completion Directive §12 (Diplomacy).
// Constitution §12 specifies treaties, non-aggression pacts,
// trade agreements, and the like. This slice adds the
// minimal treaty record type and a `requestPassage`
// interaction. The §29 impossibility audit (2026-08-28)
// answered "Can a treaty be formed?" with **NO** — this
// slice closes that gap.
//
// The treaty system is intentionally minimal:
//   - A `treaty` record with participants, terms, startTick,
//     obligations, violations, and termination.
//   - A `requestPassage(actor, target, world, tick)` interaction
//     that forms a passage treaty when the actor and target
//     share a road segment and both are willing (default: yes).
//   - A `TREATY_FORMED` event emitted onto the world when a
//     treaty is created.
//   - A `TREATY_VIOLATED` event when a participant breaks a term.
//   - A `TREATY_TERMINATED` event when the treaty ends (either
//     by mutual agreement or by a violation).
//
// Failing-test-first: the test must fail for the right reason
// (the treaty module does not exist yet) before the
// implementation lands.

import { describe, it, expect } from '@jest/globals';
import {
    createTreaty,
    requestPassage,
    violateTreaty,
    terminateTreaty,
    activeTreatiesFor,
} from '../treaty.js';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

describe('treaty system (Constitution §12)', () => {
    it('createTreaty produces a treaty record with the required fields', () => {
        // The §12 contract: a treaty record has participants,
        // terms, startTick, obligations, violations, and a
        // termination field. The treaty starts in ACTIVE state.
        const treaty = createTreaty({
            id: 'treaty-1',
            participants: ['faction-a', 'faction-b'],
            terms: { kind: 'passage', scope: 'road-a' },
            startTick: 5,
        });
        expect(treaty.id).toBe('treaty-1');
        expect(treaty.participants).toEqual(['faction-a', 'faction-b']);
        expect(treaty.terms.kind).toBe('passage');
        expect(treaty.terms.scope).toBe('road-a');
        expect(treaty.startTick).toBe(5);
        expect(treaty.status).toBe('ACTIVE');
        expect(Array.isArray(treaty.obligations)).toBe(true);
        expect(Array.isArray(treaty.violations)).toBe(true);
        expect(treaty.termination).toBeNull();
    });

    it('requestPassage forms a treaty and emits a TREATY_FORMED event', () => {
        // The §12 contract: a `requestPassage` interaction
        // forms a passage treaty when the actor and target
        // share a road segment. The world receives a
        // TREATY_FORMED event with the treaty record.
        const world = createClosedWorldScenario();
        const result = requestPassage({
            actor: 'north-faction',
            target: 'south-faction',
            scope: 'road-a',
            world,
            tick: 1,
        });
        expect(result.ok).toBe(true);
        expect(result.treaty).toBeDefined();
        // The world event log carries the formation.
        const formed = world.events.find(e => e.type === 'TREATY_FORMED');
        expect(formed).toBeDefined();
        expect(formed.treaty.id).toBe(result.treaty.id);
        expect(formed.treaty.participants).toContain('north-faction');
        expect(formed.treaty.participants).toContain('south-faction');
        expect(formed.treaty.terms.kind).toBe('passage');
        expect(formed.treaty.terms.scope).toBe('road-a');
    });

    it('violateTreaty records the violation and emits a TREATY_VIOLATED event', () => {
        // The §12 contract: a violation is recorded on the
        // treaty and a TREATY_VIOLATED event is emitted.
        const world = createClosedWorldScenario();
        const { treaty } = requestPassage({
            actor: 'north-faction',
            target: 'south-faction',
            scope: 'road-a',
            world,
            tick: 1,
        });
        const updated = violateTreaty({
            treaty,
            violator: 'north-faction',
            reason: 'bandit-ambush',
            world,
            tick: 5,
        });
        expect(updated.violations.length).toBe(1);
        expect(updated.violations[0].violator).toBe('north-faction');
        expect(updated.violations[0].reason).toBe('bandit-ambush');
        expect(updated.violations[0].tick).toBe(5);
        const violated = world.events.find(e => e.type === 'TREATY_VIOLATED');
        expect(violated).toBeDefined();
        expect(violated.treatyId).toBe(treaty.id);
    });

    it('terminateTreaty ends the treaty and emits a TREATY_TERMINATED event', () => {
        // The §12 contract: termination is recorded with a
        // reason and endTick. The treaty is no longer active.
        const world = createClosedWorldScenario();
        const { treaty } = requestPassage({
            actor: 'north-faction',
            target: 'south-faction',
            scope: 'road-a',
            world,
            tick: 1,
        });
        const updated = terminateTreaty({
            treaty,
            reason: 'mutual-agreement',
            world,
            tick: 10,
        });
        expect(updated.status).toBe('TERMINATED');
        expect(updated.termination.reason).toBe('mutual-agreement');
        expect(updated.termination.endTick).toBe(10);
        const terminated = world.events.find(e => e.type === 'TREATY_TERMINATED');
        expect(terminated).toBeDefined();
        expect(terminated.treatyId).toBe(treaty.id);
    });

    it('activeTreatiesFor returns only ACTIVE treaties for a given faction', () => {
        const world = createClosedWorldScenario();
        requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-a', world, tick: 1 });
        const { treaty: t2 } = requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-b', world, tick: 2 });
        terminateTreaty({ treaty: t2, reason: 'mutual', world, tick: 5 });
        const active = activeTreatiesFor('north-faction', world);
        // Two were created; one was terminated. Only the first
        // (road-a) should be active for north-faction.
        expect(active.length).toBe(1);
        expect(active[0].terms.scope).toBe('road-a');
    });

    it('two parallel runs of requestPassage are deterministic (§121)', () => {
        // Same inputs must produce the same treaty id and
        // record. The §121 determinism contract applies to
        // every world-affecting interaction.
        const w1 = createClosedWorldScenario();
        const w2 = createClosedWorldScenario();
        const r1 = requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-a', world: w1, tick: 1 });
        const r2 = requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-a', world: w2, tick: 1 });
        expect(r1.treaty.id).toBe(r2.treaty.id);
        expect(r1.treaty.participants).toEqual(r2.treaty.participants);
    });

    it('treaty collection lives on world.treaties and grows on formation, shrinks on termination', () => {
        const world = createClosedWorldScenario();
        expect(world.treaties).toBeDefined();
        expect(world.treaties.length).toBe(0);
        const { treaty: t1 } = requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-a', world, tick: 1 });
        expect(world.treaties.length).toBe(1);
        const { treaty: t2 } = requestPassage({ actor: 'north-faction', target: 'south-faction', scope: 'road-b', world, tick: 2 });
        expect(world.treaties.length).toBe(2);
        terminateTreaty({ treaty: t2, reason: 'mutual', world, tick: 5 });
        // The treaty is recorded as TERMINATED but still in
        // the world.treaties list (history is preserved).
        expect(world.treaties.length).toBe(2);
        // activeTreatiesFor filters out terminated.
        const active = activeTreatiesFor('north-faction', world);
        expect(active.length).toBe(1);
        expect(t1.status).toBe('ACTIVE');
        expect(t2.status).toBe('TERMINATED');
    });
});
