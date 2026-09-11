import {
    WorldSimulationSystem,
    ROAMING_PARTY_TYPES,
    ROAMING_STATES,
    ENCOUNTER_TYPES,
    ENCOUNTER_RESOLUTIONS,
    RUMOR_TOPICS,
    WORLD_EVENT_TYPES
} from '../packages/core/src/WorldSimulationSystem.js';
import { FactionSystem } from '../packages/core/src/FactionSystem.js';
import { RelationshipTensorSystem } from '../packages/core/src/RelationshipTensorSystem.js';

describe('Milestone I: WorldSimulationSystem — Roaming Nomads, Encounters, Rumors & History', () => {
    let world;

    beforeEach(() => {
        world = new WorldSimulationSystem({ seed: 42 });
    });

    test('1. Roaming party registration, initialization, and motivational drivers', () => {
        const patrol = world.registerGroup('patrol_alpha', {
            name: 'Northern Watch Patrol',
            type: ROAMING_PARTY_TYPES.PATROL,
            factionId: 'faction_crown',
            memberCount: 8,
            position: { x: 100, y: 0, z: 50 },
            waypoints: [
                { x: 100, y: 0, z: 50, name: 'Gate' },
                { x: 200, y: 0, z: 50, name: 'Tower' }
            ],
            militaryStrength: 0.8,
            wealth: 0.3
        });

        expect(patrol).toBeDefined();
        expect(patrol.id).toBe('patrol_alpha');
        expect(patrol.state).toBe(ROAMING_STATES.TRAVELING);
        expect(patrol.drivers.fatigue).toBe(0.0);
        expect(patrol.drivers.hunger).toBe(0.0);

        // Advance 10 ticks of travel
        for (let t = 0; t < 10; t++) {
            world.tick(1.0);
        }

        expect(patrol.drivers.fatigue).toBeGreaterThan(0.0);
        expect(patrol.drivers.hunger).toBeGreaterThan(0.0);
        expect(patrol.lastIntent).toBeDefined();
        expect(patrol.lastIntent.intent).toBe('INTENT_MARCH');
        expect(patrol.lastIntent.targetCoordinates).toEqual({ x: 100, y: 0, z: 50 });
    });

    test('2. Camp Lifecycle: High fatigue triggers camp establishment, rest triggers camp teardown', () => {
        const caravan = world.registerGroup('caravan_silk', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 500, y: 0, z: 500 },
            waypoints: [{ x: 500, y: 0, z: 500 }],
            wealth: 0.9
        });

        // Artificially simulate high travel fatigue
        caravan.drivers.fatigue = 0.85;

        world.tick(1.0);

        expect(caravan.state).toBe(ROAMING_STATES.CAMPED);
        expect(caravan.campId).toBeDefined();
        expect(world.camps.has(caravan.campId)).toBe(true);
        expect(caravan.lastIntent.intent).toBe('INTENT_ESTABLISH_CAMP');

        const campEvents = world.queryHistory({
            primaryId: 'caravan_silk',
            eventType: WORLD_EVENT_TYPES.CAMP_ESTABLISHED
        });
        expect(campEvents.length).toBe(1);

        // While camped, fatigue decays over time
        caravan.drivers.fatigue = 0.08;
        world.tick(1.0);

        expect(caravan.state).toBe(ROAMING_STATES.TRAVELING);
        expect(caravan.campId).toBeNull();
        expect(caravan.lastIntent.intent).toBe('INTENT_BREAK_CAMP');

        const abandonEvents = world.queryHistory({
            primaryId: 'caravan_silk',
            eventType: WORLD_EVENT_TYPES.CAMP_ABANDONED
        });
        expect(abandonEvents.length).toBe(1);
    });

    test('3. Starvation drive triggers foraging intent', () => {
        const refugees = world.registerGroup('refugees_lost', {
            type: ROAMING_PARTY_TYPES.REFUGEES,
            position: { x: 20, y: 0, z: 20 },
            militaryStrength: 0.1,
            wealth: 0.05
        });

        refugees.drivers.hunger = 0.80;
        world.tick(1.0);

        expect(refugees.state).toBe(ROAMING_STATES.FORAGING);
        expect(refugees.lastIntent.intent).toBe('INTENT_FORAGE');

        // Once sated, resumes traveling
        refugees.drivers.hunger = 0.10;
        world.tick(1.0);

        expect(refugees.state).toBe(ROAMING_STATES.TRAVELING);
        expect(refugees.lastIntent.intent).toBe('INTENT_MARCH');
    });

    test('4. Systemic Emergent Encounters: Bandits vs Wealthy Caravan (Extortion / Combat)', () => {
        const caravan = world.registerGroup('caravan_spice', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.2,
            wealth: 0.85
        });

        const bandits = world.registerGroup('bandits_gorge', {
            type: ROAMING_PARTY_TYPES.BANDITS,
            position: { x: 110, y: 0, z: 105 }, // Distance ~11.18m (<= 40m radius)
            militaryStrength: 0.75,
            wealth: 0.1
        });

        const encounters = world.evaluateEncounters();
        expect(encounters.length).toBe(1);

        const enc = encounters[0];
        expect(enc.encounterType).toBe(ENCOUNTER_TYPES.AMBUSH_INTERCEPTION);
        expect(enc.advisoryResolution).toBe(ENCOUNTER_RESOLUTIONS.EXTORTION_PAID);
        expect(enc.urgency).toBeGreaterThan(0.8);
        expect(enc.diagnosticRationale).toContain('demand tribute under power imbalance');

        // Historical ledger must contain the encounter event
        const events = world.queryHistory({ eventType: WORLD_EVENT_TYPES.ENCOUNTER_OCCURRED });
        expect(events.length).toBe(1);
        expect(events[0].consequences.resolution).toBe(ENCOUNTER_RESOLUTIONS.EXTORTION_PAID);
    });

    test('5. Cross-System Integration: Faction Bilateral Stance influences Encounter Escalation', () => {
        const factionSys = new FactionSystem();
        factionSys.registerFaction({ id: 'faction_norse', culture: 'MILITARISTIC', militaryReadiness: 0.8 });
        factionSys.registerFaction({ id: 'faction_anglo', culture: 'HONORABLE', militaryReadiness: 0.7 });

        // Escalate bilateral stance via confirmed raid, territorial pressure, and evaluation
        factionSys.recordIncident('faction_norse', 'faction_anglo', 'RAID_CONFIRMED', { severity: 0.85 });
        factionSys.evaluateStance('faction_anglo', 'faction_norse', { territorialPressure: 0.70 });

        const stance = factionSys.getBilateralStance('faction_anglo', 'faction_norse');
        expect(['MOBILIZE', 'SKIRMISH', 'ATTACK']).toContain(stance.stage);

        const norsePatrol = world.registerGroup('norse_patrol', {
            type: ROAMING_PARTY_TYPES.PATROL,
            factionId: 'faction_norse',
            position: { x: 300, y: 0, z: 300 },
            militaryStrength: 0.8
        });

        const angloPatrol = world.registerGroup('anglo_patrol', {
            type: ROAMING_PARTY_TYPES.PATROL,
            factionId: 'faction_anglo',
            position: { x: 315, y: 0, z: 300 }, // Distance 15m
            militaryStrength: 0.75
        });

        const encounters = world.evaluateEncounters({ factionSystem: factionSys });
        expect(encounters.length).toBe(1);
        expect(encounters[0].encounterType).toBe(ENCOUNTER_TYPES.BORDER_SKIRMISH);
        expect(encounters[0].advisoryResolution).toBe(ENCOUNTER_RESOLUTIONS.COMBAT_ENGAGEMENT);
    });

    test('6. Rumor Creation, Transmission, Fidelity Degradation & Trust Modulation', () => {
        const gA = world.registerGroup('group_messenger', {
            type: ROAMING_PARTY_TYPES.PATROL,
            position: { x: 0, y: 0, z: 0 }
        });

        const gB = world.registerGroup('group_receiver', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 10, y: 0, z: 0 },
            traits: { neuroticism: 0.8 }
        });

        // Seed a lethal ambush rumor into messenger group
        const rumor = world.createRumor(RUMOR_TOPICS.AMBUSH_HOTSPOT, {
            sourceEntityId: 'group_messenger',
            originLocation: { x: 50, y: 0, z: 50 },
            severity: 0.9,
            description: 'Massacre on mountain pass by unknown raiders'
        });

        expect(gA.knownRumors.has(rumor.id)).toBe(true);
        expect(gA.knownRumors.get(rumor.id).fidelity).toBe(1.0);

        // Transmit rumors to receiver with high trust (0.9)
        const transmitted = world.transmitRumors('group_messenger', 'group_receiver', 0.9);
        expect(transmitted.length).toBe(1);

        const receivedInstance = gB.knownRumors.get(rumor.id);
        expect(receivedInstance).toBeDefined();
        expect(receivedInstance.hops).toBe(1);
        // Fidelity should have decayed by ~12%
        expect(receivedInstance.fidelity).toBeCloseTo(0.88, 2);
        // High trust + high neuroticism preserves high credibility
        expect(receivedInstance.credibility).toBeGreaterThan(0.7);

        // Check history ledger for rumor spread event
        const spreadEvents = world.queryHistory({ eventType: WORLD_EVENT_TYPES.RUMOR_SPREAD });
        expect(spreadEvents.length).toBe(1);
        expect(spreadEvents[0].primaryId).toBe('group_messenger');
        expect(spreadEvents[0].secondaryId).toBe('group_receiver');
    });

    test('7. Misinformation & Low-Trust Filtering', () => {
        const gUntrusted = world.registerGroup('shady_vagabond', {
            type: ROAMING_PARTY_TYPES.BANDITS,
            position: { x: 0, y: 0, z: 0 }
        });

        const gStoic = world.registerGroup('stoic_garrison', {
            type: ROAMING_PARTY_TYPES.PATROL,
            position: { x: 10, y: 0, z: 0 },
            traits: { neuroticism: 0.1 } // Very low neuroticism
        });

        const fakeRumor = world.createRumor(RUMOR_TOPICS.WAR_DECLARED, {
            sourceEntityId: 'shady_vagabond',
            severity: 0.95
        });

        // Transmit with near-zero trust (0.05)
        world.transmitRumors('shady_vagabond', 'stoic_garrison', 0.05);

        const received = gStoic.knownRumors.get(fakeRumor.id);
        expect(received).toBeDefined();
        // Credibility should be low due to zero trust and low neuroticism
        expect(received.credibility).toBeLessThan(0.5);
    });

    test('8. Replay Determinism and Snapshot Restore (Bit-for-Bit)', () => {
        world.registerGroup('g1', { position: { x: 10, y: 0, z: 10 } });
        world.registerGroup('g2', { position: { x: 25, y: 0, z: 20 } });
        world.createRumor(RUMOR_TOPICS.FAMINE_ALERT, { severity: 0.6, sourceEntityId: 'g1' });

        for (let t = 0; t < 25; t++) {
            world.tick(1.0);
        }

        const snapshot = world.exportState();
        expect(snapshot.groups.length).toBe(2);
        expect(snapshot.tickCount).toBe(25);

        // Advance 25 more ticks on original world
        for (let t = 0; t < 25; t++) {
            world.tick(1.0);
        }
        const stateOriginalAt50 = world.exportState();

        // Restore snapshot into a clean world instance
        const restoredWorld = new WorldSimulationSystem({ seed: 999 }); // Initialized with different seed
        restoredWorld.importState(snapshot);

        // Advance restored world by 25 ticks
        for (let t = 0; t < 25; t++) {
            restoredWorld.tick(1.0);
        }
        const stateRestoredAt50 = restoredWorld.exportState();

        // Must match exactly
        expect(stateRestoredAt50.tickCount).toBe(stateOriginalAt50.tickCount);
        expect(stateRestoredAt50.historyLedger.length).toBe(stateOriginalAt50.historyLedger.length);
        expect(stateRestoredAt50.groups[0].drivers.fatigue).toBeCloseTo(stateOriginalAt50.groups[0].drivers.fatigue, 6);
        expect(stateRestoredAt50.groups[0].drivers.hunger).toBeCloseTo(stateOriginalAt50.groups[0].drivers.hunger, 6);
    });

    test('9. Host Game Authority Invariant: Intents are advisory, host retains transform authority', () => {
        const patrol = world.registerGroup('patrol_scout', {
            type: ROAMING_PARTY_TYPES.PATROL,
            position: { x: 100, y: 0, z: 100 },
            waypoints: [{ x: 150, y: 0, z: 100 }]
        });

        world.tick(1.0);

        // Middleware outputs recommended waypoint & intent, but does NOT teleport or alter position.x/z directly
        expect(patrol.lastIntent.intent).toBe('INTENT_MARCH');
        expect(patrol.lastIntent.targetCoordinates).toEqual({ x: 150, y: 0, z: 100 });
        expect(patrol.position).toEqual({ x: 100, y: 0, z: 100 }); // Unaltered by middleware tick!
    });
});

