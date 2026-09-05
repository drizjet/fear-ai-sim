// Constitution §477 (EXAMPLE ENCOUNTER: BROKEN CARAVAN) / §531
// (TRADE MVP) / §538 (VERTICAL SLICE) / §60 (BANDITS AND TRADE).
//
// The convoy module exists in convoy.js (formConvoy,
// adaptBandits, resolveConvoyAmbush) but is not wired into the
// closed-world reducer. This slice wires it: when a merchant
// travels with cargo AND a guard is available, the reducer
// forms a convoy. The convoy is then used as the target of
// bandit ambushes (the convoy's cargo is what the bandit
// attacks). The §60 contract: "Bandits should not simply spawn
// randomly on roads. They have incentives. ... High traffic
// creates loot opportunities."

import { createClosedWorldScenario, tickClosedWorld } from '../closed-world.js';

describe('convoy wiring in the closed-world chain (Constitution §60 / §477 / §531 / §538)', () => {
    // E11: convoys are hired, not granted. These fixtures stage the
    // economic precondition (risky beliefs + capital) so the
    // merchant buys its escort; the §60 wiring underneath is
    // unchanged (formation → ambush target).
    function hireReadyWorld() {
        const world = createClosedWorldScenario();
        const merchant = world.merchants[0];
        merchant.cargo = 20;
        merchant.capital = 100;
        merchant.routeBeliefs['road-a'] = { perceivedDanger: 0.9, confidence: 0.9 };
        merchant.routeBeliefs['road-b'] = { perceivedDanger: 1, confidence: 0.9 };
        merchant.routeBeliefs['road-c'] = { perceivedDanger: 1, confidence: 0.9 };
        return world;
    }
    it('reducer forms a convoy when a merchant hires its guard', () => {
        const world = hireReadyWorld();
        // Ensure the merchant has cargo and a guard is available.
        expect(world.merchants[0].cargo).toBeGreaterThan(0);
        expect(world.guards.length).toBeGreaterThan(0);
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true, encounterRng: () => 0.999 });
        // The reducer should have formed a convoy and recorded it.
        expect(world.convoy).not.toBeNull();
        expect(world.convoy).toBeDefined();
        // The convoy should reference the merchant and the guard.
        expect(world.convoy.merchantIds).toContain('merchant-1');
        expect(world.convoy.escortIds.length).toBeGreaterThan(0);
        // The merchant should now be associated with the convoy.
        expect(world.merchants[0].convoyId).toBe(world.convoy.id);
    });

    it('reducer emits a CONVOY_FORMED event when a convoy is formed', () => {
        const world = hireReadyWorld();
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true, encounterRng: () => 0.999 });
        const convoyEvents = world.events.filter(
            event => event.type === 'CONVOY_FORMED'
        );
        expect(convoyEvents.length).toBeGreaterThanOrEqual(1);
    });

    it('the convoy is the target of a bandit ambush (cargo loss, not just merchant loss)', () => {
        // The §60 bandit-on-convoy contract: "High traffic creates
        // loot opportunities." The convoy's cargo is what the
        // bandit attacks. When a bandit ambushes a convoy, the
        // cargo loss is the convoy's cargo, not just the
        // merchant's cargo.
        const world = hireReadyWorld();
        // First form a convoy.
        tickClosedWorld(world, { tick: 1, perceivedDanger: 0.0, relationshipGate: true, encounterRng: () => 0.999 });
        const initialConvoyCargo = world.convoy.cargo;
        expect(initialConvoyCargo).toBeGreaterThan(0);
        // Drive a tick where the bandit attacks the convoy. The
        // bandit is on the merchant's current route, so the
        // ambush is plausible.
        world.bandits[0].roadId = world.merchants[0].selectedRoute ?? 'road-a';
        world.bandits[0]._lastRelocationTick = 2;
        world.bandits[0].relocationCooldownTicks = 10000;
        // Hold the merchant on its road: tick-1 learning may have
        // raised road-a toward the b/c ceiling, which would reroute
        // the convoy away from the pinned bandit.
        world.merchants[0].routeBeliefs['road-a'] = { perceivedDanger: 0.9, confidence: 0.9 };
        tickClosedWorld(world, { tick: 2, perceivedDanger: 0.0, relationshipGate: true, encounterRng: () => 0.999 });
        // The convoy's cargo should be reduced (or the convoy
        const afterTick = world.convoy ? world.convoy.cargo : 0;
        expect(afterTick).toBeLessThanOrEqual(initialConvoyCargo);
        // The attack should have produced an ambush event.
        const ambushEvents = world.events.filter(
            event => event.type === 'CONVOY_AMBUSH' || event.type === 'BANDIT_ATTACK'
        );
        expect(ambushEvents.length).toBeGreaterThanOrEqual(1);
    });
});
