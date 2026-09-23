import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-FACTION-RAID-LOOP-001 — the once-orphaned macro layer (FactionRuntime.evaluateRaid →
// macrocore raidUtility + FactionState.escalationLevel) is production-wired: evaluation →
// dispatch → one-draw resolution as canonical parent-chained events, exact loot conservation
// across both outcomes, all invariant guards before any mutation, and the whole cycle
// continuing across save/load with seeded-identical determinism.
// Mutants pinned: dispatch stage gate removed; victory inverted; loot credit skipped;
// evaluation orphan (evaluateRaid never called → no event).

const world = () => {
    const society = new SocietyCore({ seed: 41 });
    society.addFaction('raiders', { militaryConfidence: .6, loot: 20, anger: .1 });
    society.addFaction('holders', { militaryConfidence: .5, loot: 50, grievance: .1 });
    return society;
};

const evaluate = (values = { expectedLoot: 5, resourceNeed: 1 }) =>
    ({ kind: 'FACTION_RAID_EVALUATION', faction: 'raiders', targetId: 'holders', values });
const dispatch = (extra = {}) =>
    ({ kind: 'FACTION_RAID_DISPATCH', raidId: 'raid-1', faction: 'raiders', targetId: 'holders', force: 10, bagSize: 30, ...extra });
const resolve = (extra = {}) => ({ kind: 'FACTION_RAID_RESOLUTION', raidId: 'raid-1', defense: 0, ...extra });

const eventsOf = (society, type) => society.events.filter(event => event.type === type);
const totalLoot = society => [...society.factions.values()].reduce((sum, faction) => sum + faction.loot, 0);

describe('RESP-FACTION-RAID-LOOP-001: faction raid production loop', () => {
    it('runs the full evaluation → dispatch → resolution cycle as one validated lineage', () => {
        const society = world();
        society.tick({ actions: [evaluate()] });
        society.tick({ actions: [dispatch()] });
        society.tick({ actions: [resolve()] });

        const [evaluation] = eventsOf(society, 'FACTION_RAID_EVALUATION');
        const [dispatchEvent] = eventsOf(society, 'FACTION_RAID_DISPATCH');
        const [resolution] = eventsOf(society, 'FACTION_RAID_RESOLUTION');

        // causal chain: TURN → evaluation → dispatch → resolution
        expect(evaluation.parentId).toBe(society.events.find(event => event.type === 'TURN').id);
        expect(dispatchEvent.parentId).toBe(evaluation.id);
        expect(resolution.parentId).toBe(dispatchEvent.id);
        expect(society.causalChain(resolution.id).lineage.map(event => event.type)).toEqual([
            'TURN', 'FACTION_RAID_EVALUATION', 'FACTION_RAID_DISPATCH', 'FACTION_RAID_RESOLUTION',
        ]);
        expect(society.auditEventGraph().ok).toBe(true);

        // the orphaned macro layer is production-wired: raidUtility scores the decision and
        // escalationLevel is surfaced on every stage of the event graph
        expect(evaluation.decision).toBe('RAID');
        expect(evaluation.score).toBeCloseTo(6 - .5, 10); // expectedLoot 5 + resourceNeed 1 − retaliationRisk (.5)
        expect(typeof evaluation.escalationLevel).toBe('number');
        expect(dispatchEvent.escalationLevel).toBe(evaluation.escalationLevel); // state unchanged between stages
        expect(society.factions.get('raiders').history.some(entry => entry.target === 'holders' && entry.decision === 'RAID')).toBe(true);

        // resolution: force 10 > 0 + roll(<1) — always a victory; loot moves exactly
        expect(resolution.victory).toBe(true);
        expect(resolution.roll).toBeGreaterThanOrEqual(0);
        expect(resolution.roll).toBeLessThan(1);
        expect(resolution.stolen).toBe(30); // min(holders.loot 50, bagSize 30)
        expect(resolution.attackerLootBefore).toBe(20);
        expect(resolution.attackerLootAfter).toBe(50);
        expect(resolution.targetLootBefore).toBe(50);
        expect(resolution.targetLootAfter).toBe(20);
        expect(society.factions.get('raiders').loot).toBe(50);
        expect(society.factions.get('holders').loot).toBe(20);
        expect(totalLoot(society)).toBe(70); // conserved: nothing created or destroyed

        // escalation consequences recorded on the factions and in the event
        expect(society.factions.get('raiders').state.militaryConfidence).toBeCloseTo(.7, 10);
        expect(society.factions.get('holders').state.grievance).toBeCloseTo(.1 + .15, 10);
        expect(resolution.escalationLevel).toBeGreaterThanOrEqual(0);
        expect(society.raids.get('raid-1')).toMatchObject({ status: 'SUCCEEDED', outcome: 'LOOT_TAKEN' });
    });

    it('rejects a dispatch whose evaluation said DEESCALATE without touching raid state', () => {
        const society = world();
        society.tick({ actions: [evaluate({ diplomaticCost: 10 })] });

        const [evaluation] = eventsOf(society, 'FACTION_RAID_EVALUATION');
        expect(evaluation.decision).toBe('DEESCALATE');

        society.tick({ actions: [dispatch()] });
        const [dispatchEvent] = eventsOf(society, 'FACTION_RAID_DISPATCH');
        expect(dispatchEvent).toMatchObject({ status: 'REJECTED', reason: 'NOT_RAID_WORTHY' });
        expect(society.raids.size).toBe(0); // no raid entity, no mutation
        expect(totalLoot(society)).toBe(70);
        // the rejection also leaves nothing to resolve
        expect(() => society.tick({ actions: [resolve()] })).toThrow(/Unknown raid \"raid-1\"/);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('enforces stage gates and guard order before any mutation', () => {
        const society = world();

        // reference guards fire first — evaluateRaid never runs, history stays untouched
        expect(() => society.tick({ actions: [evaluate()].map(action => ({ ...action, targetId: 'ghost' })) })).toThrow(/Unknown faction \"ghost\"/);
        expect(() => society.tick({ actions: [evaluate()].map(action => ({ ...action, faction: 'raiders', targetId: 'raiders' })) })).toThrow(/distinct factions/);
        expect(() => society.tick({ actions: [evaluate({ expectedLoot: NaN })] })).toThrow(/finite number/);
        expect(society.factions.get('raiders').history).toHaveLength(0);

        // dispatch before any evaluation is impossible (stage gate)
        expect(() => society.tick({ actions: [dispatch()] })).toThrow(/requires an evaluation/);
        expect(society.raids.size).toBe(0);

        society.tick({ actions: [evaluate()] });
        // invariant-first: missing/duplicate raid ids reported even though a valid evaluation exists
        expect(() => society.tick({ actions: [dispatch({ raidId: undefined })] })).toThrow(/requires a raidId/);
        expect(() => society.tick({ actions: [dispatch({ force: 0 })] })).toThrow(/positive force/);
        society.tick({ actions: [dispatch()] });
        expect(() => society.tick({ actions: [dispatch()] })).toThrow(/Duplicate raid id/);

        // resolution stage order: double resolution refused from a terminal status
        society.tick({ actions: [resolve()] });
        expect(() => society.tick({ actions: [resolve()] })).toThrow(/cannot resolve raid \"raid-1\" from status \"SUCCEEDED\"/);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('a repulsed raid moves no loot and applies the defeat consequences', () => {
        const society = world();
        society.tick({ actions: [evaluate()] });
        society.tick({ actions: [dispatch()] });
        society.tick({ actions: [resolve({ defense: 10 })] }); // force 1... force is 10: 10 > 10 + roll? false only if roll ≥ 0... see below

        const [resolution] = eventsOf(society, 'FACTION_RAID_RESOLUTION');
        // force 10 vs defense 10 + roll(≥0): 10 > 10 + roll is false for every roll ≥ 0
        expect(resolution.victory).toBe(false);
        expect(resolution.outcome).toBe('REPULSED');
        expect(resolution.stolen).toBe(0);
        expect(society.factions.get('raiders').loot).toBe(20); // untouched
        expect(society.factions.get('holders').loot).toBe(50);
        expect(totalLoot(society)).toBe(70);
        expect(society.factions.get('raiders').state.militaryConfidence).toBeCloseTo(.5, 10); // confidence hit
        expect(society.factions.get('holders').state.grievance).toBeCloseTo(.1 + .05, 10);
        expect(society.raids.get('raid-1')).toMatchObject({ status: 'REPULSED', outcome: 'REPULSED' });
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('conserves total loot across a mixed victory/defeat sequence', () => {
        const society = world();
        const before = totalLoot(society);
        society.tick({ actions: [evaluate()] });
        society.tick({ actions: [dispatch(), dispatch({ raidId: 'raid-2' })] });
        society.tick({ actions: [resolve(), resolve({ raidId: 'raid-2', defense: 10 })] });

        expect(eventsOf(society, 'FACTION_RAID_RESOLUTION')).toHaveLength(2);
        expect(totalLoot(society)).toBe(before);
        expect(society.raids.get('raid-1').status).toBe('SUCCEEDED');
        expect(society.raids.get('raid-2').status).toBe('REPULSED');
    });

    it('survives save/load mid-cycle and continues identically to an uninterrupted run', () => {
        const control = world();
        control.tick({ actions: [evaluate()] });
        control.tick({ actions: [dispatch()] });
        control.tick({ actions: [resolve()] });

        const interrupted = world();
        interrupted.tick({ actions: [evaluate()] });
        interrupted.tick({ actions: [dispatch()] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(interrupted.serialize())));

        // raid entity, faction stash, and faction history all survive the round-trip
        expect(restored.raids.get('raid-1')).toMatchObject({ status: 'RAIDING', force: 10, bagSize: 30 });
        expect(restored.factions.get('raiders').loot).toBe(20);
        expect(restored.factions.get('holders').loot).toBe(50);
        expect(restored.factions.get('raiders').history).toHaveLength(1);

        restored.tick({ actions: [resolve()] });
        expect(restored.auditEventGraph().ok).toBe(true);
        expect(restored.serialize()).toEqual(control.serialize()); // bit-for-bit identical continuation
    });

    it('is deterministic across identical seeded worlds', () => {
        const run = () => {
            const society = world();
            society.tick({ actions: [evaluate()] });
            society.tick({ actions: [dispatch()] });
            society.tick({ actions: [resolve()] });
            return JSON.stringify(society.serialize());
        };
        expect(run()).toBe(run());
    });
});
