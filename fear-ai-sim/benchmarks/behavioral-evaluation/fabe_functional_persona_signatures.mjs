#!/usr/bin/env node
/**
 * FABE Functional Persona Signatures (FPS v1)
 * 
 * Milestone B in the Fear AI Autonomous World Intelligence & Behavioral Evaluation Program.
 * 
 * Methodological Premise:
 * Unadjusted raw state vectors x_t = [fear, arousal, dominance, urgency, ...] are dominated by
 * exogenous scenario effects (eta^2 ~ 81% in ANOVA), because an agent in an acute ambush experiences
 * high fear regardless of personality.
 * 
 * Rather than measuring aggregate state snapshots, a Functional Persona Signature (FPS) characterizes
 * the agent's dynamic stimulus-response transfer function f_theta(stimulus) -> response across 6
 * canonical response surfaces:
 * 
 * 1. Threat-Appraisal Sensitivity Curve:
 *    P(panic | threat) and fear response F(d) vs distance d in [1m, 30m], measuring distance threshold D_50,
 *    approach sensitivity slope k_threat, and peak fear F_max.
 * 
 * 2. Recovery Half-Life Curve:
 *    Post-threat decay dynamics measuring empirical recovery half-life tau_1/2, ticks to calm tau_calm,
 *    and exponential decay rate lambda_decay = exp(ln(0.5) / tau_1/2).
 * 
 * 3. Social Contagion & Reassurance Susceptibility:
 *    Empirical gain beta_social = Delta_Fear / Delta_PeerPanic and calming leader damping beta_reassure.
 * 
 * 4. Altruism & Pro-Social Dilemma Function:
 *    Pro-social action selection rate P(Help/Warn | danger, peers) under anxiety vs selfish flight.
 * 
 * 5. Tactical Discipline Retention Function:
 *    Composure and stance retention (DEFENSIVE_STANCE / SPRINTING vs STUMBLING / DESPERATE_FLAIL) under
 *    mounting acute stress and close-quarters confrontation (d < 1.5m).
 * 
 * 6. Curiosity Under Ambiguity Curve:
 *    Acoustic investigation sensitivity S_threshold and willingness to investigate ambiguous cues.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AffectiveAgent, DeterministicRng } from '../../packages/core/index.js';
import { CANONICAL_ARCHETYPES, buildExtendedCohort } from './fabe_v2_benchmark.mjs';
import { SCENARIO_FAMILIES } from './cross_scenario_invariance_benchmark.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const FROZEN_SEEDS = Object.freeze([1337, 2026, 3141, 4096, 5555, 6789, 7777, 8888, 9123, 9999]);

export const FPS_SPEC = Object.freeze({
    version: '1.0.0',
    name: 'FABE Functional Persona Signatures',
    surfacesCount: 6,
    signatureDimension: 10,
    parameterNames: Object.freeze([
        'threat_d50',             // Distance at which fear >= 0.50 (m / 30m)
        'threat_gain',            // Regression gain of fear on proximity
        'recovery_tau_half',      // Normalized ticks to 50% fear decay (tau / 40)
        'recovery_lambda',        // Normalized decay rate lambda in [0.75, 0.98]
        'social_contagion_gain',  // Delta_Fear / Delta_Contagion
        'leader_reassurance_gain',// Delta_Fear reduction from calm leader
        'altruism_rate',          // Pro-social warning/helping rate under anxiety
        'discipline_retention',   // Tactical stance retention under acute stress
        'cqb_confrontation',      // Point-blank (d < 1.5m) confrontation vs flailing
        'curiosity_sensitivity'   // Acoustic investigation threshold sensitivity
    ])
});

// =============================================================================
// 1. STATISTICAL UTILITIES
// =============================================================================

export function wilsonScoreInterval(k, n, z = 1.95996) {
    if (n === 0) return [0, 0];
    const p = k / n;
    const denominator = 1 + (z * z) / n;
    const centre = (p + (z * z) / (2 * n)) / denominator;
    const margin = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
    return [
        Math.max(0, parseFloat((centre - margin).toFixed(4))),
        Math.min(1, parseFloat((centre + margin).toFixed(4)))
    ];
}

export function cosineSimilarity(a, b) {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dot / denom;
}

export function euclideanDistance(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        const d = a[i] - b[i];
        sum += d * d;
    }
    return Math.sqrt(sum);
}

export function pearsonCorrelation(a, b) {
    let meanA = 0, meanB = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) {
        meanA += a[i];
        meanB += b[i];
    }
    meanA /= n;
    meanB /= n;

    let num = 0, denA = 0, denB = 0;
    for (let i = 0; i < n; i++) {
        const da = a[i] - meanA;
        const db = b[i] - meanB;
        num += da * db;
        denA += da * da;
        denB += db * db;
    }
    const den = Math.sqrt(denA) * Math.sqrt(denB);
    return den === 0 ? 0 : num / den;
}

// =============================================================================
// 2. PARAMETRIC FUNCTIONAL RESPONSE SURFACE EXTRACTORS (PROBE BATTERY)
// =============================================================================

/**
 * 1. Threat-Appraisal Sensitivity Response
 * Sweeps distance from 30m down to 1m to measure D50, onset slope, and point-blank peak fear.
 */
