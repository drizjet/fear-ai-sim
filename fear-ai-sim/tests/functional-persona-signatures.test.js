/**
 * @file functional-persona-signatures.test.js
 *
 * Sections VIII-XIII: response functions, near-neighbors, confusion, collapse.
 */

import { FunctionalPersonaSignatures, evaluateResponseFunctions } from '../packages/core/index.js';

const BRAVE = { neuroticism: 0.15, resilience: 0.9, agreeableness: 0.6, openness: 0.5, extraversion: 0.6, leadership: 0.7, riskTolerance: 0.75, conscientiousness: 0.7 };
const TIMID = { neuroticism: 0.85, resilience: 0.15, agreeableness: 0.6, openness: 0.4, extraversion: 0.35, leadership: 0.25, riskTolerance: 0.2, conscientiousness: 0.5 };

describe('Sections VIII-XIII: Functional Persona Signatures', () => {
    test('1. Reaction curves separate cartoon archetypes by shape', () => {
        const fps = new FunctionalPersonaSignatures();
        expect(fps.distance(BRAVE, TIMID)).toBeGreaterThan(0.1);
        const sig = fps.signatureFor(BRAVE);
        expect(Object.keys(sig.auc).length).toBe(11);
        expect(evaluateResponseFunctions(BRAVE, 1).panicThreat).toBeLessThan(evaluateResponseFunctions(TIMID, 1).panicThreat);
        expect(evaluateResponseFunctions(BRAVE, 0.5).helpRisk).toBeGreaterThan(0.2);
    });

    test('2. Near-neighbor personas discriminate above noise', () => {
        const fps = new FunctionalPersonaSignatures();
        const base = { ...BRAVE };
        const neighbor = { ...BRAVE, neuroticism: 0.25 };
        const d = fps.distance(base, neighbor);
        expect(d).toBeGreaterThan(0);
        expect(d).toBeLessThan(fps.distance(BRAVE, TIMID));
        const id = fps.identify(base, [{ id: 'self', traits: base }, { id: 'neighbor', traits: neighbor }]);
        expect(id.predictedId).toBe('self');
        expect(id.margin).toBeGreaterThanOrEqual(0);
        expect(id.strongestDiscriminator.function).not.toBe(null);
    });

    test('3. Confusion analysis names runner-up and discriminator', () => {
        const fps = new FunctionalPersonaSignatures();
        const pop = [
            { id: 'brave', traits: BRAVE },
            { id: 'timid', traits: TIMID },
            { id: 'mid', traits: { ...BRAVE, neuroticism: 0.5, resilience: 0.5 } }
        ];
        const res = fps.identify({ ...BRAVE, neuroticism: 0.18 }, pop);
        expect(res.predictedId).toBe('brave');
        expect(res.runnerUpId).not.toBe(null);
        expect(res.strongestDiscriminator.gap).toBeGreaterThanOrEqual(0);
        expect(() => fps.identify(BRAVE, [])).toThrow();
    });

    test('4. Collapse score flags flatliners, clears distinct personas', () => {
        const fps = new FunctionalPersonaSignatures();
        const pop = fps.generatePopulation(60, 7);
        const distinct = fps.collapseScore(BRAVE, pop);
        expect(distinct).toBeGreaterThan(0.15);
        const flat = fps.collapseScore({ neuroticism: 0.5, resilience: 0.5, agreeableness: 0.5, openness: 0.5, extraversion: 0.5, leadership: 0.5, riskTolerance: 0.5, conscientiousness: 0.5 }, pop);
        expect(flat).toBeLessThan(distinct);
        expect(() => fps.collapseScore(BRAVE, [{ id: 'one', traits: BRAVE }])).toThrow();
    });

    test('5. Population generation deterministic and bounded', () => {
        const fps = new FunctionalPersonaSignatures();
        const a = fps.generatePopulation(100, 99);
        const b = fps.generatePopulation(100, 99);
        expect(a).toEqual(b);
        expect(a.length).toBe(100);
        expect(() => fps.generatePopulation(0)).toThrow();
        expect(fps.auditImmutability().isClean).toBe(true);
        expect(fps.auditImmutability().hostPhysicsMutations).toBe(0);
    });
});

