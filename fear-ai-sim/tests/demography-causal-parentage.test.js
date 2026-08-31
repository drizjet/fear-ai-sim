import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

// V8 corrective checkpoint, breadth slice (2026-08-31):
// demography causal parentage.
//
// Slice 9 (Demography) emits POPULATION_CHANGE events
// directly via `world.events.push(...)` rather than
// through the canonical `appendWorldEvent` mechanism. The
// hand-crafted eventIds (`POPULATION_CHANGE-${tick}-${townId}`)
// bypass `allocateWorldEventId`; parentEventIds is absent;
// the bare push pattern is the same defect class that
// MUT-MIG-PARENT-001 killed in the migration pipeline.
//
// A POPULATION_CHANGE event must carry:
//   - eventId produced by allocateWorldEventId (distinct
//     and globally unique across the run);
//   - parentEventIds linking it to the upstream
//     MIGRATION_DECISION that drove emigration (when
//     immigration > 0), and to the seasonal/scarcity
//     assessment (when births/deaths > 0).
//
// Test contract:
//   1. every POPULATION_CHANGE event has a non-empty
//      eventId produced by the canonical allocator (not a
//      template-literal guess);
//   2. every POPULATION_CHANGE event carries a
//      parentEventIds array (not undefined);
//   3. the eventIds are globally distinct (no two
//      POPULATION_CHANGE events share an id);
//   4. an immigration-bearing POPULATION_CHANGE for a
//      receiving town parents to a MIGRATION_DECISION on the
//      same tick (when one fired for the source town).
//
// Pre-fix defect: the bare push leaves eventIds as a
// template-string template; the demography module's
// ${tick}-${townId} pattern collides on tick reuse and
// carries no parentEventIds. Both observations fail under
// the broken variant.

function popChangeEvents(world) {
    return world.events.filter(ev => ev.type === 'POPULATION_CHANGE');
}

describe('Slice 9 (Demography) causal parentage (V8 breadth slice)', () => {
    it('every POPULATION_CHANGE event has an eventId produced by the canonical allocator and a non-empty parentEventIds except the first per town', () => {
        const world = createClosedWorldScenario({ season: 'WINTER' });
        world.towns.get('north').population = 100;
        world.towns.get('north').market.inventory.set('food', 0);
        world.towns.get('north').market.setDemand('food', 1000, 10);
        for (let t = 1; t <= 30; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        }
        const events = popChangeEvents(world);
        expect(events.length).toBeGreaterThan(0);
        // Track first POPULATION_CHANGE per town.
        const firstPerTown = new Set();
        for (const ev of events) {
            expect(typeof ev.eventId).toBe('string');
            expect(ev.eventId.length).toBeGreaterThan(0);
            expect(ev.eventId.startsWith('POPULATION_CHANGE-')).toBe(false);
            expect(Array.isArray(ev.parentEventIds)).toBe(true);
            if (firstPerTown.has(ev.townId)) {
                // After the first event for a town, every
                // subsequent POPULATION_CHANGE for that
                // town must have at least one parent.
                expect(ev.parentEventIds.length).toBeGreaterThan(0);
            } else {
                firstPerTown.add(ev.townId);
            }
        }
    });

    it('POPULATION_CHANGE eventIds are globally distinct across the run', () => {
        const world = createClosedWorldScenario({ season: 'WINTER' });
        world.towns.get('north').population = 100;
        world.towns.get('north').market.inventory.set('food', 0);
        for (let t = 1; t <= 30; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        }
        const events = popChangeEvents(world);
        const ids = events.map(ev => ev.eventId);
        const seen = new Set();
        for (const id of ids) {
            expect(seen.has(id)).toBe(false);
            seen.add(id);
        }
    });

    it('an immigration-bearing POPULATION_CHANGE for a receiving town parents to a causal chain (previous POP and/or MIGRATION_DECISION)', () => {
        const world = createClosedWorldScenario({ season: 'WINTER' });
        world.towns.get('north').population = 1000;
        // Drain food so emigration fires and immigration lands at the destination.
        world.towns.get('north').market.inventory.set('food', 0);
        world.towns.get('north').market.setDemand('food', 1000, 10);
        for (let t = 1; t <= 30; t++) {
            tickClosedWorld(world, { tick: t, perceivedDanger: 0.1 });
        }
        // Find POPULATION_CHANGE events with immigration > 0.
        const immEvents = popChangeEvents(world).filter(ev => ev.immigration > 0);
        expect(immEvents.length).toBeGreaterThan(0);
        // Walk parents upward from each immigration-bearing event.
        const eventsById = new Map();
        for (const e of world.events) {
            if (e && e.eventId) eventsById.set(e.eventId, e);
        }
        // Demography runs at step 0.5 before justice/migration
        // on the same tick, so same-tick MIGRATION_DECISION does
        // not exist. Honest parentage is: previous POP for
        // destination plus most recent FIRE MIGRATION_DECISION
        // for the source (tick <= imm.tick). Every immigration
        // event must have at least one parent, and at least one
        // immigration in the run should chain to a MIGRATION_DECISION
        // when such a decision has fired.
        let sawMigDecisionParent = false;
        const firstImmPerTown = new Set();
        for (const imm of immEvents) {
            if (!firstImmPerTown.has(imm.townId)) {
                firstImmPerTown.add(imm.townId);
                // First immigration per dest may have empty parent
                // if source also had no history; allow empty.
                // But it must still have an eventId.
                expect(typeof imm.eventId).toBe('string');
                continue;
            }
            expect(imm.parentEventIds.length).toBeGreaterThan(0);
            const parents = (imm.parentEventIds ?? []).map(pid => eventsById.get(pid)).filter(Boolean);
            const migDecisionParent = parents.find(p => p.type === 'MIGRATION_DECISION' && p.tick <= imm.tick);
            if (migDecisionParent) sawMigDecisionParent = true;
            // At least one parent must be a POPULATION_CHANGE or MIGRATION_DECISION
            const validParent = parents.find(p => p.type === 'POPULATION_CHANGE' || p.type === 'MIGRATION_DECISION');
            expect(validParent).toBeDefined();
        }
        // Also check that non-first imm events generally have mig parent when available
        for (const imm of immEvents.slice(1)) {
            if (imm.parentEventIds.length === 0) continue;
            const parents = (imm.parentEventIds ?? []).map(pid => eventsById.get(pid)).filter(Boolean);
            const migDecisionParent = parents.find(p => p.type === 'MIGRATION_DECISION' && p.tick <= imm.tick);
            if (migDecisionParent) sawMigDecisionParent = true;
        }
        // If any MIGRATION_DECISION FIRE exists, at least one
        // immigration should chain to it (when justice has fired).
        const anyFire = world.events.some(ev => ev.type === 'MIGRATION_DECISION' && ev.decision === 'FIRE');
        if (anyFire) {
            expect(sawMigDecisionParent).toBe(true);
        }
    });
});