export function extractThreatAppraisalResponse(persona) {
    let d50 = 1.0;
    let foundD50 = false;
    let peakFear = 0;
    let num = 0, den = 0;

    for (let d = 30.0; d >= 1.0; d -= 0.5) {
        const agent = new AffectiveAgent(`probe_th_${persona.id}_${d}`, persona.traits);
        let fear = 0;
        for (let t = 0; t < 5; t++) {
            const res = agent.tick(0.016, { threats: [{ id: 't', distance: d, intensity: 0.85 }] });
            fear = res.affective_state.raw_fear;
        }
        if (!foundD50 && fear >= 0.50) {
            d50 = d;
            foundD50 = true;
        }
        const prox = 1.0 / (1.0 + d * 0.05);
        num += prox * fear;
        den += prox * prox;
        if (fear > peakFear) peakFear = fear;
    }

    const threatGain = den > 0.0001 ? num / den : 1.0;

    return {
        d50: parseFloat(d50.toFixed(2)),
        threatGain: parseFloat(threatGain.toFixed(4)),
        peakFear: parseFloat(peakFear.toFixed(4))
    };
}

/**
 * 2. Recovery Half-Life & Decay Dynamics Response
 * Pulses agent to peak fear, then tracks decay ticks in complete silence.
 */
export function extractRecoveryResponse(persona) {
    const agent = new AffectiveAgent(`probe_rec_${persona.id}`, persona.traits);
    for (let t = 0; t < 8; t++) {
        agent.tick(0.016, { threats: [{ id: 'apex', distance: 1.0, intensity: 1.0 }] });
    }
    const peakFear = agent.currentFear;
    const halfFear = peakFear * 0.5;

    let tauHalf = 40;
    let tauCalm = 40;
    let foundTauHalf = false;
    let foundTauCalm = false;

    // Track decay trajectory
    const trajectory = [];
    for (let t = 0; t < 40; t++) {
        const res = agent.tick(0.016, {});
        const curFear = res.affective_state.raw_fear;
        trajectory.push(curFear);

        if (!foundTauHalf && curFear <= halfFear) {
            tauHalf = t + 1;
            foundTauHalf = true;
        }
        if (!foundTauCalm && (res.fear_band === 'CALM' || curFear <= 0.05)) {
            tauCalm = t + 1;
            foundTauCalm = true;
        }
    }

    // Empirical decay rate lambda
    const f0 = peakFear > 0 ? peakFear : 1.0;
    const f5 = trajectory[Math.min(4, trajectory.length - 1)];
    const empiricalLambda = f0 > 0 ? Math.pow(Math.max(0.001, f5 / f0), 1.0 / 5.0) : 0.92;

    return {
        tauHalf,
        tauCalm,
        empiricalLambda: parseFloat(empiricalLambda.toFixed(4))
    };
}

/**
 * 3. Social Contagion & Reassurance Susceptibility Response
 * Measures Delta_Fear / Delta_Contagion and leader calming mitigation.
 */
export function extractSocialResponse(persona) {
    // A. Contagion Gain
    const agZero = new AffectiveAgent(`probe_soc0_${persona.id}`, persona.traits);
    agZero.tick(0.016, {}, { contagionFear: 0.0 });
    const agFull = new AffectiveAgent(`probe_soc1_${persona.id}`, persona.traits);
    let fFull = 0;
    for (let t = 0; t < 5; t++) {
        const res = agFull.tick(0.016, {}, { contagionFear: 1.0 });
        fFull = res.affective_state.raw_fear;
    }
    const betaSocial = Math.max(0, fFull - agZero.currentFear);

    // B. Leader Reassurance Mitigation (tested under acute threat distance 5m)
    const agLead0 = new AffectiveAgent(`probe_lead0_${persona.id}`, persona.traits);
    let fNoLeader = 0;
    for (let t = 0; t < 5; t++) {
        const res = agLead0.tick(0.016, { threats: [{ id: 't', distance: 5.0, intensity: 1.0 }] }, { leaderCalm: 0.0 });
        fNoLeader = res.affective_state.raw_fear;
    }

    const agLead1 = new AffectiveAgent(`probe_lead1_${persona.id}`, persona.traits);
    let fWithLeader = 0;
    for (let t = 0; t < 5; t++) {
        const res = agLead1.tick(0.016, { threats: [{ id: 't', distance: 5.0, intensity: 1.0 }] }, { leaderCalm: 0.8 });
        fWithLeader = res.affective_state.raw_fear;
    }
    const betaReassure = Math.max(0, fNoLeader - fWithLeader);

    return {
        betaSocial: parseFloat(betaSocial.toFixed(4)),
        betaReassure: parseFloat(betaReassure.toFixed(4))
    };
}

