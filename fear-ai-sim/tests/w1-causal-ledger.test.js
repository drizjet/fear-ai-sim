import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, resolveBanditAttack, appendWorldEvent } from '../closed-world.js';
import { lintCausalLedger, findingsByCode } from '../causal-ledger.js';

// W1-CAUSAL-DAG-AUTHORITY (RESP-EVENT-ID-AUTHORITY-001) — causal ledger.
//
// Frozen contracts under test:
//   EVENT-ID-001         one allocator owns authoritative event ids;
//                        template-derived ids are violations.
//   EVENT-PARENT-001     chain-connector events REQUIRE a parent;
//                        derivative events require a parent OR explicit
//                        rootReason (silent [] is the orphan class).
//   EVENT-PARENT-ORDER-001  no parent causally after its child.
//   CHAIN-MERCHANT-001   decision -> commitment -> exposure -> consequence
//                        must exist in the parent/child graph.
//   CHAIN-MIGRATION-001  migration -> decision -> pressure evaluation must
//                        exist in the parent/child graph.
//
// The mutations below are the pre-registered negative controls: each must
// produce exactly its intended finding (never a green lint).

function tickedWorld(ticks = 15) {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    for (let t = 1; t <= ticks; t++) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, relationshipGate: true });
    }
    return world;
}

/** Default world with forced attack/restock cycles (drives encounters). */
function attackWorld(ticks = 12) {
    const world = createClosedWorldScenario();
    world.ticksPerSeason = 10000;
    for (let t = 1; t <= ticks; t++) {
        world.merchants[0].cargo = 20;
        resolveBanditAttack(world, { tick: t, roadId: 'road-a' });
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5, relationshipGate: true });
    }
    return world;
}

describe('EVENT-ID-001 / EVENT-PARENT-001 — structural ledger health', () => {
    it('canonical 15-tick world lints clean (allocator ids, parents/roots, chains)', () => {
        const world = tickedWorld(15);
        const { ok, findings } = lintCausalLedger(world);
        expect(findings).toEqual([]);
        expect(ok).toBe(true);
    });

    it('protected-chain 12-tick world with real attacks and migrations lints clean', () => {
        const world = attackWorld(12);
        const { ok, findings } = lintCausalLedger(world);
        // Sanity that the world actually exercised the chains.
        expect(world.events.some(e => e.type === 'ENCOUNTER')).toBe(true);
        expect(world.events.some(e => e.type === 'MIGRATION')).toBe(true);
        expect(findings).toEqual([]);
        expect(ok).toBe(true);
    });

    it('MUT-EVENT-TEMPLATE-001: a template-derived protected id is flagged', () => {
        const world = tickedWorld(3);
        const d = world.events.find(e => e.type === 'MERCHANT_ROUTE_DECISION');
        expect(d).toBeDefined();
        d.eventId = 'MERCHANT_ROUTE_DECISION-1-merchant-1';
        const byCode = findingsByCode(world);
        expect(byCode.TEMPLATE_EVENT_ID).toBeDefined();
        expect(byCode.TEMPLATE_EVENT_ID.some(f => f.eventId === 'MERCHANT_ROUTE_DECISION-1-merchant-1')).toBe(true);
    });

    it('MUT-EVENT-DUP-001: a duplicated event id is flagged', () => {
        const world = tickedWorld(3);
        const last = world.events[world.events.length - 1];
        world.events.push({ ...last });
        expect(findingsByCode(world).DUP_EVENT_ID).toBeDefined();
    });

    it('MUT-EVENT-UNKNOWN-PARENT-001: a parent id that resolves nowhere is flagged', () => {
        const world = tickedWorld(3);
        const trip = world.events.find(e => e.type === 'TRIP_COMMITMENT');
        expect(trip).toBeDefined();
        trip.parentEventIds = ['WORLD-EVENT-999999'];
        const byCode = findingsByCode(world);
        expect(byCode.UNKNOWN_PARENT).toBeDefined();
        expect(byCode.UNKNOWN_PARENT.some(f => f.parentId === 'WORLD-EVENT-999999')).toBe(true);
    });

    it('MUT-EVENT-FUTURE-PARENT-001: a child parented to a later event is flagged', () => {
        const world = createClosedWorldScenario();
        const later = appendOwn(world, { type: 'BANDIT_ATTACK', tick: 5, roadId: 'road-a' });
        const earlier = appendOwn(world, { type: 'BANDIT_ATTACK', tick: 3, roadId: 'road-a' });
        earlier.parentEventIds = [later.eventId];
        const byCode = findingsByCode(world);
        expect(byCode.FUTURE_PARENT).toBeDefined();
        expect(byCode.FUTURE_PARENT.some(f => f.parentId === later.eventId)).toBe(true);
    });

    it('MUT-EVENT-ORPHAN-001: a protected event with silent empty parents is flagged', () => {
        const world = tickedWorld(3);
        const trip = world.events.find(e => e.type === 'TRIP_COMMITMENT');
        trip.parentEventIds = [];
        delete trip.rootReason;
        trip.materialized = true;
        const byCode = findingsByCode(world);
        expect(byCode.MISSING_PARENT).toBeDefined();
    });
});

describe('CHAIN-MERCHANT-001 / CHAIN-MIGRATION-001 — protected chains', () => {
    it('MUT-CHAIN-MERCHANT-001: stripping the decision->commitment link breaks the merchant chain', () => {
        const world = attackWorld(6);
        for (const trip of world.events.filter(e => e.type === 'TRIP_COMMITMENT')) {
            trip.parentEventIds = [];
        }
        const byCode = findingsByCode(world);
        expect(byCode.CHAIN_MERCHANT_DECISION).toBeDefined();
    });

    it('MUT-CHAIN-MIGRATION-001: stripping the migration decision parent breaks the migration chain', () => {
        const world = attackWorld(12);
        const mig = world.events.find(e => e.type === 'MIGRATION');
        expect(mig).toBeDefined();
        mig.parentEventIds = [];
        const byCode = findingsByCode(world);
        expect(byCode.CHAIN_MIGRATION).toBeDefined();
        expect(byCode.MISSING_PARENT).toBeDefined();
    });
});

// Local helper: append an event through the canonical allocator.
function appendOwn(world, event) {
    return appendWorldEvent(world, event, []);
}