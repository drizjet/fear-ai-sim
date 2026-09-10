import { FrontierValleySimulation, FRONTIER_VALLEY_FACTIONS } from '../packages/core/src/FrontierValleySimulation.js';
import { RoamingBandSystem, BAND_ARCHETYPES } from '../packages/core/src/RoamingBandSystem.js';
import { ESCALATION_STAGES } from '../packages/core/src/FactionSystem.js';

// Section NOW-15: outbreak-pacing budgets. The valley starts at THREATEN by
// design (hostile frontier, 0.8 initial grievance); outbreak must then be
// EARNED by raids, and war must come in phases rather than permanently.
// Probes across seeds show first war after exactly 2 raids and war fractions
// of 13-17% over 2000 ticks, so these tests pin that pacing instead of
// retuning the designed initial condition.

function trajectory(seed, ticks) {
  const s = new FrontierValleySimulation({ seed });
  const phases = [];
  for (let t = 1; t <= ticks; t++) phases.push(s.advance(1).warsActive);
  return { sim: s, phases };
}

describe('NOW-15: outbreak pacing budgets', () => {
  it('starts at THREATEN by design, not yet at war', () => {
    const s = new FrontierValleySimulation({ seed: 4242 });
    const st = s.factionSystem.getBilateralStance(
      FRONTIER_VALLEY_FACTIONS.SETTLERS,
      FRONTIER_VALLEY_FACTIONS.BANDITS,
    );
    expect(st.stage).toBe(ESCALATION_STAGES.THREATEN);
    expect(s.advance(1).warsActive).toBe(0);
  });

  it('outbreak is earned by raids, never instant', () => {
    for (const seed of [4242, 7, 77]) {
      const { phases } = trajectory(seed, 200);
      const firstWar = phases.findIndex((w) => w === 1);
      // Two raids minimum: single-raid pressure peaks at MOBILIZE.
      expect(firstWar).toBeGreaterThan(0);
    }
  });

  it('war comes in phases, never permanent war or permanent peace', () => {
    for (const seed of [4242, 7, 77, 1234]) {
      const { phases } = trajectory(seed, 2000);
      const warTicks = phases.filter((w) => w === 1).length;
      expect(warTicks).toBeGreaterThan(0);
      expect(warTicks).toBeLessThan(2000);
      // At least one war-to-peace transition: peace phases exist.
      let transitions = 0;
      for (let i = 1; i < phases.length; i++) {
        if (phases[i - 1] === 1 && phases[i] === 0) transitions++;
      }
      expect(transitions).toBeGreaterThan(0);
    }
  });

  it('war trajectories are deterministic per seed', () => {
    const a = trajectory(4242, 500).phases;
    const b = trajectory(4242, 500).phases;
    expect(a).toEqual(b);
  });
});

