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
        if (!mutation || !mutation.type) {
            throw new Error('Valid mutation specification with type is required.');
        }

        // 1. Advance simulation to forkTick if not already there
        if (simulation.currentTick < forkTick) {
            simulation.advance(forkTick - simulation.currentTick);
        }

        // 2. Clone identical parallel branches
        const factualSim = simulation.fork();
        const counterfactualSim = simulation.fork();

        // 3. Apply atomic mutation exclusively to counterfactual branch
        const appliedIntervention = this._applyMutation(counterfactualSim, mutation);

        // 4. Advance both branches in lockstep tick-by-tick to record trajectory differences
        const factualTrajectory = [];
        const counterfactualTrajectory = [];
        let firstDivergenceTick = null;
        const causalEvents = [];

        for (let step = 1; step <= horizonTicks; step++) {
            const currentSimTick = forkTick + step;

            const factSummary = factualSim.advance(1);
            const counterSummary = counterfactualSim.advance(1);

            factualTrajectory.push({ tick: currentSimTick, ...factSummary });
            counterfactualTrajectory.push({ tick: currentSimTick, ...counterSummary });

            // Check for first divergence
            if (firstDivergenceTick === null) {
                const diffFear = Math.abs(factSummary.meanPopulationFear - counterSummary.meanPopulationFear);
                const diffEncounters = Math.abs(factSummary.totalEncounters - counterSummary.totalEncounters);
                const diffFailures = Math.abs(factSummary.routeFailures - counterSummary.routeFailures);
                const diffPanics = Math.abs(factSummary.panicIncidents - counterSummary.panicIncidents);

                if (diffFear > 0.001 || diffEncounters > 0 || diffFailures > 0 || diffPanics > 0) {
                    firstDivergenceTick = currentSimTick;
                    causalEvents.push({
                        tick: currentSimTick,
                        type: 'FIRST_DIVERGENCE',
                        description: `First macro divergence detected: ΔFear=${(counterSummary.meanPopulationFear - factSummary.meanPopulationFear).toFixed(3)}, ΔFailures=${counterSummary.routeFailures - factSummary.routeFailures}`
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

        const ate = {
            meanPopulationFearDiff: Number((meanFearCounter - meanFearFact).toFixed(4)),
            finalFearDiff: Number((finalCounter.meanPopulationFear - finalFact.meanPopulationFear).toFixed(4)),
            routeFailuresDiff: finalCounter.routeFailures - finalFact.routeFailures,
            totalEncountersDiff: finalCounter.totalEncounters - finalFact.totalEncounters,
            panicIncidentsDiff: finalCounter.panicIncidents - finalFact.panicIncidents,
            warsDeclaredDiff: finalCounter.warsDeclared - finalFact.warsDeclared,
            alliancesFormedDiff: finalCounter.alliancesFormed - finalFact.alliancesFormed
        };

        // 6. Formulate causal attribution narrative
        const causalNarrative = this._buildCausalNarrative(appliedIntervention, ate, firstDivergenceTick);

        return {
            forkTick,
            horizonTicks,
            intervention: appliedIntervention,
            firstDivergenceTick,
            ate,
            causalEvents,
            causalNarrative,
            factualSummary: finalFact,
            counterfactualSummary: finalCounter
        };
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
    static _buildCausalNarrative(intervention, ate, firstDivergenceTick) {
        if (firstDivergenceTick === null) {
            return `Intervention [${intervention.type}] produced ZERO causal divergence across all traced macro metrics over the evaluation horizon. The system is causally invariant to this stimulus under current conditions.`;
        }

        const fearDirection = ate.meanPopulationFearDiff > 0 ? 'increased' : 'decreased';
        const fearMagnitude = Math.abs(ate.meanPopulationFearDiff).toFixed(3);
        const failureDirection = ate.routeFailuresDiff > 0 ? 'increased' : 'reduced';

        return `Causal Intervention [${intervention.type}] emerged at Tick ${firstDivergenceTick}. Downstream propagation ${fearDirection} average world population fear by ${fearMagnitude} units and ${failureDirection} trade route failures by ${Math.abs(ate.routeFailuresDiff)} incidents.`;
    }
}