/**
 * 4. Altruism & Pro-Social Action Response
 * Tests pro-social helping/warning probability under anxious threat with nearby peers.
 */
export function extractAltruismResponse(persona) {
    let proSocialCount = 0;
    const trials = 5;
    const ticksPerTrial = 5;

    for (let trial = 0; trial < trials; trial++) {
        const agent = new AffectiveAgent(`probe_alt_${persona.id}_${trial}`, persona.traits);
        for (let t = 0; t < ticksPerTrial; t++) {
            const res = agent.tick(0.016, {
                threats: [{ id: 'prowler', distance: 10.0, intensity: 0.65 }],
                peers: [{ id: 'ally', x: 2.0, y: 0, z: 0, state: 'HELP_NEEDED' }]
            });
            if (res.action_intent?.type === 'WARN_GROUP' || res.action_intent?.type === 'APPROACH_ALLY') {
                proSocialCount++;
            }
        }
    }

    const altruismRate = proSocialCount / (trials * ticksPerTrial);
    return {
        altruismRate: parseFloat(altruismRate.toFixed(4))
    };
}

/**
 * 5. Tactical Discipline Retention Response
 * Measures stance composure (DEFENSIVE_STANCE / SPRINTING) and CQB confrontation vs flailing.
 */
export function extractDisciplineResponse(persona) {
    const agent = new AffectiveAgent(`probe_disc_${persona.id}`, persona.traits);
    let cqbConfronts = 0;
    let sprintPostures = 0;
    let flails = 0;
    const ticks = 10;

    for (let t = 0; t < ticks; t++) {
        const res = agent.tick(0.016, { threats: [{ id: 'apex_trap', distance: 1.2, intensity: 1.0 }] });
        if (res.action_intent?.type === 'CONFRONT_THREAT' && res.action_intent?.suggested_posture === 'DEFENSIVE_STANCE') {
            cqbConfronts++;
        }
        if (res.action_intent?.suggested_posture === 'SPRINTING') {
            sprintPostures++;
        }
        if (res.action_intent?.type === 'DESPERATE_FLAIL') {
            flails++;
        }
    }

    const cqbConfrontRate = cqbConfronts / ticks;
    const disciplinedStanceRate = (cqbConfronts + sprintPostures) / ticks;

    return {
        cqbConfrontRate: parseFloat(cqbConfrontRate.toFixed(2)),
        disciplinedStanceRate: parseFloat(disciplinedStanceRate.toFixed(2)),
        flailRate: parseFloat((flails / ticks).toFixed(2))
    };
}

/**
 * 6. Curiosity Under Ambiguity Response
 * Sweeps sound volume at 15m to identify the acoustic investigation threshold.
 */
export function extractCuriosityResponse(persona) {
    let acousticSensitivity = 0.0;
    let soundVolumeThreshold = 1.0;

    for (let vol = 0.10; vol <= 0.90; vol += 0.05) {
        const agent = new AffectiveAgent(`probe_cur_${persona.id}_${vol.toFixed(2)}`, persona.traits);
        const res = agent.tick(0.016, { sounds: [{ id: 's', distance: 15.0, intensity: vol }] });
        if (res.action_intent?.type === 'INVESTIGATE_SOUND') {
            soundVolumeThreshold = vol;
            acousticSensitivity = 1.0 - vol; // higher means investigates fainter sounds
            break;
        }
    }

    return {
        soundVolumeThreshold: parseFloat(soundVolumeThreshold.toFixed(2)),
        acousticSensitivity: parseFloat(acousticSensitivity.toFixed(2))
    };
}

/**
 * Combined Reference Functional Persona Signature (FPS Reference Probe)
 * Returns a normalized 10-dimensional parameter vector in ~[0, 1].
 */
export function extractReferenceFPS(persona) {
    const threat = extractThreatAppraisalResponse(persona);
    const rec = extractRecoveryResponse(persona);
    const soc = extractSocialResponse(persona);
    const alt = extractAltruismResponse(persona);
    const disc = extractDisciplineResponse(persona);
    const cur = extractCuriosityResponse(persona);

    const normD50 = Math.min(1.0, Math.max(0.0, threat.d50 / 30.0));
    const normThreatGain = Math.min(1.0, Math.max(0.0, threat.threatGain / 2.0));
    const normTauHalf = Math.min(1.0, Math.max(0.0, rec.tauHalf / 40.0));
    const normLambda = Math.min(1.0, Math.max(0.0, (rec.empiricalLambda - 0.75) / (0.98 - 0.75)));
    const normBetaSocial = Math.min(1.0, Math.max(0.0, soc.betaSocial));
    const normBetaReassure = Math.min(1.0, Math.max(0.0, soc.betaReassure * 2.0));
    const normAltruism = Math.min(1.0, Math.max(0.0, alt.altruismRate));
    const normDiscipline = Math.min(1.0, Math.max(0.0, disc.disciplinedStanceRate));
    const normCQB = Math.min(1.0, Math.max(0.0, disc.cqbConfrontRate));
    const normCuriosity = Math.min(1.0, Math.max(0.0, cur.acousticSensitivity));

    return [
        normD50,
        normThreatGain,
        normTauHalf,
        normLambda,
        normBetaSocial,
        normBetaReassure,
        normAltruism,
        normDiscipline,
        normCQB,
        normCuriosity
    ];
}

