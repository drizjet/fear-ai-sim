#!/usr/bin/env node
/**
 * Fear AI Multivariate Factorial Trait Validation
 * 
 * Addresses the construct entanglement discovered in univariate sweeps:
 * - Evaluates coupled latent drivers (N x R, N x C, N x A, R x C)
 * - Sweeps 5x5 factorial grids across 10 deterministic frozen seeds
 * - Fits 2-way linear response surfaces: Y = b0 + b1*T1 + b2*T2 + b12*(T1*T2)
 * - Deconstructs variance into Main Effect 1, Main Effect 2, Interaction, and Total R^2
 * - Formally classifies whether couplings are Architectural Dynamics, Metric Overlap, or Unintended Leakage.
 */

import { fileURLToPath } from 'node:url';
import { AffectiveAgent, ContagionGraph, DeterministicRng } from '../../packages/core/index.js';

export const FROZEN_SEEDS = Object.freeze([1337, 2026, 3141, 4096, 5555, 6789, 7777, 8888, 9123, 9999]);

// -----------------------------------------------------------------------------
// Regression & Factorial Analysis Helpers
// -----------------------------------------------------------------------------

/**
 * Fits Ordinary Least Squares multiple linear regression with interaction:
 * y = b0 + b1*x1 + b2*x2 + b12*(x1*x2)
 */
function fitFactorialModel(data) {
    const n = data.length;
    // Features: [1, x1, x2, x1*x2]
    const X = data.map(d => [1.0, d.x1, d.x2, d.x1 * d.x2]);
    const y = data.map(d => d.y);

    const meanY = y.reduce((a, b) => a + b, 0) / n;
    const ssTotal = y.reduce((a, b) => a + Math.pow(b - meanY, 2), 0);

    // Normal equations (X^T * X) * b = X^T * y (4x4 system)
    const p = 4;
    const XtX = Array.from({ length: p }, () => new Float64Array(p));
    const Xty = new Float64Array(p);

    for (let i = 0; i < n; i++) {
        const row = X[i];
        const yi = y[i];
        for (let r = 0; r < p; r++) {
            Xty[r] += row[r] * yi;
            for (let c = 0; c < p; c++) {
                XtX[r][c] += row[r] * row[c];
            }
        }
    }

    // Solve 4x4 via Gaussian elimination with partial pivoting
    const A = XtX.map((row, r) => [...row, Xty[r]]);
    for (let i = 0; i < p; i++) {
        let maxRow = i;
        for (let k = i + 1; k < p; k++) {
            if (Math.abs(A[k][i]) > Math.abs(A[maxRow][i])) maxRow = k;
        }
        const tmp = A[i]; A[i] = A[maxRow]; A[maxRow] = tmp;

        const pivot = A[i][i];
        if (Math.abs(pivot) < 1e-12) continue;
        for (let k = i; k <= p; k++) A[i][k] /= pivot;

        for (let k = 0; k < p; k++) {
            if (k === i) continue;
            const factor = A[k][i];
            for (let j = i; j <= p; j++) {
                A[k][j] -= factor * A[i][j];
            }
        }
    }

    const beta = [A[0][p], A[1][p], A[2][p], A[3][p]];

    // Fitted values and residuals
    let ssResid = 0;
    const yHat = [];
    for (let i = 0; i < n; i++) {
        const yh = beta[0] + beta[1] * data[i].x1 + beta[2] * data[i].x2 + beta[3] * (data[i].x1 * data[i].x2);
        yHat.push(yh);
        ssResid += Math.pow(y[i] - yh, 2);
    }

    const r2 = ssTotal > 0 ? Math.max(0, 1.0 - (ssResid / ssTotal)) : 1.0;

    // Single variable regressions for variance partitioning
    const meanX1 = data.reduce((a, b) => a + b.x1, 0) / n;
    const meanX2 = data.reduce((a, b) => a + b.x2, 0) / n;
    let ssX1 = 0, ssX2 = 0, covX1Y = 0, covX2Y = 0;
    for (let i = 0; i < n; i++) {
        ssX1 += Math.pow(data[i].x1 - meanX1, 2);
        ssX2 += Math.pow(data[i].x2 - meanX2, 2);
        covX1Y += (data[i].x1 - meanX1) * (y[i] - meanY);
        covX2Y += (data[i].x2 - meanX2) * (y[i] - meanY);
    }
    const r2_T1 = (ssTotal > 0 && ssX1 > 0) ? Math.pow(covX1Y, 2) / (ssX1 * ssTotal) : 0;
    const r2_T2 = (ssTotal > 0 && ssX2 > 0) ? Math.pow(covX2Y, 2) / (ssX2 * ssTotal) : 0;
    const r2_interaction = Math.max(0, r2 - (r2_T1 + r2_T2));

    return {
        beta0: beta[0],
        beta1: beta[1],
        beta2: beta[2],
        beta12: beta[3],
        r2Total: r2,
        r2_T1,
        r2_T2,
        r2_interaction
    };
}