describe('NOW-16: extortion provocation mapping', () => {
  function grievanceOf(sim) {
    return sim.factionSystem.getBilateralStance(
      FRONTIER_VALLEY_FACTIONS.SETTLERS,
      FRONTIER_VALLEY_FACTIONS.BANDITS,
    ).grievance;
  }
  function synthetic(resolution, partyA, partyB) {
    return [{ encounterId: 'syn-1', partyAId: partyA, partyBId: partyB, advisoryResolution: resolution }];
  }

  it('bandit extortion of settlers records provocation (smaller than a raid)', () => {
    const sim = new FrontierValleySimulation({ seed: 4242 });
    // Reset the designed initial grievance to isolate the mapping.
    const st = sim.factionSystem.getBilateralStance(
      FRONTIER_VALLEY_FACTIONS.SETTLERS,
      FRONTIER_VALLEY_FACTIONS.BANDITS,
    );
    st.grievance = 0.0;
    sim._recordEncounterConsequences(synthetic(
      'EXTORTION_PAID', 'bandit_warband_1', 'caravan_merchant_1',
    ));
    const afterExtortion = grievanceOf(sim);
    expect(afterExtortion).toBeGreaterThan(0);
    expect(afterExtortion).toBeLessThan(0.65);
    sim._recordEncounterConsequences(synthetic(
      'COMBAT_ENGAGEMENT', 'bandit_warband_1', 'caravan_merchant_1',
    ));
    expect(grievanceOf(sim)).toBeGreaterThan(afterExtortion);
  });

  it('wildlife predation records no faction incident on either path', () => {
    const sim = new FrontierValleySimulation({ seed: 4242 });
    const before = sim.factionSystem.getBilateralStance(
      FRONTIER_VALLEY_FACTIONS.SETTLERS,
      FRONTIER_VALLEY_FACTIONS.WILDLIFE,
    ).incidents.length;
    sim._recordEncounterConsequences(synthetic(
      'EXTORTION_PAID', 'wolf_pack_1', 'caravan_merchant_1',
    ));
    sim._recordEncounterConsequences(synthetic(
      'COMBAT_ENGAGEMENT', 'wolf_pack_1', 'caravan_merchant_1',
    ));
    expect(sim.factionSystem.getBilateralStance(
      FRONTIER_VALLEY_FACTIONS.SETTLERS,
      FRONTIER_VALLEY_FACTIONS.WILDLIFE,
    ).incidents.length).toBe(before);
  });

  it('NOW-19: tribute path unreachable under current stats (tripwire)', () => {
    // Verdict: unreachable by stats consistent with doctrine, not by
    // accident. Extortion needs powerRatio above 1.4 (overwhelming
    // imbalance: tribute under near-peer odds would mean the victim
    // should fight, i.e. combat). Observed max is 1.20 across 1560
    // bandit encounters, so the NOW-16 wiring stays latent by design.
    // If stat tuning ever opens this path, this test fails loudly and
    // forces conscious re-examination instead of silent behavior change.
    let maxRatio = 0;
    let extortions = 0;
    for (const seed of [4242, 7, 77, 1234, 999]) {
      const sim = new FrontierValleySimulation({ seed });
      for (let t = 0; t < 500; t++) {
        sim.advance(1);
        for (const enc of sim.worldSystem.activeEncounters || []) {
          if (enc.advisoryResolution === 'EXTORTION_PAID') extortions++;
          const a = sim.worldSystem.groups.get(enc.partyAId);
          const b = sim.worldSystem.groups.get(enc.partyBId);
          if (!a || !b) continue;
          const bandit = a.type === 'BANDITS' ? a : (b.type === 'BANDITS' ? b : null);
          if (!bandit) continue;
          const victim = bandit === a ? b : a;
          maxRatio = Math.max(maxRatio, bandit.militaryStrength / Math.max(0.05, victim.militaryStrength));
        }
      }
    }
    expect(extortions).toBe(0);
    expect(maxRatio).toBeLessThan(1.4);
  });
});

describe('NEXT-24: deliberate tribute-scenario fixture', () => {
  // NOW-19 proved the extortion path unreachable under doctrine stats
  // (max ratio 1.20 vs the 1.4 bar). This fixture deliberately stages an
  // overwhelming-imbalance scenario override — overpowered bandits facing
  // a wealthy weak convoy — and drives it through live generation plus
  // consequence recording, so the EXTORTION_PAID branch stays exercised
  // end to end instead of latent. Scenario overrides are not stat tuning:
  // canonical group stats are untouched.
  function stageTribute(seed = 4242) {
    const sim = new FrontierValleySimulation({ seed });
    const at = { x: 1000, y: 0, z: 1000 };
    sim.worldSystem.registerGroup('tribute_raiders', {
      type: 'BANDITS',
      factionId: FRONTIER_VALLEY_FACTIONS.BANDITS,
      memberCount: 12,
      position: { ...at },
      militaryStrength: 1.0,
      wealth: 0.1
    });
    sim.worldSystem.registerGroup('tribute_convoy', {
      type: 'CARAVAN',
      factionId: FRONTIER_VALLEY_FACTIONS.SETTLERS,
      memberCount: 4,
      position: { ...at },
      militaryStrength: 0.2,
      wealth: 0.9
    });
    return sim;
  }

  function tributeEncounter(sim) {
    const encounters = sim.worldSystem.evaluateEncounters({ factionSystem: sim.factionSystem });
    return encounters.find((e) => {
      const ids = [e.partyAId, e.partyBId];
      return ids.includes('tribute_raiders') && ids.includes('tribute_convoy');
    });
  }

  it('overwhelming imbalance generates EXTORTION_PAID with a 5x rationale', () => {
    const enc = tributeEncounter(stageTribute());
    expect(enc).toBeDefined();
    expect(enc.advisoryResolution).toBe('EXTORTION_PAID');
    expect(enc.diagnosticRationale).toMatch(/5\.00x/);
  });

  it('generated tribute flows into provocation plus threat pressure', () => {
    const sim = stageTribute();
    const stance = sim.factionSystem.getBilateralStance(
      FRONTIER_VALLEY_FACTIONS.SETTLERS,
      FRONTIER_VALLEY_FACTIONS.BANDITS
    );
    stance.grievance = 0.0;
    const before = sim.worldSystem.groups.get('tribute_convoy').drivers.threatPressure;
    sim._recordEncounterConsequences([tributeEncounter(sim)]);
    expect(stance.grievance).toBeGreaterThan(0);
    expect(stance.grievance).toBeLessThan(0.65);
    expect(sim.worldSystem.groups.get('tribute_convoy').drivers.threatPressure)
      .toBeGreaterThan(before);
  });

  it('tribute generation is deterministic per seed', () => {
    const a = tributeEncounter(stageTribute(77));
    const b = tributeEncounter(stageTribute(77));
    expect(a.advisoryResolution).toBe(b.advisoryResolution);
    expect(a.diagnosticRationale).toBe(b.diagnosticRationale);
  });
});

