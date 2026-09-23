import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-FACTION-GRIEVANCE-ECONOMY-001 — the grievance a victim carries used to be scripted: only
// a raid resolution or a justice outcome ever moved it, so an ordinary world could never reach
// the .5 retaliation gate on its own. Now being hurt breeds resentment as well as fear (half a
// point of grievance per applied point of fear, recorded on FEAR_EVENT_RAISED as
// factionGrievanceAfter), resentments RENEW on every gain (grievanceTick) and cool only while
// nothing renews them (5 idle ticks, then .01 per world tick, floored at zero), and the TURN
// event records how many resentments the pass cooled. Retaliation stays a live gate: cooling
// disarms it again. Mutants pinned: fear→grievance channel dropped; renewal tick not stamped;
// cooldown ignored (cooling on the very next tick); cooling never applied; cooling allowed below
// zero; cooling count not recorded on TURN.
// Related defect fixed in the same change: `grievanceTick` had to round-trip through faction
// save/load or a restored world would cool immediately (pinned by the round-trip test).

const world = () => {
    const society = new SocietyCore({ seed: 21 });
    society.addFaction('raiders', { loot: 400, militaryConfidence: .8 });
    society.addFaction('holders', { loot: 200, militaryConfidence: .4 });
    return society;
};

const wound = (society, amount, source = 'war', factionId = 'holders') =>
    society.tick({ actions: [{ kind: 'PLAYER_DAMAGE', amount, factionId, source }] });

const raid = (society, id = 'r1', force = 10, bagSize = 5) => {
    society.tick({ actions: [{ kind: 'FACTION_RAID_EVALUATION', faction: 'raiders', targetId: 'holders', values: { expectedLoot: 5, resourceNeed: 1 } }] });
    society.tick({ actions: [{ kind: 'FACTION_RAID_DISPATCH', raidId: id, faction: 'raiders', targetId: 'holders', force, bagSize }] });
    society.tick({ actions: [{ kind: 'FACTION_RAID_RESOLUTION', raidId: id, defense: 0 }] });
};

const resolutions = society => society.events.filter(event => event.type === 'FACTION_RAID_RESOLUTION');
const turns = society => society.events.filter(event => event.type === 'TURN');
const grievanceOf = (society, id) => society.factions.get(id).state.grievance;

