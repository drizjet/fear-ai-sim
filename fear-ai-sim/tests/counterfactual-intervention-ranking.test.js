import { describe, it, expect } from '@jest/globals';
import { FrontierValleySimulation, FRONTIER_VALLEY_ROUTES } from '../packages/core/src/FrontierValleySimulation.js';
import {
  WorldCounterfactualEngine,
  COUNTERFACTUAL_MUTATIONS,
} from '../packages/core/src/WorldCounterfactualEngine.js';

// Section LXVII: counterfactual intervention ranking on the Valley chain.
// Given one bad outcome (route failures), the engine must order candidate
// interventions by measured causal effect — advisory only, never applied.

const SEED = 4242;
const HORIZON = { forkTick: 10, horizonTicks: 40 };

function candidates() {
  return [
    {
      type: COUNTERFACTUAL_MUTATIONS.ALTER_ROUTE_SECURITY,
      params: { routeId: FRONTIER_VALLEY_ROUTES.HIGHLAND_PASS, perceivedDanger: 0.05, baseSecurity: 0.95 },
    },
    { type: COUNTERFACTUAL_MUTATIONS.PACIFY_BANDIT_RAIDERS, params: {} },
    {
      type: COUNTERFACTUAL_MUTATIONS.INJECT_COMMODITY_SURPLUS,
      params: { settlementId: 'Riverbend', commodity: 'food', amount: 100 },
    },
    { type: COUNTERFACTUAL_MUTATIONS.CUSTOM_MUTATION, params: { description: 'Null' }, customFn: () => {} },
  ];
}

function rankAll(extra = {}) {
  return WorldCounterfactualEngine.rankInterventions({
    createSimulation: () => new FrontierValleySimulation({ seed: SEED }),
    ...HORIZON,
    outcome: { metric: 'routeFailures', direction: 'lower' },
    candidates: candidates(),
    ...extra,
  });
}

describe('LXVII: counterfactual intervention ranking', () => {
  it('route pacification outranks bandit, surplus, and null interventions', () => {
    const r = rankAll();
    expect(r.ranking).toHaveLength(4);
    expect(r.recommendation.mutation.type).toBe(COUNTERFACTUAL_MUTATIONS.ALTER_ROUTE_SECURITY);
    expect(r.recommendation.score).toBeGreaterThan(0);
    const nullEntry = r.ranking.find((e) => e.mutation.type === COUNTERFACTUAL_MUTATIONS.CUSTOM_MUTATION);
    expect(nullEntry.score).toBe(0);
    expect(nullEntry.firstDivergenceTick).toBeNull();
    // Scores descend throughout.
    for (let i = 1; i < r.ranking.length; i++) {
      expect(r.ranking[i].score).toBeLessThanOrEqual(r.ranking[i - 1].score);
    }
  });

  it('every candidate forks from an identical base (factuals match)', () => {
    const r = rankAll();
    const factuals = new Set(r.ranking.map((e) => e.factual));
    expect(factuals.size).toBe(1);
  });

  it('ranking is deterministic across repeated runs (ignoring function identity)', () => {
    const shape = (r) => r.ranking.map((e) => ({
      type: e.mutation.type, score: e.score, factual: e.factual,
      counterfactual: e.counterfactual, firstDivergenceTick: e.firstDivergenceTick,
    }));
    expect(shape(rankAll())).toEqual(shape(rankAll()));
  });
  it('rejects unknown outcome metrics and non-factory simulation sources', () => {
    expect(() => rankAll({ outcome: { metric: 'noSuchMetric', direction: 'lower' } })).toThrow();
    expect(() => WorldCounterfactualEngine.rankInterventions({ candidates: candidates() })).toThrow();
  });

  it('builds one fresh base per candidate (factory discipline)', () => {
    let calls = 0;
    const r = WorldCounterfactualEngine.rankInterventions({
      createSimulation: () => { calls += 1; return new FrontierValleySimulation({ seed: SEED }); },
      ...HORIZON,
      outcome: { metric: 'routeFailures', direction: 'lower' },
      candidates: candidates(),
    });
    expect(calls).toBe(4);
    expect(r.ranking).toHaveLength(4);
  });
  it('harmful and irrelevant interventions never outrank the genuine fix', () => {
    const r = WorldCounterfactualEngine.rankInterventions({
      createSimulation: () => new FrontierValleySimulation({ seed: SEED }),
      ...HORIZON,
      outcome: { metric: 'routeFailures', direction: 'lower' },
      candidates: [
        ...candidates(),
        {
          type: COUNTERFACTUAL_MUTATIONS.DEGRADE_COMMODITY_SCARCITY,
          params: { settlementId: 'Riverbend', commodity: 'food', targetLevel: 0.0 },
        },
      ],
    });
    expect(r.ranking).toHaveLength(5);
    expect(r.recommendation.mutation.type).toBe(COUNTERFACTUAL_MUTATIONS.ALTER_ROUTE_SECURITY);
  });
  it('flipping the outcome direction dethrones the fix (tie order aside)', () => {
    const lower = rankAll().ranking.map((e) => e.mutation.type);
    const higher = rankAll({ outcome: { metric: 'routeFailures', direction: 'higher' } }).ranking.map((e) => e.mutation.type);
    expect(lower[0]).toBe(COUNTERFACTUAL_MUTATIONS.ALTER_ROUTE_SECURITY);
    expect(higher[higher.length - 1]).toBe(COUNTERFACTUAL_MUTATIONS.ALTER_ROUTE_SECURITY);
    expect(higher[0]).not.toBe(COUNTERFACTUAL_MUTATIONS.ALTER_ROUTE_SECURITY);
  });

  it('bandit pacification wins fear and panic outcomes (no universal optimum)', () => {
    for (const metric of ['meanPopulationFear', 'panicIncidents']) {
      const r = rankAll({ outcome: { metric, direction: 'lower' } });
      expect(r.recommendation.mutation.type).toBe(COUNTERFACTUAL_MUTATIONS.PACIFY_BANDIT_RAIDERS);
      expect(r.recommendation.score).toBeGreaterThan(0);
      // Route security, the routeFailures champion, does nothing here.
      const routeFix = r.ranking.find((e) => e.mutation.type === COUNTERFACTUAL_MUTATIONS.ALTER_ROUTE_SECURITY);
      expect(routeFix.score).toBe(0);
    }
  });

  it('counterfactual trajectories are outcome-independent (only scoring changes)', () => {
    const fear = rankAll({ outcome: { metric: 'meanPopulationFear', direction: 'lower' } });
    const panic = rankAll({ outcome: { metric: 'panicIncidents', direction: 'lower' } });
    const byType = (r) => Object.fromEntries(r.ranking.map((e) => [e.mutation.type, e]));
    // Same candidate, same fork base: the full counterfactual summary for
    // PACIFY matches across both rankings, whatever each one scores.
    expect(byType(fear)[COUNTERFACTUAL_MUTATIONS.PACIFY_BANDIT_RAIDERS].counterfactualSummary)
      .toEqual(byType(panic)[COUNTERFACTUAL_MUTATIONS.PACIFY_BANDIT_RAIDERS].counterfactualSummary);
  });

  it('an inapplicable intervention fails loudly instead of ranking silently', () => {
    expect(() => WorldCounterfactualEngine.rankInterventions({
      createSimulation: () => new FrontierValleySimulation({ seed: SEED }),
      ...HORIZON,
      outcome: { metric: 'routeFailures', direction: 'lower' },
      candidates: [{
        type: COUNTERFACTUAL_MUTATIONS.CUSTOM_MUTATION,
        params: { description: 'Sabotage' },
        customFn: () => { throw new Error('inapplicable here'); },
      }],
    })).toThrow('inapplicable here');
  });
});