describe('Sibling-bound sweep: rumor map cap', () => {
    test('10. Master map evicts oldest-origin and purges group copies', () => {
        const sys = new WorldSimulationSystem({ seed: 3, maxRumors: 10 });
        sys.registerGroup('g1', { position: { x: 0, y: 0, z: 0 } });
        const first = sys.createRumor(RUMOR_TOPICS.WAR_DECLARED, { description: 'first', sourceEntityId: 'g1' });
        expect(sys.groups.get('g1').knownRumors.has(first.id)).toBe(true);
        for (let i = 0; i < 14; i++) sys.createRumor(RUMOR_TOPICS.WAR_DECLARED, { description: `r${i}` });
        expect(sys.rumors.size).toBe(10);
        expect(sys.rumors.has(first.id)).toBe(false);
        expect(sys.groups.get('g1').knownRumors.has(first.id)).toBe(false);
    });
});

describe('NEXT-46: NaN-basis contract strictness', () => {
    function ambushPair(banditStr, victimStr) {
        const world = new WorldSimulationSystem({ seed: 42 });
        const caravan = world.registerGroup('c_nan', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: victimStr,
            wealth: 0.85
        });
        const bandits = world.registerGroup('b_nan', {
            type: ROAMING_PARTY_TYPES.BANDITS,
            position: { x: 105, y: 0, z: 100 },
            militaryStrength: banditStr,
            wealth: 0.1
        });
        // Bypass registration clamping to simulate corrupt host-side reads.
        bandits.militaryStrength = banditStr;
        caravan.militaryStrength = victimStr;
        return world._generateSystemicEncounter(bandits, caravan, { distance: 5, factionSystem: null, relationshipTensorSystem: null });
    }
    test('1. Non-finite strengths hold with an honest rationale', () => {
        for (const [b, v] of [[NaN, 0.5], [0.6, NaN], [NaN, NaN], [undefined, 0.5]]) {
            const enc = ambushPair(b, v);
            expect(enc.encounterType).toBe(ENCOUNTER_TYPES.AMBUSH_INTERCEPTION);
            expect(enc.advisoryResolution).toBe(ENCOUNTER_RESOLUTIONS.MUTUAL_AVOIDANCE);
            expect(enc.diagnosticRationale).toContain('indeterminate');
            expect(enc.diagnosticRationale).not.toContain('superior escort defense');
        }
    });
    test('2. Finite paths keep their exact resolutions and rationales', () => {
        // Parity-ish combat band (0.6/0.5 = 1.2): combat, contested rationale.
        const combat = ambushPair(0.6, 0.5);
        expect(combat.advisoryResolution).toBe(ENCOUNTER_RESOLUTIONS.COMBAT_ENGAGEMENT);
        expect(combat.diagnosticRationale).toContain('contested transit zone');
        // Overwhelming bandits vs wealthy victim: extortion with ratio text.
        const extort = ambushPair(0.75, 0.2);
        expect(extort.advisoryResolution).toBe(ENCOUNTER_RESOLUTIONS.EXTORTION_PAID);
        expect(extort.diagnosticRationale).toContain('power imbalance');
        // Outgunned bandits: honest avoidance with the defense rationale.
        const avoid = ambushPair(0.2, 0.8);
        expect(avoid.advisoryResolution).toBe(ENCOUNTER_RESOLUTIONS.MUTUAL_AVOIDANCE);
        expect(avoid.diagnosticRationale).toContain('superior escort defense');
    });
});

