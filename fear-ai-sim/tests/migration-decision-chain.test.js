import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';

// V8 corrective checkpoint §4 (2026-08-31): migration
// causal semantics.
//
// The previous MUT-MIG-PARENT-001 implementation parented
// MIGRATION to the most recent JUSTICE_RESOLVED for the
// same town, falling back to whatever JUSTICE_RESOLVED
// could be found in the ledger when the migration tick
// did not itself emit a JUSTICE_RESOLVED. That fallback
// conflated persistent causal context with the
// immediate decision: a migration could be parented to
// a justice event from many ticks prior that happened
// to be the most recent, without recording the actual
// decision.
//
// The corrected chain is:
//
//   upstream observations / attacks / justice /
//     resource conditions
//     -> MIGRATION_PRESSURE_EVALUATED
//     -> MIGRATION_DECISION
//     -> MIGRATION
//
// MIGRATION_PRESSURE_EVALUATED is emitted when
// reportedCrime is true (attack in 5-tick window).
// MIGRATION_DECISION is emitted on every evaluation
// tick. MIGRATION is emitted only when the decision is
// FIRE (pressure >0.5 && !cooldown && population &&
// destination). The previous JUSTICE_RESOLVED or
// BANDIT_ATTACK events remain as upstream parents of
// MIGRATION_PRESSURE_EVALUATED, but the immediate
// parent of MIGRATION is always the decision that
// authorized it.

function isolatedCrisisWorld({ townId = 'north', sinkTownId = 'south', attackTicks = [1, 2, 3, 4, 5], ticks = 20 } = {}) {
    const world = createClosedWorldScenario();
    world.bandits = [];
    world.merchants = [];
    world.guards = [];
    world.civilians = [];
    world.vampires = [];
    world.convoy = null;
    world.convoys = [];
    const keep = world.towns.get(townId);
    const sink = world.towns.get(sinkTownId);
    if (!keep) throw new Error(`unknown townId ${townId}`);
    if (!sink) throw new Error(`unknown sinkTownId ${sinkTownId}`);
    keep.population = 10;
    sink.population = 10;
    if (!world.justiceState) world.justiceState = new Map();
    world.justiceState.set(townId, {
        legitimacy: 0.1,
        grievance: 0.9,
        migrationPressure: 0,
        justiceAccess: 0.4,
    });
    for (const t of attackTicks) {
        const roadId = world.routes.find(r => r.from === townId || r.to === townId)?.id ?? 'road-a';
        appendWorldEvent(world, {
            type: 'BANDIT_ATTACK',
            banditId: 'isolated-bandit',
            tick: t,
            roadId,
        });
    }
    for (let t = 1; t <= ticks; t++) {
        tickClosedWorld(world, { tick: t, perceivedDanger: 0.5 });
    }
    return world;
}

function eventsByType(world, type) {
    return world.events
        .filter(ev => ev.type === type)
        .sort((a, b) => (a.tick - b.tick) || (a.eventId?.localeCompare(b.eventId ?? '') ?? 0));
}

