import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-FACTION-AUTONOMOUS-TICK-001 — the macro layer runs autonomously: one
// FACTION_MACRO_TICK action gives every registered faction a turn with no manual targeting.
// The target is the richest other registered faction (stable sort → insertion order breaks
// loot ties), the context is the faction's own numeric state, and each turn flows through
// the production FACTION_EVALUATION → raid chain as one TURN → MACRO lineage. Fewer than
// two factions means no counterpart: the macro event alone, never a throw.
// Mutants pinned: richest-target rule broken (first-other instead of richest); turn context
// dropped (raid utility never sees the faction's need → every chain de-escalates); worldStep
// factionTurns flag ignored.

const world = (seed = 63) => {
    const society = new SocietyCore({ seed });
    society.addFaction('raiders', { militaryConfidence: .6, loot: 20, resourceNeed: .9, opportunity: .9, anger: .1 });
    society.addFaction('holders', { militaryConfidence: .5, loot: 50, grievance: .1 });
    return society;
};
const macro = () => ({ kind: 'FACTION_MACRO_TICK' });
const eventsOf = (society, type) => society.events.filter(event => event.type === type);
const totalLoot = society => [...society.factions.values()].reduce((sum, faction) => sum + faction.loot, 0);
const chainTypes = ['TURN', 'FACTION_MACRO_TICK', 'FACTION_EVALUATION', 'FACTION_RAID_EVALUATION', 'FACTION_RAID_DISPATCH', 'FACTION_RAID_RESOLUTION'];