describe('NEXT-57: victim-wealth indeterminate note', () => {
    function wealthyAmbush(victimWealth) {
        const world = new WorldSimulationSystem({ seed: 42 });
        const caravan = world.registerGroup('c_w', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.2,
            wealth: 0.85
        });
        const bandits = world.registerGroup('b_w', {
            type: ROAMING_PARTY_TYPES.BANDITS,
            position: { x: 105, y: 0, z: 100 },
            militaryStrength: 0.75,
            wealth: 0.1
        });
        caravan.wealth = victimWealth;
        return world._generateSystemicEncounter(bandits, caravan, { distance: 5, factionSystem: null, relationshipTensorSystem: null });
    }
    test('3. Unreadable wealth falls to combat with an honest note, never fiction tribute', () => {
        const bad = wealthyAmbush(NaN);
        expect(bad.advisoryResolution).toBe(ENCOUNTER_RESOLUTIONS.COMBAT_ENGAGEMENT);
        expect(bad.diagnosticRationale).toContain('unreadable');
        expect(bad.suggestedTribute).toBeNull();
        // Finite wealthy path unchanged: extortion with computed tribute.
        const good = wealthyAmbush(0.85);
        expect(good.advisoryResolution).toBe(ENCOUNTER_RESOLUTIONS.EXTORTION_PAID);
        expect(good.suggestedTribute).toBeCloseTo(0.2975, 4);
        expect(good.diagnosticRationale).not.toContain('unreadable');
    });
});

describe('NEXT-58: relationship trust-NaN review', () => {
    function refugeeAid(trustValue) {
        const world = new WorldSimulationSystem({ seed: 42 });
        const rel = new RelationshipTensorSystem();
        const host = world.registerGroup('h_t', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.9, leaderId: 'L1'
        });
        const refugees = world.registerGroup('r_t', {
            type: ROAMING_PARTY_TYPES.REFUGEES,
            position: { x: 105, y: 0, z: 100 },
            militaryStrength: 0.1, wealth: 0.05, leaderId: 'L2'
        });
        if (trustValue !== undefined) rel.getRelationship('L1', 'L2').trust = trustValue;
        return world._generateSystemicEncounter(host, refugees, { distance: 5, factionSystem: null, relationshipTensorSystem: rel });
    }
    test('4. Unreadable trust denies aid safely with an honest note, never claimed trust', () => {
        const bad = refugeeAid(NaN);
        expect(bad.encounterType).toBe(ENCOUNTER_TYPES.REFUGEE_ENCOUNTER);
        expect(bad.advisoryResolution).toBe(ENCOUNTER_RESOLUTIONS.MUTUAL_AVOIDANCE);
        expect(bad.diagnosticRationale).toContain('indeterminate');
        // High finite trust still aids; low finite trust denies without the note.
        const good = refugeeAid(0.9);
        expect(good.advisoryResolution).toBe(ENCOUNTER_RESOLUTIONS.AID_PROVIDED);
        const low = refugeeAid(0.1);
        expect(low.advisoryResolution).toBe(ENCOUNTER_RESOLUTIONS.MUTUAL_AVOIDANCE);
        expect(low.diagnosticRationale).not.toContain('indeterminate');
    });
});

describe('NEXT-74: misinformation cascade live exercise', () => {
    function caravanPair(seed = 42) {
        const world = new WorldSimulationSystem({ seed });
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5,
            wealth: 0.5
        });
        const b = world.registerGroup('b_dst', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 105, y: 0, z: 100 },
            militaryStrength: 0.5,
            wealth: 0.5
        });
        return { world, a, b };
    }
    function meet(world, x, y) {
        return world._generateSystemicEncounter(x, y, { distance: 5, factionSystem: null, relationshipTensorSystem: null });
    }
    test('1. Hearing a severe false threat rumor raises receiver pressure only', () => {
        const { world, a, b } = caravanPair();
        // FALSE rumor: no truthEventId - nobody observed any army.
        const rumor = world.createRumor('WAR_DECLARED', {
            sourceEntityId: a.id, severity: 0.9, description: 'travelers claim an army marches'
        });
        meet(world, a, b);
        expect(b.knownRumors.has(rumor.id)).toBe(true);
        expect(b.drivers.threatPressure).toBeGreaterThan(0);
        expect(b.drivers.threatPressure).toBeLessThanOrEqual(0.15);
        expect(a.drivers.threatPressure).toBe(0);
    });
    test('2. Non-threat rumors do not raise pressure', () => {
        const { world, a, b } = caravanPair();
        world.createRumor('ALLIANCE_FORMED', {
            sourceEntityId: a.id, severity: 0.9, description: 'merchants signed a pact'
        });
        meet(world, a, b);
        expect(b.knownRumors.size).toBe(1);
        expect(b.drivers.threatPressure).toBe(0);
    });
    test('3. Low-severity threat rumors do not raise pressure', () => {
        const { world, a, b } = caravanPair();
        world.createRumor('AMBUSH_HOTSPOT', {
            sourceEntityId: a.id, severity: 0.2, description: 'vague unease about the north road'
        });
        meet(world, a, b);
        expect(b.knownRumors.size).toBe(1);
        expect(b.drivers.threatPressure).toBe(0);
    });
    test('4. Rumor cascades across a second hop with degraded fidelity', () => {
        const { world, a, b } = caravanPair();
        const rumor = world.createRumor('WAR_DECLARED', {
            sourceEntityId: a.id, severity: 0.9, description: 'false army report'
        });
        meet(world, a, b);
        const c = world.registerGroup('c_far', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 110, y: 0, z: 100 },
            militaryStrength: 0.5,
            wealth: 0.5
        });
        meet(world, b, c);
        const first = b.knownRumors.get(rumor.id);
        const second = c.knownRumors.get(rumor.id);
        expect(second).toBeDefined();
        expect(second.hops).toBe(first.hops + 1);
        expect(second.fidelity).toBeLessThan(first.fidelity);
        expect(c.drivers.threatPressure).toBeGreaterThan(0);
    });
    test('5. Cascade hearing is deterministic for a fixed seed', () => {
        const run = () => {
            const { world, a, b } = caravanPair();
            world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
            meet(world, a, b);
            return { pressure: b.drivers.threatPressure, sev: b.knownRumors.values().next().value.perceivedSeverity };
        };
        expect(run()).toEqual(run());
    });
});

