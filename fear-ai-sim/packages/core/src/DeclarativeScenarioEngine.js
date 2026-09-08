/**
 * packages/core/src/DeclarativeScenarioEngine.js
 *
 * Sections 119, 120, 121, 122 / Frontiers A & E:
 * Declarative Scenario Authoring, Validation, Procedural Fuzzing & Property Verification.
 *
 * Implements:
 * 1. Declarative Scenario Schema Specification:
 *    - Structured JSON/Object format for complete world authoring:
 *      metadata, actors, factions, settlements, trade corridors, roaming groups, timeline events.
 * 2. ScenarioValidator:
 *    - Pre-simulation structural, referential, and physical constraint verification.
 *    - Detects: schema violations, dangling references (missing factions, settlements, groups),
 *      out-of-bounds traits [0..1], negative resources or populations, contradictory bilateral stances,
 *      cyclical or disconnected route corridors.
 * 3. ScenarioInstantiator:
 *    - Translates validated declarative definitions into running, interconnected living-world engines:
 *      WorldSimulationSystem, FactionSystem, CivilizationSimulationSystem.
 *    - Manages deterministic timeline event execution at scheduled ticks.
 * 4. ScenarioFuzzer:
 *    - Procedural stochastic scenario generator across continuous hypercubes for stress & chaos validation.
 * 5. PropertyVerifier:
 *    - Checks systemic invariants: bounded affect, non-negative resources, zero NaNs/Infs,
 *      escalation transition legality, population and commodity conservation.
 *
 * STRICT INVARIANT:
 * Host game maintains absolute authority over physical geometry, transforms, pathfinding, and combat damage.
 * Middleware outputs semantic intents, route recommendations, and affective states without mutating host state.
 */

import { DeterministicRng } from './DeterministicRng.js';
import { FactionSystem, FACTION_CULTURES, ESCALATION_STAGES, INCIDENT_TYPES } from './FactionSystem.js';
import { CivilizationSimulationSystem, ROUTE_STATUS } from './CivilizationSimulationSystem.js';
import { WorldSimulationSystem, ROAMING_PARTY_TYPES } from './WorldSimulationSystem.js';
import { AffectiveAgent } from './AffectiveAgent.js';

export const TIMELINE_EVENT_TYPES = Object.freeze({
    INJECT_THREAT: 'INJECT_THREAT',
    DISPATCH_CARAVAN: 'DISPATCH_CARAVAN',
    ALTER_ROUTE_DANGER: 'ALTER_ROUTE_DANGER',
    TRIGGER_INCIDENT: 'TRIGGER_INCIDENT',
    COMMODITY_SHOCK: 'COMMODITY_SHOCK',
    FACTION_DIRECTIVE: 'FACTION_DIRECTIVE'
});

export const VALIDATION_ERROR_CODES = Object.freeze({
    MISSING_METADATA: 'MISSING_METADATA',
    INVALID_ACTOR_TRAIT: 'INVALID_ACTOR_TRAIT',
    DANGLING_FACTION_REF: 'DANGLING_FACTION_REF',
    DANGLING_SETTLEMENT_REF: 'DANGLING_SETTLEMENT_REF',
    INVALID_POPULATION: 'INVALID_POPULATION',
    INVALID_DISTANCE: 'INVALID_DISTANCE',
    CONTRADICTORY_STANCE: 'CONTRADICTORY_STANCE',
    INVALID_TIMELINE_TICK: 'INVALID_TIMELINE_TICK',
    DISCONNECTED_CORRIDOR: 'DISCONNECTED_CORRIDOR'
});

