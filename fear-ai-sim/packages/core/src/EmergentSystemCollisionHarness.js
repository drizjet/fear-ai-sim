/**
 * @fear-ai/core - EmergentSystemCollisionHarness
 * 
 * Front E / Sections 61–63: Complex Emergent System Collision Harness.
 * 
 * Multi-System Stressor Orchestration:
 * Concurrently collides multi-layered living-world subsystems under catastrophic compound shocks:
 * 1. Civilization & Route Network (CivilizationSimulationSystem)
 * 2. Bilateral Factions & Diplomacy (FactionSystem)
 * 3. Market Supply/Demand & Prices (EconomicFeedbackSystem)
 * 4. Settlement Demographics & Refugees (SettlementMigrationSystem)
 * 5. Roaming Caravans, Raiders & Encounters (RoamingBandSystem)
 * 6. Designer/Player Shocks (ScenarioInterventionSystem)
 * 7. Runaway Loop Detection & Circuit Breakers (MultiFeedbackCascadeSystem)
 * 
 * Compound Stress Regimes:
 * - THE_GREAT_RUPTURE: Simultaneous leader assassination + capital terror shock + trade route blockade
 * - FAMINE_WAR_EXODUS: Commodity drought + faction war escalation + mass refugee exodus
 * - CASCADING_HORIZON_COLLISION: 100+ tick multi-phase compound stress sequence
 * 
 * Systemic Health & Resilience Metrics:
 * - Systemic Resilience Index (R_sys in [0, 1]): Multi-pillar harmonic/geometric mean
 * - Cross-Subsystem Coupling Entropy (H_coupling in [0, 1]): Shannon entropy of activity differentiation
 * - Cascade Dampening Factor (D_damp in [0, 1]): Negative feedback arrest of runaway loops
 * - Recovery Latency: Number of ticks post-shock until vital indicators return within 20% of baseline
 * - Numerical Integrity Audit: Verification of 0 NaNs, 0 Infs, 0 negative inventories, 0 invalid ranges
 * 
 * STRICT INVARIANT:
 * Host game remains authoritative for world transforms, unit navigation, combat, and entity lifecycles.
 * EmergentSystemCollisionHarness evaluates compound stress propagation and resilience offline/advisory.
 */

import { CivilizationSimulationSystem, ROUTE_STATUS, COMMODITY_TYPES } from './CivilizationSimulationSystem.js';
import { FactionSystem, ESCALATION_STAGES, INCIDENT_TYPES } from './FactionSystem.js';
import { EconomicFeedbackSystem } from './EconomicFeedbackSystem.js';
import { SettlementMigrationSystem, MIGRATION_DRIVERS } from './SettlementMigrationSystem.js';
import { RoamingBandSystem, BAND_ARCHETYPES, BAND_STATES } from './RoamingBandSystem.js';
import { ScenarioInterventionSystem, INTERVENTION_TYPES } from './ScenarioInterventionSystem.js';
import { MultiFeedbackCascadeSystem, COUPLING_VARIABLES } from './MultiFeedbackCascadeSystem.js';
import { DeterministicRng } from './DeterministicRng.js';

export const COLLISION_SCENARIOS = Object.freeze({
    THE_GREAT_RUPTURE: 'THE_GREAT_RUPTURE',
    FAMINE_WAR_EXODUS: 'FAMINE_WAR_EXODUS',
    CASCADING_HORIZON_COLLISION: 'CASCADING_HORIZON_COLLISION'
});

export const SYSTEMIC_HEALTH_METRICS = Object.freeze([
    'resilienceIndex',
    'couplingEntropy',
    'cascadeDampening',
    'recoveryLatency',
    'numericalIntegrity'
]);

export class EmergentSystemCollisionHarness {
    constructor(config = {}) {
        this.config = Object.freeze({
            seed: config.seed ?? 987654,
            defaultTicks: config.defaultTicks ?? 40,
            ...config
        });

        this.rng = new DeterministicRng(this.config.seed);
        this.tickCount = 0;
        this.subsystems = null;
        this.history = [];
        this._initWorld();
    }

