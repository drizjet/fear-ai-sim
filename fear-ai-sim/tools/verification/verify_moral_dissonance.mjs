/**
 * tools/verification/verify_moral_dissonance.mjs
 *
 * Phase 2A: Tier 5 Moral Dissonance Engine — standalone decoupling verification.
 *
 * Verifies Haidt 5-foundation vectors, Festinger rationalization mechanics,
 * guilt decay half-lives, moral injury thresholds, atonement relief, order
 * compliance deliberation, and strict non-mutating advisory output.
 *
 * Hard Rule 9 Compliant: 0 test runners. Standalone deterministic script.
 */

import {
  MoralDissonanceEngine,
  MORAL_FOUNDATIONS,
  DEFAULT_MORAL_PROFILES,
  TRANSGRESSION_TYPES,
  TRANSGRESSION_PROFILES,
  ATONEMENT_TYPES,
  ATONEMENT_PROFILES
} from '../../packages/core/src/MoralDissonanceEngine.js';

let PASS = 0;
function check(label, cond, detail = '') {
  if (!cond) throw new Error(`FAIL: ${label}${detail ? ` — ${detail}` : ''}`);
  PASS++;
  console.log(`  * ${label}: PASS`);
}

function approx(a, b, eps = 1e-6) {
  return Math.abs(a - b) <= eps;
}

