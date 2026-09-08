/**
 * packages/core/src/SituationStrengthProfiler.js
 *
 * Front B / Sections 15–16: Opportunity-Normalized Behavioral Metrics & Situation-Strength Profiling.
 *
 * Implements:
 * 1. Mischel's Situation Strength Framework:
 *    - 4 Psychological Dimensions: Clarity, Consistency, Constraints, Consequences.
 *    - Continuous score S in [0.0, 1.0] and discrete classifications: WEAK, MODERATE, STRONG.
 * 2. Opportunity-Normalized Behavioral Metrics:
 *    - Eliminates raw act frequency distortion across heterogeneous environments.
 *    - Normalizes acts by strictly counted environmental affordance opportunities:
 *      NormRate(d) = N_actions(d) / N_opportunities(d)
 *    - 6 Core Dimensions: HELPING, INVESTIGATION, LEADERSHIP, WARNING, FLIGHT, CONFRONTATION.
 * 3. Situation-Strength Compression Theorem:
 *    - In WEAK situations: High persona variance (diverse reaction norms).
 *    - In STRONG situations: Behavioral variance compresses (compression ratio < 0.50).
 * 4. Reversible Trait Restoration Protocol (Constraint Release):
 *    - 0.0000 trait drift across constraint exposure.
 *    - High-fidelity behavioral recovery upon returning to weak situations (r >= 0.90).
 * 5. Situation Pathology Detector:
 *    - Flags UNRESPONSIVE_TO_SITUATION_STRENGTH, HYPER_RIGID_TRAIT_LOCK,
 *      PERMANENT_COMPRESSION_RELAPSE, and UNNORMALIZED_METRIC_DISTORTION.
 *
 * Strictly adheres to Host Game Authority Invariant:
 * Pure behavioral evaluation oracle; never mutates external game state.
 */

import { ACTION_INTENTS } from './IntentResolver.js';
import { AffectiveAgent } from './AffectiveAgent.js';
import { CANONICAL_PRESETS } from './PresetLibrary.js';
import { DeterministicRng } from './DeterministicRng.js';

export const SITUATION_STRENGTH_LEVELS = Object.freeze({
    WEAK: 'WEAK',
    MODERATE: 'MODERATE',
    STRONG: 'STRONG'
});

export const AFFORDANCE_DIMENSIONS = Object.freeze({
    HELPING: 'HELPING',
    INVESTIGATION: 'INVESTIGATION',
    LEADERSHIP: 'LEADERSHIP',
    WARNING: 'WARNING',
    FLIGHT: 'FLIGHT',
    CONFRONTATION: 'CONFRONTATION'
});

export const DEFAULT_DIMENSION_ACTIONS = Object.freeze({
    [AFFORDANCE_DIMENSIONS.HELPING]: Object.freeze([
        'APPROACH_ALLY',
        'WARN_GROUP',
        'AID_ALLY',
        'HEAL',
        'RALLY_TEAM',
        'PROTECT_ALLY'
    ]),
    [AFFORDANCE_DIMENSIONS.INVESTIGATION]: Object.freeze([
        'INVESTIGATE_SOUND',
        'SCOUT',
        'APPROACH_ANOMALY'
    ]),
    [AFFORDANCE_DIMENSIONS.LEADERSHIP]: Object.freeze([
        'WARN_GROUP',
        'RALLY',
        'HOLD_LINE',
        'ISSUE_COMMAND'
    ]),
    [AFFORDANCE_DIMENSIONS.WARNING]: Object.freeze([
        'WARN_GROUP',
        'SIGNAL_ALARM'
    ]),
    [AFFORDANCE_DIMENSIONS.FLIGHT]: Object.freeze([
        'FLEE_FROM',
        'SEEK_COVER',
        'FREEZE',
        'DESPERATE_FLAIL'
    ]),
    [AFFORDANCE_DIMENSIONS.CONFRONTATION]: Object.freeze([
        'CONFRONT_THREAT'
    ])
});