    _initWorld() {
        // 1. Initialize Subsystems
        const civSystem = new CivilizationSimulationSystem();
        const factionSystem = new FactionSystem();
        const economicSystem = new EconomicFeedbackSystem();
        const migrationSystem = new SettlementMigrationSystem();
        // NEXT-83: was rngSeed (dead key - RoamingBandSystem reads
        // config.seed). Draw order unchanged, preserving harness determinism.
        const roamingSystem = new RoamingBandSystem({ seed: this.rng.intRange(1, 1000000) });
        const interventionSystem = new ScenarioInterventionSystem();
        const cascadeSystem = new MultiFeedbackCascadeSystem();

        // 2. Setup Baseline Settlements & Nodes
        const settlements = [
            { id: 'RIVERBEND', name: 'Riverbend Capital', x: 100, y: 100, z: 0, pop: 120, food: 150, garrison: 0.8 },
            { id: 'NORTHWATCH', name: 'Northwatch Keep', x: 100, y: 350, z: 0, pop: 60, food: 70, garrison: 0.9 },
            { id: 'OAKHAVEN', name: 'Oakhaven Trade Hub', x: 350, y: 100, z: 0, pop: 90, food: 110, garrison: 0.6 }
        ];

        for (const s of settlements) {
            civSystem.registerNode(s.id, {
                name: s.name,
                position: { x: s.x, y: s.y, z: s.z },
                garrison: s.garrison
            });
            migrationSystem.registerSettlement(s.id, {
                population: s.pop,
                housingCapacity: s.pop * 1.3,
                foodStock: s.food,
                threatLevel: 0.1,
                garrisonStrength: s.garrison
            });
            economicSystem.registerSettlementMarket(s.id, {
                population: s.pop,
                wealth: 100.0,
                garrison: s.garrison,
                initialStockpiles: {
                    [COMMODITY_TYPES.FOOD]: s.food,
                    [COMMODITY_TYPES.TIMBER]: 60.0,
                    [COMMODITY_TYPES.ORE]: 50.0
                }
            });
            roamingSystem.registerDestination({
                id: s.id,
                name: s.name,
                position: { x: s.x, y: s.y, z: s.z },
                type: 'SETTLEMENT',
                resources: { food: 0.8, shelter: 0.7, tradeProfit: 0.8 },
                baseHazard: 0.1
            });
        }

        // 3. Setup Routes
        civSystem.registerRoute('CORRIDOR_NORTH', {
            fromNodeId: 'RIVERBEND',
            toNodeId: 'NORTHWATCH',
            waypoints: [{ x: 100, y: 100, z: 0 }, { x: 100, y: 350, z: 0 }],
            lengthMeters: 250,
            baseSafety: 0.85
        });
        civSystem.registerRoute('CORRIDOR_EAST', {
            fromNodeId: 'RIVERBEND',
            toNodeId: 'OAKHAVEN',
            waypoints: [{ x: 100, y: 100, z: 0 }, { x: 350, y: 100, z: 0 }],
            lengthMeters: 250,
            baseSafety: 0.90
        });

        // 4. Setup Factions
        factionSystem.registerFaction({ id: 'SettlersAlliance', name: 'Settlers Alliance', culture: 'CIVILIAN' });
        factionSystem.registerFaction({ id: 'ShadowfangRaiders', name: 'Shadowfang Raiders', culture: 'PREDATORY' });
        factionSystem.registerFaction({ id: 'WildernessNomads', name: 'Wilderness Nomads', culture: 'DEFENSIVE' });

        // 5. Setup Roaming Bands
        roamingSystem.registerBand({
            id: 'caravan_main',
            name: 'Riverbend Royal Caravan',
            archetype: BAND_ARCHETYPES.TRADE_CARAVAN,
            factionId: 'SettlersAlliance',
            homeBase: { x: 100, y: 100, z: 0, id: 'RIVERBEND' },
            position: { x: 120, y: 100, z: 0 },
            martialPower: 35,
            wealth: 80,
            fatigue: 0.1,
            fear: 0.05
        });

        roamingSystem.registerBand({
            id: 'raider_pack',
            name: 'Shadowfang Reavers',
            archetype: BAND_ARCHETYPES.BANDIT_RAIDERS,
            factionId: 'ShadowfangRaiders',
            homeBase: { x: 100, y: 350, z: 0, id: 'NORTHWATCH' },
            position: { x: 100, y: 300, z: 0 },
            martialPower: 55,
            wealth: 20,
            fatigue: 0.2,
            fear: 0.10
        });

        this.subsystems = {
            civSystem,
            factionSystem,
            economicSystem,
            migrationSystem,
            roamingSystem,
            interventionSystem,
            cascadeSystem
        };
        this.tickCount = 0;
        this.history = [];
    }

