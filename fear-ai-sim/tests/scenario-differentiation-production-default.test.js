import { describe, it, expect } from '@jest/globals';
import { createClosedWorldScenario, tickClosedWorld, appendWorldEvent } from '../closed-world.js';

// V8 corrective checkpoint (2026-08-31):
//
// The §19 scenario-differentiation suite threads
// `relationshipGate: false` into every tickClosedWorld
// call so the historical oracle remains observable after
// MUT-DIR-001 flipped the default to `true`.
//
// This file restores the production-default coverage
// with sharp, named axes (not OR-of-five with >=0).

function runScenario({ perceivedDanger, sustainedAttacks, noObservations, ticks = 50 }) {
    const world = createClosedWorldScenario();
    if (noObservations) {
        world.merchants[0].perceptionAccuracy = 0;
        world.bandits[0].perceptionAccuracy = 0;
    }
    for (let t = 1; t <= ticks; t += 1) {
        if (sustainedAttacks && t % 2 === 0) {
            appendWorldEvent(world, {
                type: 'BANDIT_ATTACK',
                roadId: 'road-a',
                banditId: 'bandits-1',
                tick: t,
                lost: 5,
                delivered: 15,
            });
        }
        tickClosedWorld(world, { tick: t, perceivedDanger });
    }
    return {
        factionLastDecision: world.factions[0].lastDecision,
        factionResources: world.factions[0].resources,
        factionMemoryOfLoss: world.factions[0].memoryOfLoss,
        factionFear: world.factions[0].fear,
        banditRoadId: world.bandits[0].roadId,
        banditRelocations: world.events.filter(e => e.type === 'BANDIT_RELOCATION').length,
        banditAttacks: world.events.filter(e => e.type === 'BANDIT_ATTACK').length,
        invasions: world.events.filter(e => e.type === 'INVASION').length,
        merchantRoute: world.merchants[0].selectedRoute,
        merchantRouteBeliefDanger: world.merchants[0].routeBeliefs?.['road-a']?.perceivedDanger ?? null,
        factionActionGates: world.events.filter(e => e.type === 'FACTION_ACTION_GATE').length,
        factionActionsAllowed: world.events.filter(e => e.type === 'FACTION_ACTION_GATE' && e.allowed).length,
        factionActionsBlocked: world.events.filter(e => e.type === 'FACTION_ACTION_GATE' && !e.allowed).length,
        migrations: world.events.filter(e => e.type === 'MIGRATION').length,
    };
}

describe('production-default scenario differentiation (V8 corrective checkpoint, §19 with MUT-DIR-001 gate active)', () => {
    it('calm vs nervous under the production gate: nervous has higher fear', () => {
        const calm = runScenario({ perceivedDanger: 0.1, sustainedAttacks: false, noObservations: true, ticks: 60 });
        const nervous = runScenario({ perceivedDanger: 0.9, sustainedAttacks: false, noObservations: true, ticks: 60 });
        // With no observations, perceivedDanger alone must
        // drive fear. Nervous fear must be strictly greater
        // than calm fear (named axis, not OR-of-five).
        expect(nervous.factionFear).toBeGreaterThan(calm.factionFear);
    });

    it('sustained attacks vs no-attacks under the production gate: sustained has more bandit activity and more blocked gates', () => {
        const noAttacks = runScenario({ perceivedDanger: 0.5, sustainedAttacks: false, noObservations: true, ticks: 60 });
        const sustained = runScenario({ perceivedDanger: 0.5, sustainedAttacks: true, noObservations: false, ticks: 60 });
        expect(sustained.banditAttacks).toBeGreaterThan(0);
        expect(sustained.banditAttacks).toBeGreaterThan(noAttacks.banditAttacks);
        // Sustained attacks must produce at least one blocked gate
        // (gate observably active), while calm may have fewer.
        expect(sustained.factionActionsBlocked).toBeGreaterThan(0);
        expect(sustained.factionActionGates).toBeGreaterThan(0);
        expect(sustained.factionActionGates).toBeGreaterThanOrEqual(sustained.factionActionsBlocked);
    });

    it('multi-seed determinism under the production gate: two calm runs produce identical trajectories', () => {
        const a = runScenario({ perceivedDanger: 0.5, sustainedAttacks: false, noObservations: true, ticks: 40 });
        const b = runScenario({ perceivedDanger: 0.5, sustainedAttacks: false, noObservations: true, ticks: 40 });
        expect(a.banditRoadId).toBe(b.banditRoadId);
        expect(a.factionLastDecision).toBe(b.factionLastDecision);
        expect(a.factionResources).toBe(b.factionResources);
        expect(a.factionMemoryOfLoss).toBe(b.factionMemoryOfLoss);
        expect(a.migrations).toBe(b.migrations);
    });

    it('the production gate is observably active: gates fire and block at least one invasion', () => {
        const sustained = runScenario({ perceivedDanger: 0.5, sustainedAttacks: true, noObservations: false, ticks: 60 });
        expect(sustained.factionActionGates).toBeGreaterThan(0);
        expect(sustained.factionActionsAllowed).toBeLessThanOrEqual(sustained.factionActionGates);
        expect(sustained.factionActionsBlocked).toBeGreaterThan(0);
    });
});
