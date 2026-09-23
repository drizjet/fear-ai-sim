import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-FACTION-RETALIATION-LOOP-001 — the Factions row's last open leg: a raid RESOLUTION's
// outcome drives the VICTIM into its own counter-raid. The victim's grievance decides
// eligibility (grievanceBefore/grievanceAfter/threshold recorded on the resolution), the
// counter-attack then runs through the PRODUCTION DecisionCore seam (FACTION_EVALUATION →
// FACTION_RAID_EVALUATION → DISPATCH → RESOLUTION) chained off the resolution that struck it,
// and one level of retaliation budget bounds the loop (the counter resolves at depth 0, so it
// can never answer itself). Default threshold .5 keeps every existing world untouched.
// Mutants pinned: counter chain not dispatched (grievance ignored); depth budget removed
// (unbounded recursion); threshold ignored; `retaliate: false` ignored.
// Related production defect fixed in the same change: the fear machine's RNG adapter was
// passed the SOURCE OBJECT instead of a draw (a latent TypeError on the seeded FREEZE roll) —
// pinned by tests/hysteresis-reopen.test.js.

const world = (grievance = .4) => {
    const society = new SocietyCore({ seed: 41 });
    society.addFaction('raiders', { militaryConfidence: .6, loot: 20, anger: .1 });
    society.addFaction('holders', { militaryConfidence: .5, loot: 50, grievance });
    return society;
};

const attack = (society, resolve = {}) => {
    society.tick({ actions: [{ kind: 'FACTION_RAID_EVALUATION', faction: 'raiders', targetId: 'holders', values: { expectedLoot: 5, resourceNeed: 1 } }] });
    society.tick({ actions: [{ kind: 'FACTION_RAID_DISPATCH', raidId: 'raid-1', faction: 'raiders', targetId: 'holders', force: 10, bagSize: 30 }] });
    society.tick({ actions: [{ kind: 'FACTION_RAID_RESOLUTION', raidId: 'raid-1', defense: 0, ...resolve }] });
};

const eventsOf = (society, type) => society.events.filter(event => event.type === type);
const totalLoot = society => [...society.factions.values()].reduce((sum, faction) => sum + faction.loot, 0);

