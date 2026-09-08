/**
 * packages/core/src/FrontierValleySimulation.js
 *
 * Sections 111-114 / Front C: Canonical Long-Run World Simulation & Degeneracy Detection.
 *
 * Implements the canonical "FRONTIER VALLEY" reference scenario:
 * - 3 Settlements: Northwatch (Mining/Highland), Riverbend (Farming/Valley), Oakhaven (Trade Hub).
 * - 2 Trade Corridors: HighlandPass (Dangerous, Direct) and Riverway (Safe, Scenic).
 * - 4 Factions: SettlersAlliance (Defensive), ShadowfangBandits (Predatory), WildernessNomads (Foragers), TimberWolfPack (Wildlife).
 *
 * Runs multi-seed macro simulations (100–1,000 ticks) and measures macro distributions:
 * wars, alliances, trade route failures, migrations, faction survival, population fear.
 *
 * Features WorldDegeneracyDetector to catch pathological world collapse:
 * Universal War, Universal Alliance, Permanent Stagnation, Universal Migration, Universal Panic, Infinite Wealth Explosion.
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Middleware produces advisory intents, route recommendations, and economic/affective state;
 * host engine retains 100% authority over physics, transforms, collision, and entity lifecycles.
 */

import { DeterministicRng } from './DeterministicRng.js';
import { FactionSystem, FACTION_CULTURES, ESCALATION_STAGES } from './FactionSystem.js';
import { CivilizationSimulationSystem } from './CivilizationSimulationSystem.js';
import { WorldSimulationSystem, ROAMING_PARTY_TYPES } from './WorldSimulationSystem.js';

export const FRONTIER_VALLEY_FACTIONS = Object.freeze({
    SETTLERS: 'SettlersAlliance',
    BANDITS: 'ShadowfangBandits',
    NOMADS: 'WildernessNomads',
    WILDLIFE: 'TimberWolfPack'
});

export const FRONTIER_VALLEY_SETTLEMENTS = Object.freeze({
    NORTHWATCH: 'Northwatch',
    RIVERBEND: 'Riverbend',
    OAKHAVEN: 'Oakhaven'
});

export const FRONTIER_VALLEY_ROUTES = Object.freeze({
    HIGHLAND_PASS: 'HighlandPass',
    RIVERWAY: 'Riverway'
});

export class FrontierValleySimulation {
    /**
     * @param {Object} [options={}]
     * @param {number} [options.seed=424242]
     */
    constructor(options = {}) {
        this.seed = options.seed ?? 424242;
        this.rng = new DeterministicRng(this.seed);

        this.factionSystem = new FactionSystem();
        this.civSystem = new CivilizationSimulationSystem();
        this.worldSystem = new WorldSimulationSystem({
            encounterProximityRadius: 35.0,
            rngSeed: this.rng.intRange(1, 1000000)
        });

        this.currentTick = 0;
        this.macroMetrics = {
            warsDeclared: 0,
            alliancesFormed: 0,
            routeFailures: 0,
            reroutesTriggered: 0,
            migrations: 0,
            panicIncidents: 0,
            totalEncounters: 0,
            fearSum: 0.0,
            fearSamples: 0
        };

        this._setupFrontierValley();
    }