describe('NEXT-28: advisory tribute quantity', () => {
  // EXTORTION_PAID carries a suggested tribute: 35% of victim wealth,
  // mirroring the RoamingBandSystem doctrine for the same situation.
  // Advisory only — the host moves no goods.
  function stage(banditStr, victimStr, victimWealth, seed = 4242) {
    const sim = new FrontierValleySimulation({ seed });
    const at = { x: 1000, y: 0, z: 1000 };
    sim.worldSystem.registerGroup('q_raiders', {
      type: 'BANDITS', factionId: FRONTIER_VALLEY_FACTIONS.BANDITS,
      memberCount: 12, position: { ...at }, militaryStrength: banditStr, wealth: 0.1
    });
    sim.worldSystem.registerGroup('q_convoy', {
      type: 'CARAVAN', factionId: FRONTIER_VALLEY_FACTIONS.SETTLERS,
      memberCount: 4, position: { ...at }, militaryStrength: victimStr, wealth: victimWealth
    });
    const encounters = sim.worldSystem.evaluateEncounters({ factionSystem: sim.factionSystem });
    return encounters.find((e) => {
      const ids = [e.partyAId, e.partyBId];
      return ids.includes('q_raiders') && ids.includes('q_convoy');
    });
  }

  it('extortion suggests 35% of victim wealth', () => {
    expect(stage(1.0, 0.2, 0.9).suggestedTribute).toBeCloseTo(0.315, 10);
    expect(stage(1.0, 0.2, 0.8).suggestedTribute).toBeCloseTo(0.28, 10);
  });

  it('non-extortion resolutions carry no suggested tribute', () => {
    // Overwhelming but poor victim: combat, not tribute (wealth bar).
    const combat = stage(1.0, 0.2, 0.2);
    expect(combat.advisoryResolution).toBe('COMBAT_ENGAGEMENT');
    expect(combat.suggestedTribute).toBeNull();
    // Weak bandits vs strong escort: avoidance.
    const avoided = stage(0.2, 1.0, 0.9);
    expect(avoided.advisoryResolution).toBe('MUTUAL_AVOIDANCE');
    expect(avoided.suggestedTribute).toBeNull();
  });
});

