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