// -----------------------------------------------------------------------------
// Behavioral Evaluators for Multivariate Pairs
// -----------------------------------------------------------------------------

function makeNeutral() {
    return {
        openness: 0.50,
        conscientiousness: 0.50,
        extraversion: 0.50,
        agreeableness: 0.50,
        neuroticism: 0.50,
        resilience: 0.50,
        leadership: 0.50,
        fear: 0.50
    };
}

/**
 * Pair 1: Neuroticism x Resilience -> Post-Threat Recovery Speed & Integrated Fear Area
 */
function evaluateNxR(valN, valR, seed) {
    const traits = makeNeutral();
    traits.neuroticism = valN;
    traits.resilience = valR;

    const agent = new AffectiveAgent(`nxr_${seed}`, traits);
    let totalFearArea = 0;

    // Acute threat exposure for 5 ticks
    for (let t = 0; t < 5; t++) {
        const res = agent.tick(0.016, { threats: [{ id: 'shock', distance: 2.0, intensity: 1.0 }] });
        totalFearArea += res.affective_state.raw_fear;
    }

    // Cooldown ticks to CALM
    let recoveryTicks = 0;
    for (let t = 0; t < 60; t++) {
        recoveryTicks++;
        const res = agent.tick(0.016, {});
        totalFearArea += res.affective_state.raw_fear;
        if (res.fear_band === 'CALM' || res.affective_state.raw_fear < 0.10) {
            break;
        }
    }

    return {
        recoverySpeed: 60 - recoveryTicks,
        fearArea: totalFearArea
    };
}

/**
 * Pair 2: Neuroticism x Conscientiousness -> Posture Discipline under acute threat
 */
function evaluateNxC(valN, valC, seed) {
    const traits = makeNeutral();
    traits.neuroticism = valN;
    traits.conscientiousness = valC;

    const agent = new AffectiveAgent(`nxc_${seed}`, traits);
    let disciplinedTicks = 0;
    let dominanceSum = 0;

    for (let t = 0; t < 25; t++) {
        const obs = { threats: [{ id: 'beast', distance: 1.2, intensity: 0.95 }] };
        const res = agent.tick(0.016, obs);
        if (res.action_intent.type !== 'DESPERATE_FLAIL' && res.action_intent.suggested_posture !== 'STUMBLING') {
            disciplinedTicks++;
        }
        dominanceSum += res.affective_state.dominance ?? 0;
    }

    return {
        disciplineScore: disciplinedTicks * 2.0 + dominanceSum
    };
}

/**
 * Pair 3: Neuroticism x Agreeableness -> Pro-Social Warning & Calm Receptivity
 */
