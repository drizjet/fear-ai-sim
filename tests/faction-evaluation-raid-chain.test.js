import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-FACTION-EVALUATION-RAID-CHAIN-001 — a production DecisionCore RAID selection
// dispatches through the raid loop it used to only nudge: FACTION_EVALUATION →
// FACTION_RAID_EVALUATION → FACTION_RAID_DISPATCH → FACTION_RAID_RESOLUTION as ONE
// TURN-rooted canonical lineage inside a single action. Reference guards decide the
// skip BEFORE any chain event exists (recorded on the event, never a throw — existing
// worlds evaluate against unregistered targets). Every path returns exactly one
// uncommitted tail event (the turn driver commits it); earlier stages commit here so
// each child resolves its committed parent at allocation time.
// Mutants pinned: chain never executes; resolution stage dropped; reference guard
// removed (throws on unregistered targets); context force/bagSize/defense overrides
// ignored.

const world = (seed = 41) => {
    const society = new SocietyCore({ seed });
    society.addFaction('raiders', { militaryConfidence: .6, loot: 20, anger: .1 });
    society.addFaction('holders', { militaryConfidence: .5, loot: 50, grievance: .1 });
    return society;
};
const evaluate = (context = { opportunity: 1, resourceNeed: 1 }, extra = {}) =>
    ({ kind: 'FACTION_EVALUATION', faction: 'raiders', targetId: 'holders', context, ...extra });
const eventsOf = (society, type) => society.events.filter(event => event.type === type);
const totalLoot = society => [...society.factions.values()].reduce((sum, faction) => sum + faction.loot, 0);
const chainTypes = ['TURN', 'FACTION_EVALUATION', 'FACTION_RAID_EVALUATION', 'FACTION_RAID_DISPATCH', 'FACTION_RAID_RESOLUTION'];