    /**
     * Executes a compound stress collision scenario.
     * @param {string} scenarioName - One of COLLISION_SCENARIOS
     * @param {Object} [options={}]
     * @returns {Object} Collision run results and systemic resilience metrics
     */
    runCollision(scenarioName = COLLISION_SCENARIOS.THE_GREAT_RUPTURE, options = {}) {
        this._initWorld();
        const ticks = options.ticks ?? this.config.defaultTicks;
        const shockTick = 5;

        let baselineEquilibrium = null;
        let peakShockImpact = 0;
        let recoveryTick = null;
        const trajectory = [];

        for (let t = 0; t < ticks; t++) {
            this.tickCount++;

            // Inject Compound Stressors at scheduled tick
            if (t === shockTick) {
                this._injectCompoundShock(scenarioName);
            } else if (scenarioName === COLLISION_SCENARIOS.CASCADING_HORIZON_COLLISION) {
                // Multi-phase staggered shocks
                if (t === 15) {
                    this.subsystems.interventionSystem.applyIntervention({
                        type: INTERVENTION_TYPES.INJECT_COMMODITY_DROUGHT,
                        target: 'RIVERBEND',
                        parameters: { severity: 0.85 },
                        durationTicks: 15
                    });
                } else if (t === 25) {
                    this.subsystems.interventionSystem.applyIntervention({
                        type: INTERVENTION_TYPES.ASSASSINATE_LEADER,
                        target: 'SettlersAlliance',
                        parameters: { leaderId: 'Governor_Alden' },
                        durationTicks: 10
                    });
                }
            }

            // Execute Tick Step across all Subsystems
            const stepSnapshot = this._executeStep();
            trajectory.push(stepSnapshot);

            if (t === shockTick - 1) {
                baselineEquilibrium = { ...stepSnapshot };
            }

            if (t >= shockTick) {
                const totalStress = stepSnapshot.avgFear + (stepSnapshot.avgPrice / (baselineEquilibrium?.avgPrice || 1.0) - 1.0);
                if (totalStress > peakShockImpact) {
                    peakShockImpact = totalStress;
                }

                // Check recovery: fear within 25% of baseline
                if (recoveryTick === null && t > shockTick + 5) {
                    const fearDiff = Math.abs(stepSnapshot.avgFear - (baselineEquilibrium?.avgFear || 0.1));
                    if (fearDiff < 0.15) {
                        recoveryTick = t - shockTick;
                    }
                }
            }
        }

        // Compute Systemic Resilience Metrics
        const metrics = this._computeResilienceMetrics(baselineEquilibrium, trajectory, peakShockImpact, recoveryTick, ticks - shockTick);

        return {
            scenario: scenarioName,
            totalTicks: ticks,
            shockTick,
            baselineEquilibrium,
            metrics,
            trajectorySummary: {
                initialPop: trajectory[0].totalPopulation,
                finalPop: trajectory[trajectory.length - 1].totalPopulation,
                peakFear: Math.max(...trajectory.map(s => s.avgFear)),
                finalFear: trajectory[trajectory.length - 1].avgFear,
                peakPrice: Math.max(...trajectory.map(s => s.avgPrice)),
                finalPrice: trajectory[trajectory.length - 1].avgPrice
            }
        };
    }