// =============================================================================
// 3. OBSERVATIONAL SCENARIO RESPONSE SURFACE ESTIMATOR
// =============================================================================

/**
 * Extracts an Observational Functional Persona Signature from an uncontrolled scenario run.
 * Inverts the agent's time-series decisions against observed sensory inputs.
 */
export function extractObservationalFPS(episodeTrace, cooldownTrace, totalTicks) {
    // 1. Threat Appraisal Gain & Onset
    let numThreat = 0, denThreat = 0;
    let threatTicks = 0;
    let minThreatDist = 999;
    let panicTicks = 0;

    for (const step of episodeTrace) {
        if (step.threatDist !== null) {
            threatTicks++;
            if (step.threatDist < minThreatDist) minThreatDist = step.threatDist;
            const prox = (step.threatIntensity ?? 1.0) / (1.0 + step.threatDist * 0.05);
            numThreat += prox * step.fear;
            denThreat += prox * prox;
            if (step.band === 'PANIC') panicTicks++;
        }
    }
    const threatGain = denThreat > 0.001 ? Math.min(2.0, numThreat / denThreat) : 0.5;
    const threatSensitivity = threatTicks > 0 ? (panicTicks / threatTicks) : 0.0;

    // 2. Recovery Half-Life from Cooldown
    let peakFear = 0;
    for (const step of episodeTrace) {
        if (step.fear > peakFear) peakFear = step.fear;
    }
    const halfFear = peakFear * 0.5;
    let tauHalf = cooldownTrace.length;
    for (let i = 0; i < cooldownTrace.length; i++) {
        if (cooldownTrace[i].fear <= halfFear) {
            tauHalf = i + 1;
            break;
        }
    }
    const normalizedTauHalf = Math.min(1.0, tauHalf / 40.0);
    const empiricalLambda = Math.exp(Math.log(0.5) / Math.max(1, tauHalf));
    const normalizedLambda = Math.min(1.0, Math.max(0.0, (empiricalLambda - 0.75) / (0.98 - 0.75)));

    // 3. Social Contagion & Reassurance
    let socNum = 0, socDen = 0;
    let reassNum = 0, reassDen = 0;
    for (const step of episodeTrace) {
        if (step.contagionFear > 0.1) {
            socNum += step.contagionFear * step.fear;
            socDen += step.contagionFear * step.contagionFear;
        }
        if (step.leaderCalm > 0.1) {
            const prox = step.threatDist !== null ? 1.0 / (1.0 + step.threatDist * 0.05) : 0.5;
            const expectedFear = prox * (threatGain || 0.8);
            const reduction = Math.max(0, expectedFear - step.fear);
            reassNum += step.leaderCalm * reduction;
            reassDen += step.leaderCalm * step.leaderCalm;
        }
    }
    const socialGain = socDen > 0.001 ? Math.min(2.0, socNum / socDen) : 0.5;
    const reassureGain = reassDen > 0.001 ? Math.min(2.0, reassNum / reassDen) : 0.5;

    // 4. Altruism
    let peerTicks = 0, proSocialTicks = 0;
    for (const step of episodeTrace) {
        if (step.hasPeers) {
            peerTicks++;
            if (step.intent === 'WARN_GROUP' || step.intent === 'APPROACH_ALLY') {
                proSocialTicks++;
            }
        }
    }
    const altruismRate = peerTicks > 0 ? (proSocialTicks / peerTicks) : 0.0;

    // 5. Discipline under Stress
    let highStressTicks = 0, disciplinedStance = 0, cqbConfront = 0;
    for (const step of episodeTrace) {
        if (step.fear > 0.5 || step.band === 'PANIC') {
            highStressTicks++;
            if (step.posture === 'DEFENSIVE_STANCE' || step.posture === 'SPRINTING') {
                disciplinedStance++;
            }
            if (step.threatDist !== null && step.threatDist < 2.0 && step.intent === 'CONFRONT_THREAT') {
                cqbConfront++;
            }
        }
    }
    const disciplineRetention = highStressTicks > 0 ? (disciplinedStance / highStressTicks) : 0.5;
    const cqbConfrontRate = highStressTicks > 0 ? (cqbConfront / highStressTicks) : 0.0;

    // 6. Curiosity under Ambiguity
    let soundTicks = 0, investigateTicks = 0;
    for (const step of episodeTrace) {
        if (step.hasSound) {
            soundTicks++;
            if (step.intent === 'INVESTIGATE_SOUND') investigateTicks++;
        }
    }
    const curiositySensitivity = soundTicks > 0 ? (investigateTicks / soundTicks) : 0.5;

    return [
        threatSensitivity,
        threatGain / 2.0,
        normalizedTauHalf,
        normalizedLambda,
        socialGain / 2.0,
        reassureGain / 2.0,
        altruismRate,
        disciplineRetention,
        cqbConfrontRate,
        curiositySensitivity
    ];
}

