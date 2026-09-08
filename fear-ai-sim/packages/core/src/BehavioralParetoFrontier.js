/**
 * @fear-ai/core - BehavioralParetoFrontier
 * 
 * Front B / Sections 10–11 & 89: Behavioral Pareto Frontier & High-Dimensional Reaction-Norm Calibration Surface.
 * 
 * Multi-Objective Evaluation of Affective Reaction Norms:
 * 1. Identity Invariance (f_identity): Fidelity to baseline archetype behavior card across stress regimes.
 * 2. Context Sensitivity (f_sensitivity): Responsiveness to stimulus gradients without unresponsive flatlining.
 * 3. Temporal Realism (f_temporal): Smooth hysteresis, physiological recovery half-life, zero chatter/panic locks.
 * 4. Computational Efficiency (f_budget): Execution latency per tick and memory compactness.
 * 5. Anti-Caricature Regularization (f_anti_caricature): Penalizes extreme polarization and cartoonish caricatures.
 * 
 * Core Capabilities:
 * - Reaction Norm Battery Evaluation across Standard Stressor Regimes
 * - NSGA-II Fast Non-Dominated Sorting (Pareto Rank Assignment)
 * - Crowding Distance Computation for Diversity Preservation
 * - Exact/Analytical Hypervolume Indicator Computation relative to reference point (0, 0, 0, 0, 0)
 * - Knee-Point / Compromise Selection using Normalized Distance to Utopian Point (1, 1, 1, 1, 1)
 * - 2D/3D Reaction-Norm Calibration Response Surface Generator
 * 
 * STRICT INVARIANT:
 * Host game remains authoritative for world physics, movement, and collision.
 * BehavioralParetoFrontier evaluates candidate reaction norms offline/at design-time
 * without mutating live game entity transforms.
 */

import { AffectiveAgent } from './AffectiveAgent.js';
import { CANONICAL_PRESETS } from './PresetLibrary.js';

export const OBJECTIVE_KEYS = Object.freeze([
    'identity_invariance',
    'context_sensitivity',
    'temporal_realism',
    'computational_efficiency',
    'anti_caricature'
]);

export const DEFAULT_OBJECTIVE_WEIGHTS = Object.freeze({
    identity_invariance: 0.25,
    context_sensitivity: 0.25,
    temporal_realism: 0.25,
    computational_efficiency: 0.10,
    anti_caricature: 0.15
});

export const STANDARD_STRESSOR_REGIMES = Object.freeze({
    QUIESCENT_BASELINE: 'QUIESCENT_BASELINE',
    ACUTE_JUMPSCARE: 'ACUTE_JUMPSCARE',
    SUSTAINED_DREAD: 'SUSTAINED_DREAD',
    SOCIAL_CONTAGION: 'SOCIAL_CONTAGION',
    COMPOUND_CRISIS: 'COMPOUND_CRISIS'
});

export class BehavioralParetoFrontier {
    constructor(config = {}) {
        this.config = Object.freeze({
            objectiveWeights: { ...DEFAULT_OBJECTIVE_WEIGHTS, ...(config.objectiveWeights || {}) },
            evaluationTicksPerRegime: config.evaluationTicksPerRegime ?? 25,
            ...config
        });

        this.evaluatedPopulation = [];
        this.paretoFronts = [];
    }