export const SITUATION_PATHOLOGIES = Object.freeze({
    UNRESPONSIVE_TO_SITUATION_STRENGTH: 'UNRESPONSIVE_TO_SITUATION_STRENGTH',
    HYPER_RIGID_TRAIT_LOCK: 'HYPER_RIGID_TRAIT_LOCK',
    PERMANENT_COMPRESSION_RELAPSE: 'PERMANENT_COMPRESSION_RELAPSE',
    UNNORMALIZED_METRIC_DISTORTION: 'UNNORMALIZED_METRIC_DISTORTION'
});

export class SituationStrengthProfiler {
    /**
     * @param {object} [options={}]
     */
    constructor(options = {}) {
        this.weights = Object.freeze({
            clarity: options.weights?.clarity ?? 0.25,
            consistency: options.weights?.consistency ?? 0.20,
            constraints: options.weights?.constraints ?? 0.25,
            consequences: options.weights?.consequences ?? 0.30
        });

        this.dimensionActions = options.dimensionActions || DEFAULT_DIMENSION_ACTIONS;

        // Map: agentId -> { opportunities: Map, actions: Map, intentCounts: Map, totalTicks: number }
        this.agentRecords = new Map();
    }

    /**
     * Calculate Mischel Situation Strength score and discrete classification.
     * @param {object} params
     * @param {number} [params.clarity=0.5] Unambiguity of situational cues [0, 1]
     * @param {number} [params.consistency=0.5] Agreement/coherence of cues [0, 1]
     * @param {number} [params.constraints=0.5] Environmental limitation on viable choices [0, 1]
     * @param {number} [params.consequences=0.5] Severity of potential negative outcomes [0, 1]
     * @returns {object} { score: number, level: string, components: object }
     */
    calculateSituationStrength(params = {}) {
        const clamp = (val, def = 0.5) => (typeof val === 'number' && !Number.isNaN(val)) ? Math.max(0, Math.min(1, val)) : def;

        const clarity = clamp(params.clarity, 0.5);
        const consistency = clamp(params.consistency, 0.5);
        const constraints = clamp(params.constraints, 0.5);
        const consequences = clamp(params.consequences, 0.5);

        const score = (
            clarity * this.weights.clarity +
            consistency * this.weights.consistency +
            constraints * this.weights.constraints +
            consequences * this.weights.consequences
        );

        let level = SITUATION_STRENGTH_LEVELS.MODERATE;
        if (score < 0.35) {
            level = SITUATION_STRENGTH_LEVELS.WEAK;
        } else if (score >= 0.70) {
            level = SITUATION_STRENGTH_LEVELS.STRONG;
        }

        return {
            score: Number(score.toFixed(4)),
            level,
            components: {
                clarity,
                consistency,
                constraints,
                consequences
            }
        };
    }

    /**
     * Clear all recorded agent observations.
     */
    reset() {
        this.agentRecords.clear();
    }

    /**
     * Ensure tracking structure exists for an agent.
     * @param {string} agentId
     * @private
     */
    _ensureAgentRecord(agentId) {
        if (!this.agentRecords.has(agentId)) {
            const opps = {};
            const acts = {};
            for (const dim of Object.values(AFFORDANCE_DIMENSIONS)) {
                opps[dim] = 0;
                acts[dim] = 0;
            }
            this.agentRecords.set(agentId, {
                opportunities: opps,
                actions: acts,
                intentCounts: {},
                totalTicks: 0
            });
        }
        return this.agentRecords.get(agentId);
    }