describe('RESP-FACTION-RETALIATION-LOOP-001: the struck faction strikes back', () => {
    it('runs the victim\'s own evaluation → dispatch → resolution chain off the raid that hit it', () => {
        const society = world();
        attack(society);

        const resolutions = eventsOf(society, 'FACTION_RAID_RESOLUTION');
        expect(resolutions).toHaveLength(2);
        const [raid, counter] = resolutions;

        // the attacker's raid: victory, loot taken, and the grievance that arms retaliation
        expect(raid).toMatchObject({ factionId: 'raiders', targetId: 'holders', victory: true, stolen: 30, retaliationEligible: true, retaliationDepth: 1, retaliationThreshold: .5 });
        expect(raid.grievanceBefore).toBeCloseTo(.4, 10);
        expect(raid.grievanceAfter).toBeCloseTo(.55, 10); // .4 + the raid's .15 escalation

        // the victim's decision, made by production DecisionCore, tagged with the raid it answers
        const [evaluation] = eventsOf(society, 'FACTION_EVALUATION');
        expect(evaluation).toMatchObject({ factionId: 'holders', targetId: 'raiders', selected: 'RAID', retaliationOf: 'raid-1' });

        // …and the counter-attack is a real raid with real stakes: the victim's remaining
        // confidence as force, half the attacker's stolen stash as the bag, the attacker's
        // confidence as defense (force 4.5 loses to defense 7 + roll → repulsed)
        const counterRaid = society.raids.get(`${evaluation.id}:raid`);
        expect(counterRaid).toMatchObject({ factionId: 'holders', targetId: 'raiders', force: 4.5, bagSize: 25, status: 'REPULSED', outcome: 'REPULSED', stolen: 0 });
        expect(counter).toMatchObject({ factionId: 'holders', targetId: 'raiders', victory: false, stolen: 0, outcome: 'REPULSED', retaliationEligible: false, retaliationDepth: 0 });
        expect(counter.grievanceBefore).toBe(0);
        expect(counter.grievanceAfter).toBeCloseTo(.05, 10); // the raider is now the aggrieved party

        // the whole retaliation is ONE unbroken lineage rooted at the turn that resolved the raid
        expect(society.causalChain(counter.id).lineage.map(event => event.type)).toEqual([
            'TURN', 'FACTION_RAID_EVALUATION', 'FACTION_RAID_DISPATCH', 'FACTION_RAID_RESOLUTION',
            'FACTION_EVALUATION', 'FACTION_RAID_EVALUATION', 'FACTION_RAID_DISPATCH', 'FACTION_RAID_RESOLUTION',
        ]);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('leaves a lightly aggrieved victim alone — the default threshold is production-off', () => {
        const society = world(0);
        attack(society);

        const [raid] = eventsOf(society, 'FACTION_RAID_RESOLUTION');
        expect(raid).toMatchObject({ retaliationEligible: false, retaliationDepth: 1 });
        expect(raid.grievanceAfter).toBeCloseTo(.15, 10); // one looting is not enough
        expect(eventsOf(society, 'FACTION_RAID_RESOLUTION')).toHaveLength(1);
        expect(eventsOf(society, 'FACTION_EVALUATION')).toHaveLength(0); // no counter-evaluation at all
        expect(society.raids.size).toBe(1);
        expect(society.factions.get('raiders').state.grievance).toBe(0);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('bounds retaliation with the depth budget: the counter resolves at depth 0 and cannot answer itself', () => {
        const society = world();
        attack(society, { retaliationThreshold: 0 }); // lowest possible gate — depth is the only brake left

        const resolutions = eventsOf(society, 'FACTION_RAID_RESOLUTION');
        expect(resolutions.map(event => event.retaliationDepth)).toEqual([1, 0]);
        expect(resolutions.map(event => event.retaliationEligible)).toEqual([true, false]);
        expect(eventsOf(society, 'FACTION_EVALUATION')).toHaveLength(1); // exactly one counter-attempt
        expect(society.raids.size).toBe(2);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('distinguishes a barely aggrieved victim that declines from one switched off entirely', () => {
        // eligible (grievance .15 ≥ the explicit .1 gate) but barely aggrieved: the victim's own
        // DecisionCore weighs the counter-attack and declines it — eligibility is a licence, not
        // a command, so the evaluation is recorded and no raid is dispatched
        const reluctant = world(.1);
        attack(reluctant, { retaliationThreshold: .1, defense: 10 });
        const [raid] = eventsOf(reluctant, 'FACTION_RAID_RESOLUTION');
        expect(raid).toMatchObject({ victory: false, retaliationEligible: true, retaliationThreshold: .1 });
        const [evaluation] = eventsOf(reluctant, 'FACTION_EVALUATION');
        expect(evaluation.retaliationOf).toBe('raid-1');
        expect(evaluation.selected).not.toBe('RAID');
        expect(eventsOf(reluctant, 'FACTION_RAID_RESOLUTION')).toHaveLength(1);
        expect(reluctant.raids.size).toBe(1);
        expect(reluctant.factions.get('holders').loot).toBe(50); // nothing won back

        // switched off: the retaliation seam is skipped before any evaluation exists
        const refusing = world(.4);
        attack(refusing, { retaliate: false });
        const [only] = eventsOf(refusing, 'FACTION_RAID_RESOLUTION');
        expect(only).toMatchObject({ retaliationEligible: false, retaliationDepth: 1 });
        expect(eventsOf(refusing, 'FACTION_EVALUATION')).toHaveLength(0);
        expect(eventsOf(refusing, 'FACTION_RAID_RESOLUTION')).toHaveLength(1);
    });

    it('fires on grievance rather than victory: a repulsed raid still provokes the counter-attack', () => {
        const society = world(.45);
        attack(society, { defense: 10 }); // force 10 vs defense 10 + roll ≥ 0 → always repulsed

        const [raid, counter] = eventsOf(society, 'FACTION_RAID_RESOLUTION');
        expect(raid).toMatchObject({ victory: false, outcome: 'REPULSED' });
        expect(raid.grievanceAfter).toBeCloseTo(.5, 10); // .45 + .05 for being attacked at all
        expect(raid.retaliationEligible).toBe(true);
        expect(counter.targetId).toBe('raiders');
        expect(society.factions.get('raiders').state.grievance).toBeCloseTo(.05, 10);
    });

    it('conserves loot exactly across the raid and its counter-attack', () => {
        const society = world();
        const before = totalLoot(society);
        attack(society);

        expect(before).toBe(70);
        expect(totalLoot(society)).toBe(70);
        expect(society.factions.get('raiders').loot).toBe(50); // +30 stolen
        expect(society.factions.get('holders').loot).toBe(20); // −30 lost, nothing won back
        expect(society.raids.get('raid-1')).toMatchObject({ status: 'SUCCEEDED', outcome: 'LOOT_TAKEN' });
    });

    it('survives save/load mid-chain and continues bit-for-bit identically', () => {
        const control = world();
        attack(control);

        const interrupted = world();
        interrupted.tick({ actions: [{ kind: 'FACTION_RAID_EVALUATION', faction: 'raiders', targetId: 'holders', values: { expectedLoot: 5, resourceNeed: 1 } }] });
        interrupted.tick({ actions: [{ kind: 'FACTION_RAID_DISPATCH', raidId: 'raid-1', faction: 'raiders', targetId: 'holders', force: 10, bagSize: 30 }] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(interrupted.serialize())));

        // nothing retaliation-specific rides outside the serialized world: it all re-derives
        restored.tick({ actions: [{ kind: 'FACTION_RAID_RESOLUTION', raidId: 'raid-1', defense: 0 }] });
        expect(eventsOf(restored, 'FACTION_RAID_RESOLUTION')).toHaveLength(2); // the counter fired after the restore
        expect(restored.auditEventGraph().ok).toBe(true);
        expect(restored.serialize()).toEqual(control.serialize());
    });

    it('is deterministic across identical seeded worlds', () => {
        const run = () => {
            const society = world();
            attack(society);
            return JSON.stringify(society.serialize());
        };
        expect(run()).toBe(run());
    });
});