describe('NEXT-75: rumor correction (host truth vs belief)', () => {
    function caravanPair(seed = 42) {
        const world = new WorldSimulationSystem({ seed });
        const mk = (id, x) => world.registerGroup(id, {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x, y: 0, z: 100 },
            militaryStrength: 0.5,
            wealth: 0.5
        });
        return { world, a: mk('a_src', 100), b: mk('b_dst', 105) };
    }
    function meet(world, x, y) {
        return world._generateSystemicEncounter(x, y, { distance: 5, factionSystem: null, relationshipTensorSystem: null });
    }
    function falseArmy(world, a) {
        return world.createRumor('WAR_DECLARED', {
            sourceEntityId: a.id, severity: 0.9, description: 'false army report'
        });
    }
    test('1. Refutation deletes the instance and relieves heard pressure', () => {
        const { world, a, b } = caravanPair();
        const rumor = falseArmy(world, a);
        meet(world, a, b);
        expect(b.drivers.threatPressure).toBeGreaterThan(0);
        const corr = world.correctRumor(rumor.id, { confirmed: false, byGroupId: a.id });
        expect(corr.confirmed).toBe(false);
        expect(a.knownRumors.has(rumor.id)).toBe(false);
        meet(world, a, b);
        expect(b.knownRumors.has(rumor.id)).toBe(false);
        expect(b.drivers.threatPressure).toBe(0);
        const events = world.queryHistory({ eventType: WORLD_EVENT_TYPES.RUMOR_CORRECTED });
        expect(events.length).toBe(1);
        expect(events[0].cause).toBe('RUMOR_REFUTED');
    });
    test('2. Confirmation pins credibility and keeps the belief', () => {
        const { world, a, b } = caravanPair();
        const rumor = falseArmy(world, a);
        meet(world, a, b);
        world.correctRumor(rumor.id, { confirmed: true, byGroupId: a.id });
        meet(world, a, b);
        const inst = b.knownRumors.get(rumor.id);
        expect(inst).toBeDefined();
        expect(inst.credibility).toBe(1.0);
        expect(inst.fidelity).toBe(1.0);
    });
    test('3. Groups that never heard the rumor are unaffected', () => {
        const { world, a, b } = caravanPair();
        const rumor = falseArmy(world, a);
        world.correctRumor(rumor.id, { confirmed: false, byGroupId: a.id });
        meet(world, a, b);
        expect(b.knownRumors.has(rumor.id)).toBe(false);
        expect(b.drivers.threatPressure).toBe(0);
    });
    test('4. Corrections survive snapshot round-trip', () => {
        const { world, a, b } = caravanPair();
        const rumor = falseArmy(world, a);
        meet(world, a, b);
        world.correctRumor(rumor.id, { confirmed: false, byGroupId: a.id });
        meet(world, a, b);
        const restored = new WorldSimulationSystem({ seed: 999 });
        restored.importState(world.exportState());
        expect(restored.rumors.get(rumor.id).correction.confirmed).toBe(false);
        expect(restored.groups.get(b.id).knownRumors.has(rumor.id)).toBe(false);
        expect(restored.groups.get(b.id).knownCorrections.has(rumor.id)).toBe(true);
        expect(restored.groups.get(b.id).drivers.threatPressure).toBe(0);
    });
    test('5. Unknown rumor ids correct to null without history', () => {
        const { world } = caravanPair();
        expect(world.correctRumor('rumor_missing', { confirmed: false })).toBeNull();
        expect(world.queryHistory({ eventType: WORLD_EVENT_TYPES.RUMOR_CORRECTED }).length).toBe(0);
    });
});

