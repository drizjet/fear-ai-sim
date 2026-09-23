import { describe, expect, it } from '@jest/globals';
import { SocietyCore } from '../societycore.js';

// RESP-AUTONOMOUS-COMBAT-TICK-001 — the macro COMBAT tick. `FACTION_MACRO_TICK` gave the macro layer
// an autonomous turn and `COMBAT_DEPLOY`/`COMBAT_ENGAGEMENT` gave the society world actors that can
// fight, but nobody fought on its own: every engagement was an explicit caller action.
// `COMBAT_MACRO_TICK` joins the two — every faction with LIVING actors runs its OWN production
// evaluation (the `FactionRuntime.evaluateAction` seam `FACTION_EVALUATION` drives, on its own
// numeric state), names the richest counterpart that still has actors (resolved WHEN the turn runs,
// so a fight that already resolved reshapes the loot map), and a hostile selection dispatches ONE
// engagement between the two factions' actors as the same TURN-rooted single-tail chain. A faction
// whose evaluation declines records DECLINED and fights nothing, so the production decision is
// load-bearing rather than decorative.
//
// Contract pinned here, not just behavior: EVERY faction turn writes exactly one
// COMBAT_MACRO_EVALUATION, which is what makes the tail this case hands back always its own
// uncommitted event. The first draft committed a tail at the top of the next iteration and then
// returned that same event whenever a later faction sat out, so `tick` threw "Duplicate event id"
// on perfectly ordinary worlds — the NO_ACTORS and NO_COUNTERPART cases below are regression
// controls for that hazard (they assert id uniqueness and seq continuity, which is exactly what the
// double commit broke), alongside the reason recorded for each faction that sits out.
//
// Mutants to pin by isolated runs: activation dropped (the tick never engages at all); the
// evaluation made decorative (engage regardless of `selected` → the DECLINED case dies); the
// richest-counterpart rule broken (first-other instead of richest → the three-faction case dies);
// the counterpart not re-resolved at turn time (the wiped-out faction engages anyway → the
// NO_ACTORS case dies); the sum-out reason dropped (NO_ACTORS/NO_COUNTERPART conflated); the
// evaluation not chained off the macro event; the engagement run off the macro instead of off the
// faction's own evaluation; `worldStep`'s `combatTurns` flag ignored; the fear exposures dropped
// (the fear-seam case dies); the learned-danger record dropped from autonomous casualties (the
// migration case dies); `combat` dropped from serialize (the round-trip case dies).

const LOCATION = { x: 100, y: 50 };
// The production evaluation decides: this state makes the RAID candidate win (high
// resourceNeed/opportunity — the two terms `raidUtility` scores — and no legitimacy to hold on).
const hungry = loot => ({ militaryConfidence: .5, supplySecurity: .1, anger: .2, loot, resourceNeed: .95, opportunity: .95, legitimacy: 0 });
const eager = { militaryConfidence: 1, supplySecurity: .1, anger: .5, loot: 60, resourceNeed: .95, opportunity: .95, legitimacy: 0 };
const fragile = { militaryConfidence: .1, supplySecurity: .1, loot: 10, legitimacy: 0 };
const macro = () => ({ kind: 'COMBAT_MACRO_TICK' });
const deploy = (unit, faction, extra = {}) => ({ kind: 'COMBAT_DEPLOY', unit, faction, location: LOCATION, ...extra });
const eventsOf = (society, type) => society.events.filter(event => event.type === type);
const evalsOf = society => eventsOf(society, 'COMBAT_MACRO_EVALUATION');
const evalOf = (society, factionId) => evalsOf(society).find(event => event.factionId === factionId);
const foughtWorld = (seed, hp = 200) => {
    const society = new SocietyCore({ seed });
    society.addFaction('north', hungry(60));
    society.addFaction('south', hungry(30));
    society.tick({ actions: [deploy('n1', 'north', { maxHp: hp }), deploy('s1', 'south', { maxHp: hp }), macro()] });
    return society;
};
// One autonomous tick raises two exposures (defender first — it is the side that was struck).
const raidCycles = (society, cycles) => {
    for (let index = 1; index <= cycles; index += 1) {
        society.tick({ actions: [deploy(`n${index}`, 'north', { maxHp: 80 }), deploy(`s${index}`, 'south', { maxHp: 2 }), macro()] });
    }
    return society;
};