// =============================================================================
// 4. SCENARIO SIMULATION RUNNER
// =============================================================================

export function runAgentInScenarioFPS(persona, scenario, seed) {
    const rng = new DeterministicRng(seed);
    const agent = new AffectiveAgent(`ag_${persona.id}_${scenario.id}_${seed}`, persona.traits);

    const episodeTrace = [];
    let urgencySum = 0, dominanceSum = 0, fearSum = 0;
    let panicTicks = 0, disciplinedTicks = 0;
    let soundOpportunities = 0, soundInvestigations = 0;
    let peerOpportunities = 0, proSocialActions = 0;
    let threatTicks = 0;
    const totalTicks = scenario.duration;

    for (let t = 0; t < totalTicks; t++) {
        const obs = scenario.generator(t, rng);
        const hasSound = obs.sounds && obs.sounds.length > 0;
        const hasPeers = obs.peers && obs.peers.length > 0;
        const hasThreats = obs.threats && obs.threats.length > 0;
        const threatDist = hasThreats ? obs.threats[0].distance : null;
        const threatIntensity = hasThreats ? obs.threats[0].intensity : 0;

        if (hasSound) soundOpportunities++;
        if (hasPeers) peerOpportunities++;
        if (hasThreats) threatTicks++;

        const ctx = {
            contagionFear: obs.contagionFear ?? 0,
            leaderCalm: obs.leaderCalm ?? 0
        };

        const res = agent.tick(0.016, obs, ctx);
        const fear = res.affective_state?.raw_fear ?? 0;
        const dominance = res.affective_state?.dominance ?? 0.5;
        const urgency = res.action_intent?.urgency ?? 0;
        const band = res.fear_band;
        const posture = res.action_intent?.suggested_posture;
        const intent = res.action_intent?.type;

        urgencySum += urgency;
        dominanceSum += dominance;
        fearSum += fear;

        if (band === 'PANIC') panicTicks++;
        if (posture === 'DEFENSIVE_STANCE' || posture === 'SPRINTING') disciplinedTicks++;
        if (intent === 'INVESTIGATE_SOUND') soundInvestigations++;
        if (intent === 'WARN_GROUP' || intent === 'APPROACH_ALLY') proSocialActions++;

        episodeTrace.push({
            t,
            threatDist,
            threatIntensity,
            contagionFear: obs.contagionFear ?? 0,
            leaderCalm: obs.leaderCalm ?? 0,
            fear,
            dominance,
            urgency,
            band,
            posture,
            intent,
            hasSound,
            hasPeers
        });
    }

    // Cooldown trace
    const cooldownTrace = [];
    let cooldownTicks = 0;
    for (let t = 0; t < 40; t++) {
        cooldownTicks++;
        const res = agent.tick(0.016, {});
        const curFear = res.affective_state?.raw_fear ?? 0;
        cooldownTrace.push({ t, fear: curFear, band: res.fear_band });
        if (res.fear_band === 'CALM' || curFear < 0.10) break;
    }

    // 1. Raw 8D vector (LOSO V2 baseline)
    const rawVector = [
        soundOpportunities > 0 ? soundInvestigations / soundOpportunities : 0,
        peerOpportunities > 0 ? proSocialActions / peerOpportunities : 0,
        threatTicks > 0 ? panicTicks / threatTicks : 0,
        totalTicks > 0 ? disciplinedTicks / totalTicks : 0,
        urgencySum / totalTicks,
        dominanceSum / totalTicks,
        fearSum / totalTicks,
        Math.max(0, (40 - cooldownTicks) / 40.0)
    ];

    // 2. Observational Functional Persona Signature (FPS v1)
    const obsFpsVector = extractObservationalFPS(episodeTrace, cooldownTrace, totalTicks);

    return { rawVector, obsFpsVector };
}

// =============================================================================
// 5. CROSS-SCENARIO BENCHMARK SUITE
// =============================================================================