describe('NEXT-76: refutation costs directed trust (later loss of trust)', () => {
    function pairing(seed = 42) {
        const world = new WorldSimulationSystem({ seed });
        const rel = new RelationshipTensorSystem();
        const mk = (id, x, leader) => world.registerGroup(id, {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: leader
        });
        const a = mk('a_src', 100, 'LA');
        const b = mk('b_dst', 105, 'LB');
        const meet = () => world._generateSystemicEncounter(a, b,
            { distance: 5, factionSystem: null, relationshipTensorSystem: rel });
        return { world, rel, a, b, meet };
    }
    test('1. Believer loses directed trust toward the originator only', () => {
        const { world, rel, a, b, meet } = pairing();
        const rumor = world.createRumor('WAR_DECLARED', {
            sourceEntityId: a.id, severity: 0.9, description: 'false army report'
        });
        meet();
        const cred = b.knownRumors.get(rumor.id).credibility;
        world.correctRumor(rumor.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        const expected = -(0.30 * (0.5 + 0.5 * cred));
        expect(rel.getRelationship('LB', 'LA').trust).toBeCloseTo(expected, 4);
        expect(rel.getRelationship('LB', 'LA').grievance).toBeGreaterThan(0);
        expect(rel.getRelationship('LA', 'LB').trust).toBe(0);
    });
    test('2. Repeated encounters do not double-count the trust loss', () => {
        const { world, rel, a, b, meet } = pairing();
        const rumor = world.createRumor('WAR_DECLARED', {
            sourceEntityId: a.id, severity: 0.9, description: 'false army report'
        });
        meet();
        world.correctRumor(rumor.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        const once = rel.getRelationship('LB', 'LA').trust;
        meet();
        meet();
        expect(rel.getRelationship('LB', 'LA').trust).toBe(once);
    });
    test('3. Unheard groups lose no trust and gain no entry', () => {
        const { world, rel, a, b, meet } = pairing();
        const c = world.registerGroup('c_far', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 110, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LC'
        });
        const rumor = world.createRumor('WAR_DECLARED', {
            sourceEntityId: a.id, severity: 0.9, description: 'false army report'
        });
        world.correctRumor(rumor.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        expect(c.knownRumors.has(rumor.id)).toBe(false);
        expect(rel.hasRelationship('LC', 'LA')).toBe(false);
    });
    test('4. Confirmation earns directed trust at half the falsehood scale', () => {
        const { world, rel, a, b, meet } = pairing();
        const rumor = world.createRumor('WAR_DECLARED', {
            sourceEntityId: a.id, severity: 0.9, description: 'true army report'
        });
        meet();
        const cred = b.knownRumors.get(rumor.id).credibility;
        world.correctRumor(rumor.id, { confirmed: true, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        const expected = 0.15 * (0.5 + 0.5 * cred);
        expect(rel.getRelationship('LB', 'LA').trust).toBeCloseTo(expected, 4);
        expect(rel.hasRelationship('LA', 'LA')).toBe(false);
    });
    test('5. Originator self-correction writes no self-trust entry', () => {
        const { world, rel, a, b, meet } = pairing();
        const rumor = world.createRumor('WAR_DECLARED', {
            sourceEntityId: a.id, severity: 0.9, description: 'own false report'
        });
        world.correctRumor(rumor.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        expect(a.knownRumors.has(rumor.id)).toBe(false);
        expect(rel.hasRelationship('LA', 'LA')).toBe(false);
    });
});

describe('NEXT-78: threat-pressure alarm fade', () => {
    function quietPair(seed = 42, config = {}) {
        const world = new WorldSimulationSystem({ seed, ...config });
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5
        });
        const b = world.registerGroup('b_dst', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 5000, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5
        });
        return { world, a, b };
    }
    test('1. Quiet ticks fade alarm linearly at the configured rate', () => {
        const { world, b } = quietPair();
        b.drivers.threatPressure = 0.35;
        for (let i = 0; i < 50; i++) world.tick();
        expect(b.drivers.threatPressure).toBeCloseTo(0.30, 6);
    });
    test('2. Long quiet fully clears alarm without going negative', () => {
        const { world, b } = quietPair();
        b.drivers.threatPressure = 0.35;
        for (let i = 0; i < 1000; i++) world.tick();
        expect(b.drivers.threatPressure).toBe(0);
    });
    test('3. Custom decay rates are respected', () => {
        const { world, b } = quietPair(42, { threatPressureDecayRate: 0.01 });
        b.drivers.threatPressure = 0.1;
        for (let i = 0; i < 10; i++) world.tick();
        expect(b.drivers.threatPressure).toBeCloseTo(0, 9);
    });
    test('4. Fade is deterministic for a fixed seed', () => {
        const run = () => {
            const { world, b } = quietPair();
            b.drivers.threatPressure = 0.2;
            for (let i = 0; i < 37; i++) world.tick();
            return b.drivers.threatPressure;
        };
        expect(run()).toBe(run());
    });
});

describe('NEXT-79: belief aging and forgetting', () => {
    function spreadPair(seed = 42, config = {}) {
        const world = new WorldSimulationSystem({ seed, ...config });
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5
        });
        const b = world.registerGroup('b_dst', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 5000, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5
        });
        const rumor = world.createRumor('WAR_DECLARED', {
            sourceEntityId: a.id, severity: 0.9, description: 'unverified army report'
        });
        world._generateSystemicEncounter(a, b, { distance: 5, factionSystem: null, relationshipTensorSystem: null });
        b.position.x = 5000;
        return { world, a, b, rumor };
    }
    test('1. Unreinforced beliefs expire past maxBeliefAgeTicks', () => {
        const { world, b, rumor } = spreadPair();
        expect(b.knownRumors.has(rumor.id)).toBe(true);
        for (let i = 0; i < 2001; i++) world.tick();
        expect(b.knownRumors.has(rumor.id)).toBe(false);
    });
    test('2. Fresh beliefs survive within the age window', () => {
        const { world, b, rumor } = spreadPair();
        for (let i = 0; i < 1990; i++) world.tick();
        expect(b.knownRumors.has(rumor.id)).toBe(true);
    });
    test('3. Re-hearing refreshes recency without strengthening', () => {
        const { world, a, b, rumor } = spreadPair();
        const firstCred = b.knownRumors.get(rumor.id).credibility;
        for (let i = 0; i < 1500; i++) world.tick();
        b.position.x = 105;
        world._generateSystemicEncounter(a, b, { distance: 5, factionSystem: null, relationshipTensorSystem: null });
        b.position.x = 5000;
        expect(b.knownRumors.get(rumor.id).credibility).toBeLessThanOrEqual(firstCred);
        for (let i = 0; i < 1500; i++) world.tick();
        expect(b.knownRumors.has(rumor.id)).toBe(true);
    });
    test('4. Custom age windows are respected', () => {
        const { world, b, rumor } = spreadPair(42, { maxBeliefAgeTicks: 100 });
        for (let i = 0; i < 101; i++) world.tick();
        expect(b.knownRumors.has(rumor.id)).toBe(false);
    });
    test('5. Expiry is deterministic for a fixed seed', () => {
        const run = () => {
            const { world, b, rumor } = spreadPair();
            for (let i = 0; i < 2001; i++) world.tick();
            return b.knownRumors.has(rumor.id);
        };
        expect(run()).toBe(false);
        expect(run()).toBe(run());
    });
});

describe('NEXT-81: correction-awareness bounds', () => {
    function awareWorld(config = {}) {
        const world = new WorldSimulationSystem({ seed: 42, ...config });
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5
        });
        return { world, a };
    }
    test('1. Awareness caps oldest-first at the configured bound', () => {
        const { world, a } = awareWorld({ maxKnownCorrections: 3 });
        const ids = [];
        for (let i = 0; i < 5; i++) {
            const r = world.createRumor('WAR_DECLARED', { severity: 0.5 + i * 0.1 });
            ids.push(r.id);
            world.correctRumor(r.id, { confirmed: false, byGroupId: a.id });
        }
        expect(a.knownCorrections.size).toBe(3);
        expect([...a.knownCorrections]).toEqual(ids.slice(2));
        expect(a.knownCorrections.has(ids[0])).toBe(false);
    });
    test('2. Master eviction purges awareness of the evicted rumor', () => {
        const { world, a } = awareWorld({ maxRumors: 3 });
        const r1 = world.createRumor('WAR_DECLARED', { severity: 0.9 });
        world.createRumor('WAR_DECLARED', { severity: 0.8 });
        world.createRumor('WAR_DECLARED', { severity: 0.7 });
        world.correctRumor(r1.id, { confirmed: false, byGroupId: a.id });
        expect(a.knownCorrections.has(r1.id)).toBe(true);
        world.createRumor('WAR_DECLARED', { severity: 0.6 });
        world.createRumor('WAR_DECLARED', { severity: 0.5 });
        expect(world.rumors.has(r1.id)).toBe(false);
        expect(a.knownCorrections.has(r1.id)).toBe(false);
    });
    test('3. Bounding is deterministic for a fixed seed', () => {
        const run = () => {
            const { world, a } = awareWorld({ maxKnownCorrections: 3 });
            for (let i = 0; i < 5; i++) {
                const r = world.createRumor('WAR_DECLARED', { severity: 0.5 });
                world.correctRumor(r.id, { confirmed: true, byGroupId: a.id });
            }
            return [...a.knownCorrections];
        };
        expect(run()).toEqual(run());
    });
});

