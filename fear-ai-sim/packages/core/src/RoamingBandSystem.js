/**
 * RoamingBandSystem.js - World Intelligence Middleware for Roaming Bands & Nomadic Groups.
 * Implements Front C / Sections XIV & XVI:
 * - Multi-Criteria Destination Utility Engine (Need, Profit, Safety, Distance, Home Tether)
 * - Route Memory & Spatial Hazard Exponential Decay
 * - Dynamic Camp Lifecycle (Pitch, Rest Recovery, Normal Break, Emergency Evacuation)
 * - Procedural Systemic Emergent Encounters (Highway Ambush, Toll Extortion, Refugee Relief, Standoff)
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Evaluates semantic intents (INTENT_TRAVEL_TO, INTENT_ESTABLISH_CAMP, INTENT_EVACUATE_CAMP, etc.),
 * destination utilities, and advisory encounter resolutions.
 * The host game engine maintains absolute authority over entity physical movement,
 * collision, transforms, combat damage execution, and inventory.
 */

import { DeterministicRng } from './DeterministicRng.js';

export const BAND_ARCHETYPES = Object.freeze({
    PATROL_GUARD: 'PATROL_GUARD',
    TRADE_CARAVAN: 'TRADE_CARAVAN',
    BANDIT_RAIDERS: 'BANDIT_RAIDERS',
    NOMAD_TRIBE: 'NOMAD_TRIBE',
    MERCENARY_COMPANY: 'MERCENARY_COMPANY',
    DISPLACED_REFUGEES: 'DISPLACED_REFUGEES',
    FERAL_BEASTS: 'FERAL_BEASTS'
});

export const BAND_STATES = Object.freeze({
    TRAVELING: 'TRAVELING',
    FORAGING: 'FORAGING',
    CAMPED: 'CAMPED',
    AMBUSH_STANCE: 'AMBUSH_STANCE',
    ENGAGED: 'ENGAGED',
    FLEEING: 'FLEEING'
});

export const ROAMING_INTENTS = Object.freeze({
    INTENT_TRAVEL_TO: 'INTENT_TRAVEL_TO',
    INTENT_ESTABLISH_CAMP: 'INTENT_ESTABLISH_CAMP',
    INTENT_BREAK_CAMP: 'INTENT_BREAK_CAMP',
    INTENT_EVACUATE_CAMP: 'INTENT_EVACUATE_CAMP',
    INTENT_FORAGE: 'INTENT_FORAGE',
    INTENT_FLEE_FROM: 'INTENT_FLEE_FROM',
    INTENT_ENGAGE_ENCOUNTER: 'INTENT_ENGAGE_ENCOUNTER'
});

export const ENCOUNTER_CATEGORIES = Object.freeze({
    HIGHWAY_AMBUSH: 'HIGHWAY_AMBUSH',
    PATROL_RAID_ENGAGEMENT: 'PATROL_RAID_ENGAGEMENT',
    REFUGEE_INSPECTION: 'REFUGEE_INSPECTION',
    REFUGEE_HUMANITARIAN_RELIEF: 'REFUGEE_HUMANITARIAN_RELIEF',
    RIVAL_STANDOFF: 'RIVAL_STANDOFF',
    PEACEFUL_CONVERGENCE: 'PEACEFUL_CONVERGENCE'
});

export const ENCOUNTER_RESOLUTIONS = Object.freeze({
    COMBAT_ENGAGEMENT: 'COMBAT_ENGAGEMENT',
    EXTORTION_PAID: 'EXTORTION_PAID',
    MUTUAL_AVOIDANCE: 'MUTUAL_AVOIDANCE',
    RELIEF_PROVIDED: 'RELIEF_PROVIDED',
    FLED_IN_TERROR: 'FLED_IN_TERROR',
    PEACEFUL_TRADE: 'PEACEFUL_TRADE'
});

export const DEFAULT_BAND_CONFIG = Object.freeze({
    hazardDecayLambda: 0.015,       // Exponential decay rate per tick for route memory
    campFatigueThreshold: 0.75,     // Fatigue trigger to pitch camp
    campRecoveredThreshold: 0.15,   // Fatigue recovery to break camp
    emergencyThreatDistance: 35.0,  // Proximity to trigger emergency camp evacuation
    encounterRadius: 40.0,          // Proximity to trigger procedural systemic encounter
    maxTravelRange: 500.0,          // Normalization distance for destination evaluation
    seed: 1337
});