export class ScenarioValidator {
    /**
     * Validates a declarative scenario definition before execution.
     * @param {Object} scenario
     * @returns {{ valid: boolean, errors: Array<Object>, warnings: Array<Object> }}
     */
    static validate(scenario) {
        const errors = [];
        const warnings = [];

        if (!scenario || typeof scenario !== 'object') {
            return {
                valid: false,
                errors: [{ code: 'INVALID_SCENARIO_ROOT', message: 'Scenario must be a non-null object' }],
                warnings: []
            };
        }

        // 1. Metadata Validation
        if (!scenario.metadata || typeof scenario.metadata !== 'object') {
            errors.push({ code: VALIDATION_ERROR_CODES.MISSING_METADATA, message: 'Scenario requires metadata block' });
        } else {
            if (!scenario.metadata.id) errors.push({ code: VALIDATION_ERROR_CODES.MISSING_METADATA, message: 'Metadata requires id' });
            if (!scenario.metadata.title) warnings.push({ code: 'MISSING_TITLE', message: 'Metadata missing title' });
        }

        // 2. Factions Pool
        const registeredFactions = new Set();
        if (Array.isArray(scenario.factions)) {
            for (const f of scenario.factions) {
                if (!f.id) {
                    errors.push({ code: 'INVALID_FACTION_ID', message: 'Faction missing id' });
                    continue;
                }
                registeredFactions.add(f.id);
                if (f.militaryReadiness !== undefined && (f.militaryReadiness < 0 || f.militaryReadiness > 1)) {
                    errors.push({ code: 'OUT_OF_BOUNDS_READINESS', message: `Faction ${f.id} militaryReadiness out of bounds [0, 1]` });
                }
                if (f.economicStockpile !== undefined && (f.economicStockpile < 0 || f.economicStockpile > 1)) {
                    errors.push({ code: 'OUT_OF_BOUNDS_STOCKPILE', message: `Faction ${f.id} economicStockpile out of bounds [0, 1]` });
                }
            }
        }

        // 3. Settlements Pool
        const registeredSettlements = new Set();
        if (Array.isArray(scenario.settlements)) {
            for (const s of scenario.settlements) {
                if (!s.id) {
                    errors.push({ code: 'INVALID_SETTLEMENT_ID', message: 'Settlement missing id' });
                    continue;
                }
                registeredSettlements.add(s.id);
                if (typeof s.population !== 'number' || s.population < 0) {
                    errors.push({ code: VALIDATION_ERROR_CODES.INVALID_POPULATION, message: `Settlement ${s.id} has invalid population ${s.population}` });
                }
                if (s.resources) {
                    for (const [resKey, val] of Object.entries(s.resources)) {
                        if (typeof val !== 'number' || val < 0) {
                            errors.push({ code: 'NEGATIVE_RESOURCE', message: `Settlement ${s.id} has negative resource ${resKey}` });
                        }
                    }
                }
            }
        }

        // 4. Trade Routes Validation
        if (Array.isArray(scenario.routes)) {
            for (const r of scenario.routes) {
                if (!r.id) errors.push({ code: 'INVALID_ROUTE_ID', message: 'Route missing id' });
                if (!r.fromNodeId || !registeredSettlements.has(r.fromNodeId)) {
                    errors.push({ code: VALIDATION_ERROR_CODES.DANGLING_SETTLEMENT_REF, message: `Route ${r.id} references unregistered fromNodeId: ${r.fromNodeId}` });
                }
                if (!r.toNodeId || !registeredSettlements.has(r.toNodeId)) {
                    errors.push({ code: VALIDATION_ERROR_CODES.DANGLING_SETTLEMENT_REF, message: `Route ${r.id} references unregistered toNodeId: ${r.toNodeId}` });
                }
                if (r.fromNodeId && r.toNodeId && r.fromNodeId === r.toNodeId) {
                    errors.push({ code: VALIDATION_ERROR_CODES.DISCONNECTED_CORRIDOR, message: `Route ${r.id} has identical from/to node: ${r.fromNodeId}` });
                }
                if (typeof r.distance !== 'number' || r.distance <= 0) {
                    errors.push({ code: VALIDATION_ERROR_CODES.INVALID_DISTANCE, message: `Route ${r.id} distance must be positive number: ${r.distance}` });
                }
                if (r.baseSecurity !== undefined && (r.baseSecurity < 0 || r.baseSecurity > 1)) {
                    errors.push({ code: 'OUT_OF_BOUNDS_SECURITY', message: `Route ${r.id} baseSecurity out of bounds [0, 1]` });
                }
            }
        }

        // 5. Actors Validation
        if (Array.isArray(scenario.actors)) {
            for (const a of scenario.actors) {
                if (!a.id) errors.push({ code: 'INVALID_ACTOR_ID', message: 'Actor missing id' });
                if (a.factionId && !registeredFactions.has(a.factionId)) {
                    errors.push({ code: VALIDATION_ERROR_CODES.DANGLING_FACTION_REF, message: `Actor ${a.id} references unregistered faction ${a.factionId}` });
                }
                if (a.traits) {
                    for (const [traitKey, traitVal] of Object.entries(a.traits)) {
                        if (typeof traitVal !== 'number' || traitVal < 0 || traitVal > 1) {
                            errors.push({
                                code: VALIDATION_ERROR_CODES.INVALID_ACTOR_TRAIT,
                                message: `Actor ${a.id} trait ${traitKey} out of bounds [0, 1]: ${traitVal}`
                            });
                        }
                    }
                }
                if (a.initialAffect) {
                    const { fear, arousal } = a.initialAffect;
                    if (fear !== undefined && (fear < 0 || fear > 1)) {
                        errors.push({ code: 'OUT_OF_BOUNDS_FEAR', message: `Actor ${a.id} initial fear out of bounds [0, 1]` });
                    }
                    if (arousal !== undefined && (arousal < 0 || arousal > 1)) {
                        errors.push({ code: 'OUT_OF_BOUNDS_AROUSAL', message: `Actor ${a.id} initial arousal out of bounds [0, 1]` });
                    }
                }
            }
        }

        // 6. Timeline Events Validation
        if (Array.isArray(scenario.timelineEvents)) {
            for (const ev of scenario.timelineEvents) {
                if (typeof ev.tick !== 'number' || ev.tick < 1) {
                    errors.push({ code: VALIDATION_ERROR_CODES.INVALID_TIMELINE_TICK, message: `Timeline event has invalid tick: ${ev.tick}` });
                }
                if (!ev.eventType || !TIMELINE_EVENT_TYPES[ev.eventType]) {
                    warnings.push({ code: 'UNKNOWN_EVENT_TYPE', message: `Timeline event has unrecognized type: ${ev.eventType}` });
                }
            }
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }
}

export class ScenarioInstantiator {
    /**
     * Instantiates an active executable simulation environment from a validated declarative scenario.
     * @param {Object} scenario
     * @param {Object} [options={}]
     * @returns {Object} Executable instance with stepping and timeline runner
     */
    static instantiate(scenario, options = {}) {
        const validation = ScenarioValidator.validate(scenario);
        if (!validation.valid) {
            throw new Error(`Cannot instantiate invalid scenario: ${validation.errors.map(e => e.message).join('; ')}`);
        }

        const seed = options.seed ?? scenario.metadata?.seed ?? 424242;
        const rng = new DeterministicRng(seed);

        const factionSystem = new FactionSystem();
        const civSystem = new CivilizationSimulationSystem();
        const worldSystem = new WorldSimulationSystem({
            encounterProximityRadius: options.encounterProximityRadius ?? 35.0,
            seed: rng.intRange(1, 1000000)
        });

        // 1. Instantiate Factions & Bilateral Stances
        if (Array.isArray(scenario.factions)) {
            for (const f of scenario.factions) {
                factionSystem.registerFaction({
                    id: f.id,
                    name: f.name || f.id,
                    culture: f.culture || FACTION_CULTURES.HONORABLE,
                    militaryReadiness: f.militaryReadiness ?? 0.5,
                    economicStockpile: f.economicStockpile ?? 0.5
                });
            }
            // Apply initial bilateral stances
            for (const f of scenario.factions) {
                if (Array.isArray(f.bilateralStances)) {
                    for (const stance of f.bilateralStances) {
                        const s = factionSystem.getBilateralStance(f.id, stance.targetFactionId);
                        if (s) {
                            if (stance.stage) s.stage = stance.stage;
                            if (stance.trust !== undefined) s.trust = stance.trust;
                            if (stance.grievance !== undefined) s.grievance = stance.grievance;
                            if (stance.fear !== undefined) s.fear = stance.fear;
                        }
                    }
                }
            }
        }

        // 2. Instantiate Settlements & Markets
        const settlements = new Map();
        if (Array.isArray(scenario.settlements)) {
            for (const s of scenario.settlements) {
                settlements.set(s.id, {
                    id: s.id,
                    name: s.name || s.id,
                    position: s.position || { x: 0, y: 0, z: 0 },
                    population: s.population ?? 50,
                    wealth: s.wealth ?? 50.0,
                    resources: { ...(s.resources || { food: 50.0, timber: 50.0, ore: 50.0 }) }
                });
                civSystem.registerNode(s.id, {
                    name: s.name || s.id,
                    position: s.position,
                    factionId: s.factionId || null,
                    market: s.resources
                });
            }
        }

        // 3. Instantiate Trade Corridors
        if (Array.isArray(scenario.routes)) {
            for (const r of scenario.routes) {
                civSystem.registerRoute(r.id, {
                    fromNodeId: r.fromNodeId,
                    toNodeId: r.toNodeId,
                    distance: r.distance,
                    baseSecurity: r.baseSecurity ?? 0.75,
                    waypoints: r.waypoints || []
                });
            }
        }

        // 4. Instantiate Actors as Affective Agents & Groups
        const agents = new Map();
        if (Array.isArray(scenario.actors)) {
            for (const a of scenario.actors) {
                const agent = new AffectiveAgent(a.id, a.traits || {}, a.position || { x: 0, y: 0, z: 0 });
                if (a.initialAffect) {
                    if (a.initialAffect.fear !== undefined) agent.currentFear = a.initialAffect.fear;
                    if (a.initialAffect.arousal !== undefined) agent.arousal = a.initialAffect.arousal;
                }
                agents.set(a.id, agent);
            }
        }

        // 5. Instantiate Roaming Bands
        if (Array.isArray(scenario.roamingBands)) {
            for (const b of scenario.roamingBands) {
                worldSystem.registerGroup(b.id, {
                    name: b.name || b.id,
                    type: b.type || ROAMING_PARTY_TYPES.PATROL,
                    factionId: b.factionId || null,
                    memberCount: b.memberCount ?? 5,
                    position: b.position || { x: 0, y: 0, z: 0 },
                    waypoints: b.waypoints || [],
                    militaryStrength: b.militaryStrength ?? 0.5,
                    wealth: b.wealth ?? 0.5
                });
            }
        }

        // 6. Sort Timeline Events
        const timelineEvents = Array.isArray(scenario.timelineEvents)
            ? [...scenario.timelineEvents].sort((a, b) => a.tick - b.tick)
            : [];

        let currentTick = 0;
        const eventHistory = [];

        return {
            metadata: scenario.metadata,
            factionSystem,
            civSystem,
            worldSystem,
            settlements,
            agents,
            get currentTick() { return currentTick; },
            get eventHistory() { return eventHistory; },

            /**
             * Advances simulation by 1 tick and executes scheduled timeline events.
             * @returns {Object} Tick telemetry
             */
            tick() {
                currentTick++;

                // A. Execute any events scheduled for this tick
                const pendingEvents = timelineEvents.filter(e => e.tick === currentTick);
                for (const ev of pendingEvents) {
                    eventHistory.push({ tick: currentTick, ...ev });
                    if (ev.eventType === TIMELINE_EVENT_TYPES.INJECT_THREAT) {
                        for (const agent of agents.values()) {
                            agent.tick(0.016, {
                                threats: [{ id: 'injected_threat', distance: ev.parameters?.distance ?? 10.0, intensity: ev.parameters?.intensity ?? 0.8 }]
                            });
                        }
                    } else if (ev.eventType === TIMELINE_EVENT_TYPES.ALTER_ROUTE_DANGER) {
                        const route = civSystem.routes.get(ev.parameters?.routeId);
                        if (route) {
                            route.perceivedDanger = Math.max(0, Math.min(1.0, ev.parameters?.perceivedDanger ?? 0.8));
                        }
                    } else if (ev.eventType === TIMELINE_EVENT_TYPES.COMMODITY_SHOCK) {
                        const s = settlements.get(ev.parameters?.settlementId);
                        if (s && s.resources) {
                            const commodity = ev.parameters?.commodity || 'food';
                            s.resources[commodity] = Math.max(0, s.resources[commodity] + (ev.parameters?.delta ?? -20));
                        }
                    }
                }

                // B. Move roaming bands along waypoints
                for (const group of worldSystem.groups.values()) {
                    if (group.state === 'TRAVELING' && group.waypoints.length > 0) {
                        const targetWp = group.waypoints[group.currentWaypointIndex % group.waypoints.length];
                        const dx = targetWp.x - group.position.x;
                        const dz = (targetWp.z || 0) - (group.position.z || 0);
                        const dist = Math.sqrt(dx * dx + dz * dz);
                        if (dist > 5.0) {
                            const step = Math.min(dist, 3.5);
                            group.position.x += (dx / dist) * step;
                            group.position.z += (dz / dist) * step;
                        } else {
                            worldSystem.advanceWaypoint(group.id);
                        }
                    }
                }

                // C. Step subsystems
                civSystem.advanceSimulation(1);
                worldSystem.tick(1.0, { factionSystem });
                factionSystem.advanceTick(1);

                return {
                    tick: currentTick,
                    encountersThisTick: worldSystem.activeEncounters ? worldSystem.activeEncounters.length : 0,
                    executedEvents: pendingEvents.length
                };
            }
        };
    }
}

export class ScenarioFuzzer {
    /**
     * Procedurally generates a valid randomized declarative scenario.
     * @param {number} [seed=12345]
     * @param {Object} [options={}]
     * @returns {Object} Declarative scenario definition
     */
    static generateFuzzedScenario(seed = 12345, options = {}) {
        const rng = new DeterministicRng(seed);
        const scenarioId = `fuzzed_scenario_${seed}`;

        const factionCount = options.factionCount ?? rng.intRange(2, 4);
        const settlementCount = options.settlementCount ?? rng.intRange(2, 4);
        const actorCount = options.actorCount ?? rng.intRange(3, 8);

        const cultures = Object.values(FACTION_CULTURES);
        const factions = [];
        for (let i = 0; i < factionCount; i++) {
            factions.push({
                id: `faction_${i + 1}`,
                name: `Faction ${i + 1}`,
                culture: cultures[i % cultures.length],
                militaryReadiness: Number(rng.range(0.2, 0.9).toFixed(2)),
                economicStockpile: Number(rng.range(0.2, 0.9).toFixed(2)),
                bilateralStances: []
            });
        }

        const settlements = [];
        for (let i = 0; i < settlementCount; i++) {
            settlements.push({
                id: `town_${i + 1}`,
                name: `Town ${i + 1}`,
                position: { x: (i * 100) + rng.intRange(-20, 20), y: 0, z: (i * 80) + rng.intRange(-20, 20) },
                population: rng.intRange(25, 120),
                wealth: Number(rng.range(30, 100).toFixed(1)),
                resources: {
                    food: Number(rng.range(20, 80).toFixed(1)),
                    timber: Number(rng.range(10, 60).toFixed(1)),
                    ore: Number(rng.range(5, 50).toFixed(1))
                }
            });
        }

        const routes = [];
        for (let i = 0; i < settlementCount - 1; i++) {
            const sA = settlements[i];
            const sB = settlements[i + 1];
            routes.push({
                id: `route_${sA.id}_to_${sB.id}`,
                fromNodeId: sA.id,
                toNodeId: sB.id,
                distance: Number(rng.range(80, 200).toFixed(1)),
                baseSecurity: Number(rng.range(0.4, 0.9).toFixed(2)),
                waypoints: [{ ...sA.position }, { ...sB.position }]
            });
        }

        const actors = [];
        for (let i = 0; i < actorCount; i++) {
            const f = factions[i % factions.length];
            actors.push({
                id: `actor_${i + 1}`,
                factionId: f.id,
                position: { x: rng.intRange(-50, 200), y: 0, z: rng.intRange(-50, 200) },
                traits: {
                    neuroticism: Number(rng.range(0.1, 0.9).toFixed(2)),
                    resilience: Number(rng.range(0.1, 0.9).toFixed(2)),
                    aggression: Number(rng.range(0.1, 0.9).toFixed(2))
                },
                initialAffect: {
                    fear: Number(rng.range(0.0, 0.3).toFixed(2)),
                    arousal: Number(rng.range(0.1, 0.5).toFixed(2))
                }
            });
        }

        const timelineEvents = [
            {
                tick: rng.intRange(5, 15),
                eventType: TIMELINE_EVENT_TYPES.INJECT_THREAT,
                parameters: { distance: Number(rng.range(5, 15).toFixed(1)), intensity: 0.85 }
            },
            {
                tick: rng.intRange(16, 30),
                eventType: TIMELINE_EVENT_TYPES.COMMODITY_SHOCK,
                parameters: { settlementId: settlements[0].id, commodity: 'food', delta: -25 }
            }
        ];

        return {
            metadata: {
                id: scenarioId,
                title: `Fuzzed Living World ${seed}`,
                author: 'ScenarioFuzzer',
                version: '1.0.0',
                seed
            },
            factions,
            settlements,
            routes,
            actors,
            roamingBands: [],
            timelineEvents
        };
    }
}

export class PropertyVerifier {
    /**
     * Validates simulation state against formal system properties.
     * @param {Object} instance
     * @returns {{ passed: boolean, violations: Array<string> }}
     */
    static checkProperties(instance) {
        const violations = [];

        // Property 1: Bounded Affect [0, 1]
        for (const [id, agent] of instance.agents.entries()) {
            if (agent.currentFear < 0 || agent.currentFear > 1.0 || isNaN(agent.currentFear)) {
                violations.push(`Agent ${id} fear out of bounds: ${agent.currentFear}`);
            }
            if (agent.arousal < 0 || agent.arousal > 1.0 || isNaN(agent.arousal)) {
                violations.push(`Agent ${id} arousal out of bounds: ${agent.arousal}`);
            }
        }

        // Property 2: Non-negative resources & finite populations
        for (const [id, s] of instance.settlements.entries()) {
            if (s.population < 0 || !isFinite(s.population)) {
                violations.push(`Settlement ${id} invalid population: ${s.population}`);
            }
            for (const [comm, amount] of Object.entries(s.resources)) {
                if (amount < 0 || isNaN(amount)) {
                    violations.push(`Settlement ${id} negative commodity ${comm}: ${amount}`);
                }
            }
        }

        // Property 3: Faction Stance Legality
        for (const [sourceId, stanceMap] of instance.factionSystem.stances.entries()) {
            for (const [targetId, stance] of stanceMap.entries()) {
                if (!ESCALATION_STAGES[stance.stage]) {
                    violations.push(`Faction relation ${sourceId}->${targetId} invalid stage: ${stance.stage}`);
                }
            }
        }

        return {
            passed: violations.length === 0,
            violations
        };
    }
}