describe('NEXT-84: confirmed-belief anchoring', () => {
    function spreadPair(seed = 42) {
        const world = new WorldSimulationSystem({ seed });
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5
        });
        const b = world.registerGroup('b_dst', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 5000, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5
        });
        const rumor = world.createRumor('WAR_DECLARED', {
            sourceEntityId: a.id, severity: 0.9, description: 'army report'
        });
        const meet = () => {
            b.position.x = 105;
            world._generateSystemicEncounter(a, b, { distance: 5, factionSystem: null, relationshipTensorSystem: null });
            b.position.x = 5000;
        };
        meet();
        return { world, a, b, rumor, meet };
    }
    function tick(world, n) {
        for (let i = 0; i < n; i++) world.tick();
    }
    test('1. Confirmation renews the belief as of the correction tick', () => {
        const { world, a, b, rumor, meet } = spreadPair();
        tick(world, 1500);
        world.correctRumor(rumor.id, { confirmed: true, byGroupId: a.id });
        tick(world, 500);
        meet();
        // Anchored to adjudication (1500), not delivery (2000).
        expect(b.knownRumors.get(rumor.id).receivedTick).toBe(1500);
        tick(world, 1500);
        expect(b.knownRumors.has(rumor.id)).toBe(true);
        tick(world, 1);
        expect(b.knownRumors.has(rumor.id)).toBe(false);
    });
    test('2. Unconfirmed control expires on the same schedule', () => {
        const { world, b, rumor } = spreadPair();
        tick(world, 1500);
        tick(world, 1500);
        expect(b.knownRumors.has(rumor.id)).toBe(false);
    });
    test('3. Re-confirmation re-anchors an aging truth', () => {
        const { world, a, b, rumor, meet } = spreadPair();
        tick(world, 1500);
        world.correctRumor(rumor.id, { confirmed: true, byGroupId: a.id });
        meet();
        tick(world, 1500);
        expect(b.knownRumors.has(rumor.id)).toBe(true);
        world.correctRumor(rumor.id, { confirmed: true, byGroupId: a.id });
        meet();
        tick(world, 1500);
        expect(b.knownRumors.has(rumor.id)).toBe(true);
    });
    test('4. Anchoring is deterministic for a fixed seed', () => {
        const run = () => {
            const { world, a, b, rumor, meet } = spreadPair();
            tick(world, 1500);
            world.correctRumor(rumor.id, { confirmed: true, byGroupId: a.id });
            meet();
            tick(world, 1500);
            return b.knownRumors.has(rumor.id);
        };
        expect(run()).toBe(true);
        expect(run()).toBe(run());
    });
});

describe('NEXT-85: heard-threat encounter signal', () => {
    function caravanPair(seed = 42) {
        const world = new WorldSimulationSystem({ seed });
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5
        });
        const b = world.registerGroup('b_dst', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 105, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5
        });
        const meet = () => world._generateSystemicEncounter(a, b,
            { distance: 5, factionSystem: null, relationshipTensorSystem: null });
        return { world, a, b, meet };
    }
    test('1. Severe threat hearing flags the encounter', () => {
        const { world, a, meet } = caravanPair();
        world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        expect(meet().heardThreatRumor).toBe(true);
    });
    test('2. Quiet encounters leave the flag false', () => {
        expect(caravanPair().meet().heardThreatRumor).toBe(false);
    });
    test('3. Weak and non-threat rumors leave the flag false', () => {
        const low = caravanPair();
        low.world.createRumor('AMBUSH_HOTSPOT', { sourceEntityId: low.a.id, severity: 0.2 });
        expect(low.meet().heardThreatRumor).toBe(false);
        const tame = caravanPair();
        tame.world.createRumor('ALLIANCE_FORMED', { sourceEntityId: tame.a.id, severity: 0.9 });
        expect(tame.meet().heardThreatRumor).toBe(false);
    });
    test('4. NEXT-91: the encounter names the heard threat rumors', () => {
        const { world, a, meet } = caravanPair();
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        world.createRumor('ALLIANCE_FORMED', { sourceEntityId: a.id, severity: 0.9 });
        const enc = meet();
        expect(enc.heardThreatRumor).toBe(true);
        expect(enc.heardThreatRumorIds).toEqual([r.id]);
    });
});
describe('NEXT-87: trust-gated correction acceptance', () => {

    function ledPair() {
        const world = new WorldSimulationSystem({ seed: 42 });
        const rel = new RelationshipTensorSystem();
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LA'
        });
        const b = world.registerGroup('b_dst', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 105, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LB'
        });
        const meet = () => world._generateSystemicEncounter(a, b,
            { distance: 5, factionSystem: null, relationshipTensorSystem: rel });
        return { world, rel, a, b, meet };
    }
    function seedFalse(world, a) {
        return world.createRumor('WAR_DECLARED', {
            sourceEntityId: a.id, severity: 0.9, description: 'false army report'
        });
    }
    test('1. Earned distrust dents (NEXT-90) instead of deleting the belief', () => {
        const { world, rel, a, b, meet } = ledPair();
        const rumor = seedFalse(world, a);
        meet();
        const before = b.knownRumors.get(rumor.id).credibility;
        rel.getRelationship('LB', 'LA').trust = 0.1;
        world.correctRumor(rumor.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        expect(b.knownRumors.has(rumor.id)).toBe(true);
        expect(b.knownRumors.get(rumor.id).credibility).toBeCloseTo(Math.max(0.05, before * (0.1 / 0.4)), 6);
        expect(b.knownCorrections.has(rumor.id)).toBe(true);
    });
    test('2. Trusted delivery applies the refutation', () => {
        const { world, rel, a, b, meet } = ledPair();
        const rumor = seedFalse(world, a);
        meet();
        rel.getRelationship('LB', 'LA').trust = 0.9;
        world.correctRumor(rumor.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        expect(b.knownRumors.has(rumor.id)).toBe(false);
        expect(b.knownCorrections.has(rumor.id)).toBe(true);
        expect(rel.getRelationship('LB', 'LA').trust).toBeLessThan(0.9);
    });
    test('3. No reputation means neutral stranger: corrections apply', () => {
        const { world, rel, a, b, meet } = ledPair();
        const rumor = seedFalse(world, a);
        meet();
        expect(rel.hasRelationship('LB', 'LA')).toBe(false);
        world.correctRumor(rumor.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        expect(b.knownRumors.has(rumor.id)).toBe(false);
    });
    test('4. Host-direct application bypasses messenger distrust', () => {
        const { world, rel, a, b, meet } = ledPair();
        const rumor = seedFalse(world, a);
        meet();
        rel.getRelationship('LB', 'LA').trust = 0.1;
        world.correctRumor(rumor.id, { confirmed: false, byGroupId: b.id, relationshipTensorSystem: rel });
        expect(b.knownRumors.has(rumor.id)).toBe(false);
    });
    test('5. Distrust gates confirmations the same way', () => {
        const { world, rel, a, b, meet } = ledPair();
        const rumor = seedFalse(world, a);
        meet();
        rel.getRelationship('LB', 'LA').trust = 0.1;
        world.correctRumor(rumor.id, { confirmed: true, byGroupId: a.id, relationshipTensorSystem: rel });
        expect(world.transmitCorrections(a.id, 'b_dst', { relationshipTensorSystem: rel }))
            .toEqual([{ rumorId: rumor.id, result: 'distrusted' }]);
        meet();
        const inst = b.knownRumors.get(rumor.id);
        expect(inst).toBeDefined();
        expect(inst.credibility).toBeLessThan(1.0);
    });
    test('6. Gating is deterministic for a fixed seed', () => {
        const run = () => {
            const { world, rel, a, b, meet } = ledPair();
            const rumor = seedFalse(world, a);
            meet();
            rel.getRelationship('LB', 'LA').trust = 0.1;
            world.correctRumor(rumor.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
            meet();
            return b.knownRumors.has(rumor.id);
        };
        expect(run()).toBe(true);
        expect(run()).toBe(run());
    });
});

describe('NEXT-88: truth-keyed adjudication', () => {
    function truthWorld() {
        const world = new WorldSimulationSystem({ seed: 42 });
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5
        });
        const b = world.registerGroup('b_dst', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 105, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5
        });
        const meet = () => world._generateSystemicEncounter(a, b,
            { distance: 5, factionSystem: null, relationshipTensorSystem: null });
        return { world, a, b, meet };
    }
    test('1. One truth resolution adjudicates every linked rumor', () => {
        const { world, a, b, meet } = truthWorld();
        const r1 = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9, truthEventId: 'battle_7' });
        const r2 = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.8, truthEventId: 'battle_7' });
        world._generateSystemicEncounter(a, b, { distance: 5, factionSystem: null, relationshipTensorSystem: null });
        const out = world.adjudicateByTruth('battle_7', { confirmed: false, byGroupId: a.id });
        meet();
        expect(out.map(o => o.rumorId).sort()).toEqual([r1.id, r2.id].sort());
        expect(out.every(o => o.correction.confirmed === false)).toBe(true);
        expect(b.knownRumors.has(r1.id)).toBe(false);
        expect(b.knownRumors.has(r2.id)).toBe(false);
        expect(world.queryHistory({ eventType: WORLD_EVENT_TYPES.RUMOR_CORRECTED }).length).toBe(2);
    });
    test('2. Unlinked rumors survive unrelated adjudication', () => {
        const { world, a } = truthWorld();
        const linked = world.createRumor('WAR_DECLARED', { severity: 0.9, truthEventId: 'battle_7' });
        const free = world.createRumor('WAR_DECLARED', { severity: 0.9 });
        world.adjudicateByTruth('battle_7', { confirmed: false });
        expect(world.rumors.get(linked.id).correction.confirmed).toBe(false);
        expect(world.rumors.get(free.id).correction).toBeNull();
    });
    test('3. Unknown and null truth ids are safe empties', () => {
        const { world } = truthWorld();
        world.createRumor('WAR_DECLARED', { severity: 0.9, truthEventId: 'battle_7' });
        expect(world.adjudicateByTruth('no_such_battle', { confirmed: true })).toEqual([]);
        expect(world.adjudicateByTruth(null)).toEqual([]);
        expect(world.adjudicateByTruth(undefined)).toEqual([]);
        expect(world.queryHistory({ eventType: WORLD_EVENT_TYPES.RUMOR_CORRECTED }).length).toBe(0);
    });
    test('4. Confirmed adjudication pins believer credibility', () => {
        const { world, a, b, meet } = truthWorld();
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9, truthEventId: 'battle_7' });
        world._generateSystemicEncounter(a, b, { distance: 5, factionSystem: null, relationshipTensorSystem: null });
        world.adjudicateByTruth('battle_7', { confirmed: true, byGroupId: a.id });
        meet();
        expect(b.knownRumors.get(r.id).credibility).toBe(1.0);
    });
});