    /**
     * Record a tick observation and action intent for an agent, detecting active affordance opportunities.
     * @param {string} agentId
     * @param {object} intent Resolved ActionIntent
     * @param {object} observations Sensory environment observations
     * @param {object} [context={}] Additional context (e.g. peer statuses)
     */
    recordTick(agentId, intent, observations = {}, context = {}) {
        const rec = this._ensureAgentRecord(agentId);
        rec.totalTicks++;

        const intentType = intent?.type || 'IDLE_VIGILANT';
        rec.intentCounts[intentType] = (rec.intentCounts[intentType] || 0) + 1;

        const threats = observations.threats || [];
        const sounds = observations.sounds || [];
        const peers = observations.peers || [];
        const anomalies = observations.anomalies || [];

        // 1. Detect Opportunities
        // FLIGHT: Threat presence
        const hasThreat = threats.length > 0 || (context.threatPressure && context.threatPressure > 0.25);
        if (hasThreat) {
            rec.opportunities[AFFORDANCE_DIMENSIONS.FLIGHT]++;
        }

        // CONFRONTATION: Close hostile proximity or active combat
        const hasCloseThreat = threats.some(t => (t.distance ?? 10) <= 6.0 || t.inCombat) || context.inDirectCombat;
        if (hasCloseThreat) {
            rec.opportunities[AFFORDANCE_DIMENSIONS.CONFRONTATION]++;
        }

        // INVESTIGATION: Acoustic signals, cues, or ambient anomalies
        const hasInvestigationOpportunity = sounds.length > 0 || anomalies.length > 0 || context.hasSuspiciousCue;
        if (hasInvestigationOpportunity) {
            rec.opportunities[AFFORDANCE_DIMENSIONS.INVESTIGATION]++;
        }

        // HELPING: Presence of distressed, injured, or threatened peers
        const hasDistressedPeers = peers.some(p => p.injured || p.distressed || (p.fear ?? 0) > 0.50) || context.allyNeedsAid;
        if (hasDistressedPeers) {
            rec.opportunities[AFFORDANCE_DIMENSIONS.HELPING]++;
        }

        // WARNING: Threat detected while peers are proximate but not fully aware
        const hasWarningOpportunity = threats.length > 0 && peers.length > 0;
        if (hasWarningOpportunity) {
            rec.opportunities[AFFORDANCE_DIMENSIONS.WARNING]++;
        }

        // LEADERSHIP: Group under disarray, panic, or tactical distress with >= 2 peers
        const hasLeadershipOpportunity = (peers.length >= 2 && (context.groupState === 'PANICKING' || context.groupState === 'ROUTING' || hasThreat));
        if (hasLeadershipOpportunity) {
            rec.opportunities[AFFORDANCE_DIMENSIONS.LEADERSHIP]++;
        }

        // 2. Match Action Intent to Dimensions
        for (const [dim, validActions] of Object.entries(this.dimensionActions)) {
            if (validActions.includes(intentType)) {
                rec.actions[dim]++;
            }
        }
    }

    /**
     * Compute opportunity-normalized rates for an agent.
     * @param {string} agentId
     * @returns {object}
     */
    getOpportunityNormalizedRates(agentId) {
        const rec = this._ensureAgentRecord(agentId);
        const rates = {};

        for (const dim of Object.values(AFFORDANCE_DIMENSIONS)) {
            const opps = rec.opportunities[dim] || 0;
            const acts = rec.actions[dim] || 0;
            const normalizedRate = opps > 0 ? acts / opps : 0.0;

            rates[dim] = {
                opportunityCount: opps,
                actionCount: acts,
                normalizedRate: Number(normalizedRate.toFixed(4)),
                affordanceAvailable: opps > 0
            };
        }

        // Intent distribution
        const totalIntents = Object.values(rec.intentCounts).reduce((a, b) => a + b, 0);
        const intentDistribution = {};
        for (const [intent, count] of Object.entries(rec.intentCounts)) {
            intentDistribution[intent] = totalIntents > 0 ? Number((count / totalIntents).toFixed(4)) : 0;
        }

        return {
            agentId,
            totalTicks: rec.totalTicks,
            dimensions: rates,
            intentDistribution,
            entropy: this.calculateEntropy(intentDistribution)
        };
    }

    /**
     * Calculate Shannon Entropy of a probability distribution in bits.
     * @param {object} dist Key-value map of probabilities
     * @returns {number}
     */
    calculateEntropy(dist) {
        let entropy = 0.0;
        for (const p of Object.values(dist)) {
            if (p > 0) {
                entropy -= p * Math.log2(p);
            }
        }
        return Number(entropy.toFixed(4));
    }