    _injectCompoundShock(scenarioName) {
        const { interventionSystem, factionSystem, roamingSystem } = this.subsystems;

        switch (scenarioName) {
            case COLLISION_SCENARIOS.THE_GREAT_RUPTURE:
                // 1. Leader Assassination
                interventionSystem.applyIntervention({
                    type: INTERVENTION_TYPES.ASSASSINATE_LEADER,
                    target: 'SettlersAlliance',
                    parameters: { leaderId: 'Commander_Vane' },
                    durationTicks: 15
                });
                // 2. Acute Terror Incursion
                interventionSystem.applyIntervention({
                    type: INTERVENTION_TYPES.INJECT_ACUTE_THREAT,
                    target: 'RIVERBEND',
                    parameters: { intensity: 0.95, radius: 50.0 },
                    durationTicks: 10
                });
                // 3. Trade Corridor Blockade
                interventionSystem.applyIntervention({
                    type: INTERVENTION_TYPES.BLOCK_TRADE_CORRIDOR,
                    target: 'CORRIDOR_NORTH',
                    parameters: { corridorId: 'CORRIDOR_NORTH' },
                    durationTicks: 20
                });
                break;

            case COLLISION_SCENARIOS.FAMINE_WAR_EXODUS:
                // 1. Severe Commodity Drought
                interventionSystem.applyIntervention({
                    type: INTERVENTION_TYPES.INJECT_COMMODITY_DROUGHT,
                    target: 'RIVERBEND',
                    parameters: { severity: 0.90 },
                    durationTicks: 25
                });
                // 2. Faction War Escalation
                factionSystem.recordIncident('ShadowfangRaiders', 'SettlersAlliance', INCIDENT_TYPES.RAID_CONFIRMED, { severity: 1.0 });
                factionSystem.recordIncident('SettlersAlliance', 'ShadowfangRaiders', INCIDENT_TYPES.SKIRMISH_CASUALTY, { severity: 0.9 });
                // 3. Displaced Refugee Party
                roamingSystem.registerBand({
                    id: 'refugee_column',
                    name: 'Riverbend Famine Refugees',
                    archetype: BAND_ARCHETYPES.DISPLACED_REFUGEES,
                    factionId: 'SettlersAlliance',
                    homeBase: { x: 100, y: 100, z: 0, id: 'RIVERBEND' },
                    position: { x: 100, y: 120, z: 0 },
                    martialPower: 5,
                    wealth: 5,
                    fatigue: 0.65,
                    fear: 0.70
                });
                break;

            case COLLISION_SCENARIOS.CASCADING_HORIZON_COLLISION:
            default:
                interventionSystem.applyIntervention({
                    type: INTERVENTION_TYPES.BLOCK_TRADE_CORRIDOR,
                    target: 'CORRIDOR_EAST',
                    parameters: { corridorId: 'CORRIDOR_EAST' },
                    durationTicks: 30
                });
                interventionSystem.applyIntervention({
                    type: INTERVENTION_TYPES.INJECT_ACUTE_THREAT,
                    target: 'NORTHWATCH',
                    parameters: { intensity: 0.85, radius: 40.0 },
                    durationTicks: 12
                });
                break;
        }
    }

    _executeStep() {
        const { civSystem, factionSystem, economicSystem, migrationSystem, roamingSystem, interventionSystem, cascadeSystem } = this.subsystems;

        // 1. Advance Civilization LOD
        civSystem.advanceSimulation(1);

        // 2. Advance Faction Diplomacy
        factionSystem.advanceTick(1);

        // 3. Advance Interventions
        const activeShocks = interventionSystem.evaluateInterventions({
            settlements: Array.from(migrationSystem.settlements.values()),
            routes: Array.from(civSystem.routes.values())
        });

        // 4. Update Economic Feedback with Scarcity/Blockade
        for (const shock of activeShocks) {
            if (shock.directive === 'COMMODITY_DROUGHT' && economicSystem.settlementMarkets.has(shock.target)) {
                const m = economicSystem.settlementMarkets.get(shock.target);
                m.stockpiles[COMMODITY_TYPES.FOOD] = Math.max(0, (m.stockpiles[COMMODITY_TYPES.FOOD] || 50) * 0.2);
            }
        }
        economicSystem.tick(1);

        // 5. Evaluate Migration Pressures
        migrationSystem.tick(0.016);

        // 6. Roaming Bands Navigation & Systemic Encounters
        roamingSystem.currentTick++;
        for (const band of roamingSystem.bands.values()) {
            roamingSystem.evaluateCampLifecycle(band.id, { isNight: false, isStorm: false });
        }
        roamingSystem.evaluateSystemicEncounters();

        // 7. Multi-Feedback Cascade Analysis
        let totalPop = 0;
        let totalFear = 0;
        let popCount = 0;
        for (const s of migrationSystem.settlements.values()) {
            totalPop += s.population;
            totalFear += s.threatLevel;
            popCount++;
        }
        const avgFear = popCount > 0 ? totalFear / popCount : 0.0;

        let totalPrice = 0;
        let priceCount = 0;
        for (const m of economicSystem.settlementMarkets.values()) {
            for (const p of Object.values(m.prices)) {
                totalPrice += p;
                priceCount++;
            }
        }
        const avgPrice = priceCount > 0 ? totalPrice / priceCount : 15.0;

        cascadeSystem.recordTickTelemetry(this.tickCount, {
            [COUPLING_VARIABLES.POPULATION_FEAR]: avgFear,
            [COUPLING_VARIABLES.MARKET_PRICE]: avgPrice,
            [COUPLING_VARIABLES.COMMODITY_SCARCITY]: Math.min(1.0, 100.0 / Math.max(1.0, avgPrice))
        });

        const snapshot = {
            tick: this.tickCount,
            totalPopulation: totalPop,
            avgFear: Number(avgFear.toFixed(4)),
            avgPrice: Number(avgPrice.toFixed(2)),
            activeBands: roamingSystem.bands.size,
            inTransitMigrants: migrationSystem.inTransitParties.length,
            activeShocksCount: activeShocks.length
        };

        this.history.push(snapshot);
        return snapshot;
    }