describe('NEXT-89: rehabilitation through vindication', () => {
    function ledPair() {
        const world = new WorldSimulationSystem({ seed: 42 });
        const rel = new RelationshipTensorSystem();
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LA'
        });
        const b = world.registerGroup('b_dst', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 105, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LB'
        });
        const meet = () => world._generateSystemicEncounter(a, b,
            { distance: 5, factionSystem: null, relationshipTensorSystem: rel });
        const trust = () => rel.getRelationship('LB', 'LA').trust;
        return { world, rel, a, b, meet, trust };
    }
    function expose(world, rel, a, meet) {
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        meet();
        world.correctRumor(r.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        return r;
    }
    function vindicate(world, rel, a, meet) {
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        meet();
        world.correctRumor(r.id, { confirmed: true, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        return r;
    }
    test('1. Distrusted confirmation rebuilds trust without pinning belief', () => {
        const { world, rel, a, b, meet, trust } = ledPair();
        expose(world, rel, a, meet);
        expect(trust()).toBeCloseTo(-0.215, 3);
        const r = vindicate(world, rel, a, meet);
        expect(trust()).toBeCloseTo(-0.1075, 4);
        expect(b.knownRumors.has(r.id)).toBe(true);
        expect(b.knownRumors.get(r.id).credibility).toBeLessThan(1.0);
    });
    test('2. Consistent truth-telling reopens the gate', () => {
        const { world, rel, a, b, meet, trust } = ledPair();
        expose(world, rel, a, meet);
        for (let i = 0; i < 6; i++) vindicate(world, rel, a, meet);
        expect(trust()).toBeGreaterThanOrEqual(0.4);
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        meet();
        world.correctRumor(r.id, { confirmed: true, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        expect(b.knownRumors.get(r.id).credibility).toBe(1.0);
    });
    test('3. Distrusted refutation reports dented, not silent success', () => {
        const { world, rel, a, meet } = ledPair();
        expose(world, rel, a, meet);
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        meet();
        world.correctRumor(r.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        const applied = world.transmitCorrections(a.id, 'b_dst', { relationshipTensorSystem: rel });
        expect(applied).toEqual([{ rumorId: r.id, result: 'dented' }]);
    });
    test('4. Rehabilitation is deterministic for a fixed seed', () => {
        const run = () => {
            const { world, rel, a, meet, trust } = ledPair();
            expose(world, rel, a, meet);
            vindicate(world, rel, a, meet);
            vindicate(world, rel, a, meet);
            return trust();
        };
        expect(run()).toBeCloseTo(0, 4);
        expect(run()).toBe(run());
    });
});

describe('NEXT-90: graded correction acceptance', () => {
    function ledPair() {
        const world = new WorldSimulationSystem({ seed: 42 });
        const rel = new RelationshipTensorSystem();
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LA'
        });
        const b = world.registerGroup('b_dst', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 105, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LB'
        });
        const meet = () => world._generateSystemicEncounter(a, b,
            { distance: 5, factionSystem: null, relationshipTensorSystem: rel });
        return { world, rel, a, b, meet };
    }
    function dentedCred(trustValue) {
        const { world, rel, a, b, meet } = ledPair();
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        meet();
        const before = b.knownRumors.get(r.id).credibility;
        rel.getRelationship('LB', 'LA').trust = trustValue;
        world.correctRumor(r.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        return { held: b.knownRumors.has(r.id), cred: b.knownRumors.get(r.id)?.credibility, before };
    }
    test('1. Dent depth is monotonic in messenger trust', () => {
        const levels = [0.1, 0.2, 0.3].map(dentedCred);
        expect(levels.every(l => l.held)).toBe(true);
        expect(levels[0].cred).toBeLessThan(levels[1].cred);
        expect(levels[1].cred).toBeLessThan(levels[2].cred);
        expect(levels[2].cred).toBeLessThan(levels[2].before);
    });
    test('2. Zero trust guts confidence to the floor', () => {
        const { held, cred } = dentedCred(0.0);
        expect(held).toBe(true);
        expect(cred).toBe(0.05);
    });
    test('3. The 0.4 boundary still fully applies', () => {
        const { world, rel, a, b, meet } = ledPair();
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        meet();
        rel.getRelationship('LB', 'LA').trust = 0.4;
        world.correctRumor(r.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        expect(b.knownRumors.has(r.id)).toBe(false);
    });
});

describe('NEXT-92: timescale layering', () => {
    function quietPair(config = {}) {
        const world = new WorldSimulationSystem({ seed: 42, ...config });
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LA'
        });
        const b = world.registerGroup('b_dst', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 5000, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LB'
        });
        return { world, a, b };
    }
    function tick(world, n) {
        for (let i = 0; i < n; i++) world.tick();
    }
    test('1. Alarm clears strictly before beliefs expire', () => {
        const { world, a, b } = quietPair();
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        b.position.x = 105;
        world._generateSystemicEncounter(a, b, { distance: 5, factionSystem: null, relationshipTensorSystem: null });
        b.position.x = 5000;
        b.drivers.threatPressure = 0.35;
        tick(world, 400);
        expect(b.drivers.threatPressure).toBe(0);
        expect(b.knownRumors.has(r.id)).toBe(true);
    });
    test('2. Rehabilitation terminates within ten vindicated truths', () => {
        const { world, a, b } = quietPair();
        const rel = new RelationshipTensorSystem();
        const meet = () => {
            b.position.x = 105;
            world._generateSystemicEncounter(a, b,
                { distance: 5, factionSystem: null, relationshipTensorSystem: rel });
            b.position.x = 5000;
        };
        const r0 = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        meet();
        world.correctRumor(r0.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        let rounds = 0;
        while (rel.getRelationship('LB', 'LA').trust < 0.4 && rounds < 10) {
            const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
            meet();
            world.correctRumor(r.id, { confirmed: true, byGroupId: a.id, relationshipTensorSystem: rel });
            meet();
            rounds++;
        }
        expect(rel.getRelationship('LB', 'LA').trust).toBeGreaterThanOrEqual(0.4);
    });
});

describe('CCIR-24: idempotent corrections', () => {
    function ledPair() {
        const world = new WorldSimulationSystem({ seed: 42 });
        const rel = new RelationshipTensorSystem();
        const a = world.registerGroup('a_src', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LA'
        });
        const b = world.registerGroup('b_dst', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 105, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LB'
        });
        const meet = () => world._generateSystemicEncounter(a, b,
            { distance: 5, factionSystem: null, relationshipTensorSystem: rel });
        const trust = () => rel.getRelationship('LB', 'LA').trust;
        return { world, rel, a, b, meet, trust };
    }
    test('1. Host re-adjudication on the holder pays no second reward', () => {
        const { world, rel, a, b, meet, trust } = ledPair();
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        meet();
        world.correctRumor(r.id, { confirmed: true, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        const afterFirst = trust();
        expect(b.knownCorrections.has(r.id)).toBe(true);
        world.correctRumor(r.id, { confirmed: true, byGroupId: b.id, relationshipTensorSystem: rel });
        expect(trust()).toBe(afterFirst);
        expect(b.knownRumors.get(r.id).credibility).toBe(1.0);
    });
    test('2. Distrusted-confirm retransmit freezes rehabilitation (red-team replay)', () => {
        const { world, rel, a, meet, trust } = ledPair();
        rel.getRelationship('LB', 'LA').trust = 0.1;
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        meet();
        world.correctRumor(r.id, { confirmed: true, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        expect(trust()).toBeCloseTo(0.2075, 4);
        rel.getRelationship('LA', 'LB').trust = 1.0;
        meet();
        expect(trust()).toBeCloseTo(0.2075, 4);
    });
    // Refute-penalty double-charge is structurally unreachable: the first
    // refutation deletes the instance and the NEXT-76 transmit skip blocks
    // re-acquisition, so the repeat-application guard there is
    // defense-in-depth with no live vector to pin (probed both layers).
    test('4. Repeat dent application compounds no second credibility dent', () => {
        const { world, rel, a, b, meet } = ledPair();
        rel.getRelationship('LB', 'LA').trust = 0.1;
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: a.id, severity: 0.9 });
        meet();
        const heard = b.knownRumors.get(r.id).credibility;
        world.correctRumor(r.id, { confirmed: false, byGroupId: a.id, relationshipTensorSystem: rel });
        meet();
        const dented = b.knownRumors.get(r.id).credibility;
        expect(dented).toBeLessThan(heard);
        const master = world.rumors.get(r.id);
        world._applyCorrection(b, master, { relationshipTensorSystem: rel, senderGroupId: a.id });
        expect(b.knownRumors.get(r.id).credibility).toBe(dented);
    });
});

describe('NEXT-101: origin-provided flag', () => {
    test('5. Unprovided origins store zeros but flag absence', () => {
        const world = new WorldSimulationSystem({ seed: 42 });
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: null, severity: 0.9 });
        expect(r.originProvided).toBe(false);
        expect(r.originLocation).toEqual({ x: 0, y: 0, z: 0 });
    });
    test('6. Explicit origins flag presence, even at the map origin', () => {
        const world = new WorldSimulationSystem({ seed: 42 });
        const r = world.createRumor('WAR_DECLARED', { originLocation: { x: 0, y: 0, z: 0 } });
        expect(r.originProvided).toBe(true);
    });
});

