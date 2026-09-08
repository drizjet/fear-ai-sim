/**
 * ScenarioInterventionSystem.js - Living World Intelligence Middleware for Player & Designer Interventions.
 * Implements Front A / Sections 116–117:
 * - Atomic Player / Designer Intervention Directives (Threat Injection, Assassination, Blockade, Drought, Peace)
 * - Multi-Domain Causal Consequence Tracking (Affective, Demographic, Economic, Diplomatic)
 * - Multi-Tick Ripple Persistence & Effect Size Attribution
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Interventions operate by submitting semantic shocks and appraising systemic consequences.
 * The host game engine maintains absolute authority over entity physical movement,
 * collision, transforms, combat damage execution, and inventory.
 */

export const INTERVENTION_TYPES = Object.freeze({
    INJECT_ACUTE_THREAT: 'INJECT_ACUTE_THREAT',
    ASSASSINATE_LEADER: 'ASSASSINATE_LEADER',
    BLOCK_TRADE_CORRIDOR: 'BLOCK_TRADE_CORRIDOR',
    INJECT_COMMODITY_DROUGHT: 'INJECT_COMMODITY_DROUGHT',
    BROKER_PEACE_OR_ALLIANCE: 'BROKER_PEACE_OR_ALLIANCE'
});

export const CONSEQUENCE_DOMAINS = Object.freeze({
    AFFECTIVE: 'AFFECTIVE',
    DEMOGRAPHIC: 'DEMOGRAPHIC',
    ECONOMIC: 'ECONOMIC',
    DIPLOMATIC: 'DIPLOMATIC'
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

export class ScenarioInterventionSystem {
    /**
     * @param {Object} options
     */
    constructor(options = {}) {
        this.activeInterventions = [];
        this.historyLog = [];
        this.currentTick = 0;
    }

    /**
     * Injects an atomic player/designer intervention into the living world.
     * @param {Object} intervention { type, target, parameters, durationTicks }
     * @returns {Object} Created intervention record
     */
    applyIntervention(intervention) {
        if (!intervention || !intervention.type || !INTERVENTION_TYPES[intervention.type]) {
            throw new Error(`Invalid or unsupported intervention type: ${intervention?.type}`);
        }

        const record = {
            id: `intv_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
            type: intervention.type,
            target: intervention.target || 'WORLD',
            parameters: { ...(intervention.parameters || {}) },
            appliedTick: this.currentTick,
            durationTicks: Math.max(1, intervention.durationTicks || 20),
            remainingTicks: Math.max(1, intervention.durationTicks || 20),
            baselineMetrics: null,
            consequenceSeries: []
        };

        this.activeInterventions.push(record);
        this.historyLog.push({
            id: record.id,
            type: record.type,
            target: record.target,
            parameters: record.parameters,
            tick: this.currentTick
        });

        return record;
    }

    /**
     * Evaluates the active interventions against current world state and records consequences.
     * @param {Object} worldContext { agents, factions, settlements, routes }
     * @returns {Array<Object>} Generated advisory shocks and consequences
     */
    evaluateInterventions(worldContext = {}) {
        this.currentTick++;
        const generatedShocks = [];

        for (let i = this.activeInterventions.length - 1; i >= 0; i--) {
            const intv = this.activeInterventions[i];
            const shock = this._processInterventionShock(intv, worldContext);
            if (shock) {
                generatedShocks.push(shock);
            }

            intv.remainingTicks--;
            if (intv.remainingTicks <= 0) {
                // Conclude intervention and generate final attribution report
                this.activeInterventions.splice(i, 1);
            }
        }

        return generatedShocks;
    }

    _processInterventionShock(intv, worldContext) {
        const shock = {
            interventionId: intv.id,
            type: intv.type,
            target: intv.target,
            tick: this.currentTick,
            advisoryDirectives: [],
            impactSnapshot: {}
        };

        switch (intv.type) {
            case INTERVENTION_TYPES.INJECT_ACUTE_THREAT: {
                const threatPos = intv.parameters.position || { x: 0, y: 0, z: 0 };
                const threatIntensity = clamp01(intv.parameters.intensity || 0.85);
                const threatRadius = intv.parameters.radius || 50.0;

                let affectedAgents = 0;
                let fearSurgeSum = 0.0;

                // Advisory threat notifications for agents within radius
                if (Array.isArray(worldContext.agents)) {
                    for (const agent of worldContext.agents) {
                        const dist = euclideanDistance(agent.position || { x: 0, y: 0 }, threatPos);
                        if (dist <= threatRadius) {
                            affectedAgents++;
                            const falloff = 1.0 - (dist / threatRadius);
                            const fearDelta = clamp01(threatIntensity * falloff);
                            fearSurgeSum += fearDelta;

                            shock.advisoryDirectives.push({
                                targetAgentId: agent.id,
                                directive: 'ELEVATE_FEAR_STIMULUS',
                                recommendedFearDelta: fearDelta,
                                distance: dist,
                                threatVector: {
                                    x: (agent.position?.x || 0) - threatPos.x,
                                    y: (agent.position?.y || 0) - threatPos.y
                                }
                            });
                        }
                    }
                }

                shock.impactSnapshot = {
                    domain: CONSEQUENCE_DOMAINS.AFFECTIVE,
                    affectedEntitiesCount: affectedAgents,
                    meanFearDelta: affectedAgents > 0 ? (fearSurgeSum / affectedAgents) : 0.0
                };
                break;
            }

            case INTERVENTION_TYPES.ASSASSINATE_LEADER: {
                const factionId = intv.target;
                shock.advisoryDirectives.push({
                    targetFactionId: factionId,
                    directive: 'LEADERSHIP_VACANCY_CRISIS',
                    cohesionPenalty: 0.50,
                    panicContagionMultiplier: 2.0,
                    recommendedSuccessionType: 'EMERGENCY_MARTIAL_COUNCIL'
                });

                shock.impactSnapshot = {
                    domain: CONSEQUENCE_DOMAINS.DIPLOMATIC,
                    cohesionLoss: 0.50,
                    successionTriggered: true
                };
                break;
            }

            case INTERVENTION_TYPES.BLOCK_TRADE_CORRIDOR: {
                const corridorId = intv.target;
                shock.advisoryDirectives.push({
                    corridorId,
                    directive: 'CORRIDOR_TRANSIT_SUSPENDED',
                    hazardSeverity: 1.0,
                    recommendedDetour: intv.parameters.detourCorridorId || 'ALTERNATE_DETOUR'
                });

                shock.impactSnapshot = {
                    domain: CONSEQUENCE_DOMAINS.ECONOMIC,
                    blockedCorridor: corridorId,
                    trafficDiverted: true
                };
                break;
            }

            case INTERVENTION_TYPES.INJECT_COMMODITY_DROUGHT: {
                const settlementId = intv.target;
                const severity = clamp01(intv.parameters.severity || 0.70);
                shock.advisoryDirectives.push({
                    settlementId,
                    directive: 'FAMINE_DESPERATION_FEEDBACK',
                    stockpileReductionPercent: severity,
                    desperationFearDelta: severity * 0.50,
                    migrationPushTriggered: severity >= 0.50
                });

                shock.impactSnapshot = {
                    domain: CONSEQUENCE_DOMAINS.DEMOGRAPHIC,
                    settlementId,
                    desperationFearDelta: severity * 0.50,
                    migrationPush: severity >= 0.50
                };
                break;
            }

            case INTERVENTION_TYPES.BROKER_PEACE_OR_ALLIANCE: {
                const [factionA, factionB] = Array.isArray(intv.parameters.factions)
                    ? intv.parameters.factions
                    : ['FACTION_A', 'FACTION_B'];
                shock.advisoryDirectives.push({
                    factionA,
                    factionB,
                    directive: 'ENFORCE_CEASEFIRE_SUMMIT',
                    targetStance: 'TRADE',
                    grievanceDampening: 0.80
                });

                shock.impactSnapshot = {
                    domain: CONSEQUENCE_DOMAINS.DIPLOMATIC,
                    reconciledPairs: `${factionA} <-> ${factionB}`,
                    peaceEnforced: true
                };
                break;
            }
        }

        intv.consequenceSeries.push({
            tick: this.currentTick,
            snapshot: shock.impactSnapshot
        });

        return shock;
    }

    /**
     * Synthesizes a structured causal consequence report for an intervention.
     * @param {Object} interventionRecord
     * @returns {Object} Structured report
     */
    generateCausalReport(interventionRecord) {
        const series = interventionRecord.consequenceSeries || [];
        const n = series.length;
        if (n === 0) {
            return {
                id: interventionRecord.id,
                type: interventionRecord.type,
                effectSize: 0.0,
                narrative: 'No consequences recorded.'
            };
        }

        let totalMagnitude = 0.0;
        for (const item of series) {
            const snap = item.snapshot || {};
            if (snap.meanFearDelta) totalMagnitude += snap.meanFearDelta;
            if (snap.cohesionLoss) totalMagnitude += snap.cohesionLoss;
            if (snap.desperationFearDelta) totalMagnitude += snap.desperationFearDelta;
            if (snap.trafficDiverted) totalMagnitude += 0.8;
            if (snap.peaceEnforced) totalMagnitude += 0.9;
        }

        const effectSize = clamp01(totalMagnitude / n);

        return {
            id: interventionRecord.id,
            type: interventionRecord.type,
            target: interventionRecord.target,
            ticksObserved: n,
            effectSize,
            immediateImpact: series[0]?.snapshot,
            terminalImpact: series[n - 1]?.snapshot,
            narrative: `Intervention ${interventionRecord.type} exerted persistent causal influence (effect size ${effectSize.toFixed(3)}) across ${n} ticks.`
        };
    }

    /**
     * State export for determinism and replay.
     */
    getState() {
        return {
            currentTick: this.currentTick,
            activeInterventions: JSON.parse(JSON.stringify(this.activeInterventions)),
            historyLog: [...this.historyLog]
        };
    }

    /**
     * State restore for determinism and replay.
     */
    setState(state) {
        if (!state) return;
        this.currentTick = state.currentTick || 0;
        this.activeInterventions = JSON.parse(JSON.stringify(state.activeInterventions || []));
        this.historyLog = [...(state.historyLog || [])];
    }
}