describe('RESP-AUTONOMOUS-COMBAT-TICK-001: factions fight on their own', () => {
    it('fights a whole engagement without any caller engagement action, as one TURN-rooted chain', () => {
        const society = new SocietyCore({ seed: 7 });
        society.addFaction('north', eager);
        society.addFaction('south', fragile);
        society.tick({ actions: [deploy('n1', 'north', { maxHp: 80 }), deploy('s1', 'south', { maxHp: 3 }), macro()] });

        const [resolution] = eventsOf(society, 'COMBAT_ENGAGEMENT_RESOLVED');
        // No COMBAT_ENGAGEMENT action was ever issued above — the tick produced this by itself.
        expect(society.causalChain(resolution.id).lineage.map(event => event.type)).toEqual([
            'TURN', 'COMBAT_MACRO_TICK', 'COMBAT_MACRO_EVALUATION', 'COMBAT_ENGAGEMENT_STARTED', 'COMBAT_STRIKE',
            'COMBAT_CASUALTY', 'FEAR_EVENT_RAISED', 'FEAR_HABITUATED', 'FEAR_EVENT_RAISED', 'FEAR_HABITUATED',
            'COMBAT_ENGAGEMENT_RESOLVED',
        ]);
        expect(eventsOf(society, 'COMBAT_ENGAGEMENT_STARTED')).toHaveLength(1);
        expect(resolution.outcome).toBe('ATTACKER_VICTORY');
        expect(resolution.casualtyCount).toBe(1);
        expect(resolution.attackerId).toBe('n1');
        expect(resolution.defenderId).toBe('s1');
        expect(resolution.engagementId).toBe('north->south@1');
        expect(evalOf(society, 'north')).toMatchObject({ targetId: 'south', selected: 'RAID', willEngage: true, engagementId: 'north->south@1', reason: null });
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('gives every faction with living actors its own turn, and both sides can engage', () => {
        const society = foughtWorld(7);
        const [macroEvent] = eventsOf(society, 'COMBAT_MACRO_TICK');

        const evaluations = evalsOf(society);
        expect(evaluations).toHaveLength(2);
        // Every faction turn chains off the tick that opened it, not off the previous faction's turn.
        expect(evaluations.map(event => event.parentId)).toEqual([macroEvent.id, macroEvent.id]);
        expect(evaluations.map(event => event.engagementId)).toEqual(['north->south@1', 'south->north@1']);
        expect(eventsOf(society, 'COMBAT_ENGAGEMENT_RESOLVED').map(event => [event.attackerId, event.defenderId]))
            .toEqual([['n1', 's1'], ['s1', 'n1']]);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('names the richest counterpart that still has actors, resolved when the turn runs', () => {
        const society = new SocietyCore({ seed: 9 });
        society.addFaction('a', hungry(50));
        society.addFaction('b', hungry(30));
        society.addFaction('c', hungry(10));
        society.tick({ actions: ['a', 'b', 'c'].map(id => deploy(`${id}1`, id)).concat([macro()]) });

        // c names a (the richest at its turn — no loot has moved), never a neighbour's leftovers.
        expect(evalsOf(society).map(event => [event.factionId, event.targetId]))
            .toEqual([['a', 'b'], ['b', 'a'], ['c', 'a']]);
        expect(eventsOf(society, 'COMBAT_MACRO_TICK')[0].roster).toEqual({ a: ['a1'], b: ['b1'], c: ['c1'] });
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('sits a faction out once its actors are gone, and still returns exactly one uncommitted tail', () => {
        const society = new SocietyCore({ seed: 7 });
        society.addFaction('north', eager);
        society.addFaction('south', fragile);
        society.tick({ actions: [deploy('n1', 'north', { maxHp: 80 }), deploy('s1', 'south', { maxHp: 2 }), macro()] });

        expect(evalsOf(society).map(event => [event.factionId, event.reason]))
            .toEqual([['north', null], ['south', 'NO_ACTORS']]);
        expect(evalOf(society, 'south')).toMatchObject({ targetId: null, selected: null, willEngage: false, engagementId: null, alternatives: [] });
        // The regression pin: the tick handed back a tail it had already committed exactly here.
        const ids = society.events.map(event => event.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(society.eventSeq).toBe(society.events.length);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('records NO_COUNTERPART for a faction left with nobody standing to fight', () => {
        const society = new SocietyCore({ seed: 7 });
        society.addFaction('a', eager);
        society.addFaction('b', { militaryConfidence: .9, supplySecurity: .5, anger: .2, loot: 20, legitimacy: 0 });
        // a raids with one fragile actor: b survives the exchange and a is wiped out, so b's own turn
        // has actors but nobody left to name.
        society.tick({ actions: [deploy('a1', 'a', { maxHp: 3 }), deploy('b1', 'b', { maxHp: 200 }), macro()] });

        expect(evalsOf(society).map(event => [event.factionId, event.selected, event.reason]))
            .toEqual([['a', 'RAID', null], ['b', null, 'NO_COUNTERPART']]);
        const [resolution] = eventsOf(society, 'COMBAT_ENGAGEMENT_RESOLVED');
        expect(resolution.outcome).toBe('DEFENDER_HELD');
        expect(society.combat.actor('a1').alive).toBe(false);
        expect(society.combat.actor('b1').alive).toBe(true);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('fights nothing when a faction\'s own production evaluation declines', () => {
        const society = new SocietyCore({ seed: 7 });
        society.addFaction('north', eager);
        society.addFaction('south', { militaryConfidence: .2, supplySecurity: .9, loot: 10, legitimacy: .9 });
        society.tick({ actions: [deploy('n1', 'north', { maxHp: 80 }), deploy('s1', 'south', { maxHp: 80 }), macro()] });

        expect(evalsOf(society).map(event => [event.factionId, event.selected, event.willEngage, event.reason]))
            .toEqual([['north', 'RAID', true, null], ['south', 'HOLD', false, 'DECLINED']]);
        expect(evalOf(society, 'south').engagementId).toBeNull();
        expect(eventsOf(society, 'COMBAT_ENGAGEMENT_RESOLVED')).toHaveLength(1);
        expect(eventsOf(society, 'COMBAT_STRIKE')).toHaveLength(2); // one blow per side in the single round
        // The declining faction's actor was hit but never struck back.
        expect(society.combat.actor('n1').hp).toBe(80);
        expect(society.combat.actor('s1').hp).toBeCloseTo(72.76, 2);
    });

    it('is gated by that evaluation, not by a hardcoded rule', () => {
        // Same two factions, same actors, same tick — only the terms the production RAID candidate
        // scores are left at zero, and nobody fights.
        const society = new SocietyCore({ seed: 7 });
        society.addFaction('north', { militaryConfidence: 1, supplySecurity: .1, anger: .5, loot: 60, legitimacy: 0 });
        society.addFaction('south', { militaryConfidence: .2, supplySecurity: .9, loot: 10, legitimacy: .9 });
        society.tick({ actions: [deploy('n1', 'north', { maxHp: 80 }), deploy('s1', 'south', { maxHp: 80 }), macro()] });

        expect(evalsOf(society).map(event => [event.factionId, event.selected, event.willEngage]))
            .toEqual([['north', 'PATROL', false], ['south', 'HOLD', false]]);
        expect(eventsOf(society, 'COMBAT_ENGAGEMENT_RESOLVED')).toHaveLength(0);
        expect(eventsOf(society, 'COMBAT_STRIKE')).toHaveLength(0);
        expect(society.combat.actor('n1').hp).toBe(80);
        expect(society.auditEventGraph().ok).toBe(true);
    });

    it('sends an autonomous fight through the ONE fear seam, where habituation attenuates it', () => {
        const society = new SocietyCore({ seed: 7 });
        society.addFaction('north', eager);
        society.addFaction('south', fragile);
        raidCycles(society, 3);

        const raised = eventsOf(society, 'FEAR_EVENT_RAISED');
        expect(raised.map(event => event.factionId)).toEqual(['south', 'north', 'south', 'north', 'south', 'north']);
        expect(raised.every(event => event.source === 'combat')).toBe(true);
        expect(raised.map(event => event.engagementId)).toEqual(['north->south@1', 'north->south@1', 'north->south@2', 'north->south@2', 'north->south@3', 'north->south@3']);
        expect(raised[0].baseFearGain).toBe(.05);
        expect(raised[0].fearGainApplied).toBe(.05);
        // Habituation is the same book the production player-damage path attenuates against, and the
        // third exposure of the same stimulus type lands softer than it was ordered.
        expect(eventsOf(society, 'FEAR_HABITUATED').map(event => event.exposureCount)).toEqual([1, 1, 2, 2, 3, 3]);
        expect(raised[4].habituationLevel).toBeGreaterThan(0);
        expect(raised[4].fearGainApplied).toBeLessThan(raised[4].baseFearGain);
        expect(society.factions.get('north').state.fear).toBeCloseTo(.1429, 4);
        expect(society.factions.get('south').state.fear).toBeCloseTo(.1429, 4);
        // A wound from the player, tagged with the same stimulus, is attenuated by the fighting that
        // came before it — one seam, not two parallel fear paths.
        society.executeAction({ kind: 'PLAYER_DAMAGE', amount: 10, factionId: 'north', source: 'combat' }, null);
        const playerExposure = eventsOf(society, 'FEAR_EVENT_RAISED').at(-1);
        expect(playerExposure.factionId).toBe('north');
        expect(playerExposure.source).toBe('combat');
        expect(playerExposure.baseFearGain).toBe(.1);
        expect(playerExposure.fearGainApplied).toBeLessThan(playerExposure.baseFearGain);
        // ... and it books against the SAME habituation key the fighting built up for that faction.
        expect(eventsOf(society, 'FEAR_HABITUATED').at(-1).stimulusKey).toBe('combat:north');
        const [resolution] = eventsOf(society, 'COMBAT_ENGAGEMENT_RESOLVED');
        expect(resolution.fearExposures.map(entry => entry.factionId)).toEqual(['south', 'north']);
        expect(resolution.fearGainPerFaction).toBe(.05);
        // The band contract sees it too: an autonomous fight moves fear transitions on its own.
        expect(eventsOf(society, 'FEAR_STATE_TRANSITION').length + eventsOf(society, 'FEARCORE_BAND_TRANSITION').length).toBeGreaterThan(0);
    });

    it('makes a place learned-dangerous from autonomous casualties, and migration consumes it', () => {
        const society = new SocietyCore({ seed: 7 });
        society.addFaction('north', eager);
        society.addFaction('south', fragile);
        raidCycles(society, 3);

        // Three autonomous ticks, three deaths in one 50-unit cell: the legacy `danger > 2` gate.
        expect(eventsOf(society, 'COMBAT_CASUALTY')).toHaveLength(3);
        expect(society.combat.dangerCount(LOCATION.x, LOCATION.y)).toBe(3);
        expect(society.combat.isDangerousZone(LOCATION.x, LOCATION.y)).toBe(true);
        society.tick({ actions: [{ kind: 'MIGRATION_EVALUATION', faction: 'south', location: LOCATION, fear: 0, foodSecurity: 1 }] });
        const migration = eventsOf(society, 'MIGRATION_EVALUATION').at(-1);
        expect(migration.learnedDanger).toBe(1);
        expect(migration.routeDanger).toBe(1);
        expect(migration.pressure).toBeCloseTo(.4, 4);
        // The control: the same evaluation somewhere nobody has died.
        const clean = society.executeAction({ kind: 'MIGRATION_EVALUATION', faction: 'south', location: { x: 900, y: 900 }, fear: 0, foodSecurity: 1 }, null);
        expect(clean.learnedDanger).toBe(0);
        expect(clean.pressure).toBeCloseTo(.1, 4);
        expect(clean.pressure).toBeLessThan(migration.pressure);
    });

    it('leaves the macro event alone when no counterpart can be fought', () => {
        const lonely = new SocietyCore({ seed: 3 });
        lonely.addFaction('lonely', hungry(20));
        lonely.tick({ actions: [deploy('l1', 'lonely', { maxHp: 50 }), macro()] });
        expect(eventsOf(lonely, 'COMBAT_MACRO_TICK')).toHaveLength(1);
        expect(evalsOf(lonely)).toHaveLength(0);
        expect(eventsOf(lonely, 'COMBAT_ENGAGEMENT_RESOLVED')).toHaveLength(0);

        const bare = new SocietyCore({ seed: 3 });
        bare.addFaction('x', {});
        bare.addFaction('y', {});
        bare.tick({ actions: [macro()] });
        expect(eventsOf(bare, 'COMBAT_MACRO_TICK')).toHaveLength(1);
        expect(evalsOf(bare)).toHaveLength(0);
        expect(bare.auditEventGraph().ok).toBe(true);
    });

    it('runs through the world-step entry only when asked', () => {
        const build = () => {
            const society = new SocietyCore({ seed: 5 });
            society.addFaction('a', hungry(40));
            society.addFaction('b', hungry(10));
            society.tick({ actions: [deploy('a1', 'a'), deploy('b1', 'b')] });
            return society;
        };
        const off = build();
        off.worldStep();
        expect(eventsOf(off, 'COMBAT_MACRO_TICK')).toHaveLength(0);
        expect(eventsOf(off, 'COMBAT_ENGAGEMENT_RESOLVED')).toHaveLength(0);

        const on = build();
        on.worldStep({ combatTurns: true });
        expect(eventsOf(on, 'COMBAT_MACRO_TICK')).toHaveLength(1);
        // Both factions want something here, so both sides fight in the one tick.
        expect(eventsOf(on, 'COMBAT_ENGAGEMENT_RESOLVED')).toHaveLength(2);
        expect(on.auditEventGraph().ok).toBe(true);
    });

    it('is deterministic and round-trips save/load bit-for-bit', () => {
        const run = () => {
            const society = new SocietyCore({ seed: 4 });
            society.addFaction('x', hungry(40));
            society.addFaction('y', hungry(20));
            society.tick({ actions: [deploy('x1', 'x', { maxHp: 120 }), deploy('y1', 'y', { maxHp: 120 })] });
            for (let index = 0; index < 3; index += 1) society.worldStep({ combatTurns: true });
            return society;
        };
        const first = run();
        const second = run();
        expect(JSON.stringify(first.serialize())).toBe(JSON.stringify(second.serialize()));

        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(first.serialize())));
        expect(JSON.stringify(restored.combat.serialize())).toBe(JSON.stringify(first.combat.serialize()));
        // The restored world fights on exactly as the original would have.
        restored.worldStep({ combatTurns: true });
        first.worldStep({ combatTurns: true });
        expect(JSON.stringify(restored.serialize())).toBe(JSON.stringify(first.serialize()));
        expect(restored.auditEventGraph().ok).toBe(true);
    });
});