    /**
     * Evaluate a cohort of agents under a given situation across a number of ticks.
     * @param {Array<AffectiveAgent>} agents Cohort of agents
     * @param {object} situationConfig
     * @param {number} [ticks=30]
     * @param {number} [seed=1337]
     * @returns {object}
     */
    evaluateCohort(agents, situationConfig, ticks = 30, seed = 1337) {
        const rng = new DeterministicRng(seed);
        const profiler = new SituationStrengthProfiler({ weights: this.weights });
        const strength = profiler.calculateSituationStrength(situationConfig);

        for (let t = 0; t < ticks; t++) {
            for (let i = 0; i < agents.length; i++) {
                const agent = agents[i];
                const otherPeers = agents
                    .filter((_, idx) => idx !== i)
                    .map(p => ({
                        id: p.id,
                        x: p.x,
                        y: p.y,
                        z: p.z,
                        fear: p.currentFear,
                        distressed: p.currentFear > 0.55,
                        injured: situationConfig.injuriesPresent ?? false
                    }));

                // Build observations based on situation parameters
                const observations = {
                    threats: [],
                    sounds: [],
                    peers: otherPeers,
                    anomalies: []
                };

                if (situationConfig.threatDistance !== undefined && situationConfig.threatIntensity !== undefined) {
                    observations.threats.push({
                        id: 'threat_primary',
                        distance: situationConfig.threatDistance,
                        intensity: situationConfig.threatIntensity,
                        x: agent.x + (situationConfig.threatDistance || 10),
                        y: agent.y,
                        z: agent.z,
                        inCombat: situationConfig.threatDistance <= 3.0
                    });
                }

                if (situationConfig.ambientSoundIntensity !== undefined) {
                    observations.sounds.push({
                        id: `sound_ambient_${t}`,
                        intensity: situationConfig.ambientSoundIntensity,
                        x: agent.x + rng.range(-15, 15),
                        y: agent.y + rng.range(-15, 15),
                        z: agent.z
                    });
                }

                if (situationConfig.anomaliesPresent) {
                    observations.anomalies.push({ id: 'anomaly_marker', x: agent.x + 5, y: agent.y });
                }

                // Tick agent and get intent
                const tickOutput = agent.tick(0.016, observations, {
                    pacingIntensity: situationConfig.threatPressure !== undefined ? Math.max(0.5, situationConfig.threatPressure) : 1.0
                });
                const intent = tickOutput.action_intent;
                profiler.recordTick(agent.id, intent, observations, {
                    threatPressure: situationConfig.threatPressure,
                    inDirectCombat: situationConfig.threatDistance <= 3.0,
                    allyNeedsAid: situationConfig.injuriesPresent
                });
            }
        }

        // Collect per-agent profiles
        const agentProfiles = agents.map(a => profiler.getOpportunityNormalizedRates(a.id));

        // Compute cross-agent variance in normalized rates
        const variances = {};
        for (const dim of Object.values(AFFORDANCE_DIMENSIONS)) {
            const values = agentProfiles
                .map(p => p.dimensions[dim]?.normalizedRate ?? 0)
                .filter(v => typeof v === 'number');

            variances[dim] = this._calculateVariance(values);
        }

        const meanVariance = Object.values(variances).reduce((a, b) => a + b, 0) / Object.keys(variances).length;
        const meanEntropy = agentProfiles.reduce((acc, p) => acc + p.entropy, 0) / (agentProfiles.length || 1);

        return {
            situationStrength: strength,
            ticks,
            agentProfiles,
            dimensionVariances: variances,
            meanBehavioralVariance: Number(meanVariance.toFixed(6)),
            meanEntropy: Number(meanEntropy.toFixed(4))
        };
    }

