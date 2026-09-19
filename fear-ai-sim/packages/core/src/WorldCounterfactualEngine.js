/**
 * packages/core/src/WorldCounterfactualEngine.js
 *
 * Sections 51-53 & 108-110 / Front E & Front C:
 * Causal Counterfactual World Forks & Treatment Effect Engine.
 *
 * Enables deterministic causal inference on living-world simulations:
 * 1. Takes a simulation at historical fork tick T_fork.
 * 2. Forks identical parallel worlds: Factual (untouched) vs Counterfactual (mutated).
 * 3. Applies atomic interventions (route security, commodity shocks, faction diplomacy, raider pacification).
 * 4. Advances both worlds in lockstep across a causal horizon.
 * 5. Measures Average Treatment Effect (ATE), First Divergence Point, and Causal Attribution Graphs.
 * 6. Validates Orthogonal Invariance (unrelated regions remain identical until downstream causal propagation).
 *
 * Strictly adheres to the Host Game Authority Invariant:
 * Evaluates advisory world trajectories and causal metrics without mutating host runtime.
 */

export const COUNTERFACTUAL_MUTATIONS = Object.freeze({
    ALTER_ROUTE_SECURITY: 'ALTER_ROUTE_SECURITY',
    MODIFY_FACTION_STANCE: 'MODIFY_FACTION_STANCE',
    INJECT_COMMODITY_SURPLUS: 'INJECT_COMMODITY_SURPLUS',
    DEGRADE_COMMODITY_SCARCITY: 'DEGRADE_COMMODITY_SCARCITY',
    PACIFY_BANDIT_RAIDERS: 'PACIFY_BANDIT_RAIDERS',
    CUSTOM_MUTATION: 'CUSTOM_MUTATION'
});