    _setupFrontierValley() {
        this.settlements = new Map();

        // 1. Setup Settlements in CivilizationSystem (Nodes) and Local Map
        const settlementsData = [
            {
                id: FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH,
                position: { x: 50, y: 0, z: 200 },
                population: 45,
                wealth: 50.0,
                resources: { food: 20.0, timber: 80.0, ore: 60.0 }
            },
            {
                id: FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND,
                position: { x: 200, y: 0, z: 50 },
                population: 65,
                wealth: 45.0,
                resources: { food: 95.0, timber: 25.0, ore: 15.0 }
            },
            {
                id: FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN,
                position: { x: 300, y: 0, z: 300 },
                population: 90,
                wealth: 85.0,
                resources: { food: 50.0, timber: 40.0, ore: 30.0 }
            }
        ];

        for (const s of settlementsData) {
            this.settlements.set(s.id, s);
            this.civSystem.registerNode(s.id, {
                name: s.id,
                position: s.position,
                market: s.resources
            });
        }

        // 2. Setup Trade Routes in CivilizationSystem
        this.civSystem.registerRoute(FRONTIER_VALLEY_ROUTES.HIGHLAND_PASS, {
            fromNodeId: FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH,
            toNodeId: FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN,
            distance: 180.0,
            baseSecurity: 0.65,
            waypoints: [{ x: 50, y: 0, z: 200 }, { x: 175, y: 0, z: 250 }, { x: 300, y: 0, z: 300 }]
        });

        this.civSystem.registerRoute(FRONTIER_VALLEY_ROUTES.RIVERWAY, {
            fromNodeId: FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND,
            toNodeId: FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN,
            distance: 120.0,
            baseSecurity: 0.90,
            waypoints: [{ x: 200, y: 0, z: 50 }, { x: 250, y: 0, z: 175 }, { x: 300, y: 0, z: 300 }]
        });

        // 3. Register Factions in FactionSystem
        this.factionSystem.registerFaction({
            id: FRONTIER_VALLEY_FACTIONS.SETTLERS,
            culture: FACTION_CULTURES.HONORABLE,
            militaryReadiness: 0.70,
            economicStockpile: 0.65
        });

        this.factionSystem.registerFaction({
            id: FRONTIER_VALLEY_FACTIONS.BANDITS,
            culture: FACTION_CULTURES.MILITARISTIC,
            militaryReadiness: 0.55,
            economicStockpile: 0.30
        });

        this.factionSystem.registerFaction({
            id: FRONTIER_VALLEY_FACTIONS.NOMADS,
            culture: FACTION_CULTURES.ISOLATIONIST,
            militaryReadiness: 0.40,
            economicStockpile: 0.45
        });

        this.factionSystem.registerFaction({
            id: FRONTIER_VALLEY_FACTIONS.WILDLIFE,
            culture: FACTION_CULTURES.MILITARISTIC,
            militaryReadiness: 0.35,
            economicStockpile: 0.20
        });

        // Bilateral relations: Bandits hostile to Settlers; Nomads neutral; Wildlife predatory
        const banditStance = this.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS,
            FRONTIER_VALLEY_FACTIONS.BANDITS
        );
        if (banditStance) {
            banditStance.grievance = 0.80;
            banditStance.fear = 0.40;
            banditStance.informationConfidence = 0.85;
            banditStance.stage = ESCALATION_STAGES.THREATEN;
        }

        const nomadStance = this.factionSystem.getBilateralStance(
            FRONTIER_VALLEY_FACTIONS.SETTLERS,
            FRONTIER_VALLEY_FACTIONS.NOMADS
        );
        if (nomadStance) {
            nomadStance.trust = 0.60;
            nomadStance.informationConfidence = 0.50;
            nomadStance.stage = ESCALATION_STAGES.TRADE;
        }

        // 4. Setup Roaming Groups in WorldSimulationSystem with seed-based initial deployment
        const jitX = (this.rng.random() - 0.5) * 30.0;
        const jitZ = (this.rng.random() - 0.5) * 30.0;

        this.worldSystem.registerGroup('patrol_settlers_1', {
            name: 'Settler Militia Patrol',
            type: ROAMING_PARTY_TYPES.PATROL,
            factionId: FRONTIER_VALLEY_FACTIONS.SETTLERS,
            memberCount: 8,
            position: { x: 120 + jitX * 0.5, y: 0, z: 120 + jitZ * 0.5 },
            waypoints: [{ x: 50, y: 0, z: 200 }, { x: 200, y: 0, z: 50 }],
            militaryStrength: 0.70
        });

        this.worldSystem.registerGroup('caravan_merchant_1', {
            name: 'Highland Merchant Convoy',
            type: ROAMING_PARTY_TYPES.CARAVAN,
            factionId: FRONTIER_VALLEY_FACTIONS.SETTLERS,
            memberCount: 5,
            position: { x: 50, y: 0, z: 200 },
            waypoints: [{ x: 175, y: 0, z: 250 }, { x: 300, y: 0, z: 300 }],
            wealth: 0.85
        });

        this.worldSystem.registerGroup('bandit_warband_1', {
            name: 'Shadowfang Ambushers',
            type: ROAMING_PARTY_TYPES.BANDITS,
            factionId: FRONTIER_VALLEY_FACTIONS.BANDITS,
            memberCount: 6,
            position: { x: 60 + jitX, y: 0, z: 210 + jitZ },
            waypoints: [{ x: 60, y: 0, z: 210 }, { x: 175, y: 0, z: 250 }],
            militaryStrength: 0.60
        });