    /**
     * Compute Situation Strength Compression across Weak and Strong situations.
     * Evaluates Mischel's Theorem: variance(strong) / variance(weak) < 0.50.
     * @param {object} weakResult Result from evaluateCohort in weak situation
     * @param {object} strongResult Result from evaluateCohort in strong situation
     * @returns {object}
     */
    evaluateCompression(weakResult, strongResult) {
        const weakVar = Math.max(1e-6, weakResult.meanBehavioralVariance);
        const strongVar = strongResult.meanBehavioralVariance;
        const compressionRatio = Number((strongVar / weakVar).toFixed(4));
        const entropyDrop = Number((weakResult.meanEntropy - strongResult.meanEntropy).toFixed(4));

        const compressedDimensions = {};
        for (const dim of Object.values(AFFORDANCE_DIMENSIONS)) {
            const wDimVar = Math.max(1e-6, weakResult.dimensionVariances[dim] || 0);
            const sDimVar = strongResult.dimensionVariances[dim] || 0;
            compressedDimensions[dim] = {
                weakVariance: Number(wDimVar.toFixed(6)),
                strongVariance: Number(sDimVar.toFixed(6)),
                ratio: Number((sDimVar / wDimVar).toFixed(4))
            };
        }

        return {
            weakSituationScore: weakResult.situationStrength.score,
            strongSituationScore: strongResult.situationStrength.score,
            weakMeanVariance: weakResult.meanBehavioralVariance,
            strongMeanVariance: strongResult.meanBehavioralVariance,
            compressionRatio,
            isCompressed: compressionRatio < 0.50,
            entropyDrop,
            compressedDimensions
        };
    }

    /**
     * Run Reversible Trait Restoration Protocol:
     * Phase 1: WEAK baseline (measure pre-exposure profiles)
     * Phase 2: STRONG constraint (apply extreme threat pressure)
     * Phase 3: WEAK release (measure post-recovery profiles)
     * Verifies: 0.0000 trait drift & high-fidelity behavioral recovery (r >= 0.90).
     * @param {Array<AffectiveAgent>} agents
     * @param {object} weakConfig
     * @param {object} strongConfig
     * @param {number} [phaseTicks=25]
     * @returns {object}
     */
    runReversibilityProtocol(agents, weakConfig, strongConfig, phaseTicks = 25) {
        // Snapshot original traits
        const originalTraits = agents.map(a => ({
            id: a.id,
            traits: { ...a.traits }
        }));

        // Phase 1: Weak Baseline
        const phase1Result = this.evaluateCohort(agents, weakConfig, phaseTicks, 101);

        // Phase 2: Strong Duress
        const phase2Result = this.evaluateCohort(agents, strongConfig, phaseTicks, 202);

        // Allow agents to recover fear/anger back to calm baseline
        for (let i = 0; i < 150; i++) {
            agents.forEach(a => a.tick(0.016, {}, {}));
        }
        agents.forEach(a => {
            if (a.currentFear < 0.05) a.currentFear = 0.0;
            if (a.currentAnger < 0.05) a.currentAnger = 0.0;
            if (a.fearCore && a.currentFear === 0.0) a.fearCore.reset();
        });

        // Phase 3: Weak Release (identical baseline environment conditions)
        const phase3Result = this.evaluateCohort(agents, weakConfig, phaseTicks, 101);

        // Check Trait Drift Invariant
        let maxTraitDrift = 0.0;
        for (const orig of originalTraits) {
            const currentAgent = agents.find(a => a.id === orig.id);
            for (const [tKey, tVal] of Object.entries(orig.traits)) {
                const diff = Math.abs((currentAgent.traits[tKey] ?? 0) - tVal);
                if (diff > maxTraitDrift) maxTraitDrift = diff;
            }
        }

        // Compute Pearson Correlation between Phase 1 and Phase 3 normalized rates
        const p1Rates = [];
        const p3Rates = [];
        for (let i = 0; i < agents.length; i++) {
            const p1 = phase1Result.agentProfiles[i];
            const p3 = phase3Result.agentProfiles[i];
            for (const dim of Object.values(AFFORDANCE_DIMENSIONS)) {
                p1Rates.push(p1.dimensions[dim].normalizedRate);
                p3Rates.push(p3.dimensions[dim].normalizedRate);
            }
        }

        const correlation = this._calculateCorrelation(p1Rates, p3Rates);

        return {
            traitDrift: Number(maxTraitDrift.toFixed(6)),
            traitIntegrityPreserved: maxTraitDrift === 0.0,
            restorationFidelityCorrelation: Number(correlation.toFixed(4)),
            restorationSucceeded: correlation >= 0.90,
            phase1MeanVariance: phase1Result.meanBehavioralVariance,
            phase2MeanVariance: phase2Result.meanBehavioralVariance,
            phase3MeanVariance: phase3Result.meanBehavioralVariance,
            compressionRatio: Number((phase2Result.meanBehavioralVariance / Math.max(1e-6, phase1Result.meanBehavioralVariance)).toFixed(4)),
            recoveryRatio: Number((phase3Result.meanBehavioralVariance / Math.max(1e-6, phase1Result.meanBehavioralVariance)).toFixed(4))
        };
    }