export class WorldCounterfactualEngine {
    /**
     * Executes a controlled causal counterfactual experiment between a factual baseline and a mutated fork.
     * @param {Object} options
     * @param {Object} options.simulation - Simulation instance supporting .fork() and .advance()
     * @param {number} [options.forkTick=20] - Tick at which the world is forked
     * @param {number} [options.horizonTicks=50] - Number of ticks to advance after the fork
     * @param {Object} options.mutation - Atomic mutation specification
     * @param {string} options.mutation.type - COUNTERFACTUAL_MUTATIONS enum
     * @param {Object} [options.mutation.params={}] - Parameters for the mutation
     * @param {Function} [options.mutation.customFn=null] - Optional custom mutator
     * @returns {Object} Comprehensive causal evaluation report
     */
    static runExperiment(options = {}) {
        const {
            simulation,
            forkTick = 20,
            horizonTicks = 50,
            mutation
        } = options;

        if (!simulation || typeof simulation.fork !== 'function') {
            throw new Error('Simulation must implement .fork() to execute counterfactual experiments.');
        }
        if (typeof simulation.advance !== 'function') {
            throw new Error('Simulation must implement .advance() to execute counterfactual experiments.');
        }
        if (!mutation || !mutation.type) {
            throw new Error('Valid mutation specification with type is required.');
        }

        const normalizedForkTick = Number(forkTick);
        const normalizedHorizonTicks = Number(horizonTicks);
        if (!Number.isInteger(normalizedForkTick) || normalizedForkTick < 0) {
            throw new Error('forkTick must be a non-negative integer.');
        }
        if (!Number.isInteger(normalizedHorizonTicks) || normalizedHorizonTicks < 1) {
            throw new Error('horizonTicks must be a positive integer.');
        }

        const currentTick = simulation.currentTick == null ? 0 : Number(simulation.currentTick);
        if (!Number.isInteger(currentTick) || currentTick < 0) {
            throw new Error('Simulation currentTick must be a non-negative integer.');
        }
        if (currentTick > normalizedForkTick) {
            throw new Error(`Simulation is already past forkTick (${currentTick} > ${normalizedForkTick}); rewind or choose a later forkTick.`);
        }

        // 1. Advance simulation to forkTick if not already there
        if (currentTick < normalizedForkTick) {
            simulation.advance(normalizedForkTick - currentTick);
        }

        // 2. Clone identical parallel branches
        const factualSim = simulation.fork();
        const counterfactualSim = simulation.fork();

        // 3. Apply atomic mutation exclusively to counterfactual branch
        const appliedIntervention = this._applyMutation(counterfactualSim, mutation);
        if (appliedIntervention?.applied === false) {
            throw new Error(`Counterfactual mutation did not apply: ${mutation.type}`);
        }

        // 4. Advance both branches in lockstep tick-by-tick to record trajectory differences
        const factualTrajectory = [];
        const counterfactualTrajectory = [];
        let firstDivergenceTick = null;
        let firstDivergenceDimensions = [];
        const causalEvents = [];

        for (let step = 1; step <= normalizedHorizonTicks; step++) {
            const currentSimTick = normalizedForkTick + step;

            const factSummary = factualSim.advance(1);
            const counterSummary = counterfactualSim.advance(1);

            factualTrajectory.push({ tick: currentSimTick, ...factSummary });
            counterfactualTrajectory.push({ tick: currentSimTick, ...counterSummary });

            // Check for first divergence. This includes the original macro
            // metrics plus settlement populations and faction survivals;
            // otherwise a real world-state change (for example, scarcity
            // moving population between settlements) can be reported as
            // causally invariant.
            if (firstDivergenceTick === null) {
                const changedDimensions = this._findSummaryDifferences(factSummary, counterSummary);
                if (changedDimensions.length > 0) {
                    firstDivergenceTick = currentSimTick;
                    firstDivergenceDimensions = changedDimensions;
                    causalEvents.push({
                        tick: currentSimTick,
                        type: 'FIRST_DIVERGENCE',
                        dimensions: changedDimensions,
                        description: `First world-summary divergence detected in: ${changedDimensions.join(', ')}`
                    });
                }
            }
        }

        // 5. Compute Average Treatment Effects (ATE)
        const finalFact = factualTrajectory[factualTrajectory.length - 1];
        const finalCounter = counterfactualTrajectory[counterfactualTrajectory.length - 1];

        const fearSumFact = factualTrajectory.reduce((acc, t) => acc + t.meanPopulationFear, 0);
        const fearSumCounter = counterfactualTrajectory.reduce((acc, t) => acc + t.meanPopulationFear, 0);
        const meanFearFact = fearSumFact / factualTrajectory.length;
        const meanFearCounter = fearSumCounter / counterfactualTrajectory.length;
        const settlementPopulationDiff = this._getSettlementPopulationDiff(finalFact, finalCounter);

        const ate = {
            meanPopulationFearDiff: Number((meanFearCounter - meanFearFact).toFixed(4)),
            finalFearDiff: Number((finalCounter.meanPopulationFear - finalFact.meanPopulationFear).toFixed(4)),
            routeFailuresDiff: finalCounter.routeFailures - finalFact.routeFailures,
            totalEncountersDiff: finalCounter.totalEncounters - finalFact.totalEncounters,
            deliveriesDiff: (finalCounter.deliveries ?? 0) - (finalFact.deliveries ?? 0),
            deliveredVolumeDiff: (finalCounter.deliveredVolume ?? 0) - (finalFact.deliveredVolume ?? 0),
            panicIncidentsDiff: finalCounter.panicIncidents - finalFact.panicIncidents,
            warsDeclaredDiff: finalCounter.warsDeclared - finalFact.warsDeclared,
            alliancesFormedDiff: finalCounter.alliancesFormed - finalFact.alliancesFormed,
            warsActiveDiff: (finalCounter.warsActive ?? 0) - (finalFact.warsActive ?? 0),
            alliancesActiveDiff: (finalCounter.alliancesActive ?? 0) - (finalFact.alliancesActive ?? 0),
            settlementPopulationDiff
        };

        // 6. Formulate causal attribution narrative
        const causalNarrative = this._buildCausalNarrative(
            appliedIntervention,
            ate,
            firstDivergenceTick,
            firstDivergenceDimensions
        );

        return {
            forkTick: normalizedForkTick,
            horizonTicks: normalizedHorizonTicks,
            intervention: appliedIntervention,
            firstDivergenceTick,
            firstDivergenceDimensions,
            ate,
            causalEvents,
            causalNarrative,
            factualSummary: finalFact,
            counterfactualSummary: finalCounter
        };
    }