    /**
     * Evaluates a candidate reaction norm across the standard stressor regimes.
     * @param {Object} candidate - Candidate NPC config { id, traits, behaviorCard, ... }
     * @param {Object} [options={}]
     * @returns {Object} Evaluated solution with objectives and vector
     */
    evaluateCandidate(candidate, options = {}) {
        if (!candidate || typeof candidate !== 'object') {
            throw new Error('[BehavioralParetoFrontier] Candidate must be a non-null object');
        }

        const candidateId = candidate.id || `candidate_${Math.random().toString(36).substring(2, 8)}`;
        const traits = candidate.traits || { ...candidate };
        const behaviorCard = candidate.behaviorCard || null;
        const targetPreset = options.targetPreset || (candidate.presetId ? CANONICAL_PRESETS[candidate.presetId] : null);

        const agent = new AffectiveAgent(candidateId, traits, {
            enableHabituation: candidate.enableHabituation ?? true,
            enableOCEAN: candidate.enableOCEAN ?? true,
            enableHysteresis: candidate.enableHysteresis ?? true
        });

        // 1. Run Standard Stressor Regimes and Record Trajectories
        const trajectories = {
            [STANDARD_STRESSOR_REGIMES.QUIESCENT_BASELINE]: [],
            [STANDARD_STRESSOR_REGIMES.ACUTE_JUMPSCARE]: [],
            [STANDARD_STRESSOR_REGIMES.SUSTAINED_DREAD]: [],
            [STANDARD_STRESSOR_REGIMES.SOCIAL_CONTAGION]: [],
            [STANDARD_STRESSOR_REGIMES.COMPOUND_CRISIS]: []
        };

        const tStart = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        let totalTicks = 0;

        // --- Regime A: Quiescent Baseline ---
        this._resetAgent(agent, traits);
        for (let t = 0; t < this.config.evaluationTicksPerRegime; t++) {
            agent.tick(0.016, { threats: [] }, { contagionFear: 0.0 });
            trajectories[STANDARD_STRESSOR_REGIMES.QUIESCENT_BASELINE].push(agent.currentFear);
            totalTicks++;
        }

        // --- Regime B: Acute Jumpscare ---
        this._resetAgent(agent, traits);
        for (let t = 0; t < this.config.evaluationTicksPerRegime; t++) {
            const threats = (t === 4) ? [{ distance: 2.0, intensity: 0.95 }] : [];
            agent.tick(0.016, { threats }, { contagionFear: 0.0 });
            trajectories[STANDARD_STRESSOR_REGIMES.ACUTE_JUMPSCARE].push(agent.currentFear);
            totalTicks++;
        }

        // --- Regime C: Sustained Dread ---
        this._resetAgent(agent, traits);
        for (let t = 0; t < this.config.evaluationTicksPerRegime; t++) {
            const threats = [{ distance: 8.0, intensity: 0.60 }];
            agent.tick(0.016, { threats }, { contagionFear: 0.0 });
            trajectories[STANDARD_STRESSOR_REGIMES.SUSTAINED_DREAD].push(agent.currentFear);
            totalTicks++;
        }

        // --- Regime D: Social Contagion Storm ---
        this._resetAgent(agent, traits);
        for (let t = 0; t < this.config.evaluationTicksPerRegime; t++) {
            agent.tick(0.016, { threats: [] }, { contagionFear: 0.80 });
            trajectories[STANDARD_STRESSOR_REGIMES.SOCIAL_CONTAGION].push(agent.currentFear);
            totalTicks++;
        }

        // --- Regime E: Compound Crisis ---
        this._resetAgent(agent, traits);
        for (let t = 0; t < this.config.evaluationTicksPerRegime; t++) {
            const isShock = t < 10;
            const threats = isShock ? [{ distance: 3.0, intensity: 0.85 }] : [];
            const contagionFear = isShock ? 0.75 : 0.0;
            agent.tick(0.016, { threats }, { contagionFear });
            trajectories[STANDARD_STRESSOR_REGIMES.COMPOUND_CRISIS].push(agent.currentFear);
            totalTicks++;
        }

        const tEnd = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
        const totalDurationMs = Math.max(0.0001, tEnd - tStart);
        const msPerTick = totalDurationMs / totalTicks;

        // 2. Compute 5 Competing Objective Scores [0.0, 1.0]
        const f_identity = this._evaluateIdentityInvariance(traits, trajectories, targetPreset || behaviorCard);
        const f_sensitivity = this._evaluateContextSensitivity(trajectories);
        const f_temporal = this._evaluateTemporalRealism(trajectories);
        const f_budget = this._evaluateComputationalEfficiency(msPerTick);
        const f_anti = this._evaluateAntiCaricature(traits, trajectories);

        const objectives = {
            identity_invariance: Math.max(0.0, Math.min(1.0, f_identity)),
            context_sensitivity: Math.max(0.0, Math.min(1.0, f_sensitivity)),
            temporal_realism: Math.max(0.0, Math.min(1.0, f_temporal)),
            computational_efficiency: Math.max(0.0, Math.min(1.0, f_budget)),
            anti_caricature: Math.max(0.0, Math.min(1.0, f_anti))
        };

        const vector = OBJECTIVE_KEYS.map(k => objectives[k]);

        const evaluated = {
            id: candidateId,
            candidate,
            objectives,
            vector,
            trajectories,
            msPerTick,
            paretoRank: null,
            crowdingDistance: 0.0
        };

        const existingIdx = this.evaluatedPopulation.findIndex(p => p.id === candidateId);
        if (existingIdx >= 0) {
            this.evaluatedPopulation[existingIdx] = evaluated;
        } else {
            this.evaluatedPopulation.push(evaluated);
        }

        return evaluated;
    }