describe('NOW-30: cross-system extortion-share consistency', () => {
  // Two wealth scales (0..1 world groups, absolute band holdings) share
  // one doctrine: victims pay 35% to avoid slaughter. This pins the share
  // on both, plus the band absolute-scale cap as documented behavior.
  function bandShare(caravanWealth) {
    const sys = new RoamingBandSystem({ encounterRadius: 10 });
    sys.registerBand({ id: 'bnd', archetype: BAND_ARCHETYPES.BANDIT_RAIDERS, position: { x: 0, y: 0, z: 0 }, power: 100, wealth: 20, fear: 0 });
    sys.registerBand({ id: 'crv', archetype: BAND_ARCHETYPES.TRADE_CARAVAN, position: { x: 0, y: 0, z: 0 }, power: 100, wealth: caravanWealth, fear: 0.9 });
    const amb = sys.evaluateSystemicEncounters().find((e) => e.resolution === 'EXTORTION_PAID');
    expect(amb).toBeDefined();
    return (caravanWealth - sys.bands.get('crv').wealth) / caravanWealth;
  }
  it('both systems take a 35% share below the absolute cap', () => {
    expect(bandShare(100)).toBeCloseTo(0.35, 10);
    const sim = new FrontierValleySimulation({ seed: 4242 });
    const at = { x: 1000, y: 0, z: 1000 };
    sim.worldSystem.registerGroup('c_raiders', {
      type: 'BANDITS', factionId: FRONTIER_VALLEY_FACTIONS.BANDITS,
      memberCount: 12, position: { ...at }, militaryStrength: 1.0, wealth: 0.1
    });
    sim.worldSystem.registerGroup('c_convoy', {
      type: 'CARAVAN', factionId: FRONTIER_VALLEY_FACTIONS.SETTLERS,
      memberCount: 4, position: { ...at }, militaryStrength: 0.2, wealth: 0.9
    });
    const enc = sim.worldSystem.evaluateEncounters({ factionSystem: sim.factionSystem })
      .find((e) => [e.partyAId, e.partyBId].includes('c_raiders') && [e.partyAId, e.partyBId].includes('c_convoy'));
    expect(enc.advisoryResolution).toBe('EXTORTION_PAID');
    expect(enc.suggestedTribute / 0.9).toBeCloseTo(0.35, 10);
  });

  it('band absolute cap binds above ~143 wealth as documented', () => {
    expect(bandShare(200)).toBeCloseTo(0.25, 10);
  });
});

describe('NEXT-16: trade-dependency conflict restraint', () => {
  // A faction that depends on the provocateur treats the same incident
  // differently: grievance cools, facts (trust/fear/pressure) stand.
  const S = FRONTIER_VALLEY_FACTIONS.SETTLERS;
  const B = FRONTIER_VALLEY_FACTIONS.BANDITS;
  const N = FRONTIER_VALLEY_FACTIONS.NOMADS;
  function raided(seed = 4242) {
    const sim = new FrontierValleySimulation({ seed });
    sim.factionSystem.getBilateralStance(S, B).grievance = 0.0;
    return sim;
  }
  const RAID = [{ encounterId: 'r1', partyAId: 'bandit_warband_1', partyBId: 'caravan_merchant_1', advisoryResolution: 'COMBAT_ENGAGEMENT' }];
  function feed(sim, source, dest, amount, n) {
    for (let i = 0; i < n; i++) sim.recordValleyTrade({ sourceFaction: source, destFaction: dest, amount });
  }

  it('independent victim takes the full raid grievance', () => {
    const sim = raided();
    sim._recordEncounterConsequences(RAID);
    expect(sim.factionSystem.getBilateralStance(S, B).grievance).toBeCloseTo(0.65, 10);
  });

  it('dependent victim cools the same raid grievance but keeps trust/fear losses', () => {
    const sim = raided();
    feed(sim, B, S, 10, 9);
    feed(sim, N, S, 10, 1);
    sim._recordEncounterConsequences(RAID);
    const stance = sim.factionSystem.getBilateralStance(S, B);
    expect(stance.grievance).toBeCloseTo(0.65 * (1 - 0.9 * 0.7), 10);
    expect(stance.grievance).toBeLessThan(0.65);
    // Facts stand: trust and fear move exactly as without restraint.
    const plain = raided();
    plain._recordEncounterConsequences(RAID);
    const ref = plain.factionSystem.getBilateralStance(S, B);
    expect(stance.trust).toBe(ref.trust);
    expect(stance.fear).toBe(ref.fear);
  });

  it('restraint is deterministic per seed and rejects bad factions', () => {
    const run = () => {
      const sim = raided(77);
      feed(sim, B, S, 10, 9);
      feed(sim, N, S, 10, 1);
      sim._recordEncounterConsequences(RAID);
      return sim.factionSystem.getBilateralStance(S, B).grievance;
    };
    expect(run()).toBe(run());
    const sim = raided();
    expect(() => sim.recordValleyTrade({ sourceFaction: 'GHOST', destFaction: S }))
      .toThrow('UNKNOWN_TRADE_FACTION');
    expect(() => sim.recordValleyTrade({ sourceFaction: S, destFaction: S }))
      .toThrow('UNKNOWN_TRADE_FACTION');
  });
});