describe('RESP-FACTION-EVALUATION-RAID-CHAIN-001: evaluation to raid dispatch chain', () => {
    it('drives evaluation → raid evaluation → dispatch → resolution from one production RAID choice', () => {
        const society = world();
        society.tick({ actions: [evaluate()] });

        const [decision] = eventsOf(society, 'FACTION_EVALUATION');
        const [raidEval] = eventsOf(society, 'FACTION_RAID_EVALUATION');
        const [dispatch] = eventsOf(society, 'FACTION_RAID_DISPATCH');
        const [resolution] = eventsOf(society, 'FACTION_RAID_RESOLUTION');

        expect(decision.selected).toBe('RAID');
        expect(society.causalChain(resolution.id).lineage.map(event => event.type)).toEqual(chainTypes);
        expect(society.auditEventGraph().ok).toBe(true);

        // raidUtility scored the chain from the SAME context DecisionCore chose from:
        // resourceNeed 1 − retaliationRisk (holders' confidence .5) = .5 → RAID
        expect(raidEval.decision).toBe('RAID');
        expect(raidEval.score).toBeCloseTo(1 - .5, 10);
        expect(society.factions.get('raiders').history.some(entry => entry.target === 'holders' && entry.decision === 'RAID')).toBe(true);

        // defaults: force = attacker confidence ×10 (6), bag = half the target stash (25),
        // defense = defender confidence ×10 (5); 6 > 5 + roll(<1) → always a victory
        expect(dispatch.force).toBe(6);
        expect(dispatch.bagSize).toBe(25);
        expect(resolution.defense).toBe(5);
        expect(resolution.victory).toBe(true);
        expect(resolution.stolen).toBe(25);
        expect(society.raids.get(`${decision.id}:raid`)).toMatchObject({ status: 'SUCCEEDED', outcome: 'LOOT_TAKEN' });
        expect(society.factions.get('raiders').loot).toBe(45);
        expect(society.factions.get('holders').loot).toBe(25);
        expect(totalLoot(society)).toBe(70); // conserved: nothing created or destroyed

        // the legacy RAID nudge still happens on the evaluation event
        expect(decision.resourceNeed).toBe(0);
    });

    it('honors context force/bagSize/defense overrides through the whole chain', () => {
        const society = world();
        society.tick({ actions: [evaluate({ opportunity: 1, resourceNeed: 1, force: 10, bagSize: 30, defense: 10 })] });

        const [decision] = eventsOf(society, 'FACTION_EVALUATION');
        const [dispatch] = eventsOf(society, 'FACTION_RAID_DISPATCH');
        const [resolution] = eventsOf(society, 'FACTION_RAID_RESOLUTION');

        expect(decision.selected).toBe('RAID'); // overrides are not decision considerations
        expect(dispatch.force).toBe(10);
        expect(dispatch.bagSize).toBe(30);
        expect(resolution.force).toBe(10);
        expect(resolution.defense).toBe(10);
        // force 10 vs defense 10 + roll(≥0): never a victory
        expect(resolution.victory).toBe(false);
        expect(resolution.stolen).toBe(0);
        expect(totalLoot(society)).toBe(70);
        expect(society.raids.get(`${decision.id}:raid`)).toMatchObject({ status: 'REPULSED' });
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('stops at a REJECTED dispatch when the raid evaluation de-escalates', () => {
        const society = world();
        society.tick({ actions: [evaluate({ opportunity: 1, resourceNeed: 1, diplomaticCost: 10 })] });

        const [decision] = eventsOf(society, 'FACTION_EVALUATION');
        const [raidEval] = eventsOf(society, 'FACTION_RAID_EVALUATION');
        const [dispatch] = eventsOf(society, 'FACTION_RAID_DISPATCH');

        // DecisionCore still chose RAID (diplomaticCost is not a decision consideration),
        // but raidUtility refused: resourceNeed 1 − diplomaticCost 10 − retaliation .5 < 0
        expect(decision.selected).toBe('RAID');
        expect(raidEval.decision).toBe('DEESCALATE');
        expect(dispatch).toMatchObject({ status: 'REJECTED', reason: 'NOT_RAID_WORTHY' });
        expect(society.causalChain(dispatch.id).lineage.map(event => event.type)).toEqual(chainTypes.slice(0, 4));
        expect(eventsOf(society, 'FACTION_RAID_RESOLUTION')).toHaveLength(0);
        expect(society.raids.size).toBe(0); // no raid entity, no mutation
        expect(totalLoot(society)).toBe(70);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('records a skip instead of throwing when the target is not a registered distinct faction', () => {
        const unregistered = world();
        unregistered.tick({ actions: [{ kind: 'FACTION_EVALUATION', faction: 'raiders', targetId: 'rival', context: { opportunity: 1, resourceNeed: 1 } }] });
        const [decision] = eventsOf(unregistered, 'FACTION_EVALUATION');
        expect(decision.selected).toBe('RAID');
        expect(decision.raidChain).toBe('SKIPPED_TARGET_NOT_REGISTERED');
        expect(eventsOf(unregistered, 'FACTION_RAID_EVALUATION')).toHaveLength(0);
        expect(unregistered.raids.size).toBe(0);
        expect(unregistered.auditEventGraph().ok).toBe(true);

        const self = world();
        self.tick({ actions: [{ kind: 'FACTION_EVALUATION', faction: 'raiders', targetId: 'raiders', context: { opportunity: 1, resourceNeed: 1 } }] });
        const [selfDecision] = eventsOf(self, 'FACTION_EVALUATION');
        expect(selfDecision.selected).toBe('RAID');
        expect(selfDecision.raidChain).toBe('SKIPPED_SELF_TARGET');
        expect(self.raids.size).toBe(0);
        expect(self.auditEventGraph().ok).toBe(true);
    });

    it('leaves non-RAID selections untouched — no chain, no marker, legacy behavior byte-identical', () => {
        const society = world();
        society.tick({ actions: [evaluate({ security: 1, opportunity: 0, resourceNeed: 0 })] });

        const [decision] = eventsOf(society, 'FACTION_EVALUATION');
        expect(decision.selected).toBe('PATROL');
        expect(decision.raidChain).toBeUndefined();
        expect(eventsOf(society, 'FACTION_RAID_EVALUATION')).toHaveLength(0);
        expect(society.raids.size).toBe(0);
        expect(decision.supplySecurity).toBeCloseTo(.6, 10); // legacy +.1 patrol nudge intact
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('chains through the production worldStep entry, not just raw tick actions', () => {
        const society = world();
        society.worldStep({ faction: 'raiders', factionTarget: 'holders', factionContext: { opportunity: 1, resourceNeed: 1 } });

        const [resolution] = eventsOf(society, 'FACTION_RAID_RESOLUTION');
        expect(resolution).toBeDefined();
        expect(society.causalChain(resolution.id).lineage.map(event => event.type)).toEqual(chainTypes);
        expect(resolution.victory).toBe(true);
        expect(totalLoot(society)).toBe(70);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('continues bit-for-bit identical across save/load', () => {
        const control = world();
        control.tick({ actions: [evaluate()] });

        const interrupted = world();
        interrupted.tick({ actions: [evaluate()] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(interrupted.serialize())));

        // raid entity, faction stashes, faction history, and the committed chain survive
        expect(restored.raids.size).toBe(1);
        expect([...restored.raids.values()][0]).toMatchObject({ status: 'SUCCEEDED', factionId: 'raiders', targetId: 'holders' });
        expect(restored.factions.get('raiders').loot).toBe(45);
        expect(restored.factions.get('holders').loot).toBe(25);
        expect(restored.factions.get('raiders').history).toHaveLength(2); // decision + evaluateRaid
        expect(restored.auditEventGraph().ok).toBe(true);

        control.tick({ actions: [evaluate()] });
        restored.tick({ actions: [evaluate()] });
        expect(restored.auditEventGraph().ok).toBe(true);
        expect(restored.serialize()).toEqual(control.serialize()); // seeded-identical continuation
    });

    it('is deterministic across identical seeded worlds', () => {
        const run = () => {
            const society = world();
            society.tick({ actions: [evaluate()] });
            society.tick({ actions: [evaluate()] });
            return JSON.stringify(society.serialize());
        };
        expect(run()).toBe(run());
    });
});