describe('NEXT-8: near-neighbor discrimination under noise', () => {
    // Tiny grid (N only, 2 deltas x 2 sigmas) for suite speed; the full
    // 7-trait grid lives in near_neighbor_noise_robustness.mjs.
    const tiny = { traitIdxs: [0], deltas: [0.05, 0.20], sigmas: [0, 0.20], reps: 2 };

    test('6. Runner is deterministic and noiseless column resolves N at delta 0.05', async () => {
        const { runNoiseRobustness } = await import('../benchmarks/behavioral-evaluation/near_neighbor_noise_robustness.mjs');
        const a = runNoiseRobustness(tiny);
        const b = runNoiseRobustness(tiny);
        expect(a).toEqual(b);
        const n = a.traits.neuroticism;
        expect(n.perSigma['sigma_0.00'].rows['delta_0.05'].accuracyPct).toBe(100);
        expect(n.perSigma['sigma_0.00'].deltaStar).toBe(0.05);
    });

    test('7. High stimulus noise collapses fine N discrimination', async () => {
        const { runNoiseRobustness } = await import('../benchmarks/behavioral-evaluation/near_neighbor_noise_robustness.mjs');
        const r = runNoiseRobustness(tiny);
        const n = r.traits.neuroticism;
        const clean = n.perSigma['sigma_0.00'].rows['delta_0.05'].accuracyPct;
        const noisy = n.perSigma['sigma_0.20'].rows['delta_0.05'].accuracyPct;
        expect(noisy).toBeLessThan(clean);
        // Chance-level accuracy must claim no delta-star (binomial + Wilson gate).
        expect(n.perSigma['sigma_0.20'].deltaStar).toBeNull();
    });
});

describe('NOW-34: agreeableness elicitation map', () => {
    test('8. Dead zone below the WARN gate is exact, gate is uniform', async () => {
        const { runElicitationMap, elicitationCell } = await import('../benchmarks/behavioral-evaluation/agreeableness_elicitation_map.mjs');
        // Base signature regime: both near-neighbor arms elicit nothing.
        expect(elicitationCell(0.45, 8, 0.6, 1, 0.6).prosocialUrgency).toBe(0);
        expect(elicitationCell(0.55, 8, 0.6, 1, 0.6).prosocialUrgency).toBe(0);
        const full = runElicitationMap();
        expect(runElicitationMap()).toEqual(full);
        expect(full.scenarioCount).toBe(72);
        for (const s of full.scenarios) {
            if (s.thresholdA === null) {
                // Silence holds exactly where the gate cannot open: no peers
                // to warn, or no visible threat to be anxious about.
                expect(s.peerCount === 0 || s.threatDist === null).toBe(true);
            } else {
                expect(s.thresholdA).toBe(0.7);
                expect(s.peerCount).toBe(1);
                expect(s.threatDist).not.toBeNull();
            }
        }
        expect(full.elicitingCount).toBe(27);
    });
});

describe('NOW-39: residual gate at zeroed geometry', () => {
    test('16. Only both-arms-above-gate pairs order with no stimulus', async () => {
        const { TRAIT_DEFINITIONS } = await import('../benchmarks/behavioral-evaluation/construct_validity_sweeps.mjs');
        const def = TRAIT_DEFINITIONS.find((d) => d.key === 'agreeableness');
        const mA = def.signature;
        const T = (a) => ({ neuroticism: 0.5, resilience: 0.5, openness: 0.5, extraversion: 0.5, agreeableness: a, conscientiousness: 0.5, leadership: 0.5 });
        const zeroed = { peerDist: 0, threatDist: 0, leaderCalm: 0 };
        // Zeroed geometry is scenario-independent: one comparison per pair.
        const orders = (a, b) => mA(T(b), zeroed) > mA(T(a), zeroed);
        // Below gate: ties (the 20/40 residual comes only from above).
        expect(orders(0.45, 0.50)).toBe(false);
        expect(orders(0.60, 0.65)).toBe(false);
        // Both arms above the strict 0.65 gate: urgency slope separates them.
        expect(orders(0.75, 0.80)).toBe(true);
        expect(orders(0.75, 0.95)).toBe(true);
        expect(orders(0.60, 0.80)).toBe(true);
    });
});