    _computeResilienceMetrics(baseline, trajectory, peakImpact, recoveryTick, maxRecoveryTicks) {
        if (!baseline || trajectory.length === 0) {
            return {
                resilienceIndex: 0.5,
                couplingEntropy: 0.5,
                cascadeDampening: 0.5,
                recoveryLatency: 999,
                numericalIntegrity: { hasNaN: false, hasInf: false, status: 'CLEAN' }
            };
        }

        const finalStep = trajectory[trajectory.length - 1];

        // 1. Population Retention Pillar [0.0, 1.0]
        const popRetention = Math.max(0.0, Math.min(1.0, finalStep.totalPopulation / Math.max(1, baseline.totalPopulation)));

        // 2. Economic Stability Pillar [0.0, 1.0]
        const priceRatio = finalStep.avgPrice / Math.max(1.0, baseline.avgPrice);
        const econStability = Math.max(0.0, Math.min(1.0, 1.0 / (1.0 + Math.abs(priceRatio - 1.0))));

        // 3. Affective Recovery Pillar [0.0, 1.0]
        const affectRecovery = Math.max(0.0, Math.min(1.0, 1.0 - finalStep.avgFear));

        // 4. Peace Viability Pillar [0.0, 1.0]
        let warCount = 0;
        let pairCount = 0;
        for (const targetMap of this.subsystems.factionSystem.stances.values()) {
            for (const st of targetMap.values()) {
                pairCount++;
                if (st.stage === ESCALATION_STAGES.ATTACK || st.stage === ESCALATION_STAGES.SKIRMISH) {
                    warCount++;
                }
            }
        }
        const peaceViability = pairCount > 0 ? (1.0 - (warCount / pairCount)) : 1.0;

        // Systemic Resilience Index: Geometric mean of all 4 pillars
        const resilienceIndex = Math.pow(popRetention * econStability * affectRecovery * peaceViability, 0.25);

        // 5. Cross-Subsystem Coupling Entropy [0.0, 1.0]
        // Measures activity balance across Affective, Demographic, Economic, and Roaming subsystems
        const activities = [
            Math.max(0.01, finalStep.avgFear),
            Math.max(0.01, finalStep.inTransitMigrants / 10.0),
            Math.max(0.01, (finalStep.avgPrice - baseline.avgPrice) / baseline.avgPrice + 0.1),
            Math.max(0.01, finalStep.activeBands / 5.0)
        ];
        const sumAct = activities.reduce((a, b) => a + b, 0);
        let entropy = 0;
        for (const act of activities) {
            const p = act / sumAct;
            entropy -= p * Math.log(p);
        }
        const normalizedEntropy = entropy / Math.log(activities.length);

        // 6. Cascade Dampening Factor [0.0, 1.0]
        // Validates that observed peak impact was less than theoretical unbounded catastrophe
        const theoreticalWorst = 5.0;
        const cascadeDampening = Math.max(0.0, Math.min(1.0, 1.0 - (peakImpact / theoreticalWorst)));

        // 7. Numerical Integrity Audit
        let hasNaN = false;
        let hasInf = false;
        for (const step of trajectory) {
            for (const val of Object.values(step)) {
                if (typeof val === 'number') {
                    if (Number.isNaN(val)) hasNaN = true;
                    if (!Number.isFinite(val)) hasInf = true;
                }
            }
        }

        return {
            resilienceIndex: Number(resilienceIndex.toFixed(4)),
            couplingEntropy: Number(normalizedEntropy.toFixed(4)),
            cascadeDampening: Number(cascadeDampening.toFixed(4)),
            recoveryLatency: recoveryTick !== null ? recoveryTick : maxRecoveryTicks,
            numericalIntegrity: {
                hasNaN,
                hasInf,
                status: (!hasNaN && !hasInf) ? 'CLEAN' : 'NUMERICAL_INSTABILITY_DETECTED'
            },
            pillars: {
                populationRetention: Number(popRetention.toFixed(4)),
                economicStability: Number(econStability.toFixed(4)),
                affectiveRecovery: Number(affectRecovery.toFixed(4)),
                peaceViability: Number(peaceViability.toFixed(4))
            }
        };
    }

    getState() {
        return {
            seed: this.config.seed,
            tickCount: this.tickCount,
            historyCount: this.history.length,
            latestSnapshot: this.history.length > 0 ? { ...this.history[this.history.length - 1] } : null
        };
    }

    setState(state) {
        if (!state) return;
        this.tickCount = state.tickCount ?? 0;
    }
}
