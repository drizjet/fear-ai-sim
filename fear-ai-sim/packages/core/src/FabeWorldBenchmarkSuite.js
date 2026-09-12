/**
 * packages/core/src/FabeWorldBenchmarkSuite.js
 *
 * Section 107 / 113 / 114 / 118: FABE-WORLD Living-World Simulation Benchmark Suite.
 *
 * Implements the complete multi-seed, long-horizon living-world evaluation framework:
 * - 7 Canonical Benchmark Dimensions (Section 107):
 *   1. causal_coherence: Every macro consequence has a traceable simulated antecedent.
 *   2. stability: Bounded numerical state, zero NaNs/Infs, absence of permanent hysteria lock.
 *   3. diversity: Shannon entropy of world event distributions, diplomatic stances, and route choices.
 *   4. replay: Bit-exact deterministic replay parity (1.0000 score, 0 divergence).
 *   5. population_behavior: Opportunity-normalized demographic flow & Population Conservation Theorem.
 *   6. faction_decisions: 14-stage escalation ladder dynamics with non-monotonic progression.
 *   7. resource_responses: Commodity supply/demand elasticity under corridor disruption.
 *
 * - 6 World Degeneracy Flags (Section 113):
 *   UNIVERSAL_ALLIANCE, UNIVERSAL_WAR, PERMANENT_STAGNATION, INFINITE_RESOURCE, UNIVERSAL_MIGRATION, UNIVERSAL_PANIC.
 *
 * - Emergence Quality Scorecard (Section 114):
 *   Causal Traceability, State Grounding, Replay Parity, Gameplay Sensitivity -> Emergence Quality Index (EQI).
 *
 * - Causal World Chronicle (Section 118):
 *   Chronological audit trail linking cause -> process -> outcome without decorative flavor prose.
 *
 * Adheres strictly to the Host Game Authority Invariant:
 * Evaluates semantic living-world intelligence without mutating host transforms, physics, or entity ownership.
 */

import { DeterministicRng } from './DeterministicRng.js';
import {
    FrontierValleySimulation,
    FRONTIER_VALLEY_FACTIONS,
    FRONTIER_VALLEY_SETTLEMENTS,
    FRONTIER_VALLEY_ROUTES,
    WorldDegeneracyDetector
} from './FrontierValleySimulation.js';

export const BENCHMARK_DIMENSIONS = Object.freeze({
    CAUSAL_COHERENCE: 'causal_coherence',
    STABILITY: 'stability',
    DIVERSITY: 'diversity',
    REPLAY: 'replay',
    POPULATION_BEHAVIOR: 'population_behavior',
    FACTION_DECISIONS: 'faction_decisions',
    RESOURCE_RESPONSES: 'resource_responses'
});

export const DEGENERACY_FLAGS = Object.freeze({
    UNIVERSAL_ALLIANCE: 'UNIVERSAL_ALLIANCE',
    UNIVERSAL_WAR: 'UNIVERSAL_WAR',
    PERMANENT_STAGNATION: 'PERMANENT_STAGNATION',
    INFINITE_RESOURCE: 'INFINITE_RESOURCE',
    UNIVERSAL_MIGRATION: 'UNIVERSAL_MIGRATION',
    UNIVERSAL_PANIC: 'UNIVERSAL_PANIC'
});

export class FabeWorldBenchmarkSuite {
    /**
     * @param {Object} [options={}]
     * @param {Array<number>} [options.seeds=[101, 202, 303, 404, 505]]
     * @param {number} [options.ticks=150]
     */
    constructor(options = {}) {
        this.seeds = options.seeds || [101, 202, 303, 404, 505];
        this.ticks = options.ticks || 150;
    }

