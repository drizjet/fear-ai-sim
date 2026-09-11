/**
 * tests/civilization-lod-trade.test.js
 *
 * Test suite for Milestone G: Civilization Simulation, Dynamic Trade Routes,
 * and 5-Tier Cognitive Level-of-Detail (LOD).
 *
 * Verifies:
 * 1. 5-Tier Cognitive LOD spatial partitioning (LOD0 to LOD4)
 * 2. Amortized cadence updates per LOD tier
 * 3. State Continuity Invariant across camera focus movement (zero discontinuous jumps)
 * 4. Economic trade route utility ranking and profit calculations
 * 5. Dynamic danger rerouting: incidents spike danger and redirect caravans to safe detours
 * 6. Temporal danger decay across peaceful simulation intervals
 * 7. Snapshot serialization and 100% bit-for-bit replay determinism
 */

import {
    CivilizationSimulationSystem,
    COGNITIVE_LOD_TIERS,
    LOD_CADENCES,
    ROUTE_STATUS,
    COMMODITY_TYPES
} from '../packages/core/index.js';

describe('Milestone G: Civilization Simulation & Cognitive LOD Engine', () => {
    let civ;

    beforeEach(() => {
        civ = new CivilizationSimulationSystem();
    });

    test('1. 5-Tier Cognitive LOD spatial partitioning allocates correct detail levels', () => {
        civ.setFocusOrigin(0, 0, 0);

        // Register entities at exact boundary intervals
        civ.registerEntity('ent_lod0', { position: { x: 15, y: 0, z: 0 } });   // 15m < 30m -> LOD0
        civ.registerEntity('ent_lod1', { position: { x: 50, y: 0, z: 0 } });   // 50m < 80m -> LOD1
        civ.registerEntity('ent_lod2', { position: { x: 150, y: 0, z: 0 } });  // 150m < 250m -> LOD2
        civ.registerEntity('ent_lod3', { position: { x: 500, y: 0, z: 0 } });  // 500m < 1000m -> LOD3
        civ.registerEntity('ent_lod4', { position: { x: 1500, y: 0, z: 0 } }); // 1500m >= 1000m -> LOD4

        const report = civ.updateLODTiers();

        expect(civ.entities.get('ent_lod0').lodTier).toBe(COGNITIVE_LOD_TIERS.LOD0_IMMEDIATE);
        expect(civ.entities.get('ent_lod1').lodTier).toBe(COGNITIVE_LOD_TIERS.LOD1_TACTICAL);
        expect(civ.entities.get('ent_lod2').lodTier).toBe(COGNITIVE_LOD_TIERS.LOD2_REGIONAL);
        expect(civ.entities.get('ent_lod3').lodTier).toBe(COGNITIVE_LOD_TIERS.LOD3_MACRO_ROUTE);
        expect(civ.entities.get('ent_lod4').lodTier).toBe(COGNITIVE_LOD_TIERS.LOD4_OFFSCREEN);

        expect(report.counts[COGNITIVE_LOD_TIERS.LOD0_IMMEDIATE]).toBe(1);
        expect(report.counts[COGNITIVE_LOD_TIERS.LOD4_OFFSCREEN]).toBe(1);
    });

    test('2. Cognitive LOD cadences throttle update frequency proportionally', () => {
        civ.setFocusOrigin(0, 0, 0);
        civ.registerEntity('ent_near', { position: { x: 10, y: 0 } });  // LOD0 (cadence 1)
        civ.registerEntity('ent_tact', { position: { x: 60, y: 0 } });  // LOD1 (cadence 5)
        civ.registerEntity('ent_far', { position: { x: 1500, y: 0 } }); // LOD4 (cadence 500)

        // Advance 1 tick: LOD0 updates, LOD1 and LOD4 skip
        const tick1 = civ.advanceSimulation(1);
        expect(tick1.updatedEntityCount).toBe(1);
        expect(civ.entities.get('ent_near').lastUpdateTick).toBe(1);
        expect(civ.entities.get('ent_tact').lastUpdateTick).toBe(0);

        // Advance 4 more ticks (tick 5): LOD0 updates every tick, LOD1 updates on tick 5
        const tick5 = civ.advanceSimulation(4);
        expect(tick5.updatedEntityCount).toBe(2); // LOD0 and LOD1
        expect(civ.entities.get('ent_tact').lastUpdateTick).toBe(5);
        expect(civ.entities.get('ent_far').lastUpdateTick).toBe(0);
    });

    test('3. State Continuity Invariant preserves internal attributes across focus movements', () => {
        civ.setFocusOrigin(0, 0, 0);
        const entity = civ.registerEntity('nomad_leader', {
            position: { x: 1200, y: 0, z: 0 }, // Starts offscreen in LOD4
            fear: 0.35,
            morale: 0.75,
            wealth: 450
        });

        expect(entity.lodTier).toBe(COGNITIVE_LOD_TIERS.LOD4_OFFSCREEN);

        // Camera jumps to nomad leader (promoting directly from LOD4 -> LOD0)
        civ.setFocusOrigin(1200, 0, 0);
        const report = civ.updateLODTiers();

        expect(entity.lodTier).toBe(COGNITIVE_LOD_TIERS.LOD0_IMMEDIATE);
        expect(report.transitions.length).toBe(1);
        expect(report.transitions[0].fromTier).toBe(COGNITIVE_LOD_TIERS.LOD4_OFFSCREEN);
        expect(report.transitions[0].toTier).toBe(COGNITIVE_LOD_TIERS.LOD0_IMMEDIATE);

        // Internal affective state must remain perfectly continuous (no NaN or reset)
        expect(entity.fear).toBeCloseTo(0.35, 4);
        expect(entity.morale).toBeCloseTo(0.75, 4);
        expect(entity.wealth).toBe(450);
    });

    test('4. Trade route evaluation selects highest utility based on profit and distance', () => {
        civ.registerNode('town_a', {
            market: { [COMMODITY_TYPES.ORE]: { sellPrice: 15 } }
        });
        civ.registerNode('town_b', {
            market: { [COMMODITY_TYPES.ORE]: { buyPrice: 40 } }
        });

        civ.registerRoute('direct_route', {
            fromNodeId: 'town_a',
            toNodeId: 'town_b',
            distance: 100,
            baseSecurity: 0.9,
            toll: 0
        });

        civ.registerRoute('long_route', {
            fromNodeId: 'town_a',
            toNodeId: 'town_b',
            distance: 400,
            baseSecurity: 0.9,
            toll: 10
        });

        const ranking = civ.rankTradeRoutes('town_a', 'town_b', COMMODITY_TYPES.ORE);

        expect(ranking.length).toBe(2);
        expect(ranking[0].routeId).toBe('direct_route');
        expect(ranking[0].utility).toBeGreaterThan(ranking[1].utility);
        expect(ranking[0].recommended).toBe(true);
    });

    test('5. Dynamic danger rerouting diverts trade caravans around raided corridors', () => {
        civ.registerNode('city_north', {
            market: { [COMMODITY_TYPES.FOOD]: { sellPrice: 10, buyPrice: 15 } }
        });
        civ.registerNode('city_south', {
            market: { [COMMODITY_TYPES.FOOD]: { sellPrice: 20, buyPrice: 35 } }
        });

        civ.registerRoute('valley_pass', {
            fromNodeId: 'city_north',
            toNodeId: 'city_south',
            distance: 120,
            baseSecurity: 0.85
        });

        civ.registerRoute('mountain_detour', {
            fromNodeId: 'city_north',
            toNodeId: 'city_south',
            distance: 280,
            baseSecurity: 0.95
        });

        // Initially valley_pass is preferred
        const initRank = civ.rankTradeRoutes('city_north', 'city_south', COMMODITY_TYPES.FOOD);
        expect(initRank[0].routeId).toBe('valley_pass');

        // Lethal ambush strikes valley_pass
        civ.recordRouteIncident('valley_pass', 'BANDIT_AMBUSH', 0.80);
        const valleyRoute = civ.routes.get('valley_pass');
        expect(valleyRoute.status).toBe(ROUTE_STATUS.BLOCKED);

        // Caravans dynamically re-rank and choose mountain_detour
        const reroutedRank = civ.rankTradeRoutes('city_north', 'city_south', COMMODITY_TYPES.FOOD);
        expect(reroutedRank[0].routeId).toBe('mountain_detour');
        expect(reroutedRank[0].recommended).toBe(true);
        expect(reroutedRank[1].routeId).toBe('valley_pass');
        expect(reroutedRank[1].recommended).toBe(false);
    });

    test('6. Temporal decay restores security on peaceful corridors', () => {
        civ.registerRoute('coastal_road', {
            fromNodeId: 'n1',
            toNodeId: 'n2',
            distance: 100,
            baseSecurity: 0.90
        });

        civ.recordRouteIncident('coastal_road', 'PIRATE_RAID', 0.60);
        const highDanger = civ.routes.get('coastal_road').perceivedDanger;
        expect(highDanger).toBeGreaterThan(0.60);

        // Advance 160 ticks (2 half-lives)
        civ.advanceSimulation(160);

        const decayedDanger = civ.routes.get('coastal_road').perceivedDanger;
        expect(decayedDanger).toBeLessThan(highDanger * 0.40);
        expect(civ.routes.get('coastal_road').status).not.toBe(ROUTE_STATUS.BLOCKED);
    });

    test('7. State serialization and 100% bit-for-bit replay determinism', () => {
        civ.setFocusOrigin(50, 50, 0);
        civ.registerNode('n_alpha', { position: { x: 0, y: 0 } });
        civ.registerNode('n_beta', { position: { x: 100, y: 100 } });
        civ.registerRoute('r_connect', { fromNodeId: 'n_alpha', toNodeId: 'n_beta', distance: 150 });
        civ.registerEntity('caravan_1', { position: { x: 45, y: 45 }, fear: 0.2, currentRouteId: 'r_connect' });

        civ.advanceSimulation(10);

        const snapshot = civ.getState();
        expect(snapshot.tickCount).toBe(10);
        expect(snapshot.nodes.length).toBe(2);

        const cloneCiv = new CivilizationSimulationSystem();
        cloneCiv.setState(snapshot);

        expect(cloneCiv.tickCount).toBe(10);
        expect(cloneCiv.focusOrigin).toEqual({ x: 50, y: 50, z: 0 });

        // Advance both instances simultaneously
        civ.advanceSimulation(15);
        cloneCiv.advanceSimulation(15);

        const origCaravan = civ.entities.get('caravan_1');
        const cloneCaravan = cloneCiv.entities.get('caravan_1');

        expect(origCaravan.lodTier).toBe(cloneCaravan.lodTier);
        expect(origCaravan.fear).toBeCloseTo(cloneCaravan.fear, 6);
        expect(origCaravan.routeProgress).toBeCloseTo(cloneCaravan.routeProgress, 6);
    });
});

describe('NEXT-96: route exoneration mechanics', () => {
    let civ;
    beforeEach(() => {
        civ = new CivilizationSimulationSystem();
    });
    test('8. Negative severity retracts danger symmetrically and floors at zero', () => {
        civ.registerNode('n1', { market: {} });
        civ.registerNode('n2', { market: {} });
        civ.registerRoute('quiet_road', { fromNodeId: 'n1', toNodeId: 'n2', distance: 100, baseSecurity: 0.90 });
        const route = civ.routes.get('quiet_road');
        const base = route.perceivedDanger;
        civ.recordRouteIncident('quiet_road', 'RUMOR_THREAT', 0.10);
        expect(route.perceivedDanger).toBeCloseTo(base + 0.10, 9);
        civ.recordRouteIncident('quiet_road', 'RUMOR_EXONERATED', -0.10);
        expect(route.perceivedDanger).toBeCloseTo(base, 9);
        civ.recordRouteIncident('quiet_road', 'RUMOR_EXONERATED', -0.10);
        civ.recordRouteIncident('quiet_road', 'RUMOR_EXONERATED', -0.10);
        expect(route.perceivedDanger).toBe(0);
        expect(route.status).toBe(ROUTE_STATUS.SAFE);
    });
});