describe('NEXT-112: refresh-only re-hearings bump nothing', () => {
    function ledPair() {
        const world = new WorldSimulationSystem({ seed: 11 });
        const rel = new RelationshipTensorSystem();
        const a = world.registerGroup('ga_a', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LA'
        });
        const b = world.registerGroup('gb_b', {
            type: ROAMING_PARTY_TYPES.CARAVAN,
            position: { x: 105, y: 0, z: 100 },
            militaryStrength: 0.5, wealth: 0.5, leaderId: 'LB'
        });
        const meet = () => world._generateSystemicEncounter(a, b,
            { distance: 5, factionSystem: null, relationshipTensorSystem: rel });
        return { world, a, b, meet };
    }
    test('7. Fresh hearing bumps once with the rumor id', () => {
        const { world, meet } = ledPair();
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: 'ga_a', severity: 0.9 });
        const enc = meet();
        expect(enc.heardThreatRumor).toBe(true);
        expect(enc.heardThreatRumorIds).toContain(r.id);
    });
    test('8. Immediate re-hearings at equal credibility bump nothing', () => {
        // The earlier confirmed-rehearing scare was a synthetic artifact:
        // hand-listed ids bypass the new-or-upgraded gate. Live encounters
        // refresh recency without re-bumping pressure or ids.
        const { world, b, meet } = ledPair();
        world.createRumor('WAR_DECLARED', { sourceEntityId: 'ga_a', severity: 0.9 });
        meet();
        const before = b.drivers.threatPressure;
        const e2 = meet();
        const e3 = meet();
        expect(e2.heardThreatRumor).toBe(false);
        expect(e2.heardThreatRumorIds).toEqual([]);
        expect(e3.heardThreatRumor).toBe(false);
        expect(b.drivers.threatPressure).toBe(before);
    });
    test('9. Refresh still renews recency without strengthening belief', () => {
        const { world, b, meet } = ledPair();
        const r = world.createRumor('WAR_DECLARED', { sourceEntityId: 'ga_a', severity: 0.9 });
        meet();
        const cred = b.knownRumors.get(r.id).credibility;
        world.tickCount += 10;
        meet();
        expect(b.knownRumors.get(r.id).credibility).toBe(cred);
    });
    test('10. Refresh coherence is deterministic', () => {
        const run = () => {
            const { b, meet } = ledPair();
            meet(); meet();
            return b.drivers.threatPressure;
        };
        expect(run()).toBe(run());
    });
});