describe('NEXT-38: bounded valley trade ledger', () => {
  const S = FRONTIER_VALLEY_FACTIONS.SETTLERS;
  const B = FRONTIER_VALLEY_FACTIONS.BANDITS;
  const N = FRONTIER_VALLEY_FACTIONS.NOMADS;
  function fed() {
    const sim = new FrontierValleySimulation({ seed: 4242 });
    for (let i = 0; i < 9; i++) sim.recordValleyTrade({ sourceFaction: B, destFaction: S, amount: 10 });
    sim.recordValleyTrade({ sourceFaction: N, destFaction: S, amount: 10 });
    return sim;
  }

  it('window eviction is invisible: stale rows drop only when they cannot count', () => {
    const sim = fed();
    expect(sim.tradeLedger.length).toBe(10);
    expect(sim._dependencyRestraint(S, B)).toBeCloseTo(0.63, 10);
    sim.advance(500);
    // Read-time windowing already excludes the stale rows...
    expect(sim._dependencyRestraint(S, B)).toBe(0);
    // ...so evicting them on the next write changes nothing countable.
    sim.recordValleyTrade({ sourceFaction: B, destFaction: S, amount: 10 });
    expect(sim.tradeLedger.length).toBe(1);
    expect(sim._dependencyRestraint(S, B)).toBeCloseTo(0.7, 10);
  });

  it('flood reports cap at 1000 rows, newest retained', () => {
    const sim = new FrontierValleySimulation({ seed: 4242 });
    for (let i = 0; i < 1200; i++) {
      sim.recordValleyTrade({ sourceFaction: B, destFaction: S, amount: 1, commodity: `g${i}` });
    }
    expect(sim.tradeLedger.length).toBe(1000);
    expect(sim.tradeLedger[999].commodity).toBe('g1199');
    expect(sim.tradeLedger[0].commodity).toBe('g200');
  });
});

describe('NEXT-22: war-degeneracy soak', () => {
  it('5000-tick soak is flag-free, deterministic, and simmers without locking', async () => {
    const { runWarSoak, soakDigest } = await import('../benchmarks/behavioral-evaluation/valley_war_degeneracy_soak.mjs');
    const first = runWarSoak();
    const second = runWarSoak();
    expect(soakDigest(first)).toBe(soakDigest(second));
    expect(first.runs.length).toBe(3);
    for (const r of first.runs) {
      expect(r.flags).toEqual([]);
      expect(r.finalTick).toBe(5000);
      // Emergent ceiling (NEXT-39): the full ladder is live — ATTACK is
      // visited transiently under burst concentration — but it never
      // locks: the simmer always cools back to SHADOW via decay.
      const sb = r.visitedStages['SettlersAlliance>ShadowfangBandits'];
      expect(sb).toContain(ESCALATION_STAGES.SKIRMISH);
      expect(sb).toContain(ESCALATION_STAGES.ATTACK);
      expect(r.allWarLocked).toBe(false);
      // Emergent war exists (post-transient), but the simmer always cools.
      expect(r.firstEmergentWarTick).toBeGreaterThanOrEqual(500);
      expect(r.finalStages['SettlersAlliance>ShadowfangBandits']).toBe(ESCALATION_STAGES.SHADOW);
      // Advisory state stays within caps over the full horizon.
      expect(r.tradeRows).toBeLessThanOrEqual(1000);
      expect(r.historyRows).toBeLessThanOrEqual(1000);
      expect(r.rumors).toBeLessThanOrEqual(500);
    }
  });
});

describe('NEXT-22b: outcome distribution across seeds', () => {
  it('12 seeds converge to one macro class with tight numeric dispersion', async () => {
    const { runOutcomeDistribution, outcomeDigest } = await import('../benchmarks/behavioral-evaluation/valley_outcome_distribution.mjs');
    const first = runOutcomeDistribution();
    expect(outcomeDigest(runOutcomeDistribution())).toBe(outcomeDigest(first));
    expect(first.runs.length).toBe(12);
    // Single attractor today: robust simmer, zero story variance. A future
    // setup-variation feature should deliberately change this count.
    expect(first.classCount).toBe(1);
    expect(Object.keys(first.classes)[0]).toBe('SHADOW/TRADE/UNAWARE|wars=1|ally=0');
    expect(first.dispersion.totalEncounters.cv).toBeLessThan(0.05);
    expect(first.dispersion.routeFailures.cv).toBe(0);
    expect(first.dispersion.deliveries.cv).toBe(0);
  });
});