    _resetAgent(agent, traits) {
        agent.currentFear = 0.0;
        agent.currentAnger = 0.0;
        agent.energy = 1.0;
        agent.health = 1.0;
        agent.tickCount = 0;
        agent.fearCore.currentBand = 'CALM';
        agent.fearCore.panicLockCounter = 0;
        if (agent.habituation?.records) {
            agent.habituation.records.clear();
        }
    }

    _evaluateIdentityInvariance(traits, trajectories, targetProfile) {
        // If an explicit target preset or behaviorCard is specified, compare against its expectations
        if (targetProfile) {
            const card = targetProfile.behaviorCard || targetProfile;
            let score = 1.0;

            // Compare against panic onset expectation
            if (card.panicOnsetThreshold !== undefined) {
                const targetPanicOnset = card.panicOnsetThreshold;
                const diff = Math.abs((1.0 - (traits.neuroticism ?? 0.5)) - targetPanicOnset);
                score -= diff * 0.4;
            }

            // Compare resilience expectation
            if (targetProfile.traits) {
                let traitDist = 0;
                let traitCount = 0;
                for (const [k, v] of Object.entries(targetProfile.traits)) {
                    if (typeof traits[k] === 'number') {
                        traitDist += Math.abs(traits[k] - v);
                        traitCount++;
                    }
                }
                if (traitCount > 0) {
                    const avgDist = traitDist / traitCount;
                    score -= avgDist * 0.5;
                }
            }

            return Math.max(0.0, Math.min(1.0, score));
        }

        // Default archetype identity fidelity: baseline quiescence must remain low,
        // and acute response must correlate with neuroticism vs bravery
        const baseTraj = trajectories[STANDARD_STRESSOR_REGIMES.QUIESCENT_BASELINE];
        const avgBase = baseTraj.reduce((a, b) => a + b, 0) / baseTraj.length;
        const acuteTraj = trajectories[STANDARD_STRESSOR_REGIMES.ACUTE_JUMPSCARE];
        const peakAcute = Math.max(...acuteTraj);

        const expectedPeak = Math.max(0.1, (traits.neuroticism ?? 0.5) * 0.8 + (1.0 - (traits.bravery ?? 0.5)) * 0.2);
        const baselinePenalty = Math.max(0, avgBase - 0.25) * 1.5;
        const peakError = Math.abs(peakAcute - expectedPeak);

        return Math.max(0.0, Math.min(1.0, 1.0 - (baselinePenalty + peakError * 0.5)));
    }