describe('migration causal semantics (V8 corrective checkpoint §4): explicit evaluation / decision / migration chain', () => {
    it('MIGRATION_PRESSURE_EVALUATED fires when the justice loop evaluates, and carries a parentEventIds list', () => {
        const world = isolatedCrisisWorld({ ticks: 30 });
        const evaluations = eventsByType(world, 'MIGRATION_PRESSURE_EVALUATED');
        // The justice loop emits MIGRATION_PRESSURE_EVALUATED
        // on every tick where reportedCrime is true (an
        // attack exists in the 5-tick window). With our
        // fixture pre-loading 5 attacks at ticks 1..5,
        // reportedCrime is true on ticks 1..10 (the
        // 5-tick sliding window extends coverage to tick
        // 10). At least one evaluation per town per
        // evaluation-eligible tick is the contract.
        expect(evaluations.length).toBeGreaterThanOrEqual(5);
        for (const ev of evaluations) {
            expect(typeof ev.eventId).toBe('string');
            expect(ev.eventId.length).toBeGreaterThan(0);
            expect(Array.isArray(ev.parentEventIds)).toBe(true);
        }
        // Evaluations for the same town across ticks
        // carry distinct eventIds.
        const ids = new Set(evaluations.map(ev => ev.eventId));
        expect(ids.size).toBe(evaluations.length);
    });

    it('MIGRATION_DECISION fires once per evaluation and is parented to the MIGRATION_PRESSURE_EVALUATED on the same tick', () => {
        const world = isolatedCrisisWorld({ ticks: 10 });
        const decisions = eventsByType(world, 'MIGRATION_DECISION');
        const evaluations = eventsByType(world, 'MIGRATION_PRESSURE_EVALUATED');
        expect(decisions.length).toBeGreaterThan(0);
        expect(evaluations.length).toBeGreaterThan(0);
        expect(decisions.length).toBe(evaluations.length);
        for (const decision of decisions) {
            const evalSameTick = evaluations.find(ev =>
                ev.tick === decision.tick && ev.townId === decision.townId
            );
            expect(evalSameTick).toBeDefined();
            expect(decision.parentEventIds).toContain(evalSameTick.eventId);
        }
    });

    it('MIGRATION is parented to the MIGRATION_DECISION on the same tick (not to a historical JUSTICE_RESOLVED)', () => {
        const world = isolatedCrisisWorld({ ticks: 30 });
        const migrations = eventsByType(world, 'MIGRATION');
        const decisions = eventsByType(world, 'MIGRATION_DECISION');
        expect(migrations.length).toBeGreaterThan(0);
        for (const mig of migrations) {
            expect(mig.toTownId).not.toBeNull();
            const decisionSameTick = decisions.find(d =>
                d.tick === mig.tick && d.townId === mig.townId && d.decision === 'FIRE'
            );
            expect(decisionSameTick).toBeDefined();
            expect(mig.parentEventIds).toContain(decisionSameTick.eventId);
            const directJusticeParents = (mig.parentEventIds ?? []).filter(pid => {
                const parent = world.events.find(ev => ev.eventId === pid);
                return parent?.type === 'JUSTICE_RESOLVED';
            });
            expect(directJusticeParents.length).toBe(0);
        }
    });

    it('the chain answers "why did these people migrate now?" via MIGRATION_DECISION', () => {
        const world = isolatedCrisisWorld({ ticks: 30 });
        const migrations = eventsByType(world, 'MIGRATION');
        expect(migrations.length).toBeGreaterThan(0);
        for (const mig of migrations) {
            const decisionParent = (mig.parentEventIds ?? [])
                .map(pid => world.events.find(ev => ev.eventId === pid))
                .find(parent => parent?.type === 'MIGRATION_DECISION');
            expect(decisionParent).toBeDefined();
            const evalParent = (decisionParent.parentEventIds ?? [])
                .map(pid => world.events.find(ev => ev.eventId === pid))
                .find(parent => parent?.type === 'MIGRATION_PRESSURE_EVALUATED');
            expect(evalParent).toBeDefined();
        }
    });

    it('FIRE iff MIGRATION: every FIRE has a MIGRATION and no SUPPRESSED has one', () => {
        const world = isolatedCrisisWorld({ ticks: 30 });
        const fires = eventsByType(world, 'MIGRATION_DECISION').filter(d => d.decision === 'FIRE');
        const migrations = eventsByType(world, 'MIGRATION');
        expect(fires.length).toBe(migrations.length);
        for (const f of fires) {
            const m = migrations.find(mig => mig.tick === f.tick && mig.townId === f.townId);
            expect(m).toBeDefined();
            expect(m.toTownId).not.toBeNull();
            expect(m.toTownId).not.toBe(f.townId);
        }
    });
});