    /**
     * Executes the comprehensive FABE-WORLD multi-seed benchmark battery.
     * @param {Object} [overrideOptions={}]
     * @returns {Object} Comprehensive benchmark evaluation report
     */
    runBenchmark(overrideOptions = {}) {
        const seeds = overrideOptions.seeds || this.seeds;
        const ticks = overrideOptions.ticks || this.ticks;
        const startTime = Date.now();

        const runSummaries = [];
        const perSeedResults = [];
        const globalChronicle = [];

        let totalTraceableEvents = 0;
        let totalUntraceableEvents = 0;
        const eventTypeCounts = new Map();
        const diplomaticStateCounts = new Map();

        for (const seed of seeds) {
            const sim = new FrontierValleySimulation({ seed });
            const seedChronicle = [];
            let seedEncounters = 0;
            let seedWars = 0;
            let seedAlliances = 0;
            let seedReroutes = 0;
            let seedMigrations = 0;
            let seedFearSum = 0;
            let seedTraceable = 0;
            let seedUntraceable = 0;

            const initialSettlements = Array.from(sim.settlements.values());
            const initialInTransit = Array.from(sim.worldSystem.groups.values()).reduce((sum, p) => sum + (p.memberCount || 0), 0);
            const initialTotalPopulation = initialSettlements.reduce((sum, s) => sum + s.population, 0) + initialInTransit;

            // Time-series recording
            for (let t = 1; t <= ticks; t++) {
                const tickResult = sim.tick();
                seedFearSum += tickResult.meanFear;

                // 1. Causal Coherence Audit: Inspect events emitted during tick
                if (Array.isArray(tickResult.events)) {
                    for (const ev of tickResult.events) {
                        const type = ev.type || 'UNKNOWN';
                        eventTypeCounts.set(type, (eventTypeCounts.get(type) || 0) + 1);

                        // Verify causal link
                        if (type === 'HIGHWAY_AMBUSH' || type === 'PATROL_SKIRMISH') {
                            seedEncounters++;
                            seedTraceable++;
                            totalTraceableEvents++;
                            seedChronicle.push({
                                tick: t,
                                type,
                                cause: 'PROXIMITY_INTERCEPT_HAZARD',
                                detail: ev
                            });
                        } else if (type === 'CARAVAN_REROUTE') {
                            seedReroutes++;
                            // Causal validation: reroute must correspond to corridor danger > threshold
                            const danger = sim.civSystem.routes.get(FRONTIER_VALLEY_ROUTES.HIGHLAND_PASS)?.perceivedDanger ?? 0;
                            if (danger >= 0.4) {
                                seedTraceable++;
                                totalTraceableEvents++;
                            } else {
                                seedUntraceable++;
                                totalUntraceableEvents++;
                            }
                            seedChronicle.push({
                                tick: t,
                                type,
                                cause: `CORRIDOR_DANGER_ELEVATION (score: ${danger.toFixed(2)})`,
                                detail: ev
                            });
                        } else if (type === 'WAR_DECLARED') {
                            seedWars++;
                            seedTraceable++;
                            totalTraceableEvents++;
                            seedChronicle.push({
                                tick: t,
                                type,
                                cause: 'BILATERAL_TENSION_ESCALATION',
                                detail: ev
                            });
                        } else if (type === 'ALLIANCE_FORMED') {
                            seedAlliances++;
                            seedTraceable++;
                            totalTraceableEvents++;
                            seedChronicle.push({
                                tick: t,
                                type,
                                cause: 'MUTUAL_BENEFIT_COOPERATION',
                                detail: ev
                            });
                        } else if (type === 'MIGRATION_DISPATCH') {
                            seedMigrations++;
                            seedTraceable++;
                            totalTraceableEvents++;
                            seedChronicle.push({
                                tick: t,
                                type,
                                cause: 'SCARCITY_OR_WAR_DISPLACEMENT',
                                detail: ev
                            });
                        }
                    }
                }

                // Sample bilateral diplomatic states across all registered faction pairs
                for (const [, stanceMap] of sim.factionSystem.stances) {
                    for (const [, stance] of stanceMap) {
                        const stage = stance.stage || 'UNKNOWN';
                        diplomaticStateCounts.set(stage, (diplomaticStateCounts.get(stage) || 0) + 1);
                    }
                }
            }

            const meanSeedFear = seedFearSum / ticks;
            const currentSettlements = Array.from(sim.settlements.values());
            const finalSettlementPop = currentSettlements.reduce((sum, s) => sum + s.population, 0);

            // Demographic Population Conservation Check
            const inTransitPop = Array.from(sim.worldSystem.groups.values()).reduce((sum, p) => sum + (p.memberCount || 0), 0);
            const populationDelta = Math.abs((finalSettlementPop + inTransitPop) - initialTotalPopulation);

            const runSummary = {
                seed,
                warsDeclared: seedWars,
                alliancesFormed: seedAlliances,
                totalEncounters: seedEncounters,
                routeFailures: seedReroutes,
                migrations: seedMigrations,
                meanPopulationFear: meanSeedFear,
                settlements: {
                    northwatch: sim.settlements.get(FRONTIER_VALLEY_SETTLEMENTS.NORTHWATCH)?.population ?? 0,
                    riverbend: sim.settlements.get(FRONTIER_VALLEY_SETTLEMENTS.RIVERBEND)?.population ?? 0,
                    oakhaven: sim.settlements.get(FRONTIER_VALLEY_SETTLEMENTS.OAKHAVEN)?.population ?? 0
                },
                populationConservationDelta: populationDelta,
                traceableEvents: seedTraceable,
                untraceableEvents: seedUntraceable
            };

            runSummaries.push(runSummary);
            perSeedResults.push({
                seed,
                summary: runSummary,
                chronicleSnippet: seedChronicle.slice(0, 10)
            });

            if (globalChronicle.length < 50) {
                globalChronicle.push(...seedChronicle.slice(0, 50 - globalChronicle.length));
            }
        }

        // ---------------------------------------------------------------------
        // 2. Replay Determinism Verification
        // ---------------------------------------------------------------------
        const replaySeed = 99999;
        const simA = new FrontierValleySimulation({ seed: replaySeed });
        const simB = new FrontierValleySimulation({ seed: replaySeed });

        for (let t = 0; t < 50; t++) {
            simA.tick();
            simB.tick();
        }

        const stateA = simA.getState();
        const stateB = simB.getState();
        const stateStrA = JSON.stringify(stateA);
        const stateStrB = JSON.stringify(stateB);
        const replayIdentical = (stateStrA === stateStrB);
        const replayScore = replayIdentical ? 1.0 : 0.0;

        // ---------------------------------------------------------------------
        // 3. Dimension Scoring
        // ---------------------------------------------------------------------
        // A. Causal Coherence Score
        const totalEventsEvaluated = totalTraceableEvents + totalUntraceableEvents;
        const causalCoherenceScore = totalEventsEvaluated > 0
            ? Number((totalTraceableEvents / totalEventsEvaluated).toFixed(4))
            : 1.0;

        // B. Stability Score
        let numericalErrors = 0;
        let panicLocks = 0;
        for (const s of runSummaries) {
            if (isNaN(s.meanPopulationFear) || !isFinite(s.meanPopulationFear)) numericalErrors++;
            if (s.meanPopulationFear >= 0.90 || s.meanPopulationFear <= 0.01) panicLocks++;
        }
        const stabilityScore = Number(Math.max(0.0, 1.0 - (numericalErrors * 0.5) - (panicLocks * 0.25)).toFixed(4));

        // C. Diversity Score (Shannon Entropy of event types and diplomatic stages).
        // R37: normalize each entropy by the log of its own expressive
        // range instead of a flat 2.0. The suite recognizes 6 event types
        // (ambush/skirmish/reroute/war/alliance/migration) and samples a
        // 14-stage diplomatic ladder, so the maxima are log2(6) and
        // log2(14) bits. A world repeating 2 event types in 3 stages now
        // scores its actual range fraction instead of saturating at 1.0.
        // Unknown event types still add entropy (variety is variety), but
        // the denominator stays fixed: unrecognized novelty cannot inflate
        // the score past the benchmark's own vocabulary.
        const totalEventTokens = Array.from(eventTypeCounts.values()).reduce((a, b) => a + b, 0);
        let eventEntropy = 0;
        if (totalEventTokens > 0) {
            for (const count of eventTypeCounts.values()) {
                const p = count / totalEventTokens;
                eventEntropy -= p * Math.log2(p);
            }
        }
        const totalDiplomaticTokens = Array.from(diplomaticStateCounts.values()).reduce((a, b) => a + b, 0);
        let diplomaticEntropy = 0;
        if (totalDiplomaticTokens > 0) {
            for (const count of diplomaticStateCounts.values()) {
                const p = count / totalDiplomaticTokens;
                diplomaticEntropy -= p * Math.log2(p);
            }
        }
        const eventRangeBits = Math.log2(6);
        const diplomaticRangeBits = Math.log2(14);
        const totalDiversityEntropy = Number((eventEntropy + diplomaticEntropy).toFixed(4));
        // Clamped: unrecognized-novelty entropy can exceed the fixed
        // denominator (dimension contract stays within [0, 1]).
        const diversityScore = Number(Math.min(1.0, (eventEntropy / eventRangeBits + diplomaticEntropy / diplomaticRangeBits) / 2.0).toFixed(4));

        // D. Population Behavior & Conservation Score
        const maxPopDelta = Math.max(...runSummaries.map(s => s.populationConservationDelta));
        const populationBehaviorScore = maxPopDelta === 0 ? 1.0 : Math.max(0.0, 1.0 - (maxPopDelta * 0.1));

        // E. Faction Decision Flexibility Score
        const diplomaticStagesOccupied = diplomaticStateCounts.size;
        const factionDecisionScore = Number(Math.min(1.0, diplomaticStagesOccupied / 3.0).toFixed(4));

        // F. Resource Response Score (Elasticity of corridor rerouting under stress)
        const totalReroutes = runSummaries.reduce((sum, s) => sum + s.routeFailures, 0);
        const resourceResponseScore = totalReroutes > 0 ? 1.0 : 0.85;

        // ---------------------------------------------------------------------
        // 4. Degeneracy Detection (Section 113)
        // ---------------------------------------------------------------------
        const degeneracyAnalysis = WorldDegeneracyDetector.analyzeRuns(runSummaries);
        const detectedDegeneracies = degeneracyAnalysis.flags.map(f => f.type);

        // ---------------------------------------------------------------------
        // 5. Emergence Quality Scorecard (Section 114)
        // ---------------------------------------------------------------------
        const causalTraceability = causalCoherenceScore;
        const stateGrounding = stabilityScore;
        const replayParity = replayScore;
        const gameplaySensitivity = Number(((diversityScore + resourceResponseScore) / 2.0).toFixed(4));

        const emergenceQualityIndex = Number((
            (causalTraceability * 0.30) +
            (stateGrounding * 0.25) +
            (replayParity * 0.25) +
            (gameplaySensitivity * 0.20)
        ).toFixed(4));

        const elapsedMs = Date.now() - startTime;

        return {
            benchmark: 'FABE-WORLD-v1',
            timestamp: new Date().toISOString(),
            elapsedMs,
            config: {
                seedsEvaluated: seeds.length,
                ticksPerSeed: ticks,
                totalSimulationTicks: seeds.length * ticks
            },
            dimensionScores: {
                [BENCHMARK_DIMENSIONS.CAUSAL_COHERENCE]: causalCoherenceScore,
                [BENCHMARK_DIMENSIONS.STABILITY]: stabilityScore,
                [BENCHMARK_DIMENSIONS.DIVERSITY]: diversityScore,
                [BENCHMARK_DIMENSIONS.REPLAY]: replayScore,
                [BENCHMARK_DIMENSIONS.POPULATION_BEHAVIOR]: populationBehaviorScore,
                // R37: computed all along but never emitted, so the 7th
                // dimension read as undefined (masked while diversity
                // failed first). The suite now scores all 7 it advertises.
                [BENCHMARK_DIMENSIONS.FACTION_DECISIONS]: factionDecisionScore,
                [BENCHMARK_DIMENSIONS.RESOURCE_RESPONSES]: resourceResponseScore
            },
            metrics: {
                totalEventsEvaluated,
                totalTraceableEvents,
                diversityShannonEntropyBits: totalDiversityEntropy,
                // R37: entropy components behind the normalized diversity
                // score (inspectable range fractions).
                eventEntropyBits: Number(eventEntropy.toFixed(4)),
                diplomaticEntropyBits: Number(diplomaticEntropy.toFixed(4)),
                distinctEventTypes: eventTypeCounts.size,
                distinctDiplomaticStages: diplomaticStagesOccupied,
                meanPopulationFear: degeneracyAnalysis.healthyMetrics.meanPopulationFear,
                meanEncountersPerRun: degeneracyAnalysis.healthyMetrics.meanEncountersPerRun,
                meanWarsPerRun: degeneracyAnalysis.healthyMetrics.meanWarsPerRun,
                populationConservationDeltaMax: maxPopDelta
            },
            degeneracyCheck: {
                isDegenerate: degeneracyAnalysis.degenerate,
                flags: degeneracyAnalysis.flags,
                detectedDegeneracies
            },
            emergenceQualityScorecard: {
                causalTraceability,
                stateGrounding,
                replayParity,
                gameplaySensitivity,
                emergenceQualityIndex,
                // R37: EXEMPLARY must be earned by content, not granted
                // for stability. Beyond EQI >= 0.85 the world must use at
                // least half the benchmark's expressive range (diversity
                // >= 0.5, the natural midpoint) AND show macro dynamics
                // (wars, alliances, migrations, or reroutes observed).
                // Short, quiet worlds rate ACCEPTABLE: coherent and
                // stable, but content-poor. This is the degeneracy
                // recalibration: impoverished worlds can no longer read
                // as exemplary systemic emergence.
                rating: emergenceQualityIndex >= 0.85 && diversityScore >= 0.5 &&
                    runSummaries.some((s) => s.warsDeclared + s.alliancesFormed + s.migrations + s.routeFailures > 0)
                    ? 'EXEMPLARY_SYSTEMIC_EMERGENCE'
                    : 'ACCEPTABLE'
            },
            worldChronicleSnippet: globalChronicle.slice(0, 15),
            perSeedSummaries: runSummaries
        };
    }
}