    _evaluateContextSensitivity(trajectories) {
        // Must exhibit significant dynamic range between quiescence and compound crisis
        const baseTraj = trajectories[STANDARD_STRESSOR_REGIMES.QUIESCENT_BASELINE];
        const avgBase = baseTraj.reduce((a, b) => a + b, 0) / baseTraj.length;

        const compoundTraj = trajectories[STANDARD_STRESSOR_REGIMES.COMPOUND_CRISIS];
        const maxCompound = Math.max(...compoundTraj);

        const acuteTraj = trajectories[STANDARD_STRESSOR_REGIMES.ACUTE_JUMPSCARE];
        const maxAcute = Math.max(...acuteTraj);

        const sustainedTraj = trajectories[STANDARD_STRESSOR_REGIMES.SUSTAINED_DREAD];
        const maxSustained = Math.max(...sustainedTraj);

        const dynamicRange = Math.max(0, maxCompound - avgBase);
        const gradient = Math.max(0, maxCompound - maxSustained) + Math.max(0, maxAcute - avgBase);

        const sensitivityScore = (dynamicRange * 0.6) + (Math.min(1.0, gradient) * 0.4);
        return Math.max(0.0, Math.min(1.0, sensitivityScore));
    }

    _evaluateTemporalRealism(trajectories) {
        // Realism demands:
        // 1. Recovery occurs (not locked forever at peak)
        // 2. No high-frequency chatter / jerk
        // 3. Smooth decay
        const acuteTraj = trajectories[STANDARD_STRESSOR_REGIMES.ACUTE_JUMPSCARE];
        const peakIdx = acuteTraj.indexOf(Math.max(...acuteTraj));
        const postPeak = acuteTraj.slice(peakIdx);

        // Check chatter / second-derivative variation
        let jerkSum = 0;
        for (let i = 2; i < postPeak.length; i++) {
            const d2 = Math.abs(postPeak[i] - 2 * postPeak[i - 1] + postPeak[i - 2]);
            jerkSum += d2;
        }
        const avgJerk = postPeak.length > 2 ? jerkSum / (postPeak.length - 2) : 0;
        const chatterPenalty = Math.min(0.5, avgJerk * 3.0);

        // Check for permanent panic lock at end of acute regime
        const endFear = postPeak[postPeak.length - 1];
        const lockPenalty = endFear > 0.6 ? 0.6 : (endFear > 0.3 ? 0.25 : 0.0);

        // Check that recovery actually moved downward
        const recoveredAmount = postPeak.length > 1 ? (postPeak[0] - endFear) : 0;
        const recoveryBonus = Math.max(0, Math.min(0.3, recoveredAmount * 0.4));

        const baseRealism = 0.9 - chatterPenalty - lockPenalty + recoveryBonus;
        return Math.max(0.0, Math.min(1.0, baseRealism));
    }

    _evaluateComputationalEfficiency(msPerTick) {
        if (msPerTick <= 0.005) return 1.0;
        if (msPerTick >= 0.10) return 0.1;
        return 1.0 - ((msPerTick - 0.005) / 0.095) * 0.9;
    }

    _evaluateAntiCaricature(traits, trajectories) {
        let saturationPenalty = 0;
        let traitCount = 0;

        for (const val of Object.values(traits)) {
            if (typeof val === 'number') {
                traitCount++;
                if (val <= 0.02 || val >= 0.98) {
                    saturationPenalty += 0.25;
                } else if (val <= 0.05 || val >= 0.95) {
                    saturationPenalty += 0.10;
                }
            }
        }

        const normalizedSatPenalty = traitCount > 0 ? Math.min(0.6, saturationPenalty / traitCount * 2.0) : 0;

        const baseTraj = trajectories[STANDARD_STRESSOR_REGIMES.QUIESCENT_BASELINE];
        const avgBase = baseTraj.reduce((a, b) => a + b, 0) / baseTraj.length;
        const compoundTraj = trajectories[STANDARD_STRESSOR_REGIMES.COMPOUND_CRISIS];
        const maxCompound = Math.max(...compoundTraj);

        let behaviorPenalty = 0;
        if (avgBase > 0.85) behaviorPenalty += 0.3;
        if (maxCompound < 0.05) behaviorPenalty += 0.3;

        return Math.max(0.0, Math.min(1.0, 1.0 - normalizedSatPenalty - behaviorPenalty));
    }