describe('NOW-35: APPROACH_ALLY recovery-window map', () => {
    test('9. Recovery window is N-driven with an inverted low-fear gate and a panic-overshoot gate', async () => {
        const { runRecoveryMap } = await import('../benchmarks/behavioral-evaluation/ally_approach_recovery_map.mjs');
        const full = runRecoveryMap();
        expect(runRecoveryMap()).toEqual(full);
        expect(full.cellCount).toBe(12);
        const cell = (n, tt, pd) => full.cells.find(c => c.n === n && c.threatTicks === tt && c.peerDist === pd);
        // Low fear + brief threat: only the lowest A reaches ANXIOUS at all
        // (A damps fear via social buffering, so high-A stays CALM).
        const low = cell(0.3, 3, 2);
        expect(low.perA['0.3'].approachTicks).toBeGreaterThan(0);
        for (const a of ['0.45', '0.55', '0.7', '0.85']) {
            expect(low.perA[a].approachTicks).toBe(0);
        }
        // High fear + sustained threat: low-A overshoots into PANIC and
        // approaches late; high-A approaches from tick 0.
        const high = cell(0.9, 10, 2);
        expect(high.perA['0.3'].firstApproach).toBeGreaterThanOrEqual(30);
        // Peer distance is presence-only across the whole grid.
        const near = cell(0.6, 10, 2);
        const far = cell(0.6, 10, 8);
        expect(far.perA).toEqual(near.perA);
        // Mid-regime urgency carries a genuine (shallow) A slope.
        expect(near.perA['0.85'].totalUrgency).toBeGreaterThan(near.perA['0.3'].totalUrgency);
        expect(near.elasticity).toBeGreaterThan(1.0);
    });
});

describe('NEXT-40: discrimination under noise families', () => {
    // Tiny grid (N only, 2 deltas x 3 conditions) for suite speed; the
    // full 7-trait grid lives in near_neighbor_noise_families.mjs.
    const tiny = { traitIdxs: [0], deltas: [0.05, 0.20], conds: [['clean', 0], ['bias', 0.10], ['dropout', 0.30]], reps: 2 };

    test('10. Runner is deterministic; bias is harmless, dropout degrades', async () => {
        const { runNoiseFamilies } = await import('../benchmarks/behavioral-evaluation/near_neighbor_noise_families.mjs');
        const a = runNoiseFamilies(tiny);
        expect(runNoiseFamilies(tiny)).toEqual(a);
        const n = a.traits.neuroticism;
        const clean = n.perCond.clean_0.rows['delta_0.05'].accuracyPct;
        const biased = n.perCond.bias_0p1.rows['delta_0.05'].accuracyPct;
        const dropped = n.perCond.dropout_0p3.rows['delta_0.05'].accuracyPct;
        // Systematic miscalibration shifts both arms together: no loss.
        expect(clean).toBe(100);
        expect(biased).toBe(clean);
        // Missing fields degrade gracefully, never collapse or crash.
        expect(dropped).toBeLessThan(clean);
        expect(dropped).toBeGreaterThan(50);
    });
});

describe('NOW-36: zero-reads dropout mapping', () => {
    // Same tiny grid plus the zero family at matched rate; the full
    // 7-trait grid lives in near_neighbor_noise_families.mjs.
    const tinyZero = { traitIdxs: [0], deltas: [0.05, 0.20], conds: [['clean', 0], ['dropout', 0.30], ['zero', 0.30]], reps: 2 };

    test('11. Zero-reads corrupt strictly worse than missing-at-matched-rate', async () => {
        const { runNoiseFamilies } = await import('../benchmarks/behavioral-evaluation/near_neighbor_noise_families.mjs');
        const a = runNoiseFamilies(tinyZero);
        expect(runNoiseFamilies(tinyZero)).toEqual(a);
        const n = a.traits.neuroticism;
        const dropped = n.perCond.dropout_0p3;
        const zeroed = n.perCond.zero_0p3;
        // Missing degrades; zero collapses fine discrimination entirely.
        expect(dropped.rows['delta_0.05'].accuracyPct).toBe(74);
        expect(zeroed.rows['delta_0.05'].accuracyPct).toBe(58);
        expect(zeroed.rows['delta_0.05'].accuracyPct).toBeLessThan(dropped.rows['delta_0.05'].accuracyPct);
        expect(dropped.deltaStar).toBe(0.05);
        expect(zeroed.deltaStar).toBeNull();
    });
});

