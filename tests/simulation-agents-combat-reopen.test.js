import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import {
    ACTOR_PANIC_FEAR, COMBAT_STRATEGIES, MAX_FAMILY_KNOWLEDGE, MAX_HIDING_SPOTS,
    TRAUMA_DECAY_RATE, CombatCore, actorFamilyName, dangerZoneKey,
} from '../socialcore.js';
import { SocietyCore } from '../societycore.js';

// RESP-SIMULATION-AGENTS-COMBAT-REOPEN-001 (fifth re-open under RESP-SOURCE-ABSENT-RECONCILIATION-001's
// procedure) — re-opened `Simulation/agents/combat`: the three located sources (`simulation.js`,
// `agent.js`, `learningagent.js`) are extracted byte-exact into `legacy/`, and the row finally gets
// the implement-and-test pass it always needed. The V8 integration is `CombatCore`/`CombatActor` in
// `socialcore.js` (the world's actors: lineage, engagement window, trauma memory; the world's
// survival book: escapes/deaths, strategy effectiveness, learned danger zones, family knowledge,
// predator adaptation) consumed in production by `COMBAT_DEPLOY` + `COMBAT_ENGAGEMENT`, whose whole
// fight is ONE TURN-rooted chain ending in exactly one uncommitted tail.
//
// Honest limits, recorded rather than papered over: `simulation.js` is a renderer/PIXI orchestrator
// and the extracted sources carry NO damage formula or combat subsystem (their harm came from
// per-agent proximity in the spatial layer the V8 design deletes), so the strike model is a
// V8-DESIGN primitive on top of the legacy mechanisms (`COMBAT_FEAR_PER_CASUALTY` included), while
// the family derivation, generation rule, engagement/trauma semantics, danger grid, strategy book,
// escape-rate adaptation windows and the 50/100 caps are ported verbatim. The row's cited
// integration tests were never committed in either tree — absence recorded, not recoverable.
// Mutants pinned (9/9 by isolated runs — the first draft of the strategy assertion SURVIVED the
// dropped-bonus mutant by passing for the wrong reason, so it was strengthened to a case where the
// bonus is the deciding term): digest drift; trauma cap removed; danger gate moved; strategy bonus
// dropped; adaptation window dropped; combat dropped from serialize; lineage child edge dropped;
// fear exposures dropped; the two defect classes this pass fixed re-injected.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PINS = [
    { file: 'simulation.js', blob: '2cc0c2dc991362fece0afea05150bcd988fe4cb2', sha256: '3b91c4dc778efea806ed47e704e02c2ecc65ab016819d4cb08d608108bd90ef5' },
    { file: 'agent.js', blob: 'f3815a84736b04afc592ee3fd8652464e898b148', sha256: '5e208a01a8840af4976c7c3db2f48106a861115c049bc472b143a13e779d847c' },
    { file: 'learningagent.js', blob: '562faea5106f6cff3ccdc9cecb7b3dd7a0d2a7c6', sha256: 'f06f44f3090879c41789300d98579515abd936f9933fd61d7b70bfa0e4915eb7' },
];

const eventsOf = (society, type) => society.events.filter(event => event.type === type);
const typesOf = lineage => lineage.map(event => event.type);
// A world with two factions whose actors are deployed and one engagement run inside one turn.
const warWorld = (seed = 21) => {
    const society = new SocietyCore({ seed });
    society.addFaction('north', { militaryConfidence: .5, supplySecurity: .5, anger: .2, loot: 40 });
    society.addFaction('south', { militaryConfidence: .5, supplySecurity: .5, anger: .2, loot: 40 });
    society.tick({ actions: [{ kind: 'COMBAT_DEPLOY', unit: 'n1', faction: 'north' }, { kind: 'COMBAT_DEPLOY', unit: 's1', faction: 'south' }] });
    return society;
};
const fight = (engagementId = 'e1', extra = {}) => ({ kind: 'COMBAT_ENGAGEMENT', engagementId, attacker: 'n1', defender: 's1', ...extra });
const lastOf = (society, type) => eventsOf(society, type).at(-1);