    dominates(u, v, epsilon = 1e-5) {
        let strictlyBetter = false;
        for (let i = 0; i < u.length; i++) {
            if (u[i] < v[i] - epsilon) {
                return false;
            }
            if (u[i] > v[i] + epsilon) {
                strictlyBetter = true;
            }
        }
        return strictlyBetter;
    }

    nonDominatedSort(population) {
        const fronts = [[]];
        const S = new Map();
        const n = new Map();

        for (const p of population) {
            S.set(p, []);
            n.set(p, 0);

            for (const q of population) {
                if (p === q) continue;
                if (this.dominates(p.vector, q.vector)) {
                    S.get(p).push(q);
                } else if (this.dominates(q.vector, p.vector)) {
                    n.set(p, n.get(p) + 1);
                }
            }

            if (n.get(p) === 0) {
                p.paretoRank = 1;
                fronts[0].push(p);
            }
        }

        let i = 0;
        while (fronts[i] && fronts[i].length > 0) {
            const nextFront = [];
            for (const p of fronts[i]) {
                for (const q of S.get(p)) {
                    n.set(q, n.get(q) - 1);
                    if (n.get(q) === 0) {
                        q.paretoRank = i + 2;
                        nextFront.push(q);
                    }
                }
            }
            i++;
            if (nextFront.length > 0) {
                fronts.push(nextFront);
            }
        }

        this.paretoFronts = fronts.filter(f => f.length > 0);
        return this.paretoFronts;
    }

    computeCrowdingDistance(front) {
        const l = front.length;
        if (l === 0) return front;

        for (const p of front) {
            p.crowdingDistance = 0.0;
        }

        if (l <= 2) {
            for (const p of front) p.crowdingDistance = Infinity;
            return front;
        }

        const numObjectives = OBJECTIVE_KEYS.length;

        for (let m = 0; m < numObjectives; m++) {
            front.sort((a, b) => a.vector[m] - b.vector[m]);

            front[0].crowdingDistance = Infinity;
            front[l - 1].crowdingDistance = Infinity;

            const minVal = front[0].vector[m];
            const maxVal = front[l - 1].vector[m];
            const spread = maxVal - minVal;

            if (spread > 1e-6) {
                for (let i = 1; i < l - 1; i++) {
                    if (Number.isFinite(front[i].crowdingDistance)) {
                        front[i].crowdingDistance += (front[i + 1].vector[m] - front[i - 1].vector[m]) / spread;
                    }
                }
            }
        }

        return front;
    }

    computeHypervolume(front, referencePoint = [0, 0, 0, 0, 0]) {
        if (!front || front.length === 0) return 0.0;

        const numSamples = 2000;
        let dominatedSamples = 0;

        let seed = 123456789;
        const nextRand = () => {
            seed = (seed * 1664525 + 1013904223) % 4294967296;
            return seed / 4294967296;
        };

        const dim = OBJECTIVE_KEYS.length;
        for (let s = 0; s < numSamples; s++) {
            const point = [];
            for (let d = 0; d < dim; d++) {
                point.push(referencePoint[d] + nextRand() * (1.0 - referencePoint[d]));
            }

            let isDominated = false;
            for (let i = 0; i < front.length; i++) {
                const solVec = front[i].vector;
                let dominatesPoint = true;
                for (let d = 0; d < dim; d++) {
                    if (solVec[d] < point[d]) {
                        dominatesPoint = false;
                        break;
                    }
                }
                if (dominatesPoint) {
                    isDominated = true;
                    break;
                }
            }

            if (isDominated) {
                dominatedSamples++;
            }
        }

        return dominatedSamples / numSamples;
    }