describe('RESP-FACTION-GRIEVANCE-ECONOMY-001: hurt breeds resentment that must be renewed', () => {
    it('feeds grievance from applied fear at the documented rate and records it on the fear event', () => {
        const society = world();
        wound(society, 40);

        // pressureGain = applied damage (40) → baseFearGain .4 → grievance += .4 × .5 = .2
        const fear = society.events.find(event => event.type === 'FEAR_EVENT_RAISED');
        expect(fear).toMatchObject({ factionId: 'holders', baseFearGain: .4, fearGainApplied: .4, factionGrievanceAfter: .2 });
        expect(grievanceOf(society, 'holders')).toBeCloseTo(.2, 10);
        expect(grievanceOf(society, 'raiders')).toBe(0);
    });

    it('breeds more resentment from a bigger wound and none at all without one', () => {
        const small = world();
        const large = world();
        wound(small, 10);
        wound(large, 40);
        expect(grievanceOf(small, 'holders')).toBeCloseTo(.05, 10);
        expect(grievanceOf(large, 'holders')).toBeCloseTo(.2, 10);

        // a wound with no faction still raises war pressure but can breed no resentment
        const lone = world();
        societyTickWithoutFaction(lone, 40);
        expect(grievanceOf(lone, 'holders')).toBe(0);
    });

    it('renews on every gain, so sustained pressure never cools', () => {
        const society = world();
        for (let i = 0; i < 10; i++) wound(society, 10, 'war');
        // every tick was a renewal: cooling never fired and the grievance only ever rose
        expect(turns(society).map(turn => turn.grievanceCooling)).toEqual(Array(10).fill(0));
        const readings = society.events.filter(event => event.type === 'FEAR_EVENT_RAISED').map(event => event.factionGrievanceAfter);
        expect(readings).toEqual([...readings].sort((a, b) => a - b));
        expect(grievanceOf(society, 'holders')).toBeGreaterThan(readings[0]);
    });

    it('cools idle resentments only after the cooldown, from the last renewal', () => {
        const society = world();
        wound(society, 40); // renewal at world tick 1, grievance .2
        for (let i = 0; i < 10; i++) society.tick();
        // the wound's own turn plus ticks 2..5 are inside the 5-tick cooldown (idle 1..4) → no
        // cooling; from tick 6 on (idle ≥ 5) every turn sheds exactly .01
        expect(turns(society).map(turn => turn.grievanceCooling)).toEqual([0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
        expect(grievanceOf(society, 'holders')).toBeCloseTo(.2 - .06, 10);
    });

    it('floors cooling at zero and keeps cooling a faction with nothing left to shed at zero', () => {
        const society = world();
        wound(society, 10); // grievance .05, cooled away in five ticks
        for (let i = 0; i < 20; i++) society.tick();
        expect(grievanceOf(society, 'holders')).toBe(0);
        // past the floor the pass stops reporting the faction as cooled
        expect(turns(society).at(-1).grievanceCooling).toBe(0);
    });

    it('counts every cooled faction on the TURN event', () => {
        const society = world();
        wound(society, 40, 'war', 'holders');
        wound(society, 40, 'war', 'raiders');
        for (let i = 0; i < 8; i++) society.tick();
        expect(turns(society).at(-1).grievanceCooling).toBe(2);
    });

    it('arms a retaliation the world never scripted — wounds plus one raid reach the gate', () => {
        const society = world();
        for (let i = 0; i < 3; i++) wound(society, 40);
        expect(grievanceOf(society, 'holders')).toBeCloseTo(.5716, 4); // .2 + habituation-attenuated repeats
        expect(resolutions(society)).toHaveLength(0);

        raid(society);

        // the raid's own .15 tops an already-resentful faction over the gate, and the counter
        // is a real raid dispatched by production DecisionCore
        const [strike, counter] = resolutions(society);
        expect(strike).toMatchObject({ factionId: 'raiders', targetId: 'holders', victory: true, retaliationEligible: true, retaliationDepth: 1 });
        expect(strike.grievanceAfter).toBeCloseTo(.7216, 4);
        expect(counter).toMatchObject({ factionId: 'holders', targetId: 'raiders', retaliationDepth: 0 });
        expect([...society.raids.values()].some(entry => entry.factionId === 'holders' && entry.targetId === 'raiders')).toBe(true);
    });

    it('cools the resentment back below the gate, so retaliation disarms again', () => {
        const society = world();
        wound(society, 40); // .2 — well under the gate
        for (let i = 0; i < 25; i++) society.tick();
        expect(grievanceOf(society, 'holders')).toBe(0);

        raid(society);

        const [strike] = resolutions(society);
        expect(strike).toMatchObject({ victory: true, retaliationEligible: false });
        expect(strike.grievanceAfter).toBeCloseTo(.15, 10); // the raid alone, no accumulated scar
        expect(resolutions(society)).toHaveLength(1); // no counter-raid
    });

    it('round-trips the resentment and its renewal tick, and continues seeded-identically', () => {
        const society = world();
        wound(society, 40);
        for (let i = 0; i < 2; i++) society.tick();

        const restored = SocietyCore.deserialize(society.serialize());
        expect(grievanceOf(restored, 'holders')).toBeCloseTo(.2, 10);
        expect(restored.factions.get('holders').state.grievanceTick).toBe(1);

        // the restored world must cool on the SAME schedule — not immediately
        for (let i = 0; i < 6; i++) { society.tick(); restored.tick(); }
        expect(turns(restored).map(turn => turn.grievanceCooling)).toEqual(turns(society).map(turn => turn.grievanceCooling));
        expect(grievanceOf(restored, 'holders')).toBeCloseTo(grievanceOf(society, 'holders'), 12);
        expect(grievanceOf(restored, 'holders')).toBeLessThan(.2); // it did cool, on schedule
    });
});

// A wound with no factionId: war pressure rises, no faction is named, so no resentment.
function societyTickWithoutFaction(society, amount) {
    return society.tick({ actions: [{ kind: 'PLAYER_DAMAGE', amount, source: 'lone' }] });
}