describe('NEXT-51: large-bias regime crossings', () => {
    // NEXT-53: exact pins. Both arms share one per-trial fallback stream,
    // so in-process reruns are bit-identical (no construction-order jitter).
    test('12. E floor-collapses at -0.50, A saturation-ties at +1.00, N holds', async () => {
        const { runBiasRegimes } = await import('../benchmarks/behavioral-evaluation/bias_regime_sweep.mjs');
        const grid = { levels: [-0.5, 0.5, 1.0], traitIdxs: [0, 3, 4], deltas: [0.05, 0.20], reps: 2 };
        const a = runBiasRegimes(grid);
        expect(runBiasRegimes(grid)).toEqual(a);
        const cell = (t, l) => a.table[t].find((r) => r.level === l);
        // N immune: systematic scaling preserves orderings exactly.
        for (const l of [-0.5, 0.5, 1.0]) {
            expect(cell('neuroticism', l).fine).toBe(100);
            expect(cell('neuroticism', l).star).toBe(0.05);
        }
        // E: halved contagion hits the response floor (both score 0.00).
        expect(cell('extraversion', -0.5).fine).toBe(20);
        expect(cell('extraversion', -0.5).star).toBeNull();
        expect(cell('extraversion', 0.5).fine).toBe(100);
        // A: scaled geometry saturates both neighbors identically.
        expect(cell('agreeableness', 1.0).fine).toBe(20);
        expect(cell('agreeableness', 1.0).star).toBeNull();
        expect(cell('agreeableness', -0.5).fine).toBe(96);
        // Mechanism anchors (raw signature values): halved contagion floors
        // both neighbors at exactly 0; scaled geometry saturates both at 4.75.
        const { TRAIT_DEFINITIONS } = await import('../benchmarks/behavioral-evaluation/construct_validity_sweeps.mjs');
        const mE = TRAIT_DEFINITIONS.find((d) => d.key === 'extraversion').signature;
        const mA = TRAIT_DEFINITIONS.find((d) => d.key === 'agreeableness').signature;
        const T = (e, a) => ({ neuroticism: 0.5, resilience: 0.5, openness: 0.5, extraversion: e, agreeableness: a, conscientiousness: 0.5, leadership: 0.5 });
        expect(mE(T(0.45, 0.5), { contagionFear: 0.3 })).toBe(0);
        expect(mE(T(0.55, 0.5), { contagionFear: 0.3 })).toBe(0);
        expect(mA(T(0.5, 0.5), { peerDist: 3.0, threatDist: 15.0, leaderCalm: 0.9 }))
            .toBe(mA(T(0.5, 0.6), { peerDist: 3.0, threatDist: 15.0, leaderCalm: 0.9 }));
    });
});

describe('NOW-37: tie-count convention', () => {
    test('13. Total stimulus zero reads 0% (ties fail), never ~50%', async () => {
        const { runNoiseFamilies } = await import('../benchmarks/behavioral-evaluation/near_neighbor_noise_families.mjs');
        const grid = { traitIdxs: [0, 3, 4], deltas: [0.05, 0.20], conds: [['bias', -1.0]], reps: 2 };
        const a = runNoiseFamilies(grid);
        const cell = (t) => a.traits[t].perCond.bias_m1;
        // N/E take no stochastic branches at zero stimulus: total tie.
        for (const t of ['neuroticism', 'extraversion']) {
            expect(cell(t).rows['delta_0.05'].accuracyPct).toBe(0);
            expect(cell(t).rows['delta_0.20'].accuracyPct).toBe(0);
            expect(cell(t).deltaStar).toBeNull();
        }
        // A takes fallback-noise branches at zero stimulus: tie-dominated
        // (below chance), exact value left unpinned. NEXT-53 resolution: with
        // shared per-trial streams it still reads 20/40 — residual gate
        // signal (above-gate pairs warn via the urgency slope even at zeroed
        // geometry), not noise. See the NEXT-53 milestone.
        expect(cell('agreeableness').rows['delta_0.05'].accuracyPct).toBeLessThan(50);
        expect(cell('agreeableness').deltaStar).toBeNull();
    });
});

