import {
    RoamingBandSystem,
    BAND_ARCHETYPES,
    BAND_STATES,
    ROAMING_INTENTS,
    ENCOUNTER_CATEGORIES,
    ROAMING_ENCOUNTER_RESOLUTIONS
} from '../packages/core/index.js';

describe('Front C: RoamingBandSystem & Procedural Encounters', () => {
    let system;

    beforeEach(() => {
        system = new RoamingBandSystem({ seed: 42 });

        // Register candidate destinations
        system.registerDestination({
            id: 'RIVERBEND_MARKET',
            name: 'Riverbend Market',
            position: { x: 100, y: 0, z: 50 },
            type: 'MARKET',
            resources: { food: 0.8, shelter: 0.7, tradeProfit: 0.9 },
            baseHazard: 0.1
        });

        system.registerDestination({
            id: 'HIGHLAND_MINE',
            name: 'Highland Mine',
            position: { x: 300, y: 0, z: 200 },
            type: 'OUTPOST',
            resources: { food: 0.2, shelter: 0.3, tradeProfit: 0.6 },
            baseHazard: 0.4
        });

        system.registerDestination({
            id: 'OAKHAVEN_HOME',
            name: 'Oakhaven Settlement',
            position: { x: 0, y: 0, z: 0 },
            type: 'SETTLEMENT',
            resources: { food: 0.9, shelter: 0.95, tradeProfit: 0.3 },
            baseHazard: 0.05
        });
    });

    test('1. Multi-Criteria Destination Utility ranks based on archetype weights and pressing needs', () => {
        // Caravan with goods should prioritize Riverbend Market (high profit, high safety)
        system.registerBand({
            id: 'caravan_alpha',
            archetype: BAND_ARCHETYPES.TRADE_CARAVAN,
            position: { x: 20, y: 0, z: 20 },
            homeBase: { x: 0, y: 0, z: 0, id: 'OAKHAVEN_HOME' },
            wealth: 60.0,
            hunger: 0.1,
            fatigue: 0.1,
            fear: 0.0
        });

        const utilities = system.evaluateDestinationUtilities('caravan_alpha');
        expect(utilities.length).toBe(3);
        // Top utility should be Riverbend Market due to high profit attraction
        expect(utilities[0].destinationId).toBe('RIVERBEND_MARKET');
        expect(utilities[0].breakdown.profitAttraction).toBeGreaterThan(0.8);
    });

    test('2. Route Memory hazard logging and exponential decay over time', () => {
        system.registerBand({
            id: 'scout_unit',
            archetype: BAND_ARCHETYPES.PATROL_GUARD,
            position: { x: 50, y: 0, z: 50 }
        });

        // Record acute ambush hazard on Highland Mine
        system.recordHazard('scout_unit', 'HIGHLAND_MINE', 0.80);
        const immediateHazard = system.getDecayedHazard('scout_unit', 'HIGHLAND_MINE');
        expect(immediateHazard).toBeCloseTo(0.80, 2);

        // Advance 50 ticks and verify exponential decay
        for (let i = 0; i < 50; i++) {
            system.step();
        }

        const decayedHazard = system.getDecayedHazard('scout_unit', 'HIGHLAND_MINE');
        expect(decayedHazard).toBeLessThan(immediateHazard);
        expect(decayedHazard).toBeGreaterThan(0.0);
    });

    test('3. Home Tether pull activates when wealth is high or fear is critical', () => {
        system.registerBand({
            id: 'rich_trader',
            archetype: BAND_ARCHETYPES.TRADE_CARAVAN,
            position: { x: 80, y: 0, z: 40 },
            homeBase: { x: 0, y: 0, z: 0, id: 'OAKHAVEN_HOME' },
            wealth: 95.0, // High wealth triggers tether
            fear: 0.70    // High fear triggers tether
        });

        const utils = system.evaluateDestinationUtilities('rich_trader');
        const homeNode = utils.find(u => u.destinationId === 'OAKHAVEN_HOME');
        expect(homeNode.breakdown.homeTether).toBeGreaterThan(0.5);
    });

    test('4. Dynamic Camp Lifecycle: pitch on fatigue, rest recovery, normal break camp', () => {
        system.registerBand({
            id: 'weary_nomads',
            archetype: BAND_ARCHETYPES.NOMAD_TRIBE,
            position: { x: 150, y: 0, z: 150 },
            fatigue: 0.85, // Exhausted
            state: BAND_STATES.TRAVELING
        });

        // Step 1: High fatigue triggers camp pitch
        const pitchRes = system.evaluateCampLifecycle('weary_nomads', { isNight: false, isStorm: false });
        expect(pitchRes.intent).toBe(ROAMING_INTENTS.INTENT_ESTABLISH_CAMP);
        expect(pitchRes.state).toBe(BAND_STATES.CAMPED);

        // Step 2: While camped, fatigue recovers
        const weary = system.bands.get('weary_nomads');
        weary.fatigue = 0.10; // Fully rested
        const breakRes = system.evaluateCampLifecycle('weary_nomads', { isNight: false, isStorm: false });
        expect(breakRes.intent).toBe(ROAMING_INTENTS.INTENT_BREAK_CAMP);
        expect(breakRes.state).toBe(BAND_STATES.TRAVELING);
    });

    test('5. Dynamic Camp Lifecycle: Emergency Evacuation upon proximate threat + high fear', () => {
        system.registerBand({
            id: 'camped_refugees',
            archetype: BAND_ARCHETYPES.DISPLACED_REFUGEES,
            position: { x: 50, y: 0, z: 50 },
            fatigue: 0.50,
            fear: 0.75, // Terrified
            state: BAND_STATES.CAMPED,
            wealth: 50.0
        });

        // Proximate bandit band appears 20m away (< emergencyThreatDistance 35m)
        system.registerBand({
            id: 'hostile_raiders',
            archetype: BAND_ARCHETYPES.BANDIT_RAIDERS,
            position: { x: 65, y: 0, z: 50 }, // 15m away
            state: BAND_STATES.TRAVELING
        });

        const evacRes = system.evaluateCampLifecycle('camped_refugees');
        expect(evacRes.intent).toBe(ROAMING_INTENTS.INTENT_EVACUATE_CAMP);
        expect(evacRes.state).toBe(BAND_STATES.FLEEING);
        // Wealth jettisoned for escape
        expect(system.bands.get('camped_refugees').wealth).toBeLessThan(50.0);
    });

    test('6. Procedural Systemic Encounters: Highway Ambush with extortion tribute resolution', () => {
        // Caravan with high fear & wealth meets Bandits
        system.registerBand({
            id: 'convoy_1',
            archetype: BAND_ARCHETYPES.TRADE_CARAVAN,
            position: { x: 100, y: 0, z: 100 },
            wealth: 80.0,
            fear: 0.60,
            power: 20.0
        });

        system.registerBand({
            id: 'bandits_1',
            archetype: BAND_ARCHETYPES.BANDIT_RAIDERS,
            position: { x: 110, y: 0, z: 100 }, // 10m away
            wealth: 10.0,
            power: 35.0 // Outpowers caravan
        });

        const encounters = system.evaluateSystemicEncounters();
        expect(encounters.length).toBe(1);
        expect(encounters[0].category).toBe(ENCOUNTER_CATEGORIES.HIGHWAY_AMBUSH);
        expect(encounters[0].resolution).toBe(ROAMING_ENCOUNTER_RESOLUTIONS.EXTORTION_PAID);

        // Bandit wealth increases, caravan wealth decreases
        expect(system.bands.get('convoy_1').wealth).toBeLessThan(80.0);
        expect(system.bands.get('bandits_1').wealth).toBeGreaterThan(10.0);
    });

    test('7. Procedural Systemic Encounters: Humanitarian relief between caravan and refugees', () => {
        system.registerBand({
            id: 'kind_caravan',
            archetype: BAND_ARCHETYPES.TRADE_CARAVAN,
            position: { x: 200, y: 0, z: 200 },
            wealth: 100.0
        });

        system.registerBand({
            id: 'starving_refugees',
            archetype: BAND_ARCHETYPES.DISPLACED_REFUGEES,
            position: { x: 215, y: 0, z: 200 }, // 15m away
            hunger: 0.90,
            fear: 0.80
        });

        const encounters = system.evaluateSystemicEncounters();
        expect(encounters.length).toBe(1);
        expect(encounters[0].category).toBe(ENCOUNTER_CATEGORIES.REFUGEE_HUMANITARIAN_RELIEF);
        expect(encounters[0].resolution).toBe(ROAMING_ENCOUNTER_RESOLUTIONS.RELIEF_PROVIDED);
        expect(system.bands.get('starving_refugees').hunger).toBeLessThan(0.90);
    });

    test('8. State serialization and 100% bit-exact replay determinism', () => {
        system.registerBand({
            id: 'patrol_omega',
            archetype: BAND_ARCHETYPES.PATROL_GUARD,
            position: { x: 30, y: 0, z: 30 },
            wealth: 40.0
        });

        system.step();
        system.recordHazard('patrol_omega', 'RIVERBEND_MARKET', 0.50);

        const stateA = system.getState();
        const systemB = new RoamingBandSystem({ seed: 42 });
        systemB.setState(stateA);
        const stateB = systemB.getState();

        expect(JSON.stringify(stateA)).toBe(JSON.stringify(stateB));
    });

    test('9. Host Game Authority Invariant strictly preserved', () => {
        system.registerBand({
            id: 'guard_unit',
            archetype: BAND_ARCHETYPES.PATROL_GUARD,
            position: { x: 10, y: 20, z: 30 }
        });

        const initialPos = { ...system.bands.get('guard_unit').position };
        const res = system.evaluateCampLifecycle('guard_unit');

        // Middleware generates advisory intent and recommended waypoint without mutating host transform
        expect(res.intent).toBeDefined();
        expect(system.bands.get('guard_unit').position).toEqual(initialPos);
    });
});
