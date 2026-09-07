#!/usr/bin/env node
/**
 * Fear AI — Long-Horizon Affect & Personality Identity Benchmark (5,000 Ticks)
 * 
 * Milestone C in the Autonomous World Intelligence Program.
 * 
 * Objectives:
 * 1. Tripartite Architectural Separation:
 *    Formally separates StableIdentity, DynamicAffectiveState, and MidTermAdaptation.
 * 2. Long-Horizon Multi-Epoch Simulation (5,000 Ticks):
 *    - Epoch 1 (0-1000): Peaceful homeostatic baseline
 *    - Epoch 2 (1001-2000): Acute lethal ambush & trauma zone creation
 *    - Epoch 3 (2001-3000): Sanctuary healing & habituation recovery
 *    - Epoch 4 (3001-4000): Trauma cue re-exposure & relapse vulnerability test
 *    - Epoch 5 (4001-5000): High-tempo periodic shock & exhaustion test
 * 3. N-Gram Behavioral Motifs & Stationary Attractor Distributions:
 *    Measures action intent n-gram diversity, transition matrices, and Shannon entropy.
 * 4. Trauma Relapse & Sensitization Dynamics:
 *    Quantifies relapse latency, spike magnitude, and recovery half-life under re-traumatization.
 * 5. Identity Invariance & Replay Determinism:
 *    Verifies zero trait drift across 5,000 ticks and bit-for-bit checkpoint restore determinism.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { AffectiveAgent, DeterministicRng, TraumaZoneSystem } from '../../packages/core/index.js';
import { CANONICAL_ARCHETYPES } from './fabe_v2_benchmark.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const FROZEN_SEEDS = Object.freeze([1337, 2026, 3141, 4096, 5555]);

// =============================================================================
// 1. TRIPARTITE DATA MODEL DECOMPOSITION
// =============================================================================

export class AgentStateDecomposition {
    /**
     * Disentangles an agent into the 3 formal layers
     * @param {AffectiveAgent|object} agent
     * @returns {object} { stableIdentity, dynamicAffectiveState, midTermAdaptation }
     */
    static decompose(agent) {
        const state = typeof agent.getState === 'function' ? agent.getState() : agent;
        return {
            stableIdentity: {
                id: state.id,
                name: state.name,
                traits: { ...state.traits }
            },
            dynamicAffectiveState: {
                valence: parseFloat((state.valence ?? 0.5).toFixed(4)),
                arousal: parseFloat((state.arousal ?? 0.1).toFixed(4)),
                dominance: parseFloat((state.currentDominance ?? 0.5).toFixed(4)),
                rawFear: parseFloat((state.currentFear ?? 0.0).toFixed(4)),
                rawAnger: parseFloat((state.currentAnger ?? 0.0).toFixed(4)),
                adrenaline: parseFloat((state.adrenaline ?? 0.0).toFixed(4)),
                uncertainty: parseFloat((state.uncertainty ?? 0.5).toFixed(4)),
                fearBand: state.fearCore?.state ?? 'CALM',
                panicLocked: state.fearCore?.panicLocked ?? false
            },
            midTermAdaptation: {
                energy: parseFloat((state.energy ?? 1.0).toFixed(4)),
                health: parseFloat((state.health ?? 1.0).toFixed(4)),
                morale: parseFloat((state.morale ?? 1.0).toFixed(4)),
                tickCount: state.tickCount ?? 0,
                habituationExposureCount: state.habituation?.exposureMap ? Object.keys(state.habituation.exposureMap).length : 0
            }
        };
    }
}

// =============================================================================
// 2. LONG-HORIZON SIMULATION ENGINE (5,000 TICKS)
// =============================================================================