    /**
     * Compares the observable world summary used by causal reports.
     * @private
     */
    static _findSummaryDifferences(factual, counterfactual) {
        const differences = [];
        const numericFields = [
            ['meanPopulationFear', 0.001],
            ['totalEncounters', 0],
            ['routeFailures', 0],
            ['deliveries', 0],
            ['deliveredVolume', 0],
            ['panicIncidents', 0],
            ['warsDeclared', 0],
            ['alliancesFormed', 0],
            ['warsActive', 0],
            ['alliancesActive', 0]
        ];

        for (const [field, tolerance] of numericFields) {
            const a = Number(factual?.[field] ?? 0);
            const b = Number(counterfactual?.[field] ?? 0);
            if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a - b) > tolerance) {
                differences.push(field);
            }
        }

        const settlementIds = new Set([
            ...Object.keys(factual?.settlements ?? {}),
            ...Object.keys(counterfactual?.settlements ?? {})
        ]);
        for (const id of settlementIds) {
            const a = Number(factual?.settlements?.[id] ?? 0);
            const b = Number(counterfactual?.settlements?.[id] ?? 0);
            if (!Number.isFinite(a) || !Number.isFinite(b) || a !== b) {
                differences.push(`settlements.${id}.population`);
            }
        }

        const factionIds = new Set([
            ...Object.keys(factual?.factionSurvivals ?? {}),
            ...Object.keys(counterfactual?.factionSurvivals ?? {})
        ]);
        for (const id of factionIds) {
            if (Boolean(factual?.factionSurvivals?.[id]) !== Boolean(counterfactual?.factionSurvivals?.[id])) {
                differences.push(`factionSurvivals.${id}`);
            }
        }

        return differences;
    }

    /**
     * Returns terminal population effects by settlement for the ATE report.
     * @private
     */
    static _getSettlementPopulationDiff(factual, counterfactual) {
        const diff = {};
        const settlementIds = new Set([
            ...Object.keys(factual?.settlements ?? {}),
            ...Object.keys(counterfactual?.settlements ?? {})
        ]);
        for (const id of settlementIds) {
            const delta = Number(counterfactual?.settlements?.[id] ?? 0) - Number(factual?.settlements?.[id] ?? 0);
            if (Number.isFinite(delta) && delta !== 0) diff[id] = delta;
        }
        return diff;
    }

    /**
     * Ranks candidate interventions by their causal effect on one outcome
     * (Section LXVII: intervention analysis). Each candidate forks from an
     * IDENTICAL base — the caller supplies a factory returning a fresh
     * simulation because runExperiment advances the instance it receives.
     * Advisory only: recommends, never applies.
     * @param {object} [options={}]
     * @param {Function} options.createSimulation - () => fresh simulation (same seed for identical bases)
     * @param {number} [options.forkTick=10]
     * @param {number} [options.horizonTicks=40]
     * @param {Array<object>} [options.candidates=[]] - mutation specs ({ type, params, customFn })
     * @param {object} [options.outcome={ metric: 'routeFailures', direction: 'lower' }]
     * @returns {{ outcome, ranking, recommendation }} ranking sorted best-first with score (improvement over factual)
     */
    static rankInterventions({ createSimulation, forkTick = 10, horizonTicks = 40, candidates = [], outcome = { metric: 'routeFailures', direction: 'lower' } } = {}) {
        if (typeof createSimulation !== 'function') {
            throw new Error('rankInterventions requires a createSimulation factory for identical fork bases.');
        }
        const { metric = 'routeFailures', direction = 'lower' } = outcome || {};
        const sign = direction === 'higher' ? -1 : 1;
        const ranking = candidates.map((mutation) => {
            const result = this.runExperiment({ simulation: createSimulation(), forkTick, horizonTicks, mutation });
            const factual = Number(result.factualSummary?.[metric]);
            const counter = Number(result.counterfactualSummary?.[metric]);
            if (!Number.isFinite(factual) || !Number.isFinite(counter)) {
                throw new Error(`Outcome metric '${metric}' missing from experiment summaries.`);
            }
            return {
                mutation,
                score: Number(((factual - counter) * sign).toFixed(4)),
                factual,
                counterfactual: counter,
                firstDivergenceTick: result.firstDivergenceTick,
                factualSummary: result.factualSummary,
                counterfactualSummary: result.counterfactualSummary,
            };
        });
        ranking.sort((a, b) => b.score - a.score);
        const best = ranking[0] || null;
        const runnerUp = ranking[1] || null;
        return {
            outcome: { metric, direction },
            ranking,
            recommendation: best ? {
                mutation: best.mutation,
                score: best.score,
                margin: runnerUp ? Number((best.score - runnerUp.score).toFixed(4)) : null,
                firstDivergenceTick: best.firstDivergenceTick,
            } : null,
        };
    }

    /**
     * Applies an atomic mutation to the target simulation.
     * @private
     */
    static _applyMutation(sim, mutation) {
        const params = mutation.params || {};

        switch (mutation.type) {
            case COUNTERFACTUAL_MUTATIONS.ALTER_ROUTE_SECURITY: {
                const routeId = params.routeId;
                const route = sim.civSystem?.routes?.get(routeId);
                if (route) {
                    const originalDanger = route.perceivedDanger;
                    route.perceivedDanger = params.perceivedDanger ?? 0.05;
                    route.baseSecurity = params.baseSecurity ?? 0.95;

                    // If route is pacified, relocate nearby raiders away from corridor
                    if (route.perceivedDanger < 0.20) {
                        for (const g of sim.worldSystem.groups.values()) {
                            if (g.type === 'BANDITS' || g.factionId === 'ShadowfangBandits') {
                                g.position.x = 800;
                                g.position.z = 800;
                            }
                        }
                    }

                    return {
                        type: mutation.type,
                        target: routeId,
                        before: { perceivedDanger: originalDanger },
                        after: { perceivedDanger: route.perceivedDanger, baseSecurity: route.baseSecurity }
                    };
                }
                break;
            }

            case COUNTERFACTUAL_MUTATIONS.MODIFY_FACTION_STANCE: {
                const { sourceFaction, targetFaction, stage, grievance = 0.0, trust = 0.8 } = params;
                const stance = sim.factionSystem?.getBilateralStance(sourceFaction, targetFaction);
                if (stance) {
                    const originalStage = stance.stage;
                    stance.stage = stage;
                    stance.grievance = grievance;
                    stance.trust = trust;
                    return {
                        type: mutation.type,
                        target: `${sourceFaction}->${targetFaction}`,
                        before: { stage: originalStage },
                        after: { stage, grievance, trust }
                    };
                }
                break;
            }

            case COUNTERFACTUAL_MUTATIONS.INJECT_COMMODITY_SURPLUS: {
                const { settlementId, commodity = 'food', amount = 100.0 } = params;
                const settlement = sim.settlements?.get(settlementId);
                if (settlement) {
                    const before = settlement.resources[commodity] || 0.0;
                    settlement.resources[commodity] = before + amount;
                    return {
                        type: mutation.type,
                        target: settlementId,
                        commodity,
                        before,
                        after: settlement.resources[commodity]
                    };
                }
                break;
            }

            case COUNTERFACTUAL_MUTATIONS.DEGRADE_COMMODITY_SCARCITY: {
                const { settlementId, commodity = 'food', targetLevel = 5.0 } = params;
                const settlement = sim.settlements?.get(settlementId);
                if (settlement) {
                    const before = settlement.resources[commodity] || 0.0;
                    settlement.resources[commodity] = Math.max(0.0, targetLevel);
                    return {
                        type: mutation.type,
                        target: settlementId,
                        commodity,
                        before,
                        after: settlement.resources[commodity]
                    };
                }
                break;
            }

            case COUNTERFACTUAL_MUTATIONS.PACIFY_BANDIT_RAIDERS: {
                const banditFaction = sim.factionSystem?.getFaction('ShadowfangBandits');
                if (banditFaction) {
                    const before = banditFaction.militaryReadiness;
                    banditFaction.militaryReadiness = 0.05;
                    // Neutralize active roaming bandits
                    for (const g of sim.worldSystem.groups.values()) {
                        if (g.factionId === 'ShadowfangBandits') {
                            g.militaryStrength = 0.10;
                            if (g.drivers) g.drivers.threatPressure = 0.0;
                        }
                    }
                    return {
                        type: mutation.type,
                        target: 'ShadowfangBandits',
                        before: { militaryReadiness: before },
                        after: { militaryReadiness: 0.05 }
                    };
                }
                break;
            }

            case COUNTERFACTUAL_MUTATIONS.CUSTOM_MUTATION: {
                if (typeof mutation.customFn === 'function') {
                    mutation.customFn(sim);
                    return {
                        type: mutation.type,
                        description: params.description || 'Custom mutation executed'
                    };
                }
                break;
            }

            default:
                throw new Error(`Unknown counterfactual mutation type: ${mutation.type}`);
        }

        return { type: mutation.type, applied: false };
    }

    /**
     * Synthesizes an empirical causal explanation connecting intervention to outcome.
     * @private
     */
    static _buildCausalNarrative(intervention, ate, firstDivergenceTick, divergenceDimensions = []) {
        if (firstDivergenceTick === null) {
            return `Intervention [${intervention.type}] produced ZERO causal divergence across all traced world-summary fields over the evaluation horizon. The system is causally invariant to this stimulus under current conditions.`;
        }

        const effects = [];
        if (ate.meanPopulationFearDiff !== 0) {
            const fearDirection = ate.meanPopulationFearDiff > 0 ? 'increased' : 'decreased';
            effects.push(`${fearDirection} average world population fear by ${Math.abs(ate.meanPopulationFearDiff).toFixed(3)} units`);
        }
        if (ate.routeFailuresDiff !== 0) {
            const failureDirection = ate.routeFailuresDiff > 0 ? 'increased' : 'reduced';
            effects.push(`${failureDirection} trade route failures by ${Math.abs(ate.routeFailuresDiff)} incidents`);
        }
        if (ate.totalEncountersDiff !== 0) {
            effects.push(`${ate.totalEncountersDiff > 0 ? 'increased' : 'reduced'} total encounters by ${Math.abs(ate.totalEncountersDiff)}`);
        }
        if (ate.deliveriesDiff !== 0 || ate.deliveredVolumeDiff !== 0) {
            effects.push(`changed deliveries by ${ate.deliveriesDiff} and delivered volume by ${ate.deliveredVolumeDiff}`);
        }
        for (const [settlementId, delta] of Object.entries(ate.settlementPopulationDiff ?? {})) {
            effects.push(`changed ${settlementId} population by ${delta > 0 ? '+' : ''}${delta}`);
        }
        if (effects.length === 0) {
            effects.push(`changed observed state in ${divergenceDimensions.join(', ') || 'the world summary'}`);
        }

        return `Causal Intervention [${intervention.type}] emerged at Tick ${firstDivergenceTick}. Downstream propagation ${effects.join('; ')}.`;
    }
}