describe('NOW-38: A zero-resolution paradox decomposition', () => {
    test('14. Zero-reads un-tie trials; untied trials were ordered all along', async () => {
        const { runNoiseFamilies } = await import('../benchmarks/behavioral-evaluation/near_neighbor_noise_families.mjs');
        const grid = { traitIdxs: [4], deltas: [0.05, 0.15], conds: [['clean', 0], ['zero', 0.30]], reps: 2 };
        const a = runNoiseFamilies(grid);
        const row = (ck, d) => a.traits.agreeableness.perCond[ck].rows[`delta_${d.toFixed(2)}`];
        // Asymmetric per-arm zero masks break ties (28->10, 18->4).
        expect(row('clean_0', 0.05).ties).toBe(28);
        expect(row('zero_0p3', 0.05).ties).toBe(10);
        expect(row('clean_0', 0.15).ties).toBe(18);
        expect(row('zero_0p3', 0.15).ties).toBe(4);
        // Correct-given-untied stays high: the signal was real, suppression
        // was the ties. Clean untied trials are perfectly ordered.
        const untiedRate = (r) => (r.correct / (r.total - r.ties)) * 100;
        expect(untiedRate(row('clean_0', 0.15))).toBe(100);
        expect(untiedRate(row('zero_0p3', 0.15))).toBeGreaterThan(70);
    });
});

describe('NEXT-54: collapse-crossing bisection', () => {
    test('15. E crosses between -0.50/-0.40 (gate), A slopes with middling clean', async () => {
        const { runBiasBisection } = await import('../benchmarks/behavioral-evaluation/bias_regime_sweep.mjs');
        const a = runBiasBisection();
        expect(runBiasBisection()).toEqual(a);
        const cell = (rows, l) => rows.find((r) => r.level === l);
        // E: floor below the 0.4 contagion gate, transitional at -0.40,
        // resolved with star at -0.30.
        expect(cell(a.extraversion, -0.5).fine).toBe(20);
        expect(cell(a.extraversion, -0.5).star).toBeNull();
        expect(cell(a.extraversion, -0.4).fine).toBe(60);
        expect(cell(a.extraversion, -0.3).fine).toBe(80);
        expect(cell(a.extraversion, -0.3).star).toBe(0.05);
        // A: no sharp crossing — smooth slope, clean itself middling.
        expect(cell(a.agreeableness, -0.1).fine).toBe(64);
        expect(cell(a.agreeableness, 0).fine).toBe(44);
        expect(cell(a.agreeableness, 0.1).fine).toBe(32);
        expect(cell(a.agreeableness, 0.1).star).toBeNull();
    });
});

describe('NEXT-68: zero-misordered-fraction decomposition', () => {
    test('17. Misorders are below-gate tie-flips; straddles stay perfect', async () => {
        const { runMisorderBreakdown } = await import('../benchmarks/behavioral-evaluation/zero_misorder_breakdown.mjs');
        const a = runMisorderBreakdown();
        expect(runMisorderBreakdown()).toEqual(a);
        const cell = (c, k) => a.classes[c][k];
        // Clean below-gate: ties absorb everything, zero wrongs.
        expect(cell('below', 'clean_0/delta_0.05')).toMatchObject({ correct: 12, tied: 28, wrong: 0 });
        expect(cell('below', 'clean_0/delta_0.15')).toMatchObject({ correct: 12, tied: 18, wrong: 0 });
        // Zero below-gate: asymmetric masks flip ties near coin rates.
        expect(cell('below', 'zero_0p3/delta_0.05')).toMatchObject({ correct: 15, tied: 10, wrong: 15 });
        expect(cell('below', 'zero_0p3/delta_0.15').wrong).toBe(12);
        // Straddles never misorder under either cond; above-gate residue small.
        expect(cell('straddle', 'zero_0p3/delta_0.15')).toMatchObject({ correct: 10, tied: 0, wrong: 0 });
        expect(cell('above', 'zero_0p3/delta_0.15').wrong).toBeLessThanOrEqual(2);
    });
});