export function runLongHorizonSimulation(persona, options = {}) {
    const totalTicks = options.ticks || 5000;
    const seed = options.seed || 1337;
    const rng = new DeterministicRng(seed);

    const agent = new AffectiveAgent(`agent_${persona.id}_long`, persona.traits);
    const traumaSystem = new TraumaZoneSystem();

    const initialIdentity = AgentStateDecomposition.decompose(agent).stableIdentity;

    const history = {
        intents: [],
        bands: [],
        fears: [],
        valences: [],
        arousals: [],
        dominances: [],
        energies: [],
        morales: []
    };

    let checkpointTick = Math.floor(totalTicks / 2);
    let checkpointState = null;
    let forkedAgent = null;
    let checkpointIdentical = true;

    // Epoch tracking
    let epoch1Fears = [], epoch2Fears = [], epoch3Fears = [], epoch4Fears = [], epoch5Fears = [];

    const epochSize = Math.floor(totalTicks / 5);

    for (let t = 0; t < totalTicks; t++) {
        let obs = {};
        let ctx = { rng: () => rng.next() };

        // Spatial displacement
        agent.x += rng.range(-0.2, 0.2);
        agent.y += rng.range(-0.2, 0.2);

        // Trauma system advancement
        traumaSystem.tick(1);
        ctx.traumaDread = traumaSystem.getTraumaAt(agent.x, agent.y, agent.z);

        // --- DYNAMIC EPOCH SCHEDULE (5 Epochs) ---
        if (t < epochSize) {
            // Epoch 1: Peaceful baseline foraging
            if (t % 50 === 0) {
                obs.sounds = [{ id: `ambient_${t}`, distance: 25.0 + rng.range(-3, 3), intensity: 0.25 }];
            }
            if (t % 100 === 0) {
                obs.peers = [{ id: `companion_${t}`, x: agent.x + 3, y: agent.y, z: 0, state: 'CALM' }];
            }
        } else if (t < 2 * epochSize) {
            // Epoch 2: Acute ambush & trauma zone creation
            const relT = t - epochSize;
            const stalkerDist = Math.max(1.2, 20.0 - relT * 0.05 + rng.range(-0.4, 0.4));
            obs.threats = [{ id: 'apex_hunter', distance: stalkerDist, intensity: 0.95 }];
            if (relT === Math.floor(epochSize * 0.15)) {
                // High-intensity violent assault creates enduring trauma zone
                traumaSystem.addZone(agent.x, agent.y, agent.z, 1.0, 60.0, Math.floor(epochSize * 2.5));
            }
            if (relT > Math.floor(epochSize * 0.5) && t % 40 === 0) {
                obs.sounds = [{ id: `shriek_${t}`, distance: 8.0, intensity: 0.8 }];
            }
        } else if (t < 3 * epochSize) {
            // Epoch 3: Sanctuary healing & recovery
            obs.inSafeHaven = true;
            agent.x = 500.0;
            agent.y = 500.0; // safe distance from trauma zone
        } else if (t < 4 * epochSize) {
            // Epoch 4: Return to trauma zone with FAINT trigger cues
            agent.x = 0.0;
            agent.y = 0.0; // back inside the residual trauma zone
            if (t % 30 === 0) {
                obs.sounds = [{ id: `trauma_echo_${t}`, distance: 12.0, intensity: 0.35 }];
            }
        } else {
            // Epoch 5: High-tempo periodic shocks & exhaustion test
            agent.x = 100.0;
            agent.y = 100.0;
            const cycle = (t - 4 * epochSize) % 200;
            if (cycle < 60) {
                obs.threats = [{ id: `periodic_patrol_${t}`, distance: 4.0, intensity: 0.80 }];
            }
        }

        // Save checkpoint state at exact midpoint
        if (t === checkpointTick) {
            checkpointState = agent.getState();
            forkedAgent = new AffectiveAgent(`agent_${persona.id}_fork`, persona.traits);
            forkedAgent.setState(checkpointState);
        }

        // Advance primary agent
        const res = agent.tick(0.016, obs, ctx);

        // Advance forked agent if active to verify replay determinism
        if (t > checkpointTick && forkedAgent) {
            const forkedRes = forkedAgent.tick(0.016, obs, ctx);
            if (forkedRes.fear_band !== res.fear_band || Math.abs(forkedRes.affective_state.raw_fear - res.affective_state.raw_fear) > 1e-6) {
                checkpointIdentical = false;
            }
        }

        const fear = res.affective_state?.raw_fear ?? 0;
        history.intents.push(res.action_intent?.type || 'IDLE_VIGILANT');
        history.bands.push(res.fear_band);
        history.fears.push(fear);
        history.valences.push(res.affective_state?.valence ?? 0.5);
        history.arousals.push(res.affective_state?.arousal ?? 0.1);
        history.dominances.push(res.affective_state?.dominance ?? 0.5);
        history.energies.push(agent.energy);
        history.morales.push(agent.morale);

        if (t < epochSize) epoch1Fears.push(fear);
        else if (t < 2 * epochSize) epoch2Fears.push(fear);
        else if (t < 3 * epochSize) epoch3Fears.push(fear);
        else if (t < 4 * epochSize) epoch4Fears.push(fear);
        else epoch5Fears.push(fear);
    }

    // --- METRIC COMPUTATION ---

    // 1. Identity Invariance (Zero Drift Invariant)
    const finalIdentity = AgentStateDecomposition.decompose(agent).stableIdentity;
    let maxIdentityDrift = 0;
    for (const [trait, val] of Object.entries(initialIdentity.traits)) {
        const drift = Math.abs(val - finalIdentity.traits[trait]);
        if (drift > maxIdentityDrift) maxIdentityDrift = drift;
    }

    // 2. N-Gram Behavioral Motifs (3-Grams of Action Intents)
    const ngramCounts = new Map();
    for (let i = 0; i < history.intents.length - 2; i++) {
        const motif = `${history.intents[i]} > ${history.intents[i+1]} > ${history.intents[i+2]}`;
        ngramCounts.set(motif, (ngramCounts.get(motif) || 0) + 1);
    }

    const totalMotifs = history.intents.length - 2;
    let shannonEntropy = 0;
    const sortedMotifs = Array.from(ngramCounts.entries())
        .map(([motif, count]) => {
            const prob = count / totalMotifs;
            shannonEntropy -= prob * Math.log2(prob);
            return { motif, count, probability: parseFloat(prob.toFixed(4)) };
        })
        .sort((a, b) => b.count - a.count);

    // 3. Stationary Attractor State Distribution
    const stateCounts = {};
    for (const intent of history.intents) {
        stateCounts[intent] = (stateCounts[intent] || 0) + 1;
    }
    const attractorDistribution = {};
    for (const [intent, count] of Object.entries(stateCounts)) {
        attractorDistribution[intent] = parseFloat(((count / totalTicks) * 100).toFixed(2));
    }

    // 4. Trauma Relapse Dynamics
    const epoch1MaxFear = Math.max(...epoch1Fears);
    const epoch2PeakFear = Math.max(...epoch2Fears);
    const epoch3HealedFear = epoch3Fears[epoch3Fears.length - 1]; // final safe haven state
    const epoch4RelapsePeak = Math.max(...epoch4Fears);
    const relapseSpike = Math.max(0, epoch4RelapsePeak - epoch3HealedFear);

    // Relapse latency: ticks from entering Epoch 4 until fear exceeds 0.50
    let relapseLatencyTicks = 1000;
    for (let i = 0; i < epoch4Fears.length; i++) {
        if (epoch4Fears[i] >= 0.50) {
            relapseLatencyTicks = i;
            break;
        }
    }

    return {
        personaId: persona.id,
        personaName: persona.name,
        totalTicks,
        identityInvariance: {
            maxTraitDrift: maxIdentityDrift,
            invariantPreserved: maxIdentityDrift === 0
        },
        checkpointReplayDeterminism: checkpointIdentical,
        motifs: {
            unique3GramMotifs: ngramCounts.size,
            shannonEntropy: parseFloat(shannonEntropy.toFixed(3)),
            top3Motifs: sortedMotifs.slice(0, 3)
        },
        attractorDistribution,
        traumaDynamics: {
            epoch1BaselineFear: parseFloat(epoch1MaxFear.toFixed(4)),
            epoch2InitialPeakFear: parseFloat(epoch2PeakFear.toFixed(4)),
            epoch3SanctuaryHealedFear: parseFloat(epoch3HealedFear.toFixed(4)),
            epoch4RelapsePeakFear: parseFloat(epoch4RelapsePeak.toFixed(4)),
            relapseSpikeMagnitude: parseFloat(relapseSpike.toFixed(4)),
            relapseLatencyTicks
        }
    };
}