function clamp01(v) {
    if (!Number.isFinite(v)) return 0.0;
    return Math.max(0.0, Math.min(1.0, v));
}

function euclideanDistance(a, b) {
    const dx = (a.x || 0) - (b.x || 0);
    const dy = (a.y || 0) - (b.y || 0);
    const dz = (a.z || 0) - (b.z || 0);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export class RoamingBandSystem {
    /**
     * @param {Object} options
     */
    constructor(options = {}) {
        this.config = { ...DEFAULT_BAND_CONFIG, ...options };
        this.rng = new DeterministicRng(this.config.seed);
        this.bands = new Map();
        this.destinations = new Map();
        this.corridorHazards = new Map(); // corridorId -> { hazard: number, lastTick: number }
        this.encounterHistory = [];
        this.currentTick = 0;
    }

    /**
     * Registers a candidate world destination/node.
     * @param {Object} destination
     */
    registerDestination(destination) {
        if (!destination || !destination.id) {
            throw new Error('Destination must have a valid id.');
        }
        this.destinations.set(destination.id, {
            id: destination.id,
            name: destination.name || destination.id,
            position: {
                x: destination.position?.x || 0,
                y: destination.position?.y || 0,
                z: destination.position?.z || 0
            },
            type: destination.type || 'WAYPOINT',
            resources: {
                food: destination.resources?.food || 0.0,
                shelter: destination.resources?.shelter || 0.0,
                tradeProfit: destination.resources?.tradeProfit || 0.0
            },
            baseHazard: clamp01(destination.baseHazard || 0.0)
        });
    }

    /**
     * Registers a roaming band.
     * @param {Object} band
     */
    registerBand(band) {
        if (!band || !band.id) {
            throw new Error('Band must have a valid id.');
        }
        const archetype = band.archetype || BAND_ARCHETYPES.TRADE_CARAVAN;
        this.bands.set(band.id, {
            id: band.id,
            name: band.name || band.id,
            archetype,
            factionId: band.factionId || 'NEUTRAL',
            position: {
                x: band.position?.x || 0,
                y: band.position?.y || 0,
                z: band.position?.z || 0
            },
            homeBase: band.homeBase ? {
                x: band.homeBase.x || 0,
                y: band.homeBase.y || 0,
                z: band.homeBase.z || 0,
                id: band.homeBase.id || 'HOME'
            } : null,
            members: Math.max(1, band.members || 10),
            power: Math.max(1.0, band.power || 25.0),
            wealth: Math.max(0.0, band.wealth || 50.0),
            hunger: clamp01(band.hunger || 0.1),
            fatigue: clamp01(band.fatigue || 0.1),
            fear: clamp01(band.fear || 0.0),
            state: band.state || BAND_STATES.TRAVELING,
            currentDestinationId: band.currentDestinationId || null,
            campDuration: 0,
            lastIntent: null,
            routeMemory: new Map() // destId/corridorId -> { hazard: number, lastUpdatedTick: number }
        });
    }

    /**
     * Logs a hazard encounter on a route or location.
     * @param {string} bandId
     * @param {string} locationId
     * @param {number} severity
     */
    recordHazard(bandId, locationId, severity) {
        const band = this.bands.get(bandId);
        if (!band) return;
        const current = band.routeMemory.get(locationId);
        const prevHazard = current ? this.getDecayedHazard(bandId, locationId) : 0.0;
        const newHazard = clamp01(prevHazard + severity);
        band.routeMemory.set(locationId, {
            hazard: newHazard,
            lastUpdatedTick: this.currentTick
        });

        // Also record globally on corridor
        const globalCurrent = this.corridorHazards.get(locationId);
        const globalPrev = globalCurrent ? this._getDecayedValue(globalCurrent.hazard, globalCurrent.lastTick) : 0.0;
        this.corridorHazards.set(locationId, {
            hazard: clamp01(globalPrev + severity),
            lastTick: this.currentTick
        });
    }

    /**
     * Calculates decayed hazard from a band's memory.
     * @param {string} bandId
     * @param {string} locationId
     * @returns {number}
     */
    getDecayedHazard(bandId, locationId) {
        const band = this.bands.get(bandId);
        if (!band) return 0.0;
        const record = band.routeMemory.get(locationId);
        if (!record) return 0.0;
        const dt = Math.max(0, this.currentTick - record.lastUpdatedTick);
        return clamp01(record.hazard * Math.exp(-this.config.hazardDecayLambda * dt));
    }

    _getDecayedValue(val, lastTick) {
        const dt = Math.max(0, this.currentTick - lastTick);
        return clamp01(val * Math.exp(-this.config.hazardDecayLambda * dt));
    }

    /**
     * Evaluates Multi-Criteria Destination Utility for a band across all registered destinations.
     * U(d) = w_need * S(d) + w_profit * P(d) + w_safety * (1 - H(d)) - w_dist * (dist / maxRange) + w_home * Tether(d)
     * @param {string} bandId
     * @returns {Array<{ destinationId: string, utility: number, breakdown: Object }>}
     */
    evaluateDestinationUtilities(bandId, options = {}) {
        const band = this.bands.get(bandId);
        if (!band) throw new Error(`Band ${bandId} not found.`);

        const utilities = [];
        const base = this._getArchetypeWeights(band.archetype);
        // NOW-2 wiring: live motive pressure (from MovementMotiveRanker)
        // bends archetype weights. Absent bias the output is unchanged.
        const bias = options.weightBias || {};
        const weights = {
            need: base.need * (bias.need ?? 1),
            profit: base.profit * (bias.profit ?? 1),
            safety: base.safety * (bias.safety ?? 1),
            distance: base.distance * (bias.distance ?? 1),
            home: base.home * (bias.home ?? 1)
        };

        for (const [destId, dest] of this.destinations.entries()) {
            // 1. Need Satisfaction S(d)
            const foodSatisfaction = band.hunger * (dest.resources.food || 0.0);
            const shelterSatisfaction = band.fatigue * (dest.resources.shelter || 0.0);
            const fearSatisfaction = band.fear * (dest.resources.shelter || 0.0);
            const needSatisfaction = clamp01(foodSatisfaction + shelterSatisfaction + fearSatisfaction);

            // 2. Profit Attraction P(d)
            const profitAttraction = clamp01(dest.resources.tradeProfit || 0.0);

            // 3. Safety vs Hazard H(d)
            const rememberedHazard = this.getDecayedHazard(bandId, destId);
            const globalHazard = this.corridorHazards.get(destId)
                ? this._getDecayedValue(this.corridorHazards.get(destId).hazard, this.corridorHazards.get(destId).lastTick)
                : 0.0;
            const effectiveHazard = clamp01(dest.baseHazard + rememberedHazard + globalHazard);
            const safetyScore = clamp01(1.0 - effectiveHazard);

            // 4. Distance Cost
            const dist = euclideanDistance(band.position, dest.position);
            const normalizedDist = clamp01(dist / this.config.maxTravelRange);

            // 5. Home Tether Pull
            let homeTether = 0.0;
            if (band.homeBase) {
                const distToHome = euclideanDistance(dest.position, band.homeBase);
                const isHome = distToHome < 10.0;
                // Stronger tether if cargo is rich or fear is high or fatigue is critical
                const wealthTether = band.wealth > 80.0 ? 0.40 : 0.0;
                const fearTether = band.fear > 0.60 ? 0.35 : 0.0;
                const fatigueTether = band.fatigue > 0.80 ? 0.25 : 0.0;
                if (isHome) {
                    homeTether = clamp01(wealthTether + fearTether + fatigueTether);
                }
            }

            // Composite Utility
            const utility = (
                weights.need * needSatisfaction +
                weights.profit * profitAttraction +
                weights.safety * safetyScore -
                weights.distance * normalizedDist +
                weights.home * homeTether
            );

            utilities.push({
                destinationId: destId,
                name: dest.name,
                utility,
                breakdown: {
                    needSatisfaction,
                    profitAttraction,
                    safetyScore,
                    effectiveHazard,
                    normalizedDist,
                    homeTether
                }
            });
        }

        // Sort descending by utility
        utilities.sort((a, b) => b.utility - a.utility);
        return utilities;
    }

    _getArchetypeWeights(archetype) {
        switch (archetype) {
            case BAND_ARCHETYPES.TRADE_CARAVAN:
                return { need: 0.20, profit: 0.45, safety: 0.25, distance: 0.15, home: 0.20 };
            case BAND_ARCHETYPES.BANDIT_RAIDERS:
                return { need: 0.25, profit: 0.40, safety: 0.10, distance: 0.20, home: 0.15 };
            case BAND_ARCHETYPES.PATROL_GUARD:
                return { need: 0.15, profit: 0.05, safety: 0.45, distance: 0.25, home: 0.30 };
            case BAND_ARCHETYPES.NOMAD_TRIBE:
                return { need: 0.45, profit: 0.15, safety: 0.30, distance: 0.15, home: 0.10 };
            case BAND_ARCHETYPES.DISPLACED_REFUGEES:
                return { need: 0.50, profit: 0.00, safety: 0.50, distance: 0.10, home: 0.05 };
            case BAND_ARCHETYPES.MERCENARY_COMPANY:
                return { need: 0.20, profit: 0.35, safety: 0.20, distance: 0.25, home: 0.15 };
            case BAND_ARCHETYPES.FERAL_BEASTS:
            default:
                return { need: 0.60, profit: 0.00, safety: 0.30, distance: 0.20, home: 0.10 };
        }
    }

    /**
     * Evaluates camp lifecycle transitions for a band.
     * @param {string} bandId
     * @param {Object} environment { isNight: boolean, isStorm: boolean }
     * @returns {Object} { intent: string, state: string, reason: string }
     */
    evaluateCampLifecycle(bandId, environment = {}) {
        const band = this.bands.get(bandId);
        if (!band) throw new Error(`Band ${bandId} not found.`);

        // Check for nearby hostile threats
        let proximateThreat = false;
        for (const [otherId, other] of this.bands.entries()) {
            if (otherId === bandId) continue;
            const dist = euclideanDistance(band.position, other.position);
            if (dist < this.config.emergencyThreatDistance) {
                // Threat if hostile archetype (e.g. Bandit or Predator)
                if (other.archetype === BAND_ARCHETYPES.BANDIT_RAIDERS || other.archetype === BAND_ARCHETYPES.FERAL_BEASTS) {
                    proximateThreat = true;
                    break;
                }
            }
        }

        // Case 1: In Camped State
        if (band.state === BAND_STATES.CAMPED) {
            band.campDuration++;
            // Emergency Evacuation: Hostile threat is proximate and band has significant fear
            if (proximateThreat && band.fear >= 0.50) {
                band.state = BAND_STATES.FLEEING;
                band.campDuration = 0;
                // Jettison 30% cargo wealth to flee
                band.wealth = Math.max(0.0, band.wealth * 0.70);
                band.lastIntent = ROAMING_INTENTS.INTENT_EVACUATE_CAMP;
                return {
                    intent: ROAMING_INTENTS.INTENT_EVACUATE_CAMP,
                    state: band.state,
                    reason: 'EMERGENCY_THREAT_PROXIMITY_CAMP_ABANDONED'
                };
            }

            // Normal Rest Recovery: fatigue drops below threshold and safe daylight
            if (band.fatigue <= this.config.campRecoveredThreshold && !environment.isNight && !environment.isStorm) {
                band.state = BAND_STATES.TRAVELING;
                band.campDuration = 0;
                band.lastIntent = ROAMING_INTENTS.INTENT_BREAK_CAMP;
                return {
                    intent: ROAMING_INTENTS.INTENT_BREAK_CAMP,
                    state: band.state,
                    reason: 'FATIGUE_RECOVERED_NORMAL_DEPARTURE'
                };
            }

            // Continue Camping
            band.fatigue = clamp01(band.fatigue - 0.035);
            return {
                intent: ROAMING_INTENTS.INTENT_ESTABLISH_CAMP,
                state: band.state,
                reason: 'RESTING_AND_RECOVERING'
            };
        }

        // Case 2: Traveling or Foraging
        // Pitch Camp trigger: High fatigue, nightfall, or storm
        if (band.fatigue >= this.config.campFatigueThreshold || environment.isNight || environment.isStorm) {
            band.state = BAND_STATES.CAMPED;
            band.campDuration = 0;
            band.lastIntent = ROAMING_INTENTS.INTENT_ESTABLISH_CAMP;
            return {
                intent: ROAMING_INTENTS.INTENT_ESTABLISH_CAMP,
                state: band.state,
                reason: environment.isNight ? 'NIGHTFALL_SAFETY' : 'EXHAUSTION_CAMP_PITCH'
            };
        }

        // Starvation foraging trigger
        if (band.hunger >= 0.70) {
            band.state = BAND_STATES.FORAGING;
            band.hunger = clamp01(band.hunger - 0.03);
            band.lastIntent = ROAMING_INTENTS.INTENT_FORAGE;
            return {
                intent: ROAMING_INTENTS.INTENT_FORAGE,
                state: band.state,
                reason: 'ACUTE_HUNGER_FORAGING'
            };
        }

        // Default: Continue traveling toward best destination
        const dests = this.evaluateDestinationUtilities(bandId);
        const best = dests[0];
        band.currentDestinationId = best?.destinationId || null;
        band.state = BAND_STATES.TRAVELING;
        band.lastIntent = ROAMING_INTENTS.INTENT_TRAVEL_TO;

        return {
            intent: ROAMING_INTENTS.INTENT_TRAVEL_TO,
            destinationId: best?.destinationId,
            recommendedWaypoint: this.destinations.get(best?.destinationId)?.position,
            state: band.state,
            reason: 'OPTIMAL_DESTINATION_SELECTED'
        };
    }

    /**
     * Procedural Systemic Encounters (Section XVI).
     * Checks all pairs of bands for proximity and resolves emergent interactions.
     * @returns {Array<Object>} List of evaluated encounters
     */
    evaluateSystemicEncounters() {
        const encounters = [];
        const bandList = Array.from(this.bands.values());

        for (let i = 0; i < bandList.length; i++) {
            for (let j = i + 1; j < bandList.length; j++) {
                const bandA = bandList[i];
                const bandB = bandList[j];

                const dist = euclideanDistance(bandA.position, bandB.position);
                if (dist <= this.config.encounterRadius) {
                    const encounter = this._resolveEncounter(bandA, bandB, dist);
                    encounters.push(encounter);
                    this.encounterHistory.push(encounter);

                    // If encounter involved violence or ambush, record hazard on both bands
                    if (encounter.resolution === ENCOUNTER_RESOLUTIONS.COMBAT_ENGAGEMENT ||
                        encounter.resolution === ENCOUNTER_RESOLUTIONS.EXTORTION_PAID) {
                        const locId = `loc_${Math.round(bandA.position.x)}_${Math.round(bandA.position.y)}`;
                        this.recordHazard(bandA.id, locId, 0.40);
                        this.recordHazard(bandB.id, locId, 0.40);
                    }
                }
            }
        }

        return encounters;
    }

    _resolveEncounter(bandA, bandB, dist) {
        // Classify category
        let category = ENCOUNTER_CATEGORIES.PEACEFUL_CONVERGENCE;
        const isA_Bandit = bandA.archetype === BAND_ARCHETYPES.BANDIT_RAIDERS;
        const isB_Bandit = bandB.archetype === BAND_ARCHETYPES.BANDIT_RAIDERS;
        const isA_Caravan = bandA.archetype === BAND_ARCHETYPES.TRADE_CARAVAN;
        const isB_Caravan = bandB.archetype === BAND_ARCHETYPES.TRADE_CARAVAN;
        const isA_Patrol = bandA.archetype === BAND_ARCHETYPES.PATROL_GUARD;
        const isB_Patrol = bandB.archetype === BAND_ARCHETYPES.PATROL_GUARD;
        const isA_Refugee = bandA.archetype === BAND_ARCHETYPES.DISPLACED_REFUGEES;
        const isB_Refugee = bandB.archetype === BAND_ARCHETYPES.DISPLACED_REFUGEES;

        if ((isA_Bandit && isB_Caravan) || (isB_Bandit && isA_Caravan)) {
            category = ENCOUNTER_CATEGORIES.HIGHWAY_AMBUSH;
        } else if ((isA_Bandit && isB_Patrol) || (isB_Bandit && isA_Patrol)) {
            category = ENCOUNTER_CATEGORIES.PATROL_RAID_ENGAGEMENT;
        } else if ((isA_Patrol && isB_Refugee) || (isB_Patrol && isA_Refugee)) {
            category = ENCOUNTER_CATEGORIES.REFUGEE_INSPECTION;
        } else if ((isA_Caravan && isB_Refugee) || (isB_Caravan && isA_Refugee)) {
            category = ENCOUNTER_CATEGORIES.REFUGEE_HUMANITARIAN_RELIEF;
        } else if (bandA.factionId !== bandB.factionId && (isA_Patrol || isB_Patrol)) {
            category = ENCOUNTER_CATEGORIES.RIVAL_STANDOFF;
        }

        // Emergent Resolution based on power, wealth, and fear
        let resolution = ENCOUNTER_RESOLUTIONS.MUTUAL_AVOIDANCE;
        let details = '';

        if (category === ENCOUNTER_CATEGORIES.HIGHWAY_AMBUSH) {
            const bandit = isA_Bandit ? bandA : bandB;
            const caravan = isA_Bandit ? bandB : bandA;

            // If caravan is terrified and has wealth, pays tribute/toll
            if (caravan.fear >= 0.40 && caravan.wealth >= 30.0 && bandit.power >= caravan.power * 0.8) {
                resolution = ENCOUNTER_RESOLUTIONS.EXTORTION_PAID;
                const extortionAmount = Math.min(caravan.wealth * 0.35, 50.0);
                caravan.wealth -= extortionAmount;
                bandit.wealth += extortionAmount;
                caravan.fear = clamp01(caravan.fear + 0.20);
                details = `Caravan paid ${extortionAmount.toFixed(1)} wealth to avoid slaughter.`;
            } else if (caravan.power > bandit.power * 1.5) {
                // Bandit intimidated and flees
                resolution = ENCOUNTER_RESOLUTIONS.FLED_IN_TERROR;
                bandit.fear = clamp01(bandit.fear + 0.40);
                details = `Bandits intimidated by heavy caravan guard and scattered.`;
            } else {
                // Combat engagement
                resolution = ENCOUNTER_RESOLUTIONS.COMBAT_ENGAGEMENT;
                details = `Caravan refused extortion; armed clash initiated.`;
            }
        } else if (category === ENCOUNTER_CATEGORIES.REFUGEE_HUMANITARIAN_RELIEF) {
            const caravan = isA_Caravan ? bandA : bandB;
            const refugee = isA_Caravan ? bandB : bandA;
            if (caravan.wealth >= 40.0) {
                resolution = ENCOUNTER_RESOLUTIONS.RELIEF_PROVIDED;
                caravan.wealth -= 10.0;
                refugee.hunger = clamp01(refugee.hunger - 0.30);
                refugee.fear = clamp01(refugee.fear - 0.25);
                details = `Caravan donated emergency rations to displaced refugees.`;
            } else {
                resolution = ENCOUNTER_RESOLUTIONS.MUTUAL_AVOIDANCE;
                details = `Caravan lacked surplus rations; departed peacefully.`;
            }
        } else if (category === ENCOUNTER_CATEGORIES.PATROL_RAID_ENGAGEMENT) {
            resolution = ENCOUNTER_RESOLUTIONS.COMBAT_ENGAGEMENT;
            details = `Militia patrol intercepted raiding party; combat engaged.`;
        } else if (category === ENCOUNTER_CATEGORIES.PEACEFUL_CONVERGENCE) {
            resolution = ENCOUNTER_RESOLUTIONS.PEACEFUL_TRADE;
            details = `Peaceful meeting on highway; shared rumors and route safety.`;
        }

        return {
            tick: this.currentTick,
            bandA: bandA.id,
            bandB: bandB.id,
            distance: dist,
            category,
            resolution,
            details
        };
    }

    /**
     * Executes one simulation step.
     * @param {Object} environment
     */
    step(environment = {}) {
        this.currentTick++;

        // 1. Update camp lifecycles and evaluate intents
        const intents = new Map();
        for (const [id, band] of this.bands.entries()) {
            // Natural fatigue and hunger progression while traveling
            if (band.state === BAND_STATES.TRAVELING) {
                band.fatigue = clamp01(band.fatigue + 0.008);
                band.hunger = clamp01(band.hunger + 0.005);
            }
            const evalResult = this.evaluateCampLifecycle(id, environment);
            intents.set(id, evalResult);
        }

        // 2. Evaluate systemic encounters
        const encounters = this.evaluateSystemicEncounters();

        return {
            tick: this.currentTick,
            intents,
            encounters
        };
    }

    /**
     * State export for determinism and replay.
     */
    getState() {
        return {
            currentTick: this.currentTick,
            bands: Array.from(this.bands.entries()).map(([k, v]) => {
                const { routeMemory, ...rest } = v;
                return {
                    id: k,
                    ...rest,
                    routeMemory: Array.from(routeMemory.entries())
                };
            }),
            destinations: Array.from(this.destinations.entries()),
            corridorHazards: Array.from(this.corridorHazards.entries()),
            encounterHistory: [...this.encounterHistory]
        };
    }

    /**
     * State restore for determinism and replay.
     */
    setState(state) {
        if (!state) return;
        this.currentTick = state.currentTick || 0;
        this.bands.clear();
        for (const item of state.bands || []) {
            const { routeMemory, ...rest } = item;
            this.bands.set(item.id, {
                ...rest,
                routeMemory: new Map(routeMemory || [])
            });
        }
        this.destinations = new Map(state.destinations || []);
        this.corridorHazards = new Map(state.corridorHazards || []);
        this.encounterHistory = [...(state.encounterHistory || [])];
    }
}