describe('RESP-FACTION-AUTONOMOUS-TICK-001: autonomous faction macro turns', () => {
    it('runs every faction turn autonomously — raiders raid through the full chain, holders just evaluate', () => {
        const society = world();
        society.tick({ actions: [macro()] });

        const [tick] = eventsOf(society, 'FACTION_MACRO_TICK');
        expect(tick.factions).toEqual(['raiders', 'holders']);
        const evals = eventsOf(society, 'FACTION_EVALUATION');
        expect(evals).toHaveLength(2);
        expect(evals.every(event => event.parentId === tick.id)).toBe(true); // turns chain off the macro event

        const [resolution] = eventsOf(society, 'FACTION_RAID_RESOLUTION');
        expect(society.causalChain(resolution.id).lineage.map(event => event.type)).toEqual(chainTypes);
        expect(resolution.victory).toBe(true);
        expect(resolution.stolen).toBe(25); // bag = half of holders' 50, confidence math 6 > 5 + roll
        expect(society.factions.get('raiders').loot).toBe(45);
        expect(totalLoot(society)).toBe(70); // conserved
        // only raiders raided: holders' own state has no raid need (resourceNeed 0 → RAID invalid)
        expect(eventsOf(society, 'FACTION_RAID_EVALUATION')).toHaveLength(1);
        const holdersEval = evals.find(event => event.factionId === 'holders');
        expect(['HOLD', 'PATROL']).toContain(holdersEval.selected);
        expect(holdersEval.targetId).toBe('raiders'); // richest other — now the post-raid stash
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('picks the richest other faction as target, breaking loot ties by insertion order', () => {
        const society = new SocietyCore({ seed: 31 });
        society.addFaction('raiders', { militaryConfidence: .6, loot: 20, resourceNeed: .9, opportunity: .9 });
        society.addFaction('broke', { loot: 5 }); // registered BEFORE holders: first-other ≠ richest
        society.addFaction('holders', { militaryConfidence: .5, loot: 50 });
        society.tick({ actions: [macro()] });

        const evals = eventsOf(society, 'FACTION_EVALUATION');
        expect(evals.find(event => event.factionId === 'raiders').targetId).toBe('holders'); // richest, not 'broke'
        expect(evals.find(event => event.factionId === 'broke').targetId).toBe('raiders'); // 45 > 25 after the raid
        expect(evals.find(event => event.factionId === 'holders').targetId).toBe('raiders'); // 45 > 5

        // equal loot → stable sort keeps registration order
        const tie = new SocietyCore({ seed: 32 });
        tie.addFaction('x', { loot: 10 });
        tie.addFaction('y', { loot: 10 });
        tie.addFaction('z', { loot: 10 });
        tie.tick({ actions: [macro()] });
        const tieEvals = eventsOf(tie, 'FACTION_EVALUATION');
        expect(tieEvals.find(event => event.factionId === 'x').targetId).toBe('y');
        expect(tieEvals.find(event => event.factionId === 'y').targetId).toBe('x');
        expect(tieEvals.find(event => event.factionId === 'z').targetId).toBe('x');
        expect(tie.auditEventGraph().ok).toBe(true);
    });

    it('stays peaceful autonomously: no raid need → turns without any raid events', () => {
        const society = new SocietyCore({ seed: 4 });
        society.addFaction('quiet-a', { loot: 30, militaryConfidence: .5 });
        society.addFaction('quiet-b', { loot: 20, militaryConfidence: .5 });
        society.tick({ actions: [macro()] });

        const [tick] = eventsOf(society, 'FACTION_MACRO_TICK');
        expect(eventsOf(society, 'FACTION_EVALUATION')).toHaveLength(2);
        expect(eventsOf(society, 'FACTION_RAID_EVALUATION')).toHaveLength(0);
        expect(society.raids.size).toBe(0);
        expect(totalLoot(society)).toBe(50);
        expect(society.events.filter(event => event.parentId === tick.id)).toHaveLength(2);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('a lone faction has no counterpart: the macro event alone, nothing thrown', () => {
        const society = new SocietyCore({ seed: 5 });
        society.addFaction('alone', { loot: 10 });
        society.tick({ actions: [macro()] });
        const [tick] = eventsOf(society, 'FACTION_MACRO_TICK');
        expect(tick).toMatchObject({ factions: ['alone'] });
        expect(eventsOf(society, 'FACTION_EVALUATION')).toHaveLength(0);
        expect(tick.parentId).toBe(society.events[0].id); // TURN-rooted, committed by the driver
        expect(society.auditEventGraph().ok).toBe(true);

        // empty world too
        const empty = new SocietyCore({ seed: 6 });
        empty.tick({ actions: [macro()] });
        expect(eventsOf(empty, 'FACTION_MACRO_TICK')).toHaveLength(1);
        expect(empty.events).toHaveLength(2); // TURN + macro, no phantom turns
        expect(empty.auditEventGraph().ok).toBe(true);
    });

    it('runs through the production worldStep entry (factionTurns opt-in, default off)', () => {
        const society = world();
        society.worldStep({ factionTurns: true });
        expect(eventsOf(society, 'FACTION_MACRO_TICK')).toHaveLength(1);
        expect(eventsOf(society, 'FACTION_RAID_RESOLUTION')).toHaveLength(1);
        expect(totalLoot(society)).toBe(70);
        expect(society.auditEventGraph().ok).toBe(true);

        const off = world();
        off.worldStep({});
        expect(eventsOf(off, 'FACTION_MACRO_TICK')).toHaveLength(0); // default leaves worlds untouched
        expect(eventsOf(off, 'FACTION_RAID_RESOLUTION')).toHaveLength(0);
    });

    it('continues bit-for-bit identical across save/load', () => {
        const control = world();
        control.tick({ actions: [macro()] });
        control.tick({ actions: [macro()] });

        const interrupted = world();
        interrupted.tick({ actions: [macro()] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(interrupted.serialize())));
        expect(restored.raids.size).toBe(1);
        expect([...restored.raids.values()][0]).toMatchObject({ status: 'SUCCEEDED', factionId: 'raiders', targetId: 'holders' });
        expect(restored.factions.get('raiders').loot).toBe(45);
        expect(restored.auditEventGraph().ok).toBe(true);

        restored.tick({ actions: [macro()] });
        expect(restored.auditEventGraph().ok).toBe(true);
        expect(restored.serialize()).toEqual(control.serialize()); // seeded-identical continuation
    });

    it('is deterministic across identical seeded worlds', () => {
        const run = () => {
            const society = world();
            society.tick({ actions: [macro()] });
            society.tick({ actions: [macro()] });
            return JSON.stringify(society.serialize());
        };
        expect(run()).toBe(run());
    });
});