describe('re-opened Simulation/agents/combat row: extracted sources + the actor/combat pass', () => {
    it('extracts all three located sources byte-exact and records their upstream provenance', () => {
        const provenance = fs.readFileSync(path.join(ROOT, 'legacy', 'PROVENANCE.md'), 'utf8');
        const manifest = fs.readFileSync(path.join(ROOT, 'docs', 'SOURCE_ABSENT_RECONCILIATION.md'), 'utf8');
        for (const pin of PINS) {
            expect(crypto.createHash('sha256').update(fs.readFileSync(path.join(ROOT, 'legacy', pin.file))).digest('hex')).toBe(pin.sha256);
            expect(provenance).toContain(pin.blob);
            expect(provenance).toContain(pin.sha256);
            expect(manifest).not.toContain(`| ${pin.file} |`); // all three entries left the manifest
        }
        // The row's cited integration tests were never committed in either tree: the cited source
        // names have no test file here, and `git ls-tree -r origin/master` has no simulation/agent
        // test either (verified in the wave; recorded as a limitation, not recoverable).
        for (const absent of ['agent.test.js', 'simulation.test.js', 'learningagent.test.js']) {
            expect(fs.existsSync(path.join(ROOT, 'tests', absent))).toBe(false);
        }
    });

    it('keeps the legacy lineage semantics: family derivation, generation rule, parent/children', () => {
        const book = new CombatCore();
        const parent = book.deploy({ id: 7, factionId: 'north' });
        const child = book.deploy({ id: 8, factionId: 'north', parentId: 7 });
        // agent.js: prefixes[id % 10] + suffixes[(id * 7) % 10] — numeric ids run it verbatim
        expect(actorFamilyName(0)).toBe('Fearheart');
        expect(actorFamilyName(1)).toBe('Braveweaver');
        expect(actorFamilyName(7)).toBe('Silentspirit');
        expect(actorFamilyName(42)).toBe('Swiftguard');
        expect(parent.familyName).toBe('Silentspirit');
        // a non-numeric id still yields a stable, distinct family (documented V8 adaptation)
        expect(actorFamilyName('n1')).not.toBe(actorFamilyName('s1'));
        expect(actorFamilyName('n1')).toBe(actorFamilyName('n1'));
        // agent.js: `this.generation = parentId ? 0 : 1` — preserved verbatim
        expect(parent.generation).toBe(1);
        expect(child.generation).toBe(0);
        expect(parent.children).toEqual([8]);
        expect(child.getLineageInfo()).toEqual({ id: 8, familyName: actorFamilyName(8), generation: 0, parentId: 7, childrenCount: 0, children: [] });
        expect(() => book.deploy({ id: 9, parentId: 404 })).toThrow(/Unknown parent actor/);
        expect(() => book.deploy({ id: 7 })).toThrow(/Duplicate combat actor/);
    });

    it('keeps the legacy engagement window: idempotent open, stress ticker, one-way death', () => {
        const book = new CombatCore();
        const actor = book.deploy({ id: 3 });
        expect(actor.isEngaged).toBe(false);
        expect(actor.engage({ sourceId: 4, tick: 5 })).toBe(true);
        expect(actor.engagementStartTick).toBe(5);
        expect(actor.panicSourceId).toBe(4);
        expect(actor.engage({ sourceId: 9, tick: 9 })).toBe(false); // agent.js setEngaged: only once
        expect(actor.engagementStartTick).toBe(5);
        expect(actor.surviveEngagedTick()).toBe(1);
        expect(actor.surviveEngagedTick()).toBe(2); // agent.js update(): ticks while engaged and alive
        actor.endEngagement();
        expect(actor.surviveEngagedTick()).toBe(2); // not engaged → the ticker stands still
        const wound = actor.applyDamage(100);
        expect(wound).toEqual({ hpBefore: 100, hpAfter: 0, damage: 100, killed: true });
        expect(actor.alive).toBe(false);
        expect(actor.engage()).toBe(false); // the dead do not fight again
        expect(actor.applyDamage(50).damage).toBe(0);
    });

    it('keeps the legacy trauma model: panic gate, `fear * 0.8` cap, `0.9995` decay, `> 0.3` floor', () => {
        const book = new CombatCore();
        const actor = book.deploy({ id: 5 });
        expect(ACTOR_PANIC_FEAR).toBe(1); // the ported band contract's PANIC entry on the §332 scale
        expect(actor.absorbPanic(0.5)).toBe(0); // below PANIC: felt, not traumatising
        expect(actor.fear).toBe(0.5);
        expect(actor.panicEventsSurvived).toBe(0);
        expect(actor.absorbPanic(1)).toBeCloseTo(0.8, 10); // min(1, fear * 0.8)
        expect(actor.panicEventsSurvived).toBe(1);
        expect(actor.absorbPanic(0.4)).toBeCloseTo(0.8, 10); // trauma only rises while panicking
        expect(actor.decayTrauma(1)).toBeCloseTo(0.8 * TRAUMA_DECAY_RATE, 10);
        const floor = actor.traumaFloor();
        expect(floor).toBeCloseTo(0.8 * TRAUMA_DECAY_RATE * 0.3, 10);
        actor.feelFear(0.01);
        expect(actor.applyTraumaFloor()).toBe(floor); // setFear(max(fear, traumaLevel * 0.3))
        expect(actor.fear).toBeGreaterThan(0.01);
        expect(actor.decayTrauma(20000)).toBe(0); // `< 0.001` → 0
        expect(actor.traumaFloor()).toBeNull();
        expect(actor.applyTraumaFloor()).toBe(floor); // no floor above 0.3 trauma → felt fear stands
    });

    it('keeps the legacy survival book: `.5` prior, context bonuses, choice-as-use, `.05` EMA', () => {
        const book = new CombatCore({ rng: () => 0 });
        expect(COMBAT_STRATEGIES).toHaveLength(6);
        expect(book.bestStrategy()).toBe('fleeStraight'); // all priors tie → the first candidate holds
        expect(book.strategyStats.fleeStraight.uses).toBe(1); // legacy: a choice counts as a use
        expect(book.bestStrategy({ allies: 3 })).toBe('groupDefense'); // +.3 at three allies
        expect(book.bestStrategy({ allies: 2 })).toBe('splitRun'); // +.15 at two allies

        // an UNUSED strategy keeps the `.5` prior, so a strategy with a 0-for-1 record loses to one
        // that has never been tried (`fleeStraight` is the first candidate: only the prior keeps it
        // from winning here)
        const unused = new CombatCore({ rng: () => 0 });
        unused.recordDeath({ strategy: 'fleeStraight' });
        expect(unused.bestStrategy()).toBe('fleeZigzag');

        // the >5-kill unpredictability bonus is what TIPS the choice: without it the better success
        // rate wins, so this pair fails if the bonus is dropped (a mutant found this the first time
        // the assertion was written — it passed for the wrong reason)
        // NOTE the legacy asymmetry this construction has to respect: an escape counts a SUCCESS
        // while only a death (or being chosen) counts a USE, so two escapes against one death read
        // as a rate of 2 — three failed tried against two escapes is what yields .667.
        const hunted = new CombatCore({ rng: () => 0 });
        hunted.recordDeath({ strategy: 'splitRun' });
        hunted.recordDeath({ strategy: 'splitRun' });
        hunted.recordDeath({ strategy: 'splitRun' });
        hunted.recordEscape({ strategy: 'splitRun' });
        hunted.recordEscape({ strategy: 'splitRun' }); // 2 successes / 3 uses = .667
        expect(hunted.bestStrategy({ predatorKills: 6, hidingSpotKnown: false })).toBe('fleeZigzag'); // .5 + .25
        expect(hunted.bestStrategy({ predatorKills: 5, hidingSpotKnown: false })).toBe('splitRun'); // bonus off → .667 wins
        book.recordEscape({ strategy: 'hide', location: { x: 10, y: 10 } });
        expect(book.bestStrategy()).toBe('hide'); // +.2 with a known hiding spot
        expect(book.hidingSpots).toEqual([{ x: 10, y: 10, successCount: 1 }]);
        expect(book.getHidingSpot({ x: 12, y: 10 })).toEqual({ x: 10, y: 10, successCount: 1 });
        expect(book.getHidingSpot({ x: 12, y: 10, maxDistance: 1 })).toBeNull();
        book.recordEscape({ strategy: 'fleeStraight', survivalTime: 100 });
        expect(book.averageSurvivalTime).toBeCloseTo(5, 10); // alpha .05 against the zero baseline
        expect(book.strategyStats.fleeStraight.successes).toBe(1);
        book.recordDeath({ strategy: 'splitRun', location: { x: 10, y: 10 }, predatorId: 'p1' });
        expect(book.strategyStats.splitRun.uses).toBe(2); // one choice (counted as a use) + the failed one
        expect(book.predatorKills('p1')).toBe(1);
        expect(book.successfulStrategies.get('fleeStraight')).toEqual({ count: 1, totalSurvivalTime: 100 });
    });

    it('keeps the legacy danger grid: 50-unit cells, the `danger > 2` gate, no danger for no coordinates', () => {
        const book = new CombatCore();
        expect(dangerZoneKey(120, 10)).toBe('2_0');
        expect(dangerZoneKey(-1, -51)).toBe('-1_-2');
        expect(book.recordDanger({ x: 120, y: 10 })).toBe(1);
        expect(book.recordDanger({ x: 121, y: 19 })).toBe(2); // same 50-unit cell
        expect(book.isDangerousZone(120, 10)).toBe(false); // the gate is `danger > 2`, not `>= 2`
        expect(book.recordDanger({ x: 130, y: 30 })).toBe(3);
        expect(book.isDangerousZone(120, 10)).toBe(true);
        expect(book.dangerCount(400, 400)).toBe(0);
        expect(book.learnedDanger({ x: 120, y: 10 })).toBe(1); // a learned danger zone saturates the term
        expect(book.learnedDanger({ x: 400, y: 400 })).toBe(0);
        expect(book.learnedDanger(null)).toBe(0);
    });

    it('keeps the legacy adaptation windows (and the untouched-book quirk) plus the 50/100 caps', () => {
        const book = new CombatCore();
        expect(book.escapeRate()).toBe(0); // `totalEscapes / max(1, totalEscapes + totalDeaths)`
        expect(book.adaptationMultiplier()).toBe(0.8); // untouched book: predators are "winning"
        for (let i = 0; i < 3; i += 1) book.recordEscape({ strategy: 'fleeStraight', survivalTime: 1 });
        book.recordDeath({ strategy: 'fleeStraight' });
        expect(book.escapeRate()).toBe(0.75);
        expect(book.adaptationMultiplier()).toBe(1.5); // > .7 → prey winning, predators adapt faster
        for (let i = 0; i < 3; i += 1) book.recordDeath({ strategy: 'fleeStraight' });
        expect(book.escapeRate()).toBeCloseTo(3 / 7, 10);
        expect(book.adaptationMultiplier()).toBe(1); // inside the window nothing changes
        for (let i = 0; i < 5; i += 1) book.recordDeath({ strategy: 'fleeStraight' });
        expect(book.escapeRate()).toBeCloseTo(0.25, 10);
        expect(book.adaptationMultiplier()).toBe(0.8); // < .3 → adaptation may slow

        const capped = new CombatCore();
        for (let i = 0; i < MAX_HIDING_SPOTS + 5; i += 1) capped.recordEscape({ strategy: 'hide', location: { x: i, y: 0 } });
        expect(capped.hidingSpots).toHaveLength(MAX_HIDING_SPOTS);
        expect(capped.hidingSpots[0]).toEqual({ x: 5, y: 0, successCount: 1 });
        const knowledge = new CombatCore();
        for (let i = 0; i < MAX_FAMILY_KNOWLEDGE + 10; i += 1) knowledge.shareKnowledge({ familyName: 'T', allies: ['a'], knowledge: { i } });
        expect(knowledge.knowledgeOf('T')).toHaveLength(MAX_FAMILY_KNOWLEDGE);
        expect(knowledge.shareKnowledge({ familyName: 'T', allies: [] })).toBe(0); // no recipient, no bucket
        expect(knowledge.shareKnowledge({ familyName: 'T', allies: ['a', 'b'], knowledge: { marker: true } })).toBe(2);
        expect(knowledge.knowledgeOf('T').at(-1)).toEqual({ marker: true, fromAgent: null });
    });

    it('runs one engagement in production as a TURN-rooted chain with one uncommitted tail', () => {
        const society = warWorld();
        const deployed = eventsOf(society, 'COMBAT_ACTOR_DEPLOYED');
        expect(deployed).toHaveLength(2);
        // the deploy is a CHILD of the turn that ran it, while the actor's lineage parent is published
        // separately (the two meanings of "parent" must not share a field)
        expect(deployed.map(event => event.parentId)).toEqual([society.events[0].id, society.events[0].id]);
        expect(deployed[0]).toMatchObject({ actorId: 'n1', factionId: 'north', hp: 100, maxHp: 100, generation: 1, lineageParentId: null });

        society.tick({ actions: [fight('e1', { force: 400, defense: 0, location: { x: 10, y: 10 } })] });
        const resolution = lastOf(society, 'COMBAT_ENGAGEMENT_RESOLVED');
        expect(resolution).toBe(society.events.at(-1)); // exactly one tail, committed by the driver
        expect(resolution).toMatchObject({ engagementId: 'e1', outcome: 'ATTACKER_VICTORY', rounds: 1, casualtyCount: 1, attackerAlive: true, defenderAlive: false, attackerHp: 100, defenderHp: 0, stolen: 20, dangerCount: 1, learnedDangerZone: false });
        expect(resolution.casualties).toEqual(['s1']);
        expect(resolution.survivors).toHaveLength(1);
        expect(resolution.survivors[0]).toMatchObject({ actorId: 'n1', factionId: 'north', hp: 100, stressSurvivalTicks: 1 });
        expect(COMBAT_STRATEGIES).toContain(resolution.strategies.n1);

        expect(typesOf(society.causalChain(resolution.id).lineage)).toEqual([
            'TURN', 'COMBAT_ENGAGEMENT_STARTED', 'COMBAT_STRIKE', 'COMBAT_CASUALTY',
            'FEAR_EVENT_RAISED', 'FEAR_HABITUATED', 'FEAR_EVENT_RAISED', 'FEAR_HABITUATED',
            'COMBAT_ENGAGEMENT_RESOLVED',
        ]);
        expect(society.auditEventGraph().ok).toBe(true);
        // loot conservation: what the winner took is exactly what the loser lost
        expect(society.factions.get('north').loot + society.factions.get('south').loot).toBe(80);
        expect(society.factions.get('south').loot).toBe(20);
        expect(society.factions.get('north').state.militaryConfidence).toBeGreaterThan(0.5);
        expect(society.factions.get('south').state.grievance).toBeGreaterThan(0);
    });

    it('records casualties through the survival book and consumes learned danger in the migration decision', () => {
        const society = new SocietyCore({ seed: 5 });
        society.addFaction('north', { militaryConfidence: .5, supplySecurity: .5, fear: 0, loot: 0 });
        society.addFaction('south', { militaryConfidence: .5, supplySecurity: .5, fear: 0, loot: 0 });
        for (let i = 0; i < 3; i += 1) {
            society.tick({ actions: [
                { kind: 'COMBAT_DEPLOY', unit: `n${i}`, faction: 'north' },
                { kind: 'COMBAT_DEPLOY', unit: `s${i}`, faction: 'south' },
                { kind: 'COMBAT_DEPLOY', unit: `s${i}-mate`, faction: 'south' },
            ] });
            society.tick({ actions: [fight(`w${i}`, { attacker: `n${i}`, defender: `s${i}`, force: 400, defense: 0, attackerArmor: 1000, defenderForce: .1, location: { x: 120, y: 10 } })] });
        }
        expect([...society.combat.dangerZones.entries()]).toEqual([['2_0', 3]]); // one learned cell
        expect(society.combat.dangerCount(121, 19)).toBe(3); // the same 50-unit cell
        expect(society.combat.isDangerousZone(120, 10)).toBe(true);
        expect(society.combat.predatorKills('n0')).toBe(1);
        expect(society.combat.totalDeaths).toBe(3);
        expect(society.combat.totalEscapes).toBe(3); // one survivor per engagement

        const casualty = eventsOf(society, 'COMBAT_CASUALTY').at(-1);
        expect(casualty).toMatchObject({ actorId: 's2', factionId: 'south', killerId: 'n2', dangerCount: 3, dangerousZone: true, knowledgeShared: 3 });
        expect(casualty.lineage).toMatchObject({ id: 's2', generation: 1, parentId: null, childrenCount: 0 });
        // the dead actor's three living faction-mates each receive the lesson (legacy: one push per
        // nearby ally, family-keyed by the SHARER's family)
        const lesson = society.combat.knowledgeOf(casualty.lineage.familyName);
        expect(lesson).toHaveLength(3);
        expect(lesson[0]).toEqual({ type: 'death', strategy: casualty.strategy, predatorId: 'n2', fromAgent: 's2' });

        // the learned danger is CONSUMED: migration pressure from a deadly place
        society.tick({ actions: [{ kind: 'MIGRATION_EVALUATION', faction: 'north', fear: 1, location: { x: 120, y: 10 } }] });
        const warned = lastOf(society, 'MIGRATION_EVALUATION');
        expect(warned).toMatchObject({ learnedDanger: 1, routeDanger: 1, migrates: true });
        expect(warned.pressure).toBeCloseTo(0.75, 10); // .4 fear + .3 saturating danger + .05 legitimacy

        const calm = new SocietyCore({ seed: 5 });
        calm.addFaction('north', { fear: 1 });
        calm.tick({ actions: [{ kind: 'MIGRATION_EVALUATION', faction: 'north', fear: 1, location: { x: 120, y: 10 } }] });
        const control = lastOf(calm, 'MIGRATION_EVALUATION');
        expect(control).toMatchObject({ learnedDanger: 0, routeDanger: 0, migrates: false });
        expect(control.pressure).toBeCloseTo(0.45, 10); // the same world, no learned danger
    });

    it('feeds bloodshed through the one fear seam and lifts a fallen felt fear by the trauma floor', () => {
        const society = warWorld();
        society.tick({ actions: [fight('calm', { force: 1, defense: 10, location: { x: 0, y: 0 } })] });
        expect(lastOf(society, 'COMBAT_ENGAGEMENT_RESOLVED').fearExposures).toEqual([]); // no blood, no fear
        expect(society.factions.get('north').state.fear).toBe(0);

        const lethal = warWorld();
        lethal.tick({ actions: [fight('blood', { force: 400, defense: 0, location: { x: 0, y: 0 } })] });
        const resolution = lastOf(lethal, 'COMBAT_ENGAGEMENT_RESOLVED');
        expect(resolution.fearGainPerFaction).toBeCloseTo(0.05, 10); // V8 constant, one casualty
        expect(resolution.fearExposures.map(entry => entry.source)).toEqual(['combat', 'combat']); // defender first
        const raised = eventsOf(lethal, 'FEAR_EVENT_RAISED');
        expect(raised).toHaveLength(2);
        expect(raised[0]).toMatchObject({ factionId: 'south', source: 'combat', baseFearGain: 0.05, engagementId: 'blood', casualties: 1, outcome: 'ATTACKER_VICTORY' });
        expect(raised[1].factionId).toBe('north');
        expect(raised[0].parentId).toBe(eventsOf(lethal, 'COMBAT_CASUALTY').at(-1).id);
        expect(typesOf(lethal.causalChain(resolution.id).lineage).at(-1)).toBe('COMBAT_ENGAGEMENT_RESOLVED');

        // a survivor that fought panicking carries trauma, and the floor binds once fear falls back
        const trauma = new SocietyCore({ seed: 3 });
        trauma.addFaction('north', { militaryConfidence: .5, supplySecurity: .5, fear: 1, loot: 10 });
        trauma.addFaction('south', { militaryConfidence: .5, supplySecurity: .5, fear: 1, loot: 10 });
        trauma.tick({ actions: [{ kind: 'COMBAT_DEPLOY', unit: 'n1', faction: 'north' }, { kind: 'COMBAT_DEPLOY', unit: 's1', faction: 'south' }] });
        trauma.tick({ actions: [fight('t1', { force: 1, defense: 10, location: { x: 0, y: 0 } })] });
        // the band contract speaks inside a fight in a world that is already terrified: its OWN
        // counter is published separately, so the event's `tick` stays the world clock (the defect
        // this pass fixed — publishing the core counter as `tick` made a mid-turn band event carry a
        // foreign tick, and `auditEventGraph()` then reported PARENT_TICK_ORDER).
        const panic = new SocietyCore({ seed: 3 });
        panic.addFaction('north', { militaryConfidence: .5, supplySecurity: .5, fear: 1, loot: 10 });
        panic.addFaction('south', { militaryConfidence: .5, supplySecurity: .5, fear: 1, loot: 10 });
        panic.tick({ actions: [{ kind: 'COMBAT_DEPLOY', unit: 'n1', faction: 'north' }, { kind: 'COMBAT_DEPLOY', unit: 's1', faction: 'south' }] });
        panic.tick({ actions: [fight('b1', { force: 400, defense: 0, location: { x: 0, y: 0 } })] });
        const bands = eventsOf(panic, 'FEARCORE_BAND_TRANSITION');
        expect(bands).toHaveLength(2); // one rung per fear exposure inside the single turn
        expect(bands.map(band => band.coreTick)).toEqual([1, 2]); // the contract's own counter
        expect(bands.map(band => band.tick)).toEqual([panic.now(), panic.now()]); // the world clock
        expect(panic.auditEventGraph().ok).toBe(true);

        const panicked = lastOf(trauma, 'COMBAT_ENGAGEMENT_RESOLVED');
        expect(panicked.survivors[0]).toMatchObject({ actorId: 'n1', panicking: true, panicEventsSurvived: 1, traumaFloored: false });
        expect(panicked.survivors[0].traumaLevel).toBeCloseTo(0.8, 10);
        expect(panicked.survivors[0].fear).toBe(1);
        trauma.factions.get('north').state.fear = 0.2;
        trauma.factions.get('south').state.fear = 0.2;
        trauma.tick({ actions: [fight('t2', { force: 1, defense: 10, location: { x: 0, y: 0 } })] });
        const settled = lastOf(trauma, 'COMBAT_ENGAGEMENT_RESOLVED').survivors[0];
        expect(settled).toMatchObject({ actorId: 'n1', panicking: false, traumaFloored: true });
        expect(settled.fear).toBeCloseTo(0.8 * TRAUMA_DECAY_RATE * 0.3, 10); // lifted from .2 by the floor
        expect(settled.fear).toBeGreaterThan(0.2);
    });

    it('guards the production seam: ids, registration, distinctness, and the living', () => {
        const society = warWorld();
        expect(() => society.tick({ actions: [{ kind: 'COMBAT_DEPLOY', faction: 'north' }] })).toThrow(/requires a unit id/);
        expect(() => society.tick({ actions: [{ kind: 'COMBAT_DEPLOY', unit: 'n1', faction: 'north' }] })).toThrow(/Duplicate combat actor/);
        expect(() => society.tick({ actions: [{ kind: 'COMBAT_DEPLOY', unit: 'x9', faction: 'nowhere' }] })).toThrow(/Unknown faction/);
        expect(() => society.tick({ actions: [{ kind: 'COMBAT_ENGAGEMENT', attacker: 'n1', defender: 's1' }] })).toThrow(/requires an engagementId/);
        expect(() => society.tick({ actions: [fight('g1', { attacker: 'ghost' })] })).toThrow(/Unknown combat actor/);
        expect(() => society.tick({ actions: [fight('g2', { defender: 'n1' })] })).toThrow(/two distinct actors/);
        const cousins = new SocietyCore({ seed: 2 });
        cousins.addFaction('north', {});
        cousins.tick({ actions: [{ kind: 'COMBAT_DEPLOY', unit: 'a', faction: 'north' }, { kind: 'COMBAT_DEPLOY', unit: 'b', faction: 'north' }] });
        expect(() => cousins.tick({ actions: [{ kind: 'COMBAT_ENGAGEMENT', engagementId: 'g3', attacker: 'a', defender: 'b' }] })).toThrow(/two distinct factions/);
        society.tick({ actions: [fight('kill', { force: 400, defense: 0 })] });
        expect(() => society.tick({ actions: [fight('again')] })).toThrow(/two living actors/);
    });

    it('round-trips the actor population and the survival book, and stays deterministic', () => {
        // a fatal engagement costs the loser its actor, so the continuation deploys a fresh pair —
        // the deploy is part of the deterministic action stream on both sides of the round trip.
        const redeploy = [
            { kind: 'COMBAT_DEPLOY', unit: 'n9', faction: 'north', parentId: 'n1' },
            { kind: 'COMBAT_DEPLOY', unit: 's9', faction: 'south' },
        ];
        const continuation = { kind: 'COMBAT_ENGAGEMENT', engagementId: 'c2', attacker: 'n9', defender: 's9', force: 1, defense: 10, location: { x: 0, y: 0 } };

        const control = warWorld(9);
        control.tick({ actions: [fight('c1', { force: 400, defense: 0, location: { x: 0, y: 0 } })] });
        control.tick({ actions: redeploy });
        control.tick({ actions: [continuation] });

        const interrupted = warWorld(9);
        interrupted.tick({ actions: [fight('c1', { force: 400, defense: 0, location: { x: 0, y: 0 } })] });
        const restored = SocietyCore.deserialize(JSON.parse(JSON.stringify(interrupted.serialize())));
        expect(restored.combat.serialize()).toEqual(interrupted.combat.serialize());
        expect(restored.combat.actor('s1').alive).toBe(false);
        expect(restored.combat.actor('n1').getLineageInfo()).toEqual(interrupted.combat.actor('n1').getLineageInfo());

        restored.tick({ actions: redeploy });
        restored.tick({ actions: [continuation] });
        expect(restored.serialize()).toEqual(control.serialize());
        // the lineage survives the round trip: n9 is n1's child in both worlds
        expect(restored.combat.actor('n1').children).toEqual(['n9']);

        const run = () => {
            const society = warWorld(9);
            society.tick({ actions: [fight('c1', { force: 400, defense: 0, location: { x: 0, y: 0 } })] });
            society.tick({ actions: redeploy });
            society.tick({ actions: [continuation] });
            return JSON.stringify(society.serialize());
        };
        expect(run()).toBe(run());
    });
});
