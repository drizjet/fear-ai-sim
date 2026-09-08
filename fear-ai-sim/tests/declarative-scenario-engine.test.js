/**
 * tests/declarative-scenario-engine.test.js
 *
 * Sections 119, 120, 121, 122 / Frontiers A & E:
 * Comprehensive test battery for Declarative Scenario Engine:
 * - ScenarioValidator: structural, referential, constraint verification
 * - ScenarioInstantiator: living-world instantiation, timeline events
 * - ScenarioFuzzer: procedural scenario generation across continuous hypercubes
 * - PropertyVerifier: bounded affect, resource conservation, escalation legality
 */

import { describe, it, expect } from '@jest/globals';
import {
    ScenarioValidator,
    ScenarioInstantiator,
    ScenarioFuzzer,
    PropertyVerifier,
    TIMELINE_EVENT_TYPES,
    VALIDATION_ERROR_CODES
} from '../packages/core/index.js';

describe('Frontiers A & E: Declarative Scenario Engine (Sections 119-122)', () => {
    describe('ScenarioValidator', () => {
        it('1. Rejects invalid roots and missing metadata', () => {
            expect(ScenarioValidator.validate(null).valid).toBe(false);
            expect(ScenarioValidator.validate('not_an_object').valid).toBe(false);

            const missingMeta = ScenarioValidator.validate({ factions: [] });
            expect(missingMeta.valid).toBe(false);
            expect(missingMeta.errors.some(e => e.code === VALIDATION_ERROR_CODES.MISSING_METADATA)).toBe(true);
        });

        it('2. Rejects dangling faction references in actors', () => {
            const badScenario = {
                metadata: { id: 'test_dangling_faction' },
                factions: [{ id: 'faction_valid', militaryReadiness: 0.5 }],
                settlements: [{ id: 'town_1', population: 50 }],
                actors: [
                    { id: 'actor_orphan', factionId: 'faction_ghost', traits: { neuroticism: 0.4 } }
                ]
            };
            const result = ScenarioValidator.validate(badScenario);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === VALIDATION_ERROR_CODES.DANGLING_FACTION_REF)).toBe(true);
        });

        it('3. Rejects out-of-bounds traits in actors', () => {
            const badTraitsScenario = {
                metadata: { id: 'test_bad_traits' },
                factions: [{ id: 'faction_1' }],
                actors: [
                    { id: 'actor_extreme', factionId: 'faction_1', traits: { neuroticism: 1.5 } }
                ]
            };
            const result = ScenarioValidator.validate(badTraitsScenario);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === VALIDATION_ERROR_CODES.INVALID_ACTOR_TRAIT)).toBe(true);
        });

        it('4. Rejects invalid settlement population and negative resources', () => {
            const badSettlement = {
                metadata: { id: 'test_settlement_err' },
                settlements: [
                    { id: 'town_neg', population: -10, resources: { food: -5 } }
                ]
            };
            const result = ScenarioValidator.validate(badSettlement);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === VALIDATION_ERROR_CODES.INVALID_POPULATION)).toBe(true);
            expect(result.errors.some(e => e.code === 'NEGATIVE_RESOURCE')).toBe(true);
        });

        it('5. Rejects dangling routes, self-loops, and non-positive distances', () => {
            const badRoutes = {
                metadata: { id: 'test_routes' },
                settlements: [{ id: 's1', population: 20 }, { id: 's2', population: 30 }],
                routes: [
                    { id: 'r_dangling', fromNodeId: 's1', toNodeId: 's_missing', distance: 50 },
                    { id: 'r_loop', fromNodeId: 's1', toNodeId: 's1', distance: 10 },
                    { id: 'r_neg_dist', fromNodeId: 's1', toNodeId: 's2', distance: -25 }
                ]
            };
            const result = ScenarioValidator.validate(badRoutes);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === VALIDATION_ERROR_CODES.DANGLING_SETTLEMENT_REF)).toBe(true);
            expect(result.errors.some(e => e.code === VALIDATION_ERROR_CODES.DISCONNECTED_CORRIDOR)).toBe(true);
            expect(result.errors.some(e => e.code === VALIDATION_ERROR_CODES.INVALID_DISTANCE)).toBe(true);
        });

        it('6. Rejects invalid timeline ticks', () => {
            const badTimeline = {
                metadata: { id: 'test_timeline' },
                timelineEvents: [
                    { tick: 0, eventType: TIMELINE_EVENT_TYPES.INJECT_THREAT }
                ]
            };
            const result = ScenarioValidator.validate(badTimeline);
            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.code === VALIDATION_ERROR_CODES.INVALID_TIMELINE_TICK)).toBe(true);
        });
    });

    describe('ScenarioInstantiator & Timeline Stepping', () => {
        it('7. Successfully instantiates scenario and executes scheduled timeline events', () => {
            const validScenario = {
                metadata: { id: 'scenario_alpha', title: 'Frontier Conflict', seed: 1001 },
                factions: [
                    { id: 'nord_clans', militaryReadiness: 0.8, economicStockpile: 0.6 },
                    { id: 'merchant_guild', militaryReadiness: 0.4, economicStockpile: 0.9 }
                ],
                settlements: [
                    { id: 'highland_haven', population: 80, wealth: 60, resources: { food: 50, timber: 40 } },
                    { id: 'river_crossing', population: 120, wealth: 95, resources: { food: 80, timber: 70 } }
                ],
                routes: [
                    { id: 'river_pass', fromNodeId: 'highland_haven', toNodeId: 'river_crossing', distance: 100, baseSecurity: 0.8 }
                ],
                actors: [
                    { id: 'watchman_01', factionId: 'nord_clans', traits: { neuroticism: 0.5, resilience: 0.6 }, initialAffect: { fear: 0.05 } }
                ],
                roamingBands: [
                    { id: 'patrol_alpha', factionId: 'nord_clans', type: 'PATROL', memberCount: 6, waypoints: [{ x: 0, y: 0, z: 0 }, { x: 50, y: 0, z: 50 }] }
                ],
                timelineEvents: [
                    { tick: 2, eventType: TIMELINE_EVENT_TYPES.INJECT_THREAT, parameters: { distance: 8.0, intensity: 0.9 } },
                    { tick: 3, eventType: TIMELINE_EVENT_TYPES.COMMODITY_SHOCK, parameters: { settlementId: 'highland_haven', commodity: 'food', delta: -30 } }
                ]
            };

            const instance = ScenarioInstantiator.instantiate(validScenario);
            expect(instance.agents.has('watchman_01')).toBe(true);
            expect(instance.settlements.has('highland_haven')).toBe(true);

            const initialFear = instance.agents.get('watchman_01').currentFear;
            const initialFood = instance.settlements.get('highland_haven').resources.food;

            // Tick 1 (No timeline events)
            const t1 = instance.tick();
            expect(t1.tick).toBe(1);
            expect(t1.executedEvents).toBe(0);

            // Tick 2 (INJECT_THREAT triggers)
            const t2 = instance.tick();
            expect(t2.tick).toBe(2);
            expect(t2.executedEvents).toBe(1);
            const postThreatFear = instance.agents.get('watchman_01').currentFear;
            expect(postThreatFear).toBeGreaterThan(initialFear);

            // Tick 3 (COMMODITY_SHOCK triggers)
            const t3 = instance.tick();
            expect(t3.tick).toBe(3);
            expect(t3.executedEvents).toBe(1);
            const postShockFood = instance.settlements.get('highland_haven').resources.food;
            expect(postShockFood).toBe(initialFood - 30);
        });
    });

    describe('ScenarioFuzzer & PropertyVerifier', () => {
        it('8. Generates 25 procedurally randomized scenarios that validate and satisfy all properties', () => {
            for (let seed = 5001; seed < 5026; seed++) {
                const scenario = ScenarioFuzzer.generateFuzzedScenario(seed);
                const val = ScenarioValidator.validate(scenario);
                expect(val.valid).toBe(true);

                const instance = ScenarioInstantiator.instantiate(scenario);
                for (let t = 0; t < 20; t++) {
                    instance.tick();
                }

                const prop = PropertyVerifier.checkProperties(instance);
                expect(prop.passed).toBe(true);
                expect(prop.violations.length).toBe(0);
            }
        });

        it('9. PropertyVerifier detects deliberately injected illegal states', () => {
            const scenario = ScenarioFuzzer.generateFuzzedScenario(9999);
            const instance = ScenarioInstantiator.instantiate(scenario);

            // Inject negative resource
            const s = instance.settlements.values().next().value;
            s.resources.food = -15.0;

            // Inject NaN fear
            const a = instance.agents.values().next().value;
            a.currentFear = NaN;

            const prop = PropertyVerifier.checkProperties(instance);
            expect(prop.passed).toBe(false);
            expect(prop.violations.length).toBeGreaterThanOrEqual(2);
        });
    });
});