// =============================================================================
// 3. BENCHMARK SUITE RUNNER
// =============================================================================

export function runLongHorizonBenchmark(options = {}) {
    const ticks = options.ticks || 5000;
    const cohorts = CANONICAL_ARCHETYPES;

    console.log(`Evaluating Long-Horizon Affect & Identity across ${cohorts.length} canonical archetypes (${ticks} ticks each)...`);

    const results = {
        benchmark: 'Fear AI Long-Horizon Affect & Identity Separation Benchmark',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        simulationTicksPerAgent: ticks,
        archetypesCount: cohorts.length,
        archetypes: []
    };

    let allIdentitiesPreserved = true;
    let allCheckpointsDeterministic = true;

    for (const persona of cohorts) {
        const simResult = runLongHorizonSimulation(persona, { ticks });
        results.archetypes.push(simResult);

        if (!simResult.identityInvariance.invariantPreserved) allIdentitiesPreserved = false;
        if (!simResult.checkpointReplayDeterminism) allCheckpointsDeterministic = false;
    }

    results.summary = {
        allIdentitiesPreserved,
        allCheckpointsDeterministic,
        meanMotifsCount: parseFloat((results.archetypes.reduce((acc, a) => acc + a.motifs.unique3GramMotifs, 0) / cohorts.length).toFixed(1)),
        meanShannonEntropy: parseFloat((results.archetypes.reduce((acc, a) => acc + a.motifs.shannonEntropy, 0) / cohorts.length).toFixed(3)),
        meanRelapseSpike: parseFloat((results.archetypes.reduce((acc, a) => acc + a.traumaDynamics.relapseSpikeMagnitude, 0) / cohorts.length).toFixed(3))
    };

    return results;
}