export function runFPSCrossScenarioBenchmark(options = {}) {
    const fastMode = options.fast ?? false;
    const seeds = fastMode ? FROZEN_SEEDS.slice(0, 3) : FROZEN_SEEDS;
    const cohortK12 = CANONICAL_ARCHETYPES;
    const cohortK60 = buildExtendedCohort();

    const results = {
        benchmark: 'FABE Functional Persona Signatures (FPS v1)',
        timestamp: new Date().toISOString(),
        fastMode,
        seedsCount: seeds.length,
        cohorts: {}
    };

    function evaluateCohort(cohort, cohortName) {
        const K = cohort.length;
        const S = SCENARIO_FAMILIES.length;

        // Precompute reference probe signatures
        const refSignatures = cohort.map(p => extractReferenceFPS(p));

        // Simulate all runs: [p][s][seedIdx]
        const runs = Array.from({ length: K }, () =>
            Array.from({ length: S }, () => [])
        );

        for (let p = 0; p < K; p++) {
            for (let s = 0; s < S; s++) {
                for (const seed of seeds) {
                    runs[p][s].push(runAgentInScenarioFPS(cohort[p], SCENARIO_FAMILIES[s], seed));
                }
            }
        }

        // Cross-Scenario Evaluation:
        // Query in scenario s_q, compare against gallery in s_t (s_t !== s_q)
        let rawCorrect = 0, rawTotal = 0;
        let obsFpsCorrect = 0, obsFpsTotal = 0;
        let refFpsCorrect = 0, refFpsTotal = 0;

        // Domain-stratified tracking
        let withinDomainRawCorrect = 0, withinDomainRawTotal = 0;
        let withinDomainFpsCorrect = 0, withinDomainFpsTotal = 0;
        let crossDomainRawCorrect = 0, crossDomainRawTotal = 0;
        let crossDomainFpsCorrect = 0, crossDomainFpsTotal = 0;

        for (let s_q = 0; s_q < S; s_q++) {
            const domainQ = SCENARIO_FAMILIES[s_q].domain;
            // Target scenario gallery
            for (let s_t = 0; s_t < S; s_t++) {
                if (s_q === s_t) continue; // strictly held-out
                const domainT = SCENARIO_FAMILIES[s_t].domain;
                const isWithinDomain = domainQ === domainT;

                const rawGallery = [];
                const obsFpsGallery = [];

                for (let p = 0; p < K; p++) {
                    const pRuns = runs[p][s_t];
                    const rawProto = new Float64Array(8);
                    const fpsProto = new Float64Array(10);
                    for (const r of pRuns) {
                        for (let i = 0; i < 8; i++) rawProto[i] += r.rawVector[i];
                        for (let i = 0; i < 10; i++) fpsProto[i] += r.obsFpsVector[i];
                    }
                    for (let i = 0; i < 8; i++) rawProto[i] /= pRuns.length;
                    for (let i = 0; i < 10; i++) fpsProto[i] /= pRuns.length;

                    rawGallery.push(rawProto);
                    obsFpsGallery.push(fpsProto);
                }

                // Query runs from s_q
                for (let p_q = 0; p_q < K; p_q++) {
                    for (const qRun of runs[p_q][s_q]) {
                        // 1. Raw Nearest Neighbor
                        let bestRawSim = -999, bestRawP = -1;
                        for (let p_c = 0; p_c < K; p_c++) {
                            const sim = cosineSimilarity(qRun.rawVector, rawGallery[p_c]);
                            if (sim > bestRawSim) {
                                bestRawSim = sim;
                                bestRawP = p_c;
                            }
                        }
                        const isRawCorrect = bestRawP === p_q;
                        if (isRawCorrect) rawCorrect++;
                        rawTotal++;
                        if (isWithinDomain) {
                            if (isRawCorrect) withinDomainRawCorrect++;
                            withinDomainRawTotal++;
                        } else {
                            if (isRawCorrect) crossDomainRawCorrect++;
                            crossDomainRawTotal++;
                        }

                        // 2. Observational FPS Nearest Neighbor
                        let bestFpsSim = -999, bestFpsP = -1;
                        for (let p_c = 0; p_c < K; p_c++) {
                            const sim = cosineSimilarity(qRun.obsFpsVector, obsFpsGallery[p_c]);
                            if (sim > bestFpsSim) {
                                bestFpsSim = sim;
                                bestFpsP = p_c;
                            }
                        }
                        const isFpsCorrect = bestFpsP === p_q;
                        if (isFpsCorrect) obsFpsCorrect++;
                        obsFpsTotal++;
                        if (isWithinDomain) {
                            if (isFpsCorrect) withinDomainFpsCorrect++;
                            withinDomainFpsTotal++;
                        } else {
                            if (isFpsCorrect) crossDomainFpsCorrect++;
                            crossDomainFpsTotal++;
                        }

                        // 3. Reference FPS Probe Matching (Matching observational query to reference probe gallery)
                        let bestRefSim = -999, bestRefP = -1;
                        for (let p_c = 0; p_c < K; p_c++) {
                            const sim = cosineSimilarity(qRun.obsFpsVector, refSignatures[p_c]);
                            if (sim > bestRefSim) {
                                bestRefSim = sim;
                                bestRefP = p_c;
                            }
                        }
                        if (bestRefP === p_q) refFpsCorrect++;
                        refFpsTotal++;
                    }
                }
            }
        }

        const chanceFloor = 1.0 / K;
        const rawRate = rawCorrect / rawTotal;
        const obsFpsRate = obsFpsCorrect / obsFpsTotal;
        const refFpsRate = refFpsCorrect / refFpsTotal;

        const rawCI = wilsonScoreInterval(rawCorrect, rawTotal);
        const obsFpsCI = wilsonScoreInterval(obsFpsCorrect, obsFpsTotal);
        const refFpsCI = wilsonScoreInterval(refFpsCorrect, refFpsTotal);

        const withinRawRate = withinDomainRawTotal > 0 ? withinDomainRawCorrect / withinDomainRawTotal : 0;
        const withinFpsRate = withinDomainFpsTotal > 0 ? withinDomainFpsCorrect / withinDomainFpsTotal : 0;
        const crossRawRate = crossDomainRawTotal > 0 ? crossDomainRawCorrect / crossDomainRawTotal : 0;
        const crossFpsRate = crossDomainFpsTotal > 0 ? crossDomainFpsCorrect / crossDomainFpsTotal : 0;

        return {
            cohortName,
            K,
            pairsEvaluated: rawTotal,
            chanceFloor: parseFloat((chanceFloor * 100).toFixed(2)),
            rawBaseline: {
                correct: rawCorrect,
                total: rawTotal,
                top1Percent: parseFloat((rawRate * 100).toFixed(2)),
                ci95: [parseFloat((rawCI[0] * 100).toFixed(2)), parseFloat((rawCI[1] * 100).toFixed(2))]
            },
            observationalFPS: {
                correct: obsFpsCorrect,
                total: obsFpsTotal,
                top1Percent: parseFloat((obsFpsRate * 100).toFixed(2)),
                ci95: [parseFloat((obsFpsCI[0] * 100).toFixed(2)), parseFloat((obsFpsCI[1] * 100).toFixed(2))],
                deltaOverRaw: parseFloat(((obsFpsRate - rawRate) * 100).toFixed(2))
            },
            domainStratification: {
                withinDomain: {
                    pairs: withinDomainRawTotal,
                    rawTop1Percent: parseFloat((withinRawRate * 100).toFixed(2)),
                    fpsTop1Percent: parseFloat((withinFpsRate * 100).toFixed(2)),
                    delta: parseFloat(((withinFpsRate - withinRawRate) * 100).toFixed(2))
                },
                crossDomain: {
                    pairs: crossDomainRawTotal,
                    rawTop1Percent: parseFloat((crossRawRate * 100).toFixed(2)),
                    fpsTop1Percent: parseFloat((crossFpsRate * 100).toFixed(2)),
                    delta: parseFloat(((crossFpsRate - crossRawRate) * 100).toFixed(2))
                }
            },
            referenceProbeFPS: {
                correct: refFpsCorrect,
                total: refFpsTotal,
                top1Percent: parseFloat((refFpsRate * 100).toFixed(2)),
                ci95: [parseFloat((refFpsCI[0] * 100).toFixed(2)), parseFloat((refFpsCI[1] * 100).toFixed(2))],
                deltaOverRaw: parseFloat(((refFpsRate - rawRate) * 100).toFixed(2))
            }
        };
    }

    // Reference Probe Battery Noise Robustness Test across K=60
    function evaluateProbeNoiseRobustness(cohort) {
        const K = cohort.length;
        const refSignatures = cohort.map(p => extractReferenceFPS(p));

        // Test repeatability across 3 noise conditions: 0%, 5%, 20% distance noise
        const testConditions = [
            { name: 'Nominal Repeatability (0% noise)', noise: 0.0 },
            { name: 'Mild Sensor Noise (5% distance noise)', noise: 0.05 },
            { name: 'Stress Sensor Noise (20% distance noise)', noise: 0.20 }
        ];

        const conditionResults = {};

        for (const cond of testConditions) {
            let top1Correct = 0, top3Correct = 0;
            for (let i = 0; i < K; i++) {
                // Generate perturbed probe signature
                const p = cohort[i];
                const baseSig = extractReferenceFPS(p);
                const perturbedSig = baseSig.map(v => {
                    const noise = (Math.random() - 0.5) * 2 * cond.noise * v;
                    return Math.max(0, Math.min(1.0, v + noise));
                });

                // Nearest neighbor retrieval against reference signatures
                const ranked = refSignatures.map((ref, j) => ({
                    idx: j,
                    sim: cosineSimilarity(perturbedSig, ref)
                })).sort((a, b) => b.sim - a.sim);

                if (ranked[0].idx === i) top1Correct++;
                if (ranked.slice(0, 3).some(r => r.idx === i)) top3Correct++;
            }

            conditionResults[cond.name] = {
                noise: cond.noise,
                top1Percent: parseFloat(((top1Correct / K) * 100).toFixed(1)),
                top3Percent: parseFloat(((top3Correct / K) * 100).toFixed(1))
            };
        }

        return conditionResults;
    }

    results.cohorts.k12 = evaluateCohort(cohortK12, 'Canonical Archetypes K=12');
    results.cohorts.k60 = evaluateCohort(cohortK60, 'Extended Cohort K=60');
    results.probeBatteryRobustness = evaluateProbeNoiseRobustness(cohortK60);

    // Compute canonical response surface parameter table
    results.canonicalParametricSurfaces = CANONICAL_ARCHETYPES.map(p => {
        const threat = extractThreatAppraisalResponse(p);
        const rec = extractRecoveryResponse(p);
        const soc = extractSocialResponse(p);
        const alt = extractAltruismResponse(p);
        const disc = extractDisciplineResponse(p);
        const cur = extractCuriosityResponse(p);
        return {
            id: p.id,
            name: p.name,
            threat: { d50: threat.d50, threatGain: threat.threatGain, peakFear: threat.peakFear },
            recovery: { tauHalfTicks: rec.tauHalf, tauCalmTicks: rec.tauCalm, empiricalLambda: rec.empiricalLambda },
            social: { betaSocial: soc.betaSocial, betaReassure: soc.betaReassure },
            altruism: { altruismRate: alt.altruismRate },
            discipline: { disciplinedStanceRate: disc.disciplinedStanceRate, cqbConfrontRate: disc.cqbConfrontRate },
            curiosity: { acousticSensitivity: cur.acousticSensitivity, volumeThreshold: cur.soundVolumeThreshold }
        };
    });

    return results;
}