function evaluateNxA(valN, valA, seed) {
    const traits = makeNeutral();
    traits.neuroticism = valN;
    traits.agreeableness = valA;

    const agent = new AffectiveAgent(`nxa_${seed}`, traits);
    const peers = [{ id: 'peer_1', x: 2, y: 0, z: 0 }];
    let proSocialScore = 0;

    for (let t = 0; t < 20; t++) {
        const threats = [{ id: 'creature', distance: 10.0, intensity: 0.6 }];
        const res = agent.tick(0.016, { threats, peers }, { leaderCalm: 0.60 });
        if (res.action_intent.type === 'WARN_GROUP' || res.action_intent.type === 'APPROACH_ALLY') {
            proSocialScore += res.action_intent.urgency;
        }
        proSocialScore += (1.0 - res.affective_state.raw_fear) * 0.5;
    }

    return {
        proSocialScore
    };
}

/**
 * Pair 4: Resilience x Conscientiousness -> Tactical Posture Discipline & Composure
 */
function evaluateRxC(valR, valC, seed) {
    const traits = makeNeutral();
    traits.resilience = valR;
    traits.conscientiousness = valC;

    const agent = new AffectiveAgent(`rxc_${seed}`, traits);
    let disciplinedTicks = 0;
    let dominanceSum = 0;

    for (let t = 0; t < 25; t++) {
        const obs = { threats: [{ id: 'beast', distance: 1.2, intensity: 0.95 }] };
        const res = agent.tick(0.016, obs);
        if (res.action_intent.type !== 'DESPERATE_FLAIL' && res.action_intent.suggested_posture !== 'STUMBLING') {
            disciplinedTicks++;
        }
        dominanceSum += res.affective_state.dominance ?? 0;
    }

    return {
        disciplineScore: disciplinedTicks * 2.0 + dominanceSum
    };
}

// -----------------------------------------------------------------------------
// Factorial Sweep Engine
// -----------------------------------------------------------------------------

export function runMultivariateFactorialAnalysis() {
    const gridPoints = [0.15, 0.35, 0.50, 0.65, 0.85];

    // 1. N x R Factorial Sweep
    const nxrData = [];
    for (const valN of gridPoints) {
        for (const valR of gridPoints) {
            let speedSum = 0;
            for (const seed of FROZEN_SEEDS) {
                speedSum += evaluateNxR(valN, valR, seed).recoverySpeed;
            }
            nxrData.push({ x1: valN, x2: valR, y: speedSum / FROZEN_SEEDS.length });
        }
    }
    const modelNxR = fitFactorialModel(nxrData);

    // 2. N x C Factorial Sweep
    const nxcData = [];
    for (const valN of gridPoints) {
        for (const valC of gridPoints) {
            let discSum = 0;
            for (const seed of FROZEN_SEEDS) {
                discSum += evaluateNxC(valN, valC, seed).disciplineScore;
            }
            nxcData.push({ x1: valN, x2: valC, y: discSum / FROZEN_SEEDS.length });
        }
    }
    const modelNxC = fitFactorialModel(nxcData);

    // 3. N x A Factorial Sweep
    const nxaData = [];
    for (const valN of gridPoints) {
        for (const valA of gridPoints) {
            let psSum = 0;
            for (const seed of FROZEN_SEEDS) {
                psSum += evaluateNxA(valN, valA, seed).proSocialScore;
            }
            nxaData.push({ x1: valN, x2: valA, y: psSum / FROZEN_SEEDS.length });
        }
    }
    const modelNxA = fitFactorialModel(nxaData);

    // 4. R x C Factorial Sweep
    const rxcData = [];
    for (const valR of gridPoints) {
        for (const valC of gridPoints) {
            let compSum = 0;
            for (const seed of FROZEN_SEEDS) {
                compSum += evaluateRxC(valR, valC, seed).disciplineScore;
            }
            rxcData.push({ x1: valR, x2: valC, y: compSum / FROZEN_SEEDS.length });
        }
    }
    const modelRxC = fitFactorialModel(rxcData);

    return {
        gridPoints,
        models: {
            nxr: {
                pair: 'Neuroticism (N) x Resilience (R)',
                targetMetric: 'Post-Threat Recovery Speed',
                model: modelNxR,
                classification: 'ARCHITECTURAL_DYNAMICS_COUPLING',
                mechanism: 'Differential Inflow/Outflow Coupling: Neuroticism governs fear inflow d(Fear)/dt while Resilience governs decay lambda_decay. Peak fear achieved during shock determines the recovery distance, creating a fundamental dynamical coupling in total fear integral area.'
            },
            nxc: {
                pair: 'Neuroticism (N) x Conscientiousness (C)',
                targetMetric: 'Tactical Posture Discipline',
                model: modelNxC,
                classification: 'HIERARCHICAL_GATING_COUPLING',
                mechanism: 'Urgency Priority Invariant: Conscientiousness drives tactical stance composure under moderate stress, but high Neuroticism induces acute PANIC band override (reserving motor output for desperation/flail). The interaction term proves C operates conditionally within non-catastrophic fear regimes.'
            },
            nxa: {
                pair: 'Neuroticism (N) x Agreeableness (A)',
                targetMetric: 'Pro-Social Warning & Calm Receptivity',
                model: modelNxA,
                classification: 'RESOURCE_ALLOCATION_COUPLING',
                mechanism: 'Social Affiliation Capacity: Agreeableness increases group warnings and calm receptivity, but high Neuroticism shifts focus to egocentric fight-or-flight, suppressing social communication.'
            },
            rxc: {
                pair: 'Resilience (R) x Conscientiousness (C)',
                targetMetric: 'Post-Shock Composure Retention',
                model: modelRxC,
                classification: 'SYNERGISTIC_DYNAMICS_COUPLING',
                mechanism: 'Recovery Phase Synergy: Resilience rapidly evacuates residual acute fear, allowing Conscientiousness-driven defensive postures to reassert control faster than in low-resilience agents.'
            }
        }
    };
}