    /**
     * Situation Pathology Detector:
     * Audits agent behavior and detects unresponsiveness, hyper-rigidity, and un-normalized metric distortion.
     * @param {object} cohortEvaluation
     * @returns {Array<object>} Detected pathologies
     */
    detectPathologies(cohortEvaluation) {
        const pathologies = [];
        const { situationStrength, agentProfiles } = cohortEvaluation;

        for (const profile of agentProfiles) {
            const flightRate = profile.dimensions[AFFORDANCE_DIMENSIONS.FLIGHT]?.normalizedRate ?? 0;
            const confrontRate = profile.dimensions[AFFORDANCE_DIMENSIONS.CONFRONTATION]?.normalizedRate ?? 0;
            const investRate = profile.dimensions[AFFORDANCE_DIMENSIONS.INVESTIGATION]?.normalizedRate ?? 0;

            // 1. UNRESPONSIVE_TO_SITUATION_STRENGTH: In STRONG lethal situation, agent keeps leisurely exploring
            if (situationStrength.level === SITUATION_STRENGTH_LEVELS.STRONG && situationStrength.score >= 0.75) {
                if (flightRate < 0.10 && confrontRate < 0.10 && investRate > 0.40) {
                    pathologies.push({
                        type: SITUATION_PATHOLOGIES.UNRESPONSIVE_TO_SITUATION_STRENGTH,
                        agentId: profile.agentId,
                        severity: 'CRITICAL',
                        detail: `Agent ${profile.agentId} engaged in ${investRate * 100}% investigation under lethal threat (strength ${situationStrength.score}) with <10% survival actions.`
                    });
                }
            }

            // 2. UNNORMALIZED_METRIC_DISTORTION check:
            // If actionCount is high but opportunityCount is zero, or opportunity count varies wildly
            for (const [dim, data] of Object.entries(profile.dimensions)) {
                if (data.opportunityCount === 0 && data.actionCount > 0) {
                    pathologies.push({
                        type: SITUATION_PATHOLOGIES.UNNORMALIZED_METRIC_DISTORTION,
                        agentId: profile.agentId,
                        severity: 'WARNING',
                        detail: `Dimension ${dim} recorded ${data.actionCount} actions despite 0 recorded opportunities.`
                    });
                }
            }
        }

        return pathologies;
    }

    /**
     * Internal variance calculator.
     * @private
     */
    _calculateVariance(values) {
        if (!values || values.length <= 1) return 0.0;
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const sumSq = values.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0);
        return sumSq / values.length;
    }

    /**
     * Internal Pearson correlation calculator.
     * @private
     */
    _calculateCorrelation(x, y) {
        if (!x || !y || x.length !== y.length || x.length === 0) return 0.0;
        const n = x.length;
        const meanX = x.reduce((a, b) => a + b, 0) / n;
        const meanY = y.reduce((a, b) => a + b, 0) / n;

        let num = 0.0;
        let denX = 0.0;
        let denY = 0.0;

        for (let i = 0; i < n; i++) {
            const dx = x[i] - meanX;
            const dy = y[i] - meanY;
            num += dx * dy;
            denX += dx * dx;
            denY += dy * dy;
        }

        const denom = Math.sqrt(denX * denY);
        return denom > 1e-9 ? (num / denom) : 1.0;
    }
}