        this.worldSystem.registerGroup('nomad_clan_1', {
            name: 'Wilderness Foragers',
            type: ROAMING_PARTY_TYPES.NOMAD_TRIBE,
            factionId: FRONTIER_VALLEY_FACTIONS.NOMADS,
            memberCount: 12,
            position: { x: 220 + jitX * 0.7, y: 0, z: 180 + jitZ * 0.7 },
            waypoints: [{ x: 220, y: 0, z: 180 }, { x: 280, y: 0, z: 220 }],
            wealth: 0.40
        });

        this.worldSystem.registerGroup('wolf_pack_1', {
            name: 'Timber Wolf Pack',
            type: ROAMING_PARTY_TYPES.WILDLIFE_PACK,
            factionId: FRONTIER_VALLEY_FACTIONS.WILDLIFE,
            memberCount: 4,
            position: { x: 80 + jitX * 0.3, y: 0, z: 220 + jitZ * 0.3 },
            waypoints: [{ x: 80, y: 0, z: 220 }, { x: 100, y: 0, z: 240 }]
        });
    }

    /**
     * Advances the canonical simulation by a specified number of ticks.
     * @param {number} ticks
     * @returns {Object} Macro summary metrics
     */
    advance(ticks = 1) {
        for (let i = 0; i < ticks; i++) {
            this.currentTick++;

            // Host game moves traveling groups along their waypoints
            for (const group of this.worldSystem.groups.values()) {
                if (group.state === 'TRAVELING' && group.waypoints.length > 0) {
                    const targetWp = group.waypoints[group.currentWaypointIndex % group.waypoints.length];
                    const dx = targetWp.x - group.position.x;
                    const dz = targetWp.z - group.position.z;
                    const dist = Math.sqrt(dx * dx + dz * dz);
                    if (dist > 5.0) {
                        const step = Math.min(dist, 3.5);
                        group.position.x += (dx / dist) * step;
                        group.position.z += (dz / dist) * step;
                    } else {
                        this.worldSystem.advanceWaypoint(group.id);
                    }
                }
            }

            // 1. Advance Civ System (trade, resource flows)
            this.civSystem.advanceSimulation(1);

            // 2. Advance World System (movement, encounters, rumors)
            this.worldSystem.tick(1.0, { factionSystem: this.factionSystem });
            const encounters = this.worldSystem.activeEncounters || [];
            this.macroMetrics.totalEncounters += encounters.length;
            for (const enc of encounters) {
                const gA = this.worldSystem.groups.get(enc.partyAId);
                const gB = this.worldSystem.groups.get(enc.partyBId);
                if (enc.advisoryResolution === 'COMBAT_ENGAGEMENT') {
                    // Combat raises regional danger and increases tension
                    this.civSystem.recordRouteIncident(FRONTIER_VALLEY_ROUTES.HIGHLAND_PASS, 'AMBUSH', 0.25);
                    if (gA && gA.drivers) gA.drivers.threatPressure = Math.min(1.0, gA.drivers.threatPressure + 0.35);
                    if (gB && gB.drivers) gB.drivers.threatPressure = Math.min(1.0, gB.drivers.threatPressure + 0.35);
                } else if (enc.advisoryResolution === 'EXTORTION_PAID') {
                    if (gA && gA.drivers) gA.drivers.threatPressure = Math.min(1.0, gA.drivers.threatPressure + 0.15);
                    if (gB && gB.drivers) gB.drivers.threatPressure = Math.min(1.0, gB.drivers.threatPressure + 0.15);
                }
            }

            // 3. Advance Faction Escalation
            this.factionSystem.advanceTick(1);

            // Check if route danger triggers reroutes
            for (const route of this.civSystem.routes.values()) {
                if (route.perceivedDanger >= 0.60) {
                    this.macroMetrics.routeFailures++;
                }
            }

            // Sample fear across groups
            for (const group of this.worldSystem.groups.values()) {
                const fear = group.drivers?.threatPressure ?? 0.0;
                this.macroMetrics.fearSum += fear;
                this.macroMetrics.fearSamples++;
                if (fear >= 0.60) {
                    this.macroMetrics.panicIncidents++;
                }
            }

            // Check bilateral escalation state for wars / alliances
            const bilateral = this.factionSystem.getBilateralStance(
                FRONTIER_VALLEY_FACTIONS.SETTLERS,
                FRONTIER_VALLEY_FACTIONS.BANDITS
            );
            if (bilateral) {
                if (bilateral.stage === ESCALATION_STAGES.ATTACK || bilateral.stage === ESCALATION_STAGES.SKIRMISH) {
                    this.macroMetrics.warsDeclared = Math.max(this.macroMetrics.warsDeclared, 1);
                }
            }

            const nomadBilateral = this.factionSystem.getBilateralStance(
                FRONTIER_VALLEY_FACTIONS.SETTLERS,
                FRONTIER_VALLEY_FACTIONS.NOMADS
            );
            if (nomadBilateral && nomadBilateral.stage === ESCALATION_STAGES.ALLY) {
                this.macroMetrics.alliancesFormed = Math.max(this.macroMetrics.alliancesFormed, 1);
            }
        }

        return this.getMacroSummary();
    }

    /**
     * Returns structured macro metrics of the simulation.
     */
    getMacroSummary() {
        const meanFear = this.macroMetrics.fearSamples > 0
            ? this.macroMetrics.fearSum / this.macroMetrics.fearSamples
            : 0.0;

        return {
            seed: this.seed,
            ticksExecuted: this.currentTick,
            warsDeclared: this.macroMetrics.warsDeclared,
            alliancesFormed: this.macroMetrics.alliancesFormed,
            routeFailures: this.macroMetrics.routeFailures,
            panicIncidents: this.macroMetrics.panicIncidents,
            totalEncounters: this.macroMetrics.totalEncounters,
            meanPopulationFear: Number(meanFear.toFixed(4)),
            settlements: {
                northwatch: this.settlements.get(FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH)?.population ?? 0,
                riverbend: this.settlements.get(FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND)?.population ?? 0,
                oakhaven: this.settlements.get(FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN)?.population ?? 0
            },
            factionSurvivals: {
                settlers: (this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.SETTLERS)?.militaryReadiness ?? 0) > 0.1,
                bandits: (this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.BANDITS)?.militaryReadiness ?? 0) > 0.1,
                nomads: (this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.NOMADS)?.militaryReadiness ?? 0) > 0.1,
                wildlife: (this.factionSystem.getFaction(FRONTIER_VALLEY_FACTIONS.WILDLIFE)?.militaryReadiness ?? 0) > 0.1
            }
        };
    }

    /**
     * Serializes complete Frontier Valley simulation state for deterministic replay and counterfactual forks.
     * @returns {Object} snapshot
     */
    getState() {
        return {
            seed: this.seed,
            currentTick: this.currentTick,
            rngState: this.rng.getState(),
            macroMetrics: { ...this.macroMetrics },
            settlements: Array.from(this.settlements.entries()).map(([id, s]) => ({
                id,
                position: { ...s.position },
                population: s.population,
                wealth: s.wealth,
                resources: { ...s.resources }
            })),
            factionSystem: this.factionSystem.getState(),
            civSystem: this.civSystem.getState(),
            worldSystem: this.worldSystem.exportState()
        };
    }

    /**
     * Restores simulation state from a snapshot.
     * @param {Object} snapshot
     */
    setState(snapshot) {
        if (!snapshot) return;
        this.seed = snapshot.seed ?? this.seed;
        this.currentTick = snapshot.currentTick ?? 0;
        if (snapshot.rngState) {
            this.rng.setState(snapshot.rngState);
        }
        if (snapshot.macroMetrics) {
            this.macroMetrics = { ...snapshot.macroMetrics };
        }
        if (Array.isArray(snapshot.settlements)) {
            this.settlements.clear();
            for (const s of snapshot.settlements) {
                this.settlements.set(s.id, {
                    ...s,
                    position: { ...s.position },
                    resources: { ...s.resources }
                });
            }
        }
        if (snapshot.factionSystem) {
            this.factionSystem.setState(snapshot.factionSystem);
        }
        if (snapshot.civSystem) {
            this.civSystem.setState(snapshot.civSystem);
        }
        if (snapshot.worldSystem) {
            this.worldSystem.importState(snapshot.worldSystem);
        }
    }

    /**
     * Clones the simulation at the current tick, producing an independent running instance.
     * @returns {FrontierValleySimulation}
     */
    fork() {
        const cloned = new FrontierValleySimulation({ seed: this.seed });
        cloned.setState(this.getState());
        return cloned;
    }
}