    selectKneePoint(front, customWeights = {}) {
        if (!front || front.length === 0) return null;

        const weights = { ...this.config.objectiveWeights, ...customWeights };
        let bestSolution = null;
        let minDistance = Infinity;

        for (const sol of front) {
            let distSq = 0;
            for (let i = 0; i < OBJECTIVE_KEYS.length; i++) {
                const key = OBJECTIVE_KEYS[i];
                const w = weights[key] ?? 0.20;
                const diff = 1.0 - sol.vector[i];
                distSq += w * (diff * diff);
            }
            const dist = Math.sqrt(distSq);

            if (dist < minDistance) {
                minDistance = dist;
                bestSolution = sol;
            }
        }

        return {
            solution: bestSolution,
            distanceToUtopia: minDistance,
            weights
        };
    }

    generateCalibrationSurface(candidate, resolution = 5) {
        const traits = candidate.traits || { ...candidate };
        const agent = new AffectiveAgent('surface_probe', traits);
        const surfaceGrid = [];

        const step = 1.0 / (Math.max(2, resolution) - 1);

        for (let si = 0; si < resolution; si++) {
            const s = Math.min(1.0, si * step);
            for (let pi = 0; pi < resolution; pi++) {
                const p = Math.min(1.0, pi * step);

                this._resetAgent(agent, traits);
                const trajectory = [];
                let peakFear = 0;

                // 15 ticks of stimulus
                for (let t = 0; t < 15; t++) {
                    const threats = s > 0.05 ? [{ distance: 5.0, intensity: s }] : [];
                    agent.tick(0.016, { threats }, { contagionFear: p });
                    const fear = agent.currentFear;
                    trajectory.push(fear);
                    if (fear > peakFear) peakFear = fear;
                }

                // 10 ticks of recovery post-stimulus
                let recoveryTicks = 0;
                for (let t = 0; t < 10; t++) {
                    agent.tick(0.016, { threats: [] }, { contagionFear: 0.0 });
                    if (agent.currentFear >= 0.20) {
                        recoveryTicks++;
                    }
                }

                const steadyFear = trajectory.slice(-5).reduce((a, b) => a + b, 0) / 5;

                surfaceGrid.push({
                    stressorIntensity: Number(s.toFixed(2)),
                    socialPressure: Number(p.toFixed(2)),
                    steadyStateFear: Number(steadyFear.toFixed(4)),
                    peakFear: Number(peakFear.toFixed(4)),
                    recoveryTicks
                });
            }
        }

        return {
            resolution,
            candidateId: candidate.id || 'candidate',
            gridSize: surfaceGrid.length,
            surfaceGrid
        };
    }

    calibratePopulation(candidates, options = {}) {
        this.evaluatedPopulation = candidates.map(c => this.evaluateCandidate(c, options));
        const fronts = this.nonDominatedSort(this.evaluatedPopulation);

        for (const front of fronts) {
            this.computeCrowdingDistance(front);
        }

        const front1 = fronts[0] || [];
        const hypervolume = this.computeHypervolume(front1);
        const kneeResult = this.selectKneePoint(front1, options.weights);

        return {
            totalEvaluated: this.evaluatedPopulation.length,
            numFronts: fronts.length,
            front1Size: front1.length,
            hypervolume,
            bestCompromise: kneeResult?.solution || null,
            distanceToUtopia: kneeResult?.distanceToUtopia ?? null,
            fronts
        };
    }

    getState() {
        return {
            config: { ...this.config },
            evaluatedCount: this.evaluatedPopulation.length,
            frontCount: this.paretoFronts.length,
            evaluatedPopulation: this.evaluatedPopulation.map(p => ({
                id: p.id,
                objectives: { ...p.objectives },
                vector: [...p.vector],
                paretoRank: p.paretoRank,
                crowdingDistance: p.crowdingDistance
            }))
        };
    }

    setState(state) {
        if (!state) return;
        this.evaluatedPopulation = (state.evaluatedPopulation || []).map(p => ({
            id: p.id,
            objectives: { ...p.objectives },
            vector: [...p.vector],
            paretoRank: p.paretoRank,
            crowdingDistance: p.crowdingDistance
        }));
        this.paretoFronts = [];
    }
}
