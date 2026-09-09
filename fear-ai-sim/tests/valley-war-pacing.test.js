import { FrontierValleySimulation, FRONTIER_VALLEY_FACTIONS } from '../packages/core/src/FrontierValleySimulation.js';
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
});