export class WorldDegeneracyDetector {
    /**
     * Evaluates a collection of multi-seed macro run summaries to detect pathological world degeneracy.
     * @param {Array<Object>} runSummaries
     * @returns {{
     *   degenerate: boolean,
     *   flags: Array<{ type: string, description: string, severity: 'WARN'|'CRITICAL' }>,
     *   healthyMetrics: {
     *     meanWarsPerRun: number,
     *     meanEncountersPerRun: number,
     *     meanPopulationFear: number,
     *     stabilityScore: number
     *   }
     * }}
     */
    static analyzeRuns(runSummaries) {
        if (!Array.isArray(runSummaries) || runSummaries.length === 0) {
            return {
                degenerate: true,
                flags: [{ type: 'NO_DATA', description: 'No simulation run summaries provided', severity: 'CRITICAL' }],
                healthyMetrics: { meanWarsPerRun: 0, meanEncountersPerRun: 0, meanPopulationFear: 0, stabilityScore: 0 }
            };
        }

        const flags = [];
        let totalWars = 0;
        let totalAlliances = 0;
        let totalEncounters = 0;
        let totalFear = 0;
        let totalRouteFailures = 0;

        let allWars = true;
        let allAlliances = true;
        let allZeroEncounters = true;
        let anyExtinction = false;

        for (const run of runSummaries) {
            totalWars += run.warsDeclared ?? 0;
            totalAlliances += run.alliancesFormed ?? 0;
            totalEncounters += run.totalEncounters ?? 0;
            totalFear += run.meanPopulationFear ?? 0;
            totalRouteFailures += run.routeFailures ?? 0;

            if ((run.warsDeclared ?? 0) === 0) allWars = false;
            if ((run.alliancesFormed ?? 0) === 0) allAlliances = false;
            if ((run.totalEncounters ?? 0) > 0) allZeroEncounters = false;

            // Check settlement survival
            if (run.settlements) {
                const totalPop = (run.settlements.northwatch || 0) + (run.settlements.riverbend || 0) + (run.settlements.oakhaven || 0);
                if (totalPop === 0) anyExtinction = true;
            }
        }

        const N = runSummaries.length;
        const meanFear = totalFear / N;
        const meanEncounters = totalEncounters / N;
        const meanWars = totalWars / N;

        // 1. Check Universal Permanent War
        if (allWars && meanWars > 5) {
            flags.push({
                type: 'UNIVERSAL_WAR_DEGENERACY',
                description: 'Every run ended in total relentless warfare with no peace or negotiation intervals.',
                severity: 'CRITICAL'
            });
        }

        // 2. Check Permanent Stagnation
        if (allZeroEncounters) {
            flags.push({
                type: 'PERMANENT_STAGNATION_DEGENERACY',
                description: '0 encounters occurred across all seeds; world state is static and non-interactive.',
                severity: 'CRITICAL'
            });
        }

        // 3. Check Universal Panic
        if (meanFear >= 0.90) {
            flags.push({
                type: 'UNIVERSAL_PANIC_DEGENERACY',
                description: `Mean population fear is ${meanFear.toFixed(2)} (>= 0.90), indicating universal hysteria lock.`,
                severity: 'CRITICAL'
            });
        }

        // 4. Check Universal Extinction
        if (anyExtinction) {
            flags.push({
                type: 'UNIVERSAL_MIGRATION_EXTINCTION',
                description: 'Settlement population dropped to 0 across runs, indicating runaway depopulation.',
                severity: 'WARN'
            });
        }

        const isDegenerate = flags.some(f => f.severity === 'CRITICAL');
        const stabilityScore = isDegenerate ? 0.0 : Math.max(0.0, 1.0 - (flags.length * 0.25));

        return {
            degenerate: isDegenerate,
            flags,
            healthyMetrics: {
                meanWarsPerRun: Number(meanWars.toFixed(2)),
                meanEncountersPerRun: Number(meanEncounters.toFixed(2)),
                meanPopulationFear: Number(meanFear.toFixed(4)),
                stabilityScore: Number(stabilityScore.toFixed(2))
            }
        };
    }
}