describe('LXVII NOW-7: wars and alliances outcome ranking', () => {
  const F = {
    SETTLERS: 'SettlersAlliance',
    BANDITS: 'ShadowfangBandits',
    NOMADS: 'WildernessNomads',
  };
  const STAGE = { ATTACK: 'ATTACK', ALLY: 'ALLY' };
  const NULL = { type: COUNTERFACTUAL_MUTATIONS.CUSTOM_MUTATION, params: { description: 'Null' }, customFn: () => {} };
  const provoke = {
    type: COUNTERFACTUAL_MUTATIONS.MODIFY_FACTION_STANCE,
    params: { sourceFaction: F.SETTLERS, targetFaction: F.BANDITS, stage: STAGE.ATTACK, grievance: 1.0, trust: 0.0 },
  };
  const befriend = {
    type: COUNTERFACTUAL_MUTATIONS.MODIFY_FACTION_STANCE,
    params: { sourceFaction: F.SETTLERS, targetFaction: F.NOMADS, stage: STAGE.ALLY, grievance: 0.0, trust: 1.0 },
  };

  it('alliance-seeking wins the alliances outcome (higher)', () => {
    const r = WorldCounterfactualEngine.rankInterventions({
      createSimulation: () => new FrontierValleySimulation({ seed: SEED }),
      ...HORIZON,
      outcome: { metric: 'alliancesFormed', direction: 'higher' },
      candidates: [befriend, provoke, NULL],
    });
    expect(r.recommendation.mutation).toEqual(befriend);
    expect(r.recommendation.score).toBe(1);
  });

  it('provocation ranks last on the wars outcome with a negative score', () => {
    const r = WorldCounterfactualEngine.rankInterventions({
      createSimulation: () => new FrontierValleySimulation({ seed: SEED }),
      ...HORIZON,
      outcome: { metric: 'warsDeclared', direction: 'lower' },
      candidates: [provoke, NULL],
    });
    const entry = r.ranking.find((e) => e.mutation.type === COUNTERFACTUAL_MUTATIONS.MODIFY_FACTION_STANCE);
    expect(entry.counterfactual).toBe(1);
    expect(entry.factual).toBe(0);
    expect(entry.score).toBe(-1);
    expect(r.ranking[r.ranking.length - 1].mutation).toEqual(provoke);
  });

  it('war-only forks now report a first-divergence tick', () => {
    const r = WorldCounterfactualEngine.runExperiment({
      simulation: new FrontierValleySimulation({ seed: SEED }),
      ...HORIZON,
      mutation: provoke,
    });
    expect(r.counterfactualSummary.warsDeclared).toBe(1);
    expect(r.factualSummary.warsDeclared).toBe(0);
    expect(r.firstDivergenceTick).not.toBeNull();
  });
});