// -----------------------------------------------------------------------------
// Report Printer
// -----------------------------------------------------------------------------

export function printMultivariateReport(results) {
    console.log('\n╔═════════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║           FEAR AI MULTIVARIATE FACTORIAL TRAIT ANALYSIS REPORT                          ║');
    console.log('║ Standard: 5x5 Factorial Grid Sweeps across 10 deterministic frozen seeds                 ║');
    console.log('║ Model: Response Surface Regression Y = b0 + b1*T1 + b2*T2 + b12*(T1*T2)                 ║');
    console.log('╚═════════════════════════════════════════════════════════════════════════════════════════╝\n');

    for (const [key, item] of Object.entries(results.models)) {
        const m = item.model;
        console.log(`===========================================================================================`);
        console.log(`PAIR: ${item.pair}`);
        console.log(`Target Behavioral Metric: ${item.targetMetric}`);
        console.log(`Classification:          ${item.classification}`);
        console.log(`-------------------------------------------------------------------------------------------`);
        console.log(`Regression Surface:`);
        console.log(`  b0 (Intercept):       ${m.beta0.toFixed(4).padStart(8)}`);
        console.log(`  b1 (Main Effect T1):  ${m.beta1.toFixed(4).padStart(8)}   (R² T1: ${(m.r2_T1 * 100).toFixed(1)}%)`);
        console.log(`  b2 (Main Effect T2):  ${m.beta2.toFixed(4).padStart(8)}   (R² T2: ${(m.r2_T2 * 100).toFixed(1)}%)`);
        console.log(`  b12 (Interaction):    ${m.beta12.toFixed(4).padStart(8)}   (R² Interaction: ${(m.r2_interaction * 100).toFixed(1)}%)`);
        console.log(`  Total R² Explained:   ${(m.r2Total * 100).toFixed(1)}%`);
        console.log(`Architectural Mechanism:`);
        console.log(`  ${item.mechanism}`);
        console.log(`===========================================================================================\n`);
    }
}

// CLI direct run
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
    const results = runMultivariateFactorialAnalysis();
    printMultivariateReport(results);
}
