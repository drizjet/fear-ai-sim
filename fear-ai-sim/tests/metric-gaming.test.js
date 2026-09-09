import { describe, it, expect } from '@jest/globals';
import { IntentStabilizer } from '../packages/core/src/IntentStabilizer.js';
import { FunctionalPersonaSignatures } from '../packages/core/src/FunctionalPersonaSignatures.js';
import { TuningValidator } from '../packages/core/src/TuningValidator.js';
import { IntentResolver } from '../packages/core/src/IntentResolver.js';

// Section CLVI (NEXT-12): metric-gaming battery. Each test builds a
// deliberately bad agent that scores BEST on one naive metric, then proves
// a paired guard metric catches it. A metric without a gaming-resistant
// partner is a vanity metric — these tests pin the partners.

const HEALTHY_TRAITS = { neuroticism: 0.5, resilience: 0.5, agreeableness: 0.5, openness: 0.5, extraversion: 0.5, leadership: 0.5, riskTolerance: 0.5, conscientiousness: 0.5, bravery: 0.5 };

// Threat strobes every 3 ticks (inside the 5-tick cooldown): a responsive
// agent must override the lock each time danger spikes.
function threatPresent(tick) {
  return Math.floor(tick / 3) % 2 === 1;
}

function runPolicy(propose, ticks = 200) {
  const stab = new IntentStabilizer({ cooldownTicks: 5, hysteresisMargin: 0.15 });
  let overrides = 0;
  for (let t = 1; t <= ticks; t++) {
    const res = stab.update('a', t, propose(t));
    if (res.reason === 'OVERRIDE_DANGER') overrides += 1;
  }
  return { chatter: stab.chatter('a', ticks), overrides };
}

describe('CLVI NEXT-12: metric-gaming battery', () => {
  it('Statue gamer wins chatter but misses every emergency (responsiveness guard)', () => {
    const statue = runPolicy(() => ({ type: 'IDLE', urgency: 0.1 }));
    const healthy = runPolicy((t) => (threatPresent(t) ? { type: 'FLEE', urgency: 0.9 } : { type: 'IDLE', urgency: 0.1 }));
    // Gamed axis: the statue is perfectly stable.
    expect(statue.chatter.flips).toBe(0);
    expect(statue.chatter.flips).toBeLessThanOrEqual(healthy.chatter.flips);
    // Guard axis: the statue answers zero emergencies.
    expect(statue.overrides).toBe(0);
    expect(healthy.overrides).toBeGreaterThan(0);
  });

  it('Panic-lock caricature is trivially identifiable but tuning-invalid', () => {
    const sig = new FunctionalPersonaSignatures();
    const population = [
      { id: 'calm', traits: { ...HEALTHY_TRAITS, neuroticism: 0.3, resilience: 0.7 } },
      { id: 'nervous', traits: { ...HEALTHY_TRAITS, neuroticism: 0.65, resilience: 0.4 } },
      { id: 'steady', traits: { ...HEALTHY_TRAITS, neuroticism: 0.45, resilience: 0.6 } },
    ];
    const caricature = { neuroticism: 1.0, resilience: 0.0, agreeableness: 0.5, openness: 0.5, extraversion: 0.5, leadership: 0.5, riskTolerance: 0.5, conscientiousness: 0.5, bravery: 0.5 };
    // Gamed axis: caricature is farther from everyone than healthy peers are.
    const caricatureGaps = population.map((p) => sig.distance(caricature, p.traits));
    const healthyGap = sig.distance(population[0].traits, population[1].traits);
    expect(Math.min(...caricatureGaps)).toBeGreaterThan(healthyGap);
    // Guard axis: tuning validation rejects the lock.
    expect(TuningValidator.validate(caricature).valid).toBe(false);
    expect(TuningValidator.validate(caricature).errors.join(' ')).toMatch(/INSTANT_PANIC_LOCK/);
    expect(TuningValidator.validate(population[0].traits).valid).toBe(true);
  });

  it('Composure gamer never catches panic but never rallies either (leadership guard)', () => {
    const sig = new FunctionalPersonaSignatures();
    const gamer = { ...HEALTHY_TRAITS, resilience: 1.0, extraversion: 0.0, leadership: 0.0 };
    const leader = { ...HEALTHY_TRAITS, resilience: 0.5, extraversion: 0.5, leadership: 0.8 };
    const gamerAuc = sig.signatureFor(gamer).auc;
    const leaderAuc = sig.signatureFor(leader).auc;
    // Gamed axis: the gamer is less contagious than the leader.
    expect(gamerAuc.contagionPeerFear).toBeLessThan(leaderAuc.contagionPeerFear);
    // Guard axis: the gamer also rallies nobody — composure without duty.
    expect(gamerAuc.rallyGroupFear).toBeLessThan(leaderAuc.rallyGroupFear);
  });
  it('Bounce-back gamer recovers fastest but panics earliest (onset guard)', () => {
    const sig = new FunctionalPersonaSignatures();
    const gamer = sig.signatureFor({ ...HEALTHY_TRAITS, resilience: 1.0 });
    const healthy = sig.signatureFor(HEALTHY_TRAITS);
    const onset = (curve) => {
      const i = curve.findIndex((v) => v >= 0.5);
      return i < 0 ? 1 : [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1][i];
    };
    // Gamed axis: fastest recovery (lowest AUC).
    expect(gamer.auc.recoveryTime).toBeLessThan(healthy.auc.recoveryTime);
    // Guard axis: hair-trigger panic onset pays for the fast rebound.
    expect(onset(gamer.curves.panicThreat)).toBeLessThan(onset(healthy.curves.panicThreat));
  });

  it('Decisive gamer never investigates but goes deaf to ambiguity (resolver guard)', () => {
    const alertAgent = (openness) => ({
      traits: { ...HEALTHY_TRAITS, openness },
      fearCore: { state: 'ALERT' },
      currentFear: 0.3, currentDominance: 0.5, currentAnger: 0, energy: 1.0,
      x: 0, y: 0, z: 0,
    });
    const sounds = [{ id: 's1', x: 10, y: 0, z: 0 }];
    // Gamed axis: zero investigation overhead, always vigilant.
    const deaf = IntentResolver.resolveIntent(alertAgent(0.0), { sounds });
    expect(deaf.type).toBe('IDLE_VIGILANT');
    // Guard axis: the open agent investigates the genuine cue.
    const curious = IntentResolver.resolveIntent(alertAgent(1.0), { sounds });
    expect(curious.type).toBe('INVESTIGATE_SOUND');
  });

  it('Prudent trader minimizes risk but holds lethal ground too long (retreat guard)', () => {
    const sig = new FunctionalPersonaSignatures();
    const gamer = sig.signatureFor({ ...HEALTHY_TRAITS, riskTolerance: 1.0, conscientiousness: 0.0 });
    const healthy = sig.signatureFor(HEALTHY_TRAITS);
    const onset = (curve) => {
      const i = curve.findIndex((v) => v >= 0.5);
      return i < 0 ? 1 : [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1][i];
    };
    // Gamed axis: lowest trade-risk AUC (maximally "prudent").
    expect(gamer.auc.tradeRisk).toBeLessThan(healthy.auc.tradeRisk);
    // Guard axis: retreat onset dangerously late — holds into lethal odds.
    expect(onset(gamer.curves.retreatPower)).toBeGreaterThan(onset(healthy.curves.retreatPower));
  });
});