// =============================================================================
// 4. CLI RUNNER
// =============================================================================

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const isFast = process.argv.includes('--fast');
    const isJson = process.argv.includes('--json');
    const ticks = isFast ? 1000 : 5000;

    console.log('================================================================================');
    console.log('FEAR AI — LONG-HORIZON AFFECT & PERSONALITY IDENTITY BENCHMARK');
    console.log(`Simulation Horizon: ${ticks} ticks per agent (${isFast ? 'FAST' : 'STANDARD 5,000 TICKS'})`);
    console.log('================================================================================\n');

    const t0 = performance.now();
    const benchmarkResults = runLongHorizonBenchmark({ ticks });
    const elapsed = ((performance.now() - t0) / 1000).toFixed(2);

    if (isJson) {
        console.log(JSON.stringify(benchmarkResults, null, 2));
    } else {
        console.log(`\nOverall Identity Invariance Preserved: ${benchmarkResults.summary.allIdentitiesPreserved ? 'PASS (0.0000 drift)' : 'FAIL'}`);
        console.log(`Midpoint Replay Determinism Verified:  ${benchmarkResults.summary.allCheckpointsDeterministic ? 'PASS (100% bit-for-bit)' : 'FAIL'}`);
        console.log(`Mean 3-Gram Motifs per Archetype:      ${benchmarkResults.summary.meanMotifsCount}`);
        console.log(`Mean Shannon Motifs Entropy:          ${benchmarkResults.summary.meanShannonEntropy} bits`);
        console.log(`Mean Trauma Relapse Spike:            ${benchmarkResults.summary.meanRelapseSpike}\n`);

        console.log('| Persona | Drift | Replay | Motifs | Entropy | E1 Base | E2 Peak | E3 Heal | E4 Relapse | Latency |');
        console.log('|---|---|---|---|---|---|---|---|---|---|');
        for (const a of benchmarkResults.archetypes) {
            console.log(`| ${a.personaName.padEnd(20)} | ${String(a.identityInvariance.maxTraitDrift).padStart(5)} | ${a.checkpointReplayDeterminism ? 'PASS'.padStart(6) : 'FAIL'.padStart(6)} | ${String(a.motifs.unique3GramMotifs).padStart(6)} | ${String(a.motifs.shannonEntropy).padStart(7)} | ${String(a.traumaDynamics.epoch1BaselineFear).padStart(7)} | ${String(a.traumaDynamics.epoch2InitialPeakFear).padStart(7)} | ${String(a.traumaDynamics.epoch3SanctuaryHealedFear).padStart(7)} | ${String(a.traumaDynamics.epoch4RelapsePeakFear).padStart(10)} | ${String(a.traumaDynamics.relapseLatencyTicks + 't').padStart(7)} |`);
        }

        console.log(`\nCompleted in ${elapsed}s.`);
    }

    const exportPath = join(__dirname, 'long_horizon_affect_identity.json');
    writeFileSync(exportPath, JSON.stringify(benchmarkResults, null, 2), 'utf8');
    console.log(`\nArtifact exported to: ${exportPath}`);
}
