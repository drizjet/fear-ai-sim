/**
 * tools/verification/verify_fabe_personas.mjs
 *
 * Phase 2B: Tier 5 FABE Functional Persona Signatures — standalone verification.
 *
 * Verifies the 11 logistic response curves, boundary limits [0,1], the
 * mathematical phase separation between Neuroticism (N) and Resilience (R),
 * near-neighbor discrimination, determinism, population generation, confusion
 * analysis, collapse scoring, and advisory-only immutability.
 *
 * Hard Rule 9 Compliant: 0 test runners. Standalone deterministic script.
 */

import {
  FunctionalPersonaSignatures,
  evaluateResponseFunctions,
  SIGNATURE_FUNCTIONS,
  DEFAULT_PROBE_GRID
} from '../../packages/core/src/FunctionalPersonaSignatures.js';

let PASS = 0;
function check(label, cond, detail = '') {
  if (!cond) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  PASS++;
  console.log(`  * ${label}: PASS`);
}

function in01(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
}

async function main() {
  console.log('============================================================');
  console.log('VERIFY FABE FUNCTIONAL PERSONA SIGNATURES (TIER 5 DECOUPLED)');
  console.log('============================================================\n');

  const fps = new FunctionalPersonaSignatures();

  // ------------------------------------------------------------------
  // Suite 1: 11-curve vocabulary & boundary limits
  // ------------------------------------------------------------------
  console.log('--- Suite 1: 11 response curves & [0,1] bounds ---');
  check('Exactly 11 signature functions', SIGNATURE_FUNCTIONS.length === 11, `got ${SIGNATURE_FUNCTIONS.length}`);
  for (const fn of ['panicThreat', 'panicDistance', 'panicUncertainty', 'panicCount', 'retreatPower', 'helpRisk', 'investigateAmbiguity', 'rallyGroupFear', 'recoveryTime', 'contagionPeerFear', 'tradeRisk']) {
    check(`Curve ${fn} registered`, SIGNATURE_FUNCTIONS.includes(fn));
  }
  check('Default probe grid has 9 points', DEFAULT_PROBE_GRID.length === 9);

  const base = { openness: 0.5, conscientiousness: 0.5, extraversion: 0.5, agreeableness: 0.5, neuroticism: 0.5, resilience: 0.5, leadership: 0.5, riskTolerance: 0.5 };
  // Sweep full trait cube corners + probe extremes: every output must be finite [0,1]
  const corners = [];
  for (let b = 0; b < 256; b++) {
    const t = {};
    const keys = ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism', 'resilience', 'leadership', 'riskTolerance'];
    keys.forEach((k, i) => { t[k] = (b >> i) & 1; });
    corners.push(t);
  }
  let bounded = true;
  for (const t of corners) {
    for (const x of [0, 0.5, 1]) {
      const r = evaluateResponseFunctions(t, x);
      for (const fn of SIGNATURE_FUNCTIONS) {
        if (!in01(r[fn])) { bounded = false; break; }
      }
    }
  }
  check('All 256 trait corners x 3 probes bounded [0,1]', bounded);
  // NaN / Inf / garbage inputs collapse safely to finite [0,1]
  const garbage = evaluateResponseFunctions({ neuroticism: NaN, resilience: Infinity, agreeableness: 'x', openness: null }, NaN);
  check('NaN/Inf/garbage traits collapse to finite [0,1]', SIGNATURE_FUNCTIONS.every((fn) => in01(garbage[fn])));
  // Out-of-range clamps: N=99 behaves like N=1, N=-99 like N=0
  const hiN = evaluateResponseFunctions({ ...base, neuroticism: 99 }, 0.5);
  const oneN = evaluateResponseFunctions({ ...base, neuroticism: 1 }, 0.5);
  check('Neuroticism clamps above 1', JSON.stringify(hiN) === JSON.stringify(oneN));
  const loN = evaluateResponseFunctions({ ...base, neuroticism: -99 }, 0.5);
  const zeroN = evaluateResponseFunctions({ ...base, neuroticism: 0 }, 0.5);
  check('Neuroticism clamps below 0', JSON.stringify(loN) === JSON.stringify(zeroN));

  // Logistic monotonicity spot-checks at fixed persona:
  // panicThreat rises with threat x; panicDistance falls with distance x; recoveryTime falls with time x.
  const pT0 = evaluateResponseFunctions(base, 0).panicThreat;
  const pT1 = evaluateResponseFunctions(base, 1).panicThreat;
  check('panicThreat rises with threat (0->1)', pT1 > pT0, `${pT0} vs ${pT1}`);
  const pD0 = evaluateResponseFunctions(base, 0).panicDistance;
  const pD1 = evaluateResponseFunctions(base, 1).panicDistance;
  check('panicDistance falls with distance (0->1)', pD1 < pD0, `${pD0} vs ${pD1}`);

  // ------------------------------------------------------------------
  // Suite 2: N vs R phase separation (mathematical decoupling)
  // ------------------------------------------------------------------
  console.log('\n--- Suite 2: Neuroticism / Resilience phase separation ---');
  // Design equations (shipped source):
  //  panicThreat threshold = .75 - N*.30 - R*.10  (N 3x stronger than R)
  //  panicDistance threshold = .45 + R*.20 - N*.15 (opposite signs)
  //  recoveryTime threshold = .50 - R*.20 + N*.15  (opposite signs)
  //  contagion slope = 5 + N*3 - R*2               (opposite signs)
  // Consequence: high-N/low-R and low-N/high-R personas must separate
  // in signature space, and N-steps vs R-steps move different curves.
  const highN = { ...base, neuroticism: 0.9, resilience: 0.1 };
  const highR = { ...base, neuroticism: 0.1, resilience: 0.9 };
  const dNR = fps.distance(highN, highR);
  check('High-N vs High-R personas separate (d>0.05)', dNR > 0.05, `got ${dNR}`);

  // Directional proof at probe x=0.5 (shipped equations):
  //  panicThreat threshold = .75 - N*.30 - R*.10 → both N and R lower the
  //  threshold (raise sensitivity), but N is 3x stronger than R. Resilience
  //  buffering appears as opposite-sign effects on recoveryTime and
  //  contagion slope, not on panicThreat threshold.
  const nUp = evaluateResponseFunctions({ ...base, neuroticism: 0.8 }, 0.5).panicThreat;
  const nBase = evaluateResponseFunctions(base, 0.5).panicThreat;
  const rUpThreat = evaluateResponseFunctions({ ...base, resilience: 0.8 }, 0.5).panicThreat;
  check('Raising N raises panicThreat', nUp > nBase, `${nBase} -> ${nUp}`);
  check('Raising R also raises panicThreat (weaker, same direction)', rUpThreat > nBase, `${nBase} -> ${rUpThreat}`);
  // Quantitative oracle for the claimed 3x relationship (previously only
  // asserted nDelta > rDelta, which a 1.1x change would satisfy). Shipped
  // thresholds: .75 - N*.30 - R*.10 give a 3x coefficient ratio; the observed
  // output ratio runs slightly above 3.0 because N also widens the logistic
  // slope (6 + N*4) while R leaves it fixed, so 3x floors the output ratio.
  const nDelta = nUp - nBase;
  const rDelta = rUpThreat - nBase;
  const nOverR = nDelta / rDelta;
  check('N effect ~3x stronger than R effect on panicThreat', nDelta > rDelta && nOverR > 2.5 && nOverR < 4.0, `N=${nDelta} R=${rDelta} ratio=${nOverR}`);

  // Opposite-sign proof on recoveryTime: R speeds recovery (lowers residual fear),
  // N slows it (raises residual).
  const recBase = evaluateResponseFunctions(base, 0.5).recoveryTime;
  const recHighR = evaluateResponseFunctions(highR, 0.5).recoveryTime;
  const recHighN = evaluateResponseFunctions(highN, 0.5).recoveryTime;
  check('Resilience lowers residual recoveryTime fear', recHighR < recBase, `${recBase} -> ${recHighR}`);
  check('Neuroticism raises residual recoveryTime fear', recHighN > recBase, `${recBase} -> ${recHighN}`);

  // Contagion: N amplifies susceptibility slope, R dampens it.
  const conHighN = evaluateResponseFunctions(highN, 0.7).contagionPeerFear;
  const conHighR = evaluateResponseFunctions(highR, 0.7).contagionPeerFear;
  check('High-N more contagious than High-R at peerFear .7', conHighN > conHighR, `${conHighN} vs ${conHighR}`);

  // Near-neighbor discrimination: N=.45 vs .55 must separate (Sections X).
  const n45 = { ...base, neuroticism: 0.45 };
  const n55 = { ...base, neuroticism: 0.55 };
  const dNear = fps.distance(n45, n55);
  check('Near-neighbor N=.45 vs .55 separates (d>0)', dNear > 0, `got ${dNear}`);

  // ------------------------------------------------------------------
  // Suite 3: Determinism, population, confusion, collapse
  // ------------------------------------------------------------------
  console.log('\n--- Suite 3: Determinism & population analytics ---');
  const s1 = fps.signatureFor(base);
  const s2 = fps.signatureFor(base);
  check('Same traits => bit-identical signature', JSON.stringify(s1) === JSON.stringify(s2));
  check('Signature has 11 curves', Object.keys(s1.curves).length === 11);
  check('AUC summary has 11 entries', Object.keys(s1.auc).length === 11);
  const v1 = fps.vectorFor(base);
  check('Flattened vector = 11*9 = 99 dims', v1.length === 99, `got ${v1.length}`);
  check('Self-distance is 0', fps.distance(base, base) === 0);
  check('Distance symmetric', fps.distance(highN, highR) === fps.distance(highR, highN));

  // Deterministic population generation (seeded LCG, no Math.random)
  const popA = fps.generatePopulation(60, 1337);
  const popB = fps.generatePopulation(60, 1337);
  check('Same seed => identical population', JSON.stringify(popA) === JSON.stringify(popB));
  check('Population size honored', popA.length === 60);
  const popC = fps.generatePopulation(60, 9999);
  check('Different seed => different population', JSON.stringify(popA) !== JSON.stringify(popC));
  let popBounded = true;
  for (const p of popA) {
    for (const k of ['openness', 'conscientiousness', 'extraversion', 'agreeableness', 'neuroticism', 'resilience', 'leadership', 'riskTolerance']) {
      if (!in01(p.traits[k])) { popBounded = false; break; }
    }
  }
  check('Generated traits all bounded [0,1]', popBounded);
  let threwSize = false;
  try { fps.generatePopulation(0); } catch { threwSize = true; }
  check('Population size 0 throws', threwSize);

  // Identification: exact query retrieves itself with margin
  const query = popA[0].traits;
  const idRes = fps.identify(query, popA);
  check('Exact query retrieves own id', idRes.predictedId === popA[0].id);
  check('Exact query margin >= 0', idRes.margin >= 0);
  check('Strongest discriminator names a real curve', SIGNATURE_FUNCTIONS.includes(idRes.strongestDiscriminator.function));
  let threwEmpty = false;
  try { fps.identify(query, []); } catch { threwEmpty = true; }
  check('Empty population throws', threwEmpty);

  // Confusion matrix on distinct archetypes: deterministic, high recall
  const archetypes = [
    { id: 'brave', traits: { ...base, neuroticism: 0.1, resilience: 0.9, leadership: 0.8 } },
    { id: 'nervous', traits: { ...base, neuroticism: 0.9, resilience: 0.1, leadership: 0.1 } },
    { id: 'social', traits: { ...base, extraversion: 0.9, agreeableness: 0.9, neuroticism: 0.3 } }
  ];
  const cm1 = fps.confusionMatrix(archetypes, { twins: 5, noise: 0.05, seed: 777 });
  const cm2 = fps.confusionMatrix(archetypes, { twins: 5, noise: 0.05, seed: 777 });
  check('Confusion matrix deterministic', JSON.stringify(cm1) === JSON.stringify(cm2));
  check('Confusion total = 3 archetypes x 5 twins', cm1.total === 15, `got ${cm1.total}`);
  check('Confusion accuracy in [0,1]', cm1.accuracy >= 0 && cm1.accuracy <= 1);
  check('Confusion recall is high (>0.5) for distinct archetypes', cm1.accuracy > 0.5, `got ${cm1.accuracy}`);

  // Collapse score: distinct persona ~1-ish, flatlined generic ~0
  const pop100 = fps.generatePopulation(100, 42);
  const distinctScore = fps.collapseScore({ openness: 0.95, conscientiousness: 0.05, extraversion: 0.95, agreeableness: 0.05, neuroticism: 0.95, resilience: 0.05, leadership: 0.95, riskTolerance: 0.95 }, pop100);
  check('Distinct persona collapse score in [0,1]', distinctScore >= 0 && distinctScore <= 1);
  let threwCollapse = false;
  try { fps.collapseScore(base, [{ id: 'only', traits: base }]); } catch { threwCollapse = true; }
  check('Collapse with <2 population throws', threwCollapse);

  // ------------------------------------------------------------------
  // Suite 4: Advisory-only immutability
  // ------------------------------------------------------------------
  console.log('\n--- Suite 4: Advisory-only / host authority ---');
  const audit = fps.auditImmutability();
  check('auditImmutability CLEAN_ADVISORY_ONLY', audit.status === 'CLEAN_ADVISORY_ONLY' && audit.isClean === true);
  check('Zero host physics mutations', audit.hostPhysicsMutations === 0);
  check('Zero host transform mutations', audit.hostTransformMutations === 0);
  check('Tracks 11 functions', audit.functionsTracked === 11);
  // Pure functions: input traits object is never mutated
  const frozen = Object.freeze({ ...base });
  const before = JSON.stringify(frozen);
  fps.signatureFor(frozen);
  fps.vectorFor(frozen);
  fps.distance(frozen, highN);
  check('Input traits never mutated (frozen safe)', JSON.stringify(frozen) === before);

  console.log('\n============================================================');
  console.log(`SUCCESS: All ${PASS} FABE persona assertions PASSED.`);
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('VERIFICATION FAILURE:', err);
  process.exit(1);
});
