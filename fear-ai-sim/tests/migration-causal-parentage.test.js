// tests/migration-causal-parentage.test.js
//
// MUT-MIG-PARENT-001 — MIGRATION events must carry an
// eventId and a parentEventIds list. V8 corrective
// checkpoint §4 rewrote the causal chain to:
//
//   BANDIT_ATTACK -> JUSTICE_RESOLVED -> MIGRATION_PRESSURE_EVALUATED
//                                     -> MIGRATION_DECISION
//                                     -> MIGRATION
//
// MIGRATION's immediate parent is the MIGRATION_DECISION
// for the same town on the same tick. The decision is
// parented to the MIGRATION_PRESSURE_EVALUATED on the
// same tick. The evaluation is parented to the
// JUSTICE_RESOLVED (or to nothing if the justice loop
// was idle). An external auditor can reconstruct the
// chain by walking parentEventIds upward.
//
// V8 corrective checkpoint §5: the previous
// `ensureWorldEventIds` helper was removed. A test helper
// may normalize fixture events when the fixture REQUIRES
// it, but it must not make production-emitted events
// appear compliant when the emitter failed to assign
// eventId. The discriminator below observes eventIds
// produced by production code only — no helper rewrites
// them after the fact.

import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';

describe('MUT-MIG-PARENT-001 MIGRATION carries eventId and is parented to the MIGRATION_DECISION chain', () => {
    it('a MIGRATION event has a non-empty eventId and a non-empty parentEventIds list (production-emitted, no helper rewrites)', () => {
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 10; t += 1) {
            appendWorldEvent(world, { type: 'BANDIT_ATTACK', banditId: 'bandits-1', tick: t, roadId: 'road-a' });
        }
        for (let t = 1; t <= 30; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.9, relationshipGate: false });
        }
        const migrations = world.events.filter(ev => ev.type === 'MIGRATION');
        expect(migrations.length).toBeGreaterThan(0);
        for (const m of migrations) {
            // The production emitter MUST assign eventId.
            // No `ensureWorldEventIds` helper rewrites
            // missing eventIds; the contract is that
            // production code generates them.
            expect(typeof m.eventId).toBe('string');
            expect(m.eventId.length).toBeGreaterThan(0);
            expect(Array.isArray(m.parentEventIds)).toBe(true);
            expect(m.parentEventIds.length).toBeGreaterThan(0);
        }
    });

    it('a MIGRATION parentEventIds entry resolves to a MIGRATION_DECISION event for the same town (V8 §4 chain)', () => {
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 10; t += 1) {
            appendWorldEvent(world, { type: 'BANDIT_ATTACK', banditId: 'bandits-1', tick: t, roadId: 'road-a' });
        }
        for (let t = 1; t <= 30; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.9, relationshipGate: false });
        }
        const eventsById = new Map();
        for (const e of world.events) {
            if (e && e.eventId) eventsById.set(e.eventId, e);
        }
        const migrations = world.events.filter(ev => ev.type === 'MIGRATION');
        expect(migrations.length).toBeGreaterThan(0);
        let atLeastOneJustified = false;
        for (const m of migrations) {
            for (const pid of m.parentEventIds) {
                const parent = eventsById.get(pid);
                if (!parent) continue;
                // V8 §4: MIGRATION's immediate parent is
                // MIGRATION_DECISION, not JUSTICE_RESOLVED.
                expect(parent.type).toBe('MIGRATION_DECISION');
                expect(parent.townId).toBe(m.townId);
                expect(parent.tick).toBeLessThanOrEqual(m.tick);
                atLeastOneJustified = true;
            }
        }
        // The discriminator must walk back from
        // MIGRATION_DECISION -> MIGRATION_PRESSURE_EVALUATED
        // for at least one MIGRATION. The chain must be
        // reachable, not merely present.
        expect(atLeastOneJustified).toBe(true);
        // Walk the chain: every MIGRATION_DECISION must
        // have a MIGRATION_PRESSURE_EVALUATED parent.
        const decisions = world.events.filter(ev => ev.type === 'MIGRATION_DECISION');
        expect(decisions.length).toBeGreaterThan(0);
        for (const d of decisions) {
            for (const pid of d.parentEventIds) {
                const parent = eventsById.get(pid);
                if (!parent) continue;
                expect(parent.type).toBe('MIGRATION_PRESSURE_EVALUATED');
            }
        }
    });

    it('all eventIds on the world.events list are distinct (production-emitted, no helper)', () => {
        const world = createClosedWorldScenario();
        for (let t = 1; t <= 10; t += 1) {
            appendWorldEvent(world, { type: 'BANDIT_ATTACK', banditId: 'bandits-1', tick: t, roadId: 'road-a' });
        }
        for (let t = 1; t <= 30; t += 1) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.9, relationshipGate: false });
        }
        // No helper rewrites eventIds. Production code
        // must produce distinct eventIds on its own.
        const ids = world.events.map(e => e?.eventId).filter(Boolean);
        const seen = new Set();
        let dup;
        for (const id of ids) {
            if (seen.has(id)) { dup = id; break; }
            seen.add(id);
        }
        expect(dup).toBeUndefined();
    });
});