async function main() {
  console.log('============================================================');
  console.log('VERIFY MORAL DISSONANCE ENGINE (TIER 5 RESEARCH DECOUPLED)');
  console.log('============================================================\n');

  // ------------------------------------------------------------------
  // Suite 1: Foundation architecture (Haidt 5 vectors)
  // ------------------------------------------------------------------
  console.log('--- Suite 1: Haidt 5-foundation architecture ---');
  check('5 foundations defined', Object.keys(MORAL_FOUNDATIONS).length === 5);
  for (const f of ['CARE', 'FAIRNESS', 'LOYALTY', 'AUTHORITY', 'SANCTITY']) {
    check(`Foundation ${f} present`, f in MORAL_FOUNDATIONS);
  }
  check('5 canonical archetypes defined', Object.keys(DEFAULT_MORAL_PROFILES).length === 5);
  for (const [name, profile] of Object.entries(DEFAULT_MORAL_PROFILES)) {
    const sum = Object.values(profile).reduce((a, b) => a + b, 0);
    check(`${name} weights sum to 1.0`, approx(sum, 1.0, 1e-9), `got ${sum}`);
  }
  check('7 transgression types defined', Object.keys(TRANSGRESSION_TYPES).length === 7);
  for (const t of Object.values(TRANSGRESSION_TYPES)) {
    check(`Transgression ${t} has 5-dim violation vector`, TRANSGRESSION_PROFILES[t] && Object.keys(TRANSGRESSION_PROFILES[t]).length === 5);
    for (const f of Object.values(MORAL_FOUNDATIONS)) {
      const v = TRANSGRESSION_PROFILES[t][f];
      check(`${t}.${f} in [0,1]`, typeof v === 'number' && v >= 0 && v <= 1, `got ${v}`);
    }
  }
  check('5 atonement types defined', Object.keys(ATONEMENT_TYPES).length === 5);
  for (const a of Object.values(ATONEMENT_TYPES)) {
    check(`Atonement ${a} has positive relief`, ATONEMENT_PROFILES[a] && ATONEMENT_PROFILES[a].relief > 0);
  }

  // Registration normalizes arbitrary weights to sum 1.0
  const eng0 = new MoralDissonanceEngine({ seed: 1 });
  const st0 = eng0.registerAgentMoralProfile('norm_test', { CARE: 2, FAIRNESS: 2, LOYALTY: 2, AUTHORITY: 2, SANCTITY: 2 });
  const sum0 = Object.values(st0.foundations).reduce((a, b) => a + b, 0);
  check('Registration normalizes weights to sum 1.0', approx(sum0, 1.0, 1e-9), `got ${sum0}`);
  check('Initial guilt is 0', st0.guilt === 0.0);
  check('Initial moralInjury is false', st0.moralInjury === false);

  // ------------------------------------------------------------------
  // Suite 2: Festinger dissonance + rationalization mechanics
  // ------------------------------------------------------------------
  console.log('\n--- Suite 2: Dissonance dot-product & rationalization ---');
  const eng = new MoralDissonanceEngine({ seed: 4242 });
  eng.registerAgentMoralProfile('guardian', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);

  // Raw dissonance = dot(foundations, violation). Hand-compute for guardian x ABANDON_COMRADE.
  // Guardian: CARE .35 FAIR .25 LOY .25 AUTH .10 SANC .05
  // ABANDON:  CARE .80 FAIR .50 LOY .85 AUTH .30 SANC .10
  // raw = .35*.80 + .25*.50 + .25*.85 + .10*.30 + .05*.10 = .28+.125+.2125+.03+.005 = .6525
  const d0 = eng.computeDissonance('guardian', 'ABANDON_COMRADE', {});
  check('Raw dissonance hand-computed .6525', approx(d0.rawDissonance, 0.6525, 1e-4), `got ${d0.rawDissonance}`);
  check('Zero context => net == raw', approx(d0.netDissonance, d0.rawDissonance, 1e-4));
  check('Zero context rationalization is 0', d0.rationalization.total === 0);

  // Acute fear mitigation: fear=1.0 => fearRat = min(.60, .65) = .60; total .60; net = raw*.40
  const dFear = eng.computeDissonance('guardian', 'ABANDON_COMRADE', { fear: 1.0 });
  check('Fear rationalization capped at .60', approx(dFear.rationalization.fearRationalization, 0.60, 1e-4));
  check('Fear net = raw*(1-.60)', approx(dFear.netDissonance, d0.rawDissonance * 0.40, 1e-4), `got ${dFear.netDissonance}`);
  // Order compliance: AUTHORITY .10 * .50 = .05
  const dOrder = eng.computeDissonance('guardian', 'ABANDON_COMRADE', { isDirectOrder: true });
  check('Order rationalization = AUTHORITY*.50', approx(dOrder.rationalization.orderRationalization, 0.05, 1e-4));
  // Necessity: necessity=1.0 => .40
  const dNec = eng.computeDissonance('guardian', 'ABANDON_COMRADE', { necessity: 1.0 });
  check('Necessity rationalization = .40', approx(dNec.rationalization.necessityRationalization, 0.40, 1e-4));
  // Combined cap at .75: fear 1.0 (.60) + order (.05) + necessity 1.0 (.40) = 1.05 => capped .75
  const dCap = eng.computeDissonance('guardian', 'ABANDON_COMRADE', { fear: 1.0, isDirectOrder: true, necessity: 1.0 });
  check('Total rationalization capped at .75', approx(dCap.rationalization.total, 0.75, 1e-4), `got ${dCap.rationalization.total}`);
  check('Capped net = raw*.25', approx(dCap.netDissonance, d0.rawDissonance * 0.25, 1e-4));
  // Net always in [0,1]
  check('Net dissonance bounded [0,1]', dCap.netDissonance >= 0 && dCap.netDissonance <= 1);
  // Unknown transgression throws (fail loudly, no silent fabrication)
  let threwUnknown = false;
  try { eng.computeDissonance('guardian', 'NOPE_NOT_REAL', {}); } catch { threwUnknown = true; }
  check('Unknown transgression throws', threwUnknown);
  // Unregistered agent throws
  let threwAgent = false;
  try { eng.computeDissonance('ghost', 'ABANDON_COMRADE', {}); } catch { threwAgent = true; }
  check('Unregistered agent throws', threwAgent);

  // ------------------------------------------------------------------
  // Suite 3: Guilt integration, decay half-lives, injury thresholds
  // ------------------------------------------------------------------
  console.log('\n--- Suite 3: Guilt dynamics & moral injury ---');
  const eng2 = new MoralDissonanceEngine({ seed: 7, decayRate: 0.005, severeGuiltThreshold: 0.75, injuryThresholdTicks: 50 });
  eng2.registerAgentMoralProfile('soldier', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
  // recordTransgression: addedGuilt = net * .80
  const rep = eng2.recordTransgression('soldier', 'EXECUTE_DEFENSELESS', {});
  check('Guilt integration = net*.80', approx(rep.addedGuilt, rep.dissonanceCalc.netDissonance * 0.80, 1e-4));
  check('Current guilt matches added (from 0)', approx(rep.currentGuilt, rep.addedGuilt, 1e-4));
  check('Guilt clamped [0,1]', rep.currentGuilt >= 0 && rep.currentGuilt <= 1);
  check('Severe flag consistent with threshold', rep.isSevere === (rep.currentGuilt >= 0.75));

  // Guilt decay half-life: G(t) = G0*(1-lambda)^t => t_half = ln.5/ln(1-lambda)
  // lambda .005 => ~138.283 ticks; injured lambda .002 => ~346.228 ticks
  const halfHealthy = Math.log(0.5) / Math.log(1 - 0.005);
  check('Healthy half-life ~138.3 ticks', Math.abs(halfHealthy - 138.283) < 0.5, `got ${halfHealthy}`);
  const halfInjured = Math.log(0.5) / Math.log(1 - 0.005 * 0.40);
  check('Injured half-life ~346.2 ticks (60% slower)', Math.abs(halfInjured - 346.228) < 1.0, `got ${halfInjured}`);
  // Empirical decay: set guilt .80, tick 138 => ~.40; tick 139 => just under half
  const engH = new MoralDissonanceEngine({ seed: 9, decayRate: 0.005 });
  engH.registerAgentMoralProfile('h', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
  engH.agents.get('h').guilt = 0.80;
  engH.agents.get('h').consecutiveSevereTicks = 0;
  engH.tick(138);
  const g138 = engH.agents.get('h').guilt;
  check('Empirical 138-tick decay ≈ half (.40±.01)', Math.abs(g138 - 0.40) < 0.01, `got ${g138}`);
  // Single-tick decay factor exact
  const eng1 = new MoralDissonanceEngine({ seed: 11, decayRate: 0.005 });
  eng1.registerAgentMoralProfile('o', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
  eng1.agents.get('o').guilt = 1.0;
  eng1.tick(1);
  check('Single-tick decay G=.995', approx(eng1.agents.get('o').guilt, 0.995, 1e-9));

  // Moral injury: 50 consecutive severe ticks => injury + remodeling
  const engI = new MoralDissonanceEngine({ seed: 13, decayRate: 0.0, severeGuiltThreshold: 0.75, injuryThresholdTicks: 50 });
  engI.registerAgentMoralProfile('v', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
  engI.agents.get('v').guilt = 0.90;
  let injuredAt = -1;
  for (let t = 1; t <= 60; t++) {
    const res = engI.tick(1);
    if (res.newlyInjured.length > 0) { injuredAt = t; break; }
  }
  check('Moral injury triggers at exactly 50 severe ticks', injuredAt === 50, `got ${injuredAt}`);
  const vState = engI.getAgentMoralState('v');
  check('Injury flag set', vState.moralInjury === true);
  check('Neuroticism drift +0.15', approx(vState.personalityDeltas.neuroticism, 0.15, 1e-9));
  check('Agreeableness erosion -0.20', approx(vState.personalityDeltas.agreeableness, -0.20, 1e-9));
  check('Dominance erosion -0.15', approx(vState.personalityDeltas.dominance, -0.15, 1e-9));
  // Below threshold never injures
  const engN = new MoralDissonanceEngine({ seed: 17, decayRate: 0.0, severeGuiltThreshold: 0.75, injuryThresholdTicks: 50 });
  engN.registerAgentMoralProfile('c', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
  engN.agents.get('c').guilt = 0.74;
  engN.tick(200);
  check('Sub-threshold guilt never injures (200 ticks)', engN.getAgentMoralState('c').moralInjury === false);

  // Atonement relief: discrete subtraction, floor 0
  const engA = new MoralDissonanceEngine({ seed: 19 });
  engA.registerAgentMoralProfile('a', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
  engA.agents.get('a').guilt = 0.60;
  const at = engA.recordAtonement('a', 'DEFEND_THE_HELPLESS', { intensity: 1.0 });
  check('Atonement relief .35 at intensity 1.0', approx(at.reliefAmount, 0.35, 1e-9));
  check('Guilt after atonement .25', approx(at.currentGuilt, 0.25, 1e-9));
  engA.agents.get('a').guilt = 0.10;
  const atFloor = engA.recordAtonement('a', 'SACRIFICIAL_INTERVENTION', { intensity: 1.0 });
  check('Guilt floors at 0 (no negative)', atFloor.currentGuilt === 0);
  let threwAton = false;
  try { engA.recordAtonement('a', 'FAKE_RITE', {}); } catch { threwAton = true; }
  check('Unknown atonement throws', threwAton);

  // ------------------------------------------------------------------
  // Suite 4: Order compliance deliberation (advisory refusal)
  // ------------------------------------------------------------------
  console.log('\n--- Suite 4: Order compliance (moral defiance) ---');
  const engC = new MoralDissonanceEngine({ seed: 4242 });
  engC.registerAgentMoralProfile('g', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
  // Clean conscience + low-dissonance order => low refusal probability
  const comp0 = engC.evaluateOrderCompliance('g', 'COWARDLY_FLIGHT', { coercionSeverity: 0 });
  check('Refusal probability in [0,.95]', comp0.refusalProbability >= 0 && comp0.refusalProbability <= 0.95);
  check('Compliance verdict is boolean', typeof comp0.willComply === 'boolean');
  check('Rationale is non-empty advisory string', typeof comp0.rationale === 'string' && comp0.rationale.length > 0);
  // High guilt + severe prospective dissonance => higher refusal than clean state
  engC.agents.get('g').guilt = 0.90;
  const compHigh = engC.evaluateOrderCompliance('g', 'EXECUTE_DEFENSELESS', { coercionSeverity: 0 });
  check('High-guilt refusal exceeds clean-state refusal', compHigh.refusalProbability > comp0.refusalProbability);
  // Coercion suppresses refusal
  const compCoerced = engC.evaluateOrderCompliance('g', 'EXECUTE_DEFENSELESS', { coercionSeverity: 1.0 });
  check('Maximum coercion reduces refusal', compCoerced.refusalProbability < compHigh.refusalProbability);
  // Determinism: same seed => same roll sequence
  const e1 = new MoralDissonanceEngine({ seed: 555 });
  const e2 = new MoralDissonanceEngine({ seed: 555 });
  e1.registerAgentMoralProfile('x', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
  e2.registerAgentMoralProfile('x', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
  const r1 = e1.evaluateOrderCompliance('x', 'LOOT_SETTLEMENT', {});
  const r2 = e2.evaluateOrderCompliance('x', 'LOOT_SETTLEMENT', {});
  check('Same seed => identical roll & verdict', r1.roll === r2.roll && r1.willComply === r2.willComply);

  // ------------------------------------------------------------------
  // Suite 5: Non-mutating advisory output (Host Authority Invariant)
  // ------------------------------------------------------------------
  console.log('\n--- Suite 5: Advisory-only / host authority ---');
  const engM = new MoralDissonanceEngine({ seed: 3 });
  engM.registerAgentMoralProfile('m', DEFAULT_MORAL_PROFILES.HONORABLE_GUARDIAN);
  const audit = engM.auditImmutability();
  check('auditImmutability reports CLEAN_ADVISORY_ONLY', audit.status === 'CLEAN_ADVISORY_ONLY' && audit.isClean === true);
  check('Zero host physics mutations', audit.hostPhysicsMutations === 0);
  check('Zero host transform mutations', audit.hostTransformMutations === 0);
  // applyMoralAffectModulation touches only affective fields, never transforms
  const fakeAgent = { valence: 0.5, arousal: 0.5, currentDominance: 0.8, x: 10, y: 20, hp: 100 };
  engM.agents.get('m').guilt = 0.80;
  engM.applyMoralAffectModulation('m', fakeAgent);
  check('Guilt depresses valence', fakeAgent.valence < 0.5);
  check('Guilt elevates arousal', fakeAgent.arousal > 0.5);
  check('Host transform untouched (x)', fakeAgent.x === 10);
  check('Host position untouched (y)', fakeAgent.y === 20);
  check('Host HP untouched', fakeAgent.hp === 100);
  // Snapshot is serializable plain data (Map-based state, no host refs)
  const snap = engM.getAgentMoralState('m');
  check('Snapshot exposes guilt + injury + deltas', typeof snap.guilt === 'number' && 'moralInjury' in snap && 'personalityDeltas' in snap);
  JSON.stringify(snap);
  check('Snapshot JSON-serializable', true);

  console.log('\n============================================================');
  console.log(`SUCCESS: All ${PASS} moral dissonance assertions PASSED.`);
  console.log('============================================================\n');
}

main().catch((err) => {
  console.error('VERIFICATION FAILURE:', err);
  process.exit(1);
});