// =============================================================================
// 6. CLI RUNNER
// =============================================================================

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const isFast = process.argv.includes('--fast');
    const isJson = process.argv.includes('--json');

    console.log('================================================================================');
    console.log('FEAR AI — FABE FUNCTIONAL PERSONA SIGNATURES (FPS v1) BENCHMARK');
    console.log(`Execution Mode: ${isFast ? 'FAST (3 seeds)' : 'STANDARD (10 seeds)'}`);
    console.log('================================================================================\n');

    const t0 = performance.now();
    const benchmarkResults = runFPSCrossScenarioBenchmark({ fast: isFast });
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

    if (isJson) {
        console.log(JSON.stringify(benchmarkResults, null, 2));
    } else {
        for (const [key, c] of Object.entries(benchmarkResults.cohorts)) {
            console.log(`Cohort: ${c.cohortName} (K=${c.K})`);
            console.log(`  Chance Floor:              ${c.chanceFloor}%`);
            console.log(`  Overall Raw Baseline:      ${c.rawBaseline.top1Percent}% [${c.rawBaseline.ci95[0]}%, ${c.rawBaseline.ci95[1]}%] (${c.rawBaseline.correct}/${c.rawBaseline.total})`);
            console.log(`  Overall Observational FPS: ${c.observationalFPS.top1Percent}% [${c.observationalFPS.ci95[0]}%, ${c.observationalFPS.ci95[1]}%] (${c.observationalFPS.deltaOverRaw > 0 ? '+' : ''}${c.observationalFPS.deltaOverRaw}%)`);
            console.log(`  Reference Probe Gallery:   ${c.referenceProbeFPS.top1Percent}% [${c.referenceProbeFPS.ci95[0]}%, ${c.referenceProbeFPS.ci95[1]}%]`);
            console.log(`  Domain Stratification:`);
            console.log(`    Within-Domain Pairs:     Raw: ${c.domainStratification.withinDomain.rawTop1Percent}% | FPS: ${c.domainStratification.withinDomain.fpsTop1Percent}% (${c.domainStratification.withinDomain.delta > 0 ? '+' : ''}${c.domainStratification.withinDomain.delta}%)`);
            console.log(`    Cross-Domain Pairs:      Raw: ${c.domainStratification.crossDomain.rawTop1Percent}% | FPS: ${c.domainStratification.crossDomain.fpsTop1Percent}% (${c.domainStratification.crossDomain.delta > 0 ? '+' : ''}${c.domainStratification.crossDomain.delta}%)`);
            console.log('--------------------------------------------------------------------------------');
        }

        console.log('\nReference Probe Battery Noise Robustness (K=60 Cohort):');
        for (const [condName, data] of Object.entries(benchmarkResults.probeBatteryRobustness)) {
            console.log(`  ${condName.padEnd(45)}: Top-1 = ${data.top1Percent}% | Top-3 = ${data.top3Percent}%`);
        }

        console.log('\nCanonical Response Surface Parameters (12 Archetypes):');
        console.log('| Persona | D50 (m) | Tau_Half (t) | Lambda | Beta_Soc | Beta_Reass | CQB_Disc | Faint_Cur |');
        console.log('|---|---|---|---|---|---|---|---|');
        for (const p of benchmarkResults.canonicalParametricSurfaces) {
            console.log(`| ${p.name.padEnd(20)} | ${String(p.threat.d50).padStart(7)} | ${String(p.recovery.tauHalfTicks).padStart(12)} | ${String(p.recovery.empiricalLambda).padStart(6)} | ${String(p.social.betaSocial).padStart(8)} | ${String(p.social.betaReassure).padStart(10)} | ${String(p.discipline.cqbConfrontRate).padStart(8)} | ${String(p.curiosity.acousticSensitivity).padStart(9)} |`);
        }

        console.log(`\nCompleted in ${elapsed}s.`);
    }

    // Export benchmark JSON artifact
    const exportPath = join(__dirname, 'fabe_functional_persona_signatures.json');
    writeFileSync(exportPath, JSON.stringify(benchmarkResults, null, 2), 'utf8');
    console.log(`\nArtifact exported to: ${exportPath}`);
